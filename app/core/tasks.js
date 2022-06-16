const mongoose = require('mongoose')
const { setQuery } = require('../utils/query-builder')('mongo')
const Task = require('../db/models/tasks')
const { generateError } = require('../utils/error')

const {
  Types: { ObjectId },
} = mongoose

const browse = (criteria = {}, params = {}) => {
  const q = mongoose.model('Task').find(criteria)
  setQuery(q, params)

  return q.lean()
}

/*
  To build an array with all tasks and not one Query per task :
  Call ObjectId() to set ids manually and give them as ref to children.
  Also condition to check duplicate children in config are not created twice, but update query tasks parents.

  example if 'foo' category is children of both RA and RB in config, RB's foo child will update object to :
  {
    value: 'foo',
    parents: [RA_id, RB_id],
    ...
  }
*/
const createInsertManyRecursive = ({
  projectId,
  task,
  conditions,
  categoryType,
  categoryName,
  categoryMin,
  categoryMax,
  insertManyQuery,
}) => {
  task._id = ObjectId()

  insertManyQuery.push({
    _id: task._id,
    project: projectId,
    description: task.description,
    color: task.color,
    value: task.value,
    hotkey: task.hotkey,
    label: task.label,
    type: categoryType,
    conditions,
    category: categoryName,
    exposed: task.exposed,
    min: categoryMin,
    max: categoryMax,
  })
}

/**
 * After building the tree, there are some properties we don't want to keep
 * in the exported object.
 * @param {Classif[]} classifs The classifs.
 */
const cleanupExport = (classifs) => {
  for (const classif of classifs) {
    delete classif._id
    delete classif.parents
    delete classif.annotationCount
    delete classif.annotationPourcent
    delete classif.project
    delete classif.createdAt
    delete classif.__v
    delete classif.done
  }
}

/**
 * @typedef {object} Classif
 */

/**
 * @typedef {object} ClassificationType
 * @property {string} name
 * @property {number} min
 * @property {number} max
 * @property {Classif[]} values
 */

/**
 * @typedef {object<string, ClassificationType[]>} ClassificationTree
 */

/**
 * Update all project's task stat, for new ( as in : task was not annotated ) and canceled annotations
 * annotationCount: number of items annotated with the same task
 * annotationPourcent: percentage of annotations classified with a specific task.
 * @param {object} project The project.
 * @param {number} annotatedItemsCount The annotated items count.
 * @param {{itemId: object, inserted: object[], cancelled: object[]}[]} annotationsPerItem The annotations per item.
 * @returns {Promise} Nothing.
 */
const updateClassificationStats = async (project, annotatedItemsCount, annotationsPerItem) => {
  const tasks = await mongoose.model('Task').find({ project }).select('annotationCount')

  const hasClassif = (annotations, classifId) => annotations.filter((a) => a.task._id.equals(classifId))

  const toUpdate = tasks.map((c) => {
    // we only want to count an item once, so we substract its additions and substractions
    // if the result is > 0, we add 1, < 0, we substract 1
    const annotationCount = annotationsPerItem
      .map(({ inserted, cancelled }) => {
        const sum = hasClassif(inserted, c._id).length - hasClassif(cancelled, c._id).length
        if (sum === 0) return 0
        if (sum >= 1) return 1
        return -1
      })
      .reduce((a, b) => a + b, c.annotationCount)

    return {
      updateOne: {
        filter: { _id: c._id },
        update: {
          annotationCount,
          annotationPourcent: annotatedItemsCount ? Math.ceil((annotationCount / annotatedItemsCount) * 100) : 0,
        },
      },
    }
  })

  return mongoose.model('Task').bulkWrite(toUpdate)
}

const update = (tasks) =>
  Promise.all(
    tasks.map((task) => {
      const fieldsToUpdate = {
        category: task.category,
        min: task.min,
        max: task.max,
        name: task.name,
        color: task.color,
        hotkey: task.hotkey,
        description: task.description,
        exposed: task.exposed,
        label: task.label,
      }
      return mongoose.model('Task').updateOne({ _id: task._id }, fieldsToUpdate)
    })
  )

/*
  Parse front end task payload ( with string values in .parents array )
  Parents to create is one not pushed yet in document project.tasks
*/
const createTasksByProject = async (project, newClassificationsPayload) => {
  const tasksToCreate = newClassificationsPayload.filter(
    (newTask) => !project.tasks.find((oneTask) => oneTask.value === newTask.value)
  )

  // Again Create tasks in series to avoid race condition between concurrent identical parent creation
  for (const t of tasksToCreate) {
    const doc = new Task({
      project: project._id,
      ...t,
    })
    doc.save()
    project.tasks.push(doc)
  }
}

/*
  Takes array of tasks, update the ones with _id, create the others ( recursively if their parent need to be created )
*/
const createAndUpdate = async (currentClassifications, classificationsPayload = [], projectId) => {
  const classificationToUpdate = classificationsPayload.filter((task) => task._id)

  // Checks that all parents.value of req.body.tasks exist in current tasks
  // or in one to be created
  const parentDoesNotExist = classificationsPayload
    .filter((classif) => Array.isArray(classif.parents))
    .find((classif) =>
      classif.parents.find((parentValue) => {
        const parentIsNotInCurrent = !currentClassifications.find((c) => c.value === parentValue)
        const parentIsNotInNew = !classificationsPayload.some((payload) => payload.value === parentValue)

        return parentIsNotInCurrent && parentIsNotInNew
      })
    )

  if (parentDoesNotExist) {
    throw generateError({
      code: 400,
      message: 'ERROR_PROJECT_UPDATE_WRONG_PARENT',
      infos: JSON.stringify(parentDoesNotExist),
    })
  }

  await update(classificationToUpdate)

  const project = await mongoose.model('Project').findOne({ _id: projectId }).populate('tasks').select('+s3')

  const newClassifications = classificationsPayload.filter((task) => !task._id)

  // Create new tasks in series to avoid race condition between concurrent identical parent creation
  await createTasksByProject(project, newClassifications)

  return project
}

module.exports = {
  browse,
  createInsertManyRecursive,
  cleanupExport,
  updateClassificationStats,
  createAndUpdate,
}
