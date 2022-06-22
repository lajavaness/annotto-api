/* eslint-disable no-use-before-define */
const fs = require('fs/promises')
const { escapeRegExp } = require('lodash')
const { logger } = require('../../../utils/logger')
const Project = require('../../../db/models/projects')

const { generateError } = require('../../../utils/error')
const { removeCascade, createProjectAndTasks } = require('..')

const { importJsonLines } = require('../../file-upload/jsonlines')

const {
  handleItemStream,
  handleItemPredictionStream,
  handleAnnotationsImportStream,
} = require('../../file-upload/stream-handler')
const { projectConfigV2Schema } = require('../../../router/validation/project')

const importAllFromFiles = async ({
  projectFile,
  itemsFile,
  predictionsFile,
  annotationsFile,
  _user,
  renameIfDuplicateName,
}) => {
  let predictions = null
  let annotations = null
  let projectId
  try {
    // The project needs to be created first
    const project = await createProject({
      renameIfDuplicateName,
      file: projectFile,
      _user,
    })
    projectId = project._id

    const opts = { project, _user }

    const items = await importJsonLines({
      file: itemsFile,
      field: 'items',
      handler: handleItemStream,
      ...opts,
    })

    if (predictionsFile) {
      predictions = await importJsonLines({
        file: predictionsFile,
        field: 'predictions',
        handler: handleItemPredictionStream,
        ...opts,
      })
    }

    if (annotationsFile) {
      annotations = await importJsonLines({
        file: annotationsFile,
        field: 'annotations',
        handler: handleAnnotationsImportStream,
        ...opts,
      })
    }

    return {
      project,
      items,
      predictions,
      annotations,
    }
  } catch (error) {
    // Rollback on error if project was created (expects transactions to be available, >= Mongo 4.0)
    if (projectId) {
      await removeCascade(projectId)
    }
    throw error
  }
}

const createProject = async ({ file, _user, renameIfDuplicateName = false }) => {
  let config

  try {
    const configStream = await fs.readFile(file.path, 'utf8')
    config = JSON.parse(configStream)
    projectConfigV2Schema.validate(config)
  } catch (error) {
    logger.info(error)
    logger.error(error.stack)

    throw generateError({
      message: 'ERROR_PROJECT_VALIDATION',
      infos: `Invalid JSON (config.json): (${error.message})`,
    })
  }

  if (renameIfDuplicateName) {
    config.name = await findLatestDuplicateProjectNumber(config.name)
  }

  return createProjectAndTasks({ config, _user })
}

const parseProjectNumber = (project) => {
  const match = project.name.match(/ \(([0-9]+)\)$/)
  if (!match) {
    return 0
  }
  return parseInt(match[1])
}

const findLatestDuplicateProjectNumber = async (name) => {
  const tmpName = name.replace(/ \([0-9]+\)$/, '')
  const projects = await Project.find({ name: { $regex: `^${escapeRegExp(name)}( \\([0-9]+\\))?$` } }).select('name')
  if (!projects.length) {
    return tmpName
  }

  projects.sort((a, b) => parseProjectNumber(b) - parseProjectNumber(a))

  const lastNumber = parseProjectNumber(projects[0])

  return `${tmpName} (${lastNumber + 1})`
}

module.exports = {
  importAllFromFiles,
}
