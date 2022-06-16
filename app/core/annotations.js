const Annotation = require('../db/models/annotations')
const { updateProjectStats, validateTasksAndAddObject } = require('./projects')
const { updateClassificationStats } = require('./tasks')
const {
  updateItemsTags,
  updateItemsAfterBulkAnnotation,
  toCompositeUuid,
  findItemsByCompositeUuid,
} = require('./items')
const { saveLogs, logNewAnnotations, logRemoveAnnotations, genLogTagsPayloads } = require('./logs')
const { bulkInsertComments } = require('./comments')

const changeAnnotationsStatus = (annotations, status = 'cancelled') =>
  annotations.map((annotation) => {
    annotation.status = status
    return annotation
  })

const isSameClassification = (annotation, payload) => annotation.task._id.equals(payload.task._id)

const isSameNER = (annotation, payload) =>
  isSameClassification(annotation, payload) &&
  payload.ner.start === annotation.ner.start &&
  payload.ner.end === annotation.ner.end

const isSameZone = (annotation, payload) => {
  const zone1CoordsSum = annotation.zone.reduce((total, coords) => total + coords.x + coords.y, 0)
  const zone2CoordsSum = payload.zone.reduce((total, coords) => total + coords.x + coords.y, 0)

  return isSameClassification(annotation, payload) && zone1CoordsSum === zone2CoordsSum
}

const isNewClassificationPayload = (payload, annotations) => {
  const classificationAnnotations = annotations.filter((annotation) => !annotation.ner && !annotation.zone)

  return (
    !payload.ner &&
    !payload.zone &&
    !classificationAnnotations.find((annotation) => isSameClassification(annotation, payload))
  )
}

const isNewNERPayload = (payload, annotations) => {
  const nerAnnotations = annotations.filter((annotation) => annotation.ner)

  return payload.ner && !nerAnnotations.find((annotation) => isSameNER(annotation, payload))
}

const isNewZonePayload = (payload, annotations) => {
  const zoneAnnotations = annotations.filter((annotation) => annotation.zone)

  return payload.zone && !zoneAnnotations.find((annotation) => isSameZone(annotation, payload))
}

const isNewTextPayload = (payload, annotations) => {
  const textAnnotations = annotations.filter((annotation) => annotation.text)

  return payload.text && !textAnnotations.find((annotation) => annotation.text === payload.text)
}

const isClassificationAnnotationToCancel = (annotation, payloads) =>
  !annotation.ner &&
  !annotation.zone &&
  !payloads.find((payload) => !payload.ner && !payload.zone && isSameClassification(annotation, payload))

const isNerAnnotationToCancel = (annotation, payloads) =>
  annotation.ner && !payloads.find((payload) => payload.ner && isSameNER(annotation, payload))

/*
  Zone annotation to cancel is one with different coordinates Sum
*/
const isZoneAnnotationToCancel = (annotation, payloads) =>
  annotation.zone &&
  !payloads.find((payload) => {
    if (!payload.zone) return false

    return isSameClassification(annotation, payload) && isSameZone(annotation, payload)
  })

const isTextAnnotationToCancel = (annotation, payloads) =>
  annotation.text &&
  !payloads.find((payload) => {
    if (!payload.text) return false

    return isSameClassification(annotation, payload) && annotation.text === payload.text
  })

const filterAnnotationsToUpdate = async (itemIds, newAnnotations) => {
  const annotations = await Annotation.find({ item: { $in: itemIds }, status: 'done' }).populate('task')

  const toCancel = changeAnnotationsStatus(
    annotations.filter(
      (annotation) =>
        isClassificationAnnotationToCancel(annotation, newAnnotations) ||
        isNerAnnotationToCancel(annotation, newAnnotations) ||
        isZoneAnnotationToCancel(annotation, newAnnotations) ||
        isTextAnnotationToCancel(annotation, newAnnotations)
    )
  )

  const toInsert = newAnnotations
    .filter(
      (annotation) =>
        isNewClassificationPayload(annotation, annotations) ||
        isNewNERPayload(annotation, annotations) ||
        isNewZonePayload(annotation, annotations) ||
        isNewTextPayload(annotation, annotations)
    )
    .map((a) => new Annotation(a))

  return { toInsert, toCancel }
}

/**
 * Avoids looking twice at an item in an array.
 * Divides by 1000 the time it takes to run registerAnnotationLogs.
 * @param {*} array The array.
 * @param {*} itemId The itemId.
 * @returns {Array} The array without unused items.
 */
const filterAndRemove = (array, itemId) => {
  const out = []
  const keep = []
  itemId = itemId.toString()
  array.forEach((elem) => {
    // ObjectId.equals() is really slow, use a stringified version instead and cache it
    if (!elem._itemId) {
      elem._itemId = elem.item.toString()
    }
    if (elem._itemId === itemId) {
      out.push(elem)
    } else {
      keep.push(elem)
    }
  })
  array.length = 0
  array.push(...keep)
  return out
}

const registerAnnotationLogs = (itemIds, toInsert, toCancel, user, project) => {
  const logs = []
  const perItem = []
  const toInsertCopy = [...toInsert]
  const toCancelCopy = [...toCancel]
  itemIds.forEach((itemId) => {
    const inserted = filterAndRemove(toInsertCopy, itemId)
    if (inserted.length) {
      logs.push(logNewAnnotations(inserted, itemId, user, project).toObject({ depopulate: true }))
    }

    const cancelled = filterAndRemove(toCancelCopy, itemId)
    if (cancelled.length) {
      logs.push(logRemoveAnnotations(cancelled, itemId, user, project).toObject({ depopulate: true }))
    }
    perItem.push({ itemId, cancelled, inserted })
  })
  return { logs, perItem }
}

const bulkWriteAnnotations = (toInsert, toCancel) =>
  Annotation.collection.bulkWrite(
    [
      ...toInsert.map((annotation) => ({
        insertOne: { document: annotation.toObject({ depopulate: true }) },
      })),
      {
        updateMany: {
          filter: { _id: { $in: toCancel.map((a) => a._id) } },
          update: { $set: { status: 'cancelled' } },
        },
      },
    ],
    { ordered: false }
  )

const updateStats = (projectId, items, perItem) =>
  Promise.all([updateProjectStats(projectId, items, true), updateClassificationStats(projectId, items.length, perItem)])

const genLogTagsMultipleItems = (items) => items.flatMap((item) => genLogTagsPayloads(item))

/**
 * Bulk insert or update annotations.
 * @param {{item: {_id: object}, annotations: object[]}[]} payloads The payloads.
 * @param {object} user The user.
 * @param {object} project The project.
 */
const bulkInsertOrUpdateAnnotations = async (payloads, user, project) => {
  const items = payloads.map((p) => p.item)
  const itemIds = payloads.map((p) => p.item._id)

  const oneAnnotationPerSlot = payloads.flatMap((p) =>
    p.annotations.map((annotation) => ({
      ...annotation,
      item: p.item._id,
      _user: user,
      project: project._id,
    }))
  )

  const { toInsert, toCancel } = await filterAnnotationsToUpdate(itemIds, oneAnnotationPerSlot)

  const { logs, perItem } = registerAnnotationLogs(itemIds, toInsert, toCancel, user, project)

  await Promise.all([
    bulkWriteAnnotations(toInsert, toCancel),
    saveLogs([...logs, ...genLogTagsMultipleItems(items)]),
    updateItemsAfterBulkAnnotation(items, perItem, payloads, user),
    updateStats(project._id, items, perItem),
  ])
}

const insertOrUpdateAnnotations = async (payloads, itemId, params) => {
  payloads.forEach((p) => {
    p.item = itemId
    p._user = params._user
    p.project = params.project
  })

  const { toInsert, toCancel } = await filterAnnotationsToUpdate([itemId], payloads)

  const { logs } = registerAnnotationLogs([itemId], toInsert, toCancel, params._user, params.project)

  return Promise.all([
    Promise.all(toInsert.map((annotation) => annotation.save(params))),
    Promise.all(toCancel.map((annotation) => annotation.save(params))),
    saveLogs(logs),
  ])
}

/**
 * @typedef {object} ExternalEntity
 * @prop {string} value
 * @prop {object} [coords]
 * @prop {number} [start_char]
 * @prop {number} [end_char]
 * @prop {number} [ent_id]
 */

/**
 * @typedef {object} InternalEntity
 * @prop {string} value
 * @prop {object} [zone]
 * @prop {{ start: number, end: number, ent_id: number }} [ner]
 */

/**
 * @typedef {object} ExternalRelation
 * @prop {string} value
 * @prop {number} src
 * @prop {number} dest
 */

/**
 * @typedef {object} InternalRelation
 * @prop {string} value
 * @prop {InternalEntity} src
 * @prop {InternalEntity} dest
 */

/**
 * Entity mapper function.
 * @param {function(ExternalEntity): InternalEntity} fn The function to map.
 * @returns {function({ entities: Array }): Array} The generated mapper.
 */
const entityMapper =
  (fn) =>
  ({ entities }) =>
    entities.map(fn)

/**
 * We don't need the name of the category to name an entity.
 * @param {('classifications'|'ner'|'zone')} type The type.
 * @returns {function({ labels: any[], entities: ExternalEntity[] }): InternalEntity[] } The return value.
 */
const categoryMapper = (type) => {
  switch (type) {
    case 'classifications':
      return ({ labels }) => labels
    case 'ner':
      return entityMapper((entity) => ({
        value: entity.value,
        ner: {
          ent_id: entity.ent_id,
          start: entity.start_char,
          end: entity.end_char,
        },
      }))
    case 'zone':
      return entityMapper((entity) => ({
        value: entity.value,
        zone: entity.coords,
      }))
    case 'text':
      return entityMapper((entity) => ({
        value: entity.value,
        text: entity.text,
      }))
    default:
      return () => []
  }
}

const relationsToEntitiesRelations = (relations, annotations) =>
  relations.map((relation) => {
    const src = annotations.find((a) => a.ner && a.ner.ent_id === relation.src)
    const dest = annotations.find((a) => a.ner && a.ner.ent_id === relation.dest)
    return {
      value: relation.label,
      src: {
        value: src.value,
        ner: { ...src.ner },
      },
      dest: {
        value: dest.value,
        ner: { ...dest.ner },
      },
    }
  })

const deleteEntId = (annotations) =>
  annotations.forEach((a) => {
    if (a.ner) {
      delete a.ner.ent_id
    }
  })

const formatAnnotationsForImport = (project, entry) => {
  const types = Object.entries(entry.annotation)
  const entitiesRelations = []

  const annotations = types.flatMap(([type, categories]) => {
    let tmpRelations
    if (Array.isArray(categories.relations)) {
      tmpRelations = categories.relations
      delete categories.relations
    }

    const parsed = Object.values(categories).flatMap(categoryMapper(type))

    if (tmpRelations) {
      entitiesRelations.push(...relationsToEntitiesRelations(tmpRelations, parsed))
    }

    // ent_id is not used internally, we delete it after use
    // because entitiesRelations contain references to src and dest, it will also be
    // deleted here
    deleteEntId(parsed)

    return parsed
  })
  entitiesRelations.forEach((e) => deleteEntId([e.src, e.dest]))

  return {
    uuid: entry.item.uuid,
    compositeUuid: toCompositeUuid(project, entry.item),
    seenAt: new Date(entry.itemMetadata.seenAt),
    annotatedAt: new Date(entry.annotationMetadata.annotatedAt),
    lastAnnotator: { email: entry.annotationMetadata.annotatedBy },
    tags: entry.markers || entry.tags,
    comments: entry.comments,
    entitiesRelations,
    annotations,
  }
}

const findRelationWithProps = (payload) => (annotation) =>
  payload.value === annotation.value &&
  payload.ner.start === annotation.start_char &&
  payload.ner.end === annotation.end_char

const formatNerRelations = (doc, annotations) => {
  if (!annotations.ner) {
    return annotations
  }

  const ner = Object.values(annotations.ner)

  annotations.ner.relations = doc.entitiesRelations
    .map((relationPayload) => {
      const output = {
        label: relationPayload.value,
      }

      for (const category of ner) {
        const src = category.entities.find(findRelationWithProps(relationPayload.src))
        const dest = category.entities.find(findRelationWithProps(relationPayload.dest))

        if (src) output.src = src.ent_id
        if (dest) output.dest = dest.ent_id
        if (output.src && output.dest) {
          break
        }
      }

      return output
    })
    .filter((r) => typeof r.src === 'number' && typeof r.dest === 'number')

  return annotations
}

const getCategoryFormatFromType = (type) => {
  switch (type) {
    case 'classifications':
      return { labels: [] }
    case 'zone':
    case 'ner':
    case 'text':
      return { entities: [] }
    default:
      return null
  }
}

const createAnnotationObject = (obj, type, category) => {
  if (!obj[type]) obj[type] = {}

  if (!obj[type][category]) {
    obj[type][category] = getCategoryFormatFromType(type)
  }
  return obj[type][category]
}

const formatAnnotationsForExport = (annotations, isOld) => {
  let nerRelationIndex = 0

  return annotations.reduce((output, annotation) => {
    const { category, type } = annotation.task

    const curr = createAnnotationObject(output, type, category)

    let entity = {
      value: annotation.task.value,
    }

    if (isOld) {
      entity.createdAt = annotation.createdAt
      entity.updatedAt = annotation.updatedAt
    }

    if (type === 'classifications') {
      curr.labels.push(entity)
      return output
    }

    const field = annotation[type]
    switch (type) {
      case 'ner':
        entity = {
          ...entity,
          start_char: field.start,
          end_char: field.end,
          ent_id: nerRelationIndex++,
        }
        break
      case 'zone':
        entity.coords = field
        break
      case 'text':
        entity.text = field
        break
      default:
        break
    }

    curr.entities.push(entity)
    return output
  }, {})
}

const addItemsToAnnotations = (annotations, items) =>
  annotations.map((a) => ({ ...a, item: items.find((item) => item.compositeUuid === a.compositeUuid) }))

const addEntitiesRelationsToItems = (annotations) => {
  annotations.forEach((a) => {
    if (a.entitiesRelations) {
      a.item.entitiesRelations = a.entitiesRelations
      delete a.entitiesRelations
    }
  })
}

const removeAnnotationsWithNoItem = (annotations, uuidNotFound) =>
  annotations.filter((a) => {
    if (!a.item) uuidNotFound.push(a.uuid)
    return a.item
  })

/**
 * Insert a batch of annotations.
 * @param {Project} project Project model.
 * @param {Array<Annotations>} batch
 * @param {User} user
 * @param {{inserted: string, uuidNotFound: Array<string>}} response
 * @returns {Promise<void>}
 */
const insertAnnotationsBatch = async (project, batch, user, response) => {
  let annotationsToCreate = batch.map((line) => formatAnnotationsForImport(project, line))

  const items = await findItemsByCompositeUuid(annotationsToCreate.map(({ compositeUuid }) => compositeUuid))

  annotationsToCreate = addItemsToAnnotations(annotationsToCreate, items)
  annotationsToCreate = removeAnnotationsWithNoItem(annotationsToCreate, response.uuidNotFound)
  addEntitiesRelationsToItems(annotationsToCreate)

  annotationsToCreate.forEach((item) => validateTasksAndAddObject(project, item))

  await Promise.all([
    bulkInsertOrUpdateAnnotations(annotationsToCreate, user, project),
    bulkInsertComments(annotationsToCreate, project._id),
    updateItemsTags(annotationsToCreate),
  ])

  response.inserted += batch.length
}

module.exports = {
  insertOrUpdateAnnotations,
  changeAnnotationsStatus,
  isZoneAnnotationToCancel,
  isNerAnnotationToCancel,
  isClassificationAnnotationToCancel,
  insertAnnotationsBatch,
  formatAnnotationsForExport,
  formatNerRelations,
}
