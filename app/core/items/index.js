const mongoose = require('mongoose')
const AWS = require('aws-sdk')
const AmazonS3URI = require('amazon-s3-uri')
const { setQuery } = require('../../utils/query-builder')('mongo')
const { logger } = require('../../utils/logger')
const { decrypt } = require('../../utils/crypto')
const { generateError } = require('../../utils/error')
const { highlights } = require('../../utils/external')

const { updateClassificationStats } = require('../tasks')
const { updateProjectStats } = require('../projects')
const { logTags } = require('../logs')

const browse = (criteria = {}, params = {}) => {
  const q = mongoose.model('Item').find(criteria)
  setQuery(q, params)

  return q.lean()
}

const toCompositeUuid = (project, item) => `${typeof project === 'string' ? project : project._id}_${item.uuid}`

const findItemsByCompositeUuid = (compositeUuids) =>
  mongoose.model('Item').find({ compositeUuid: { $in: compositeUuids } })

const findItemByCompositeUuid = (compositeUuid) => mongoose.model('Item').findOne({ compositeUuid })

const deleteUndefinedProps = (obj) => {
  Object.keys(obj).forEach((prop) => {
    if (typeof obj[prop] === 'undefined') {
      delete obj[prop]
    }
  })
  return obj
}

const transformLineToItem = (line, projectId, isUpdate = false) => {
  const body = line.data && line.data.text ? line.data.text : line.data.body

  const undefIfUpdate = (val) => (isUpdate ? undefined : val)

  const obj = {
    raw: line || undefIfUpdate({}),
    predictions: undefIfUpdate({}),
    highlights: undefIfUpdate([]),
    project: mongoose.Types.ObjectId(projectId),
    uuid: line.uuid,
    compositeUuid: `${projectId}_${line.uuid}`,
    data: line.data,
    type: line.type || line.datatype,
    body,
    tags: (line.tags ? line.tags : line.markers) || undefIfUpdate([]),
    metadata: line.metadata || undefIfUpdate({}),
    description: line.description || undefIfUpdate(''),
    status: undefIfUpdate('todo'),
    annotated: undefIfUpdate(false),
    annotatedBy: undefIfUpdate([]),
    annotationValues: undefIfUpdate([]),
    entitiesRelations: undefIfUpdate([]),
    updatedAt: Date.now(),
    createdAt: undefIfUpdate(Date.now()),
    velocity: undefIfUpdate(null),
    annotationTimes: undefIfUpdate([]),
    lastAnnotator: undefIfUpdate(null),
    commentCount: undefIfUpdate(0),
    logCount: undefIfUpdate(0),
    sourceHighlights: undefIfUpdate([]),
  }

  return isUpdate ? deleteUndefinedProps(obj) : obj
}

const insertItemsBatch = (projectId, items) => {
  const batch = items.map((i) => transformLineToItem(i, projectId, false))

  // we don't need to validate the object because it's already done by joi validators in an earlier stage
  return mongoose.model('Item').collection.insertMany(batch, { ordered: false })
}

const updateItemsBatch = (batch, projectId, response) =>
  Promise.all(
    batch.map(async (line) => {
      const update = transformLineToItem(line, projectId, true)
      const item = await mongoose
        .model('Item')
        .findOneAndUpdate({ compositeUuid: toCompositeUuid(projectId, line) }, update)

      if (!item) throw new Error('Error project creation: Cannot find item uuid to update')
      else response.updated += 1
    })
  )

/**
 * Get highlights.
 * @param {string[]} seeds The seeds.
 * @param {string} body The body.
 * @returns {Promise.<string[]>} The highlights.
 */
const getHighlights = async (seeds, body) => {
  try {
    return highlights(seeds, body)
  } catch (err) {
    console.error('Error in highlights api request : ', err)
    return []
  }
}

const updateItemsTags = (annotations) =>
  mongoose.model('Item').bulkWrite(
    annotations.map((a) => ({
      updateOne: {
        filter: { compositeUuid: a.compositeUuid },
        update: { $set: { tags: a.tags } },
      },
    }))
  )

/**
 * When project highlight is removed, item.highlight is also removed
 * When project highlight was updated ( item.sourceHighlights doesn't match )
 * item.highlights and item.sourceHighlights are updated.
 * @param {string[]} projectHighlights The project highlights.
 * @param {string[]} sourceHighlights The source highlights.
 * @param {string} body The body.
 * @returns {Promise.<{ highlights: string[], sourceHighlights: string[] }>} The updated highlights.
 */
const updateHighlights = async (projectHighlights, sourceHighlights, body) => {
  if (!Array.isArray(projectHighlights) || !projectHighlights.length) {
    return {
      highlights: [],
      sourceHighlights: [],
    }
  }

  if (
    !Array.isArray(sourceHighlights) ||
    projectHighlights.length !== sourceHighlights.length ||
    projectHighlights.some((highlight) => !sourceHighlights.includes(highlight))
  ) {
    return {
      highlights: await getHighlights(projectHighlights, body),
      sourceHighlights: projectHighlights,
    }
  }

  return {
    highlights: [],
    sourceHighlights,
  }
}

/**
 * Update item stats.
 * @param {object} item The item.
 * @param {object | string} item._id To know which tasks stats to update.
 * @param {object | string} item.project To know which project to update.
 * @param {boolean} item.firstAnnotationVirtual To update project stats.
 * @param {{inserted: object[], cancelled: object[]}} item.annotationsVirtual To update task stats.
 * @returns {Promise} Nothing.
 */
const updateItemStats = async ({ _id: itemId, project, firstAnnotationVirtual, annotationsVirtual }) => {
  const annotatedItems = await mongoose
    .model('Item')
    .find({
      project,
      annotated: true,
    })
    .select('velocity')
    .lean()

  return Promise.all([
    updateProjectStats(project, annotatedItems, firstAnnotationVirtual),
    updateClassificationStats(project, annotatedItems.length, [
      {
        itemId,
        ...annotationsVirtual,
      },
    ]),
  ])
}

const filterAnnotationValues = (annotationValues, newAnnotations, canceledAnnotations) => {
  const vals = annotationValues.filter(
    (value) => !canceledAnnotations.find((annotation) => annotation.task.value === value)
  )
  newAnnotations.forEach((annotation) => vals.push(annotation.task.value))

  return vals
}

/**
 * Velocity is the median of all annotationTimes.
 * @param {object} item The item.
 * @param {number} item.seenAt The seenAt prop of the item.
 * @param {number} item.annotatedAt The annotatedAt prop of the item.
 * @param {number[]} item.annotationTimes The annotationTimes prop of the item.
 * @returns {{annotationTime: number, velocity: number}} The annotation time and velocity.
 */
const calculateAnnotationTimesAndVelocity = (item) => {
  if (!item.seenAt) {
    return null
  }
  const diffTime = Math.abs(item.annotatedAt - item.seenAt)
  const annotationTime = Math.ceil(diffTime / 1000)

  const sorted = [...item.annotationTimes, annotationTime].sort((a, b) => a - b)
  const velocity = sorted[Math.round((sorted.length - 1) / 2)]
  return {
    annotationTime,
    velocity,
  }
}

const updateItemsAfterBulkAnnotation = async (items, annotations, itemMetadata, user) => {
  annotations.forEach(({ itemId, cancelled, inserted }) => {
    const meta = itemMetadata.find((v) => v.item._id.equals(itemId))
    const { item } = meta
    item.annotationValues = filterAnnotationValues(item.annotationValues, inserted, cancelled)
    item.seenAt = meta.seenAt
    item.lastAnnotator = meta.lastAnnotator
    item.annotatedAt = meta.annotatedAt

    const result = calculateAnnotationTimesAndVelocity(item)
    if (result) {
      item.annotationTimes.push(result.annotationTime)
      item.velocity = result.velocity
    }

    if (!item.annotatedBy.includes(user.email)) {
      item.annotatedBy.push(user.email)
    }

    item.lastAnnotator = user
    if (!item.annotated) {
      item.annotated = true
    }
  })

  await mongoose.model('Item').bulkWrite(
    items.map((item) => ({
      updateOne: {
        filter: { _id: item._id },
        update: {
          $set: {
            lastAnnotator: item.lastAnnotator,
            annotationValues: item.annotationValues,
            annotatedAt: item.annotatedAt,
            annotationTimes: item.annotationTimes,
            velocity: item.velocity,
            seenAt: item.seenAt,
            annotatedBy: item.annotatedBy,
            entitiesRelations: item.entitiesRelations,
            annotated: true,
          },
          $inc: {
            logCount: 1, // item changed so + 1
          },
        },
      },
    })),
    { ordered: false }
  )
}

const putImgContentInItem = async (item, s3Config, next) => {
  let s3Params

  try {
    s3Params = AmazonS3URI(item.data.url)
  } catch (err) {
    next(
      generateError({
        code: 403,
        message: 'ERROR_INVALID_S3_URI',
      })
    )
    return null
  }

  try {
    const s3 = new AWS.S3({
      accessKeyId: decrypt(s3Config.accessKeyId),
      secretAccessKey: decrypt(s3Config.secretAccessKey),
    })
    const data = await s3
      .getObject({
        Bucket: s3Params.bucket,
        Key: s3Params.key,
      })
      .promise()

    item.data.url = `data:${data.ContentType};base64,`
    item.data.url += data.Body.toString('base64')

    return item
  } catch (error) {
    console.error(error)
    logger.error(error.stack)
    next(
      generateError({
        code: 403,
        message: 'ERROR_S3_GETOBJECT',
      })
    )
    return null
  }
}

const saveItem = async (item, user) => {
  await item.save({ _user: user })

  await mongoose
    .model('Project')
    .updateOne({ _id: item.project }, { $addToSet: { itemTags: item.tags } })
    .exec()

  if (item.annotationsVirtual) await updateItemStats(item)
  await logTags(item)
  return item
}

module.exports = {
  saveItem,
  browse,
  insertItemsBatch,
  updateItemsBatch,
  updateItemsTags,
  toCompositeUuid,
  findItemsByCompositeUuid,
  findItemByCompositeUuid,
  transformLineToItem,
  updateHighlights,
  updateItemsAfterBulkAnnotation,
  updateItemStats,
  putImgContentInItem,
  filterAnnotationValues,
  calculateAnnotationTimesAndVelocity,
}
