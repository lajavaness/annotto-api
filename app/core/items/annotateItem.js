const mongoose = require('mongoose')
const { insertOrUpdateAnnotations } = require('../annotations')
const { validateTasksAndAddObject } = require('../projects')
const { filterAnnotationValues, calculateAnnotationTimesAndVelocity, saveItem } = require('./index')
const { logRelations } = require('../logs')

/**
 * Takes a list of annotations payload and create/cancel modified annotations
 * Create annotations and update annotated item document with stats and dates
 * ( date coming either from params for annotation imports or current date for
 * a new annotation ).
 * @param {*} item The item.
 * @param {*} payload The payload.
 * @param {*} params The params.
 * @returns {Promise.<object>} The annotation.
 */
const annotateItem = async (item, payload, params) => {
  if (!params.project.populated('tasks')) {
    await params.project.populate('tasks').execPopulate()
  }
  const { project } = params

  const payloadWithClassificationId = validateTasksAndAddObject(project, payload)

  const [newAnnotations, canceledAnnotations] = await insertOrUpdateAnnotations(
    payloadWithClassificationId,
    item._id,
    params
  )

  // virtual passed by item post hook save to task.updateStats
  item.annotationsVirtual = { inserted: newAnnotations, cancelled: canceledAnnotations }

  if (payload.entitiesRelations) {
    await logRelations(item, payload.entitiesRelations, project, params)
    item.entitiesRelations = payload.entitiesRelations
  }

  if (
    (payload.annotations && payload.annotations.length) ||
    (payload.entitiesRelations && payload.entitiesRelations.length)
  ) {
    item.annotationValues = filterAnnotationValues(item.annotationValues, newAnnotations, canceledAnnotations)
    item.annotatedAt = params.annotatedAt || new Date()

    const result = calculateAnnotationTimesAndVelocity(item)

    if (result) {
      item.annotationTimes.push(result.annotationTime)
      item.velocity = result.velocity
    }

    if (!item.annotatedBy.includes(params._user.email)) {
      item.annotatedBy.push(params._user.email)
    }

    item.lastAnnotator = params._user
    if (!item.annotated) {
      item.annotated = true
      // virtual passed by item post save to project.updateStats
      item.firstAnnotationVirtual = true
    }
  }
  await saveItem(item, params._user)

  const result = await mongoose.model('Annotation').find({ item: item._id, status: 'done' })
  return result
}

module.exports = annotateItem
