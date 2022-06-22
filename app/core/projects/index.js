const mongoose = require('mongoose')

const Project = require('../../db/models/projects')
const { encrypt } = require('../../utils/crypto')
const { generateError } = require('../../utils/error')
const User = require('../../services/user')
const { logProject } = require('../logs')

const validateRelations = (project, relationsPayload) => {
  relationsPayload.forEach((relation) => {
    const src = project.tasks.find((c) => c.value === relation.src.value)
    const dest = project.tasks.find((c) => c.value === relation.dest.value)

    const relationLabel = project.entitiesRelationsGroup.some((group) =>
      group.values.some((label) => label.value === relation.value)
    )

    const cnt = project.entitiesRelationsGroup.map((group) => {
      const total = {
        name: group.name,
        count: 0,
        min: group.min,
        max: group.max,
      }
      relationsPayload.forEach((annotation) => {
        if (group.values.some((obj) => obj.value === annotation.value)) {
          total.count++
        }
      })

      return total
    })

    const noMinMatchGroup = cnt.find((group) => group.count < group.min)
    const noMaxMatchGroup = cnt.find((group) => group.count > group.max)

    if (noMinMatchGroup) {
      throw generateError({
        code: 400,
        message: 'TOO_FEW_RELATIONS_ANNOTATED',
        infos: `Group (${noMinMatchGroup.name}) require MIN : ${noMinMatchGroup.min} relations`,
      })
    }
    if (noMaxMatchGroup) {
      throw generateError({
        code: 400,
        message: 'TOO_MANY_RELATIONS_ANNOTATED',
        infos: `Group (${noMaxMatchGroup.name}) require MAX  : ${noMaxMatchGroup.min} relations`,
      })
    }
    if (!src) {
      throw generateError({
        code: 400,
        message: 'RELATION_SRC_NOT_FOUND',
        infos: `Relation src (${relation.src.value}) is not a project task`,
      })
    }
    if (!dest) {
      throw generateError({
        code: 400,
        message: 'RELATION_DEST_NOT_FOUND',
        infos: `Relation dest (${relation.dest.value}) is not a project task`,
      })
    }
    if (!relationLabel) {
      throw generateError({
        code: 400,
        message: 'RELATION_LABEL_NOT_FOUND',
        infos: `Relation label (${relation.value}) is not in any project entitiesRelationsGroup`,
      })
    }
  })
}

const validateAnnotations = (project, annotationsPayload) => {
  annotationsPayload.forEach((annotation) => {
    const task = project.tasks.find((c) => c.value === annotation.value)
    if (!task) {
      throw generateError({
        code: 404,
        message: 'CLASSIFICATION_NOT_FOUND',
        infos: `Classification ${annotation.value} is not a project task`,
      })
    }
  })
}

const validateCategories = (project, annotationsPayload) => {
  const categories = project.tasks.reduce((obj, current) => {
    obj[current.category] = {
      min: current.min,
      max: current.max,
      annotations: 0,
    }
    return obj
  }, {})

  annotationsPayload.forEach((annotation) => {
    const task = project.tasks.find((c) => c.value === annotation.value)
    ++categories[task.category].annotations
  })

  Object.entries(categories).forEach(([key, value]) => {
    if (value.min && value.annotations < value.min) {
      throw generateError({
        code: 400,
        message: 'TOO_FEW_ANNOTATIONS',
        infos: `Min for this category ( ${key} ) is : ${value.min}`,
      })
    }

    if (value.max && value.annotations > value.max) {
      throw generateError({
        code: 400,
        message: 'TOO_MUCH_ANNOTATIONS',
        infos: `Max for this category ( ${key} ) is : ${value.max}`,
      })
    }
  })
}

const validateTextAnnotation = (project, textAnnotations) => {
  const wrongTask = textAnnotations.find(
    (textAnnotation) => !project.textGroup.find((task) => textAnnotation.value === task.name)
  )

  if (wrongTask) {
    throw generateError({
      code: 400,
      message: 'TASK_NOT_FOUND',
      infos: `Text task (${wrongTask.value}) is not a project task`,
    })
  }
}

const validateTasksAndAddObject = (project, payload) => {
  if (payload.entitiesRelations) validateRelations(project, payload.entitiesRelations)
  if (payload.text) validateTextAnnotation(project, payload.text)
  if (payload.annotations) {
    validateAnnotations(project, payload.annotations)
    validateCategories(project, payload.annotations)
    payload.annotations.forEach((annotation) => {
      annotation.task = project.tasks.find((c) => c.value === annotation.value)
    })

    return payload.annotations
  }
  return null // FIXME ? should we throw ?
}

const updateItemCount = async (projectId) => {
  const itemCount = await mongoose.model('Item').countDocuments({ project: projectId })
  await mongoose.model('Project').updateOne({ _id: projectId }, { itemCount })
  return itemCount
}

const listUsers = async ({ projectId, token }) => {
  const project = await mongoose.model('Project').findById(projectId).select('users admins dataScientists').lean()
  const emails = []
  if (project.users) emails.push(...project.users)
  if (project.admins) emails.push(...project.admins)
  if (project.dataScientists) emails.push(...project.dataScientists)

  if (!emails.length) {
    return []
  }

  const result = await User.find({}, token)

  const users = result
    .filter((oneUser) => emails.some((oneEmail) => oneEmail === oneUser.email))
    .map((user) => ({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    }))
  return users
}

const getClient = async (clientName, { _user }) => {
  const client = await mongoose.model('Client').findOne({ name: clientName })
  if (client) return client

  const newClient = new (mongoose.model('Client'))({ name: clientName })
  return newClient.save({ _user })
}

const saveProject = async (project, user) => {
  await project.save({ _user: user })
  await logProject(project)
  return project
}

/*
  Adding creator in project admins, for non demo and when not already in config.admins
  Give tasks ids with already populated array to buildSpec()
*/
const createProjectAndTasks = async ({ config, _user }) => {
  const projectId = mongoose.Types.ObjectId()
  const admins = []
  const tasksToInsert = new Map()
  config.tasks?.forEach((task) => {
    const _id = mongoose.Types.ObjectId()
    tasksToInsert.set(_id, {
      _id,
      project: projectId,
      description: task.description,
      color: task.color,
      value: task.value,
      hotkey: task.hotkey,
      label: task.label,
      type: task.type,
      conditions: task.conditions,
      category: task.category,
      exposed: task.exposed,
      min: task.min,
      max: task.max,
    })
  })

  try {
    await mongoose.model('Task').insertMany(Array.from(tasksToInsert.values()))

    const client = await getClient(config.client, { _user })

    admins.push(_user.email)
    if (config.admins) {
      const adminsWithoutCreator = config.admins.filter((user) => user !== _user.email)
      admins.push(...adminsWithoutCreator)
    }

    const projectPayload = {
      _id: projectId,
      name: config.name,
      type: config.type,
      defaultTags: config.defaultTags,
      description: config.description,
      guidelines: config.guidelines,
      admins,
      deadline: config.deadline,
      users: config.users,
      dataScientists: config.dataScientists,
      tasks: Array.from(tasksToInsert.keys()),
      similarityEndpoint: config.similarityEndpoint,
      highlights: config.highlights,
      showPredictions: config.showPredictions,
      prefillPredictions: config.prefillPredictions,
      filterPredictionsMinimum: config.filterPredictionsMinimum,
      entitiesRelationsGroup: config.entitiesRelationsGroup,
      client,
    }

    if (config.s3) {
      projectPayload.s3 = {
        accessKeyId: encrypt(config.s3.accessKeyId),
        secretAccessKey: encrypt(config.s3.secretAccessKey),
      }
    }

    const project = new (mongoose.model('Project'))(projectPayload)
    const retVal = saveProject(project, _user)
    return retVal
  } catch (err) {
    throw new Error(`Project cannot be saved: project: ${config.name}\n. Caused by ${err.message}`)
  }
}

const getProjectTags = async (id) => {
  const p = await Project.findById(id).select('defaultTags itemTags').lean()
  const itemTags = p.itemTags || []
  const defaultTags = p.defaultTags || []

  return [...defaultTags, ...itemTags]
}

const removeCascade = async (projectId) => {
  const session = await mongoose.startSession()

  await session.withTransaction(() =>
    Promise.all([
      mongoose.model('Project').deleteOne({ _id: projectId }, { session }),
      mongoose.model('Comment').deleteMany({ project: projectId }, { session }),
      mongoose.model('Item').deleteMany({ project: projectId }, { session }),
      mongoose.model('Annotation').deleteMany({ project: projectId }, { session }),
      mongoose.model('Task').deleteMany({ project: projectId }, { session }),
      mongoose.model('Log').deleteMany({ project: projectId }, { session }),
      mongoose.model('Filter').deleteMany({ project: projectId }, { session }),
    ])
  )

  session.endSession()
}

/**
 * Velocity is the median of the annotations times.
 * @param {Array.<{ velocity: number }>} annotatedItems The annotated items.
 * @returns {number} The velocity.
 */
const getVelocity = (annotatedItems) => {
  if (!annotatedItems.length) return null

  const velocities = annotatedItems.map((item) => item.velocity).sort((a, b) => a - b)
  return velocities[Math.round((velocities.length - 1) / 2)]
}

const getProjectProgressionStats = (itemCount, velocity, annotatedCount) => {
  const unannotatedItemsCount = itemCount - annotatedCount
  const progress = Math.round((annotatedCount / itemCount) * 100)

  const remainingWork = unannotatedItemsCount ? Math.ceil((velocity * unannotatedItemsCount) / 3600) : 0

  return {
    progress,
    remainingWork,
  }
}

const updateProjectStats = async (projectId, annotatedItems, isNewAnnotation) => {
  const { itemCount } = await mongoose.model('Project').findById(projectId).select('itemCount')
  const velocity = getVelocity(annotatedItems)
  // this.lastAnnotationTime = this.annotatedAt // this.annotatedAt is never set before calling updateStats()
  let other = {}
  if (isNewAnnotation) {
    other = getProjectProgressionStats(itemCount, velocity, annotatedItems.length)
  }

  return mongoose.model('Project').updateOne(
    { _id: projectId },
    {
      velocity,
      ...other,
    }
  )
}

/*
 // never used ?
const getCommentCount = function () {
	return mongoose.model('Comment').countDocuments({ project: this._id })
}
*/

module.exports = {
  validateTasksAndAddObject,
  listUsers,
  createProjectAndTasks,
  getProjectProgressionStats,
  getProjectTags,
  getClient,
  getVelocity,
  updateProjectStats,
  removeCascade,
  saveProject,
  updateItemCount,
  // getCommentCount
}
