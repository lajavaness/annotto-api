/* eslint-disable no-use-before-define */
const archiver = require('archiver')
const fs = require('fs/promises')
const tmp = require('tmp')
const isStream = require('is-stream')

const Annotation = require('../../../db/models/annotations')
const Comment = require('../../../db/models/comments')
const Clients = require('../../../db/models/clients')
const Item = require('../../../db/models/items')

const { generateError } = require('../../../utils/error')
const queryToStream = require('./queryToStream')
const { formatAnnotationsForExport, formatNerRelations } = require('../../annotations')
const { logger } = require('../../../utils/logger')

const download = async (
  projectId,
  project,
  { annotationsAndComments = false, withHistory = false, allItems = false, config = false }
) => {
  const archive = archiver('zip', { zlib: { level: 9 } })

  let archiveError

  archive.on('error', (error) => {
    console.error(error)
    logger.error(error)

    archiveError = generateError({
      code: 500,
      message: 'ERROR_ARCHIVER_STREAM',
    })
  })

  const promises = []

  if (annotationsAndComments) {
    const filename = 'annotations.jsonlines'
    const query = Item.find({ project: projectId, annotated: true }).select(
      'raw tags metadata entitiesRelations createdAt updatedAt seenAt lastAnnotator.email'
    )
    const action = formatExportItem(withHistory)
    promises.push(addToZip(archive, filename, queryToStream(query, filename, action)))
  }

  if (allItems) {
    const filename = 'items.jsonlines'
    const query = Item.find({ project: projectId })
    promises.push(addToZip(archive, filename, queryToStream(query, filename, cleanupItem)))
  }

  if (config) {
    promises.push(addToZip(archive, 'config.json', configToFile(project)))
  }

  await Promise.all(promises)

  // to catch an error that may have happened during the promises
  if (archiveError) {
    throw archiveError
  }

  return archive
}

const configToFile = async (project) => {
  const file = tmp.fileSync()

  const client = await Clients.findById(project.client)

  const config = {
    tasks: project.tasks,
    name: project.name,
    client: client ? client.name : '',
    type: project.type,
    guidelines: project.guidelines,
    highlights: project.highlights,
    shortDescription: project.shortDescription,
    description: project.description,
    admins: project.admins,
    users: project.users,
    dataScientists: project.dataScientists,
    defaultTags: project.defaultTags,
    similarityEndpoint: project.similarityEndpoint,
    showPredictions: project.showPredictions,
    prefillPredictions: project.prefillPredictions,
    filterPredictionsMinimum: project.filterPredictionsMinimum,
    deadline: project.deadline,
    entitiesRelationsGroup: project.entitiesRelationsGroup,
  }

  await fs.appendFile(file.name, JSON.stringify(config, null, 3))
  return file
}

const addToZip = (archive, name, promise) =>
  promise.then((file) => (isStream(file) ? archive.append(file, { name }) : archive.file(file.name, { name })))

/*
const removeId = (_) => ({ ..._, _id: undefined })

const cleanupHistoricAnnotations = (annotations) => annotations.map((a) => ({
  text: a.text,
  zone: a.zone,
  ner: a.ner ? removeId(a.ner) : undefined,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
  task: {
    label: a.task?.label
  }
}))
*/

const exportAnnotations = (doc, annotations) => {
  const current = []
  const old = []

  annotations.forEach((elem) => (elem.status === 'done' ? current.push(elem) : old.push(elem)))

  return {
    annotationMetadata: {
      annotatedBy: doc.lastAnnotator?.email,
      annotatedAt: current.length ? current[0].updatedAt : null,
      createdAt: current.length ? current[0].createdAt : null,
    },
    annotation: formatNerRelations(doc, formatAnnotationsForExport(current)),
    // cleanupHistoricAnnotations(
    historicAnnotations: old.map((a) => formatNerRelations(doc, formatAnnotationsForExport([a], true))),
    // )
  }
}

const formatExportItem = (withHistory) => async (doc) => {
  const criteria = { item: doc._id }
  if (!withHistory) {
    criteria.status = 'done'
  }

  const [annotations, comments] = await Promise.all([
    Annotation.find(criteria).lean().select('status updatedAt createdAt zone.x zone.y ner.start ner.end text -_id'),
    Comment.find({ item: doc._id })
      .sort({ createdAt: -1 })
      .lean()
      .select('comment user.email user.firstName user.lastName createdAt updatedAt -_id'),
  ])

  if (doc?.raw?.entitiesRelations) {
    delete doc.raw.entitiesRelations
  }
  return {
    uuid: doc.uuid,
    item: doc.raw,
    itemMetadata: {
      createdAt: doc.createdAt,
      updated: doc.updatedAt,
      seenAt: doc.seenAt,
    },
    tags: doc.tags,
    comments,
    metadata: doc.metadata,
    ...exportAnnotations(doc, annotations),
  }
}

const cleanupItem = (doc) => {
  Object.keys(doc).forEach((key) => {
    if (Array.isArray(doc[key]) && !doc[key].length) {
      delete doc[key]
    }
  })
  delete doc._id
  delete doc.body
  delete doc.compositeUuid
  delete doc.__v
  delete doc.annotationValues
  delete doc.annotationTimes
  delete doc.commentCount
  delete doc.logCount
  delete doc.updatedAt
  doc.lastAnnotator = {
    email: doc.lastAnnotator?.email,
  }
  delete doc.raw
  delete doc.project
  delete doc.status
  return doc
}

module.exports = {
  download,
  exportAnnotations,
}
