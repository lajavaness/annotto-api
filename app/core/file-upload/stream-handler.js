const { batch: Batch } = require('stream-json/utils/Batch')
const { pipeline } = require('stream/promises')
const { logger } = require('../../utils/logger')
const { validatePrediction, validateItem, validateAnnotation } = require('./jsonlines')
const Task = require('../../db/models/tasks')
const predictions = require('./predictions')
const { updateItemCount } = require('../projects')
const { insertAnnotationsBatch } = require('../annotations')
const { insertItemsBatch, updateItemsBatch, toCompositeUuid, findItemByCompositeUuid, saveItem } = require('../items')
const {
  fileUpload: { batchSize },
} = require('../../../config')

const debugPerf = (...args) => {
  if (process.env.NODE_ENV !== 'test') {
    logger.info(...args)
  }
}
const ndjson = require('./ndjson')

/**
 * Manage a stream of entries to validate.
 * @param {ReadableStream} stream The stream.
 * @param {function(object, number): (Promise.<void> | void)} validation The validation function.
 * @param {function(object[]): Promise.<void>} action The action function.
 */
const handleStream = async (stream, validation, action) => {
  const batchStream = Batch({ batchSize })
  const parserStream = ndjson.parse()

  const p = pipeline(stream, parserStream, batchStream)

  let i = 1
  const now = Date.now()
  let validationTime = 0
  let actionTime = 0
  let totalElems = 0
  for await (const batch of batchStream) {
    const validationNow = Date.now()
    await Promise.all(batch.map((item, j) => validation(item, j * i))) // eslint-disable-line no-loop-func
    validationTime += Date.now() - validationNow

    const actionNow = Date.now()
    await action(batch)
    actionTime += Date.now() - actionNow

    i++
    totalElems += batch.length
    debugPerf('total for now', totalElems)
  }
  debugPerf('validation took', validationTime / 1000, 's')
  debugPerf('action took', actionTime / 1000, 's')
  debugPerf('stream handled in', (Date.now() - now) / 1000, 's')
  debugPerf('number of elems:', totalElems)
  await p // ensure pipeline errors are caught by the caller
}

/**
 * Pipe items stream to ndjson transform stream, and to batch transform stream.
 * On query error, in catch, emit busboy error event with .destroy.
 * @param {ReadableStream} stream
 * @param {boolean} isUpdate
 * @param {Project} project
 * @returns {Promise<{inserted: number, updated: number}>}
 */
const handleItemStream = async ({ stream, isUpdate, project }) => {
  const response = {
    inserted: 0,
    updated: 0,
  }

  await handleStream(
    stream,
    (item, i) => validateItem(item, project.type, i),
    async (batch) => {
      try {
        // insert or update batch items
        if (isUpdate) {
          await updateItemsBatch(batch, project._id, response)
        } else {
          await insertItemsBatch(project._id, batch)
          response.inserted += batch.length
        }
      } catch (error) {
        if (error.message.includes('E11000')) {
          throw new Error('Error project creation : Duplicate item uuid')
        }
        throw error
      }
    }
  )

  project.itemCount = await updateItemCount(project._id)

  return response
}

const handleItemPredictionStream = async ({ stream, project }) => {
  const response = {
    inserted: 0,
  }
  const tasks = await Task.find({ project: project._id })

  await handleStream(
    stream,
    (elem, i) => validatePrediction(elem, tasks, i),
    async (batch) => {
      // update items with predictions
      for (const line of batch) {
        const item = await findItemByCompositeUuid(toCompositeUuid(project, line))

        if (!item) throw new Error(`Error project creation: Cannot find item matching prediction.uuid (${line.uuid})`)
        item.predictions = predictions.convertToModel(line.annotations, project.filterPredictionsMinimum)
        response.inserted++
        await saveItem(item)
      }
    }
  )

  return response
}

/**
 * Handler for importing annotations.
 * @param {ReadableStream} stream
 * @param {Project} project
 * @param {User} _user
 * @returns {Promise<{inserted: number, uuidNotFound: *[]}>}
 */
const handleAnnotationsImportStream = async ({ stream, project, _user }) => {
  const response = {
    inserted: 0,
    uuidNotFound: [],
  }

  if (!project.populated('tasks')) {
    await project.populate('tasks').execPopulate()
  }

  await handleStream(stream, validateAnnotation, async (batch) =>
    insertAnnotationsBatch(project, batch, _user, response)
  )

  return response
}

module.exports = {
  handleItemStream,
  handleItemPredictionStream,
  handleAnnotationsImportStream,
}
