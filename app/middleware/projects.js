const _ = require('lodash')
const formidable = require('formidable')
const tmp = require('tmp')
const { paginate, setCriteria, setParams, setQuery } = require('../utils/query-builder')('mongo')
const { logger } = require('../utils/logger')
const Project = require('../db/models/projects')
const tasks = require('../core/tasks')
const itemMiddleware = require('./items')
const classificationMiddleware = require('./tasks')

const { generateError } = require('../utils/error')
const config = require('../../config')
const {
  fileUpload: { maxFileSize },
} = require('../../config')

const downloadCore = require('../core/projects/download')
const { importAllFromFiles } = require('../core/projects/import')
const { listUsers, getClient, removeCascade, saveProject } = require('../core/projects')
const { handleAnnotationsImportStream } = require('../core/file-upload/stream-handler')
const { importJsonLines } = require('../core/file-upload/jsonlines')

/*
  Returns DEMO projects and active projects with stats, filtered for non admin users by project config
*/
const index = async (req, res, next) => {
  const criteria = setCriteria(
    {
      ...req.query,
      ...req.params,
      active: true,
    },
    config.search.project
  )

  if (req._user && req._user.profile.role !== 'admin') {
    criteria.$or = [
      { admins: { $in: [req._user.email] } },
      { dataScientists: { $in: [req._user.email] } },
      { users: { $in: [req._user.email] } },
    ]
  }
  logger.debug(criteria)

  const params = setParams(req.query, config.search.project)
  try {
    const [total, projects] = await Promise.all([
      Project.countDocuments(criteria),
      setQuery(Project.find(criteria), params),
    ])

    res.status(200).json(paginate({ ...params, total }, projects))
  } catch (error) {
    next(error)
  }
}

/*
  Get project, filtered for non admin users by project config
  Adds DEMO projects with no users or admins
*/
const getById = async (req, res, next) => {
  const { projectId } = req.params
  try {
    const project = await Project.findById(projectId).populate('tasks').populate('client')

    if (!project) {
      throw generateError({
        code: 404,
        message: 'ERROR_PROJECT_NOT_FOUND',
      })
    }

    if (!project.active) {
      throw generateError({
        code: 403,
        message: 'ERROR_PROJECT_IS_ARCHIVED',
      })
    }

    res.status(200).json(project)
  } catch (error) {
    next(error)
  }
}

const getUsers = async (req, res, next) => {
  const { projectId } = req.params
  try {
    const users = await listUsers({ projectId, token: req.token.token })
    res.json(users)
  } catch (error) {
    next(error)
  }
}

// Update project and tasks ( if _id is given update task, else create it ).
const update = async (req, res, next) => {
  try {
    const { projectId } = req.params
    const project = await tasks.createAndUpdate(req._project.tasks, req.body.tasks, projectId)

    if (req.body.client) {
      project.client = await getClient(req.body.client, { _user: req._user })
    }

    if (req.body.entitiesRelationsGroup) {
      req.body.entitiesRelationsGroup.forEach((payloadGroup) => {
        if (payloadGroup._id) {
          let group = project.entitiesRelationsGroup.find((g) => g._id.equals(payloadGroup._id))

          // TODO : What does this whole block do ? The group isn't used anywhere, so maybe even the req.body.entitiesRelationsGroup neither. Delete ?
          if (group) group = _.extend(group, payloadGroup)
          else {
            throw generateError({
              code: 400,
              message: 'ERROR_PROJECT_VALIDATION',
              infos: `invalid relation group _id (${payloadGroup._id})`,
            })
          }
        } else {
          project.entitiesRelationsGroup.push(payloadGroup)
        }
      })
    }

    delete req.body.entitiesRelationsGroup
    delete req.body.tasks
    delete req.body.client

    const updated = _.extend(project, req.body)

    await saveProject(updated, req._user)

    res.status(200).json(updated)
  } catch (error) {
    logger.info(error)
    logger.error(error.stack)
    next(error)
  }
}

const remove = async (req, res, next) => {
  try {
    const { projectId } = req.params

    const project = await Project.findById(projectId)
    if (!project) {
      throw generateError({
        code: 404,
        message: 'ERROR_PROJECT_NOT_FOUND',
        infos: projectId,
      })
    }

    await removeCascade(projectId)

    res.sendStatus(200)
  } catch (error) {
    next(error)
  }
}

const extractFilesFromReq = (req, res, opts) => {
  return new Promise((resolve, reject) => {
    // TODO REMOVE SYNC METHODS IN WHOLE FILE
    const tmpObj = tmp.dirSync({ unsafeCleanup: true })

    res.on('finish', () => tmpObj.removeCallback())
    res.on('error', () => tmpObj.removeCallback())

    const form = new formidable.IncomingForm({
      maxFileSize,
      uploadDir: tmpObj.name,
      ...opts,
    })

    let lastProgress = 0
    form.on('progress', (bytesReceived, bytesExpected) => {
      const rec = Math.round((bytesReceived / 1024 / 1024) * 100) / 100
      const total = Math.round((bytesExpected / 1024 / 1024) * 100) / 100
      const percent = Math.round((rec / total) * 100)
      if (lastProgress < percent - 20) {
        logger.info(`${percent}%`, rec, '/', `${total}Mb`)
        lastProgress = percent
      }
    })

    form.parse(req, (err, fields, files) => {
      if (err) reject(new Error(err))
      else resolve({ fields, files })
    })
  })
}

const importAnnotations = async (req, res, next) => {
  try {
    if (!req.headers['content-type']) {
      next(
        generateError({
          code: 400,
          message: 'MISSING_CONTENT_TYPE',
        })
      )
      return
    }

    const { files } = await extractFilesFromReq(req, res, { keepExtensions: true })

    // only parse first file found
    const [file] = Object.values(files)

    const response = await importJsonLines({
      file,
      field: 'annotations',
      handler: handleAnnotationsImportStream,
      project: req._project,
      _user: req._user,
    })

    res.status(200).json(response)
  } catch (error) {
    logger.info(error)

    if (error.infos) {
      error.code = 400
      next(error)
      return
    }

    next(
      generateError({
        code: 400,
        message: 'ERROR_ANNOTATION_IMPORT',
        infos: error.message,
      })
    )
  }
}

const stats = async (req, res, next) => {
  try {
    switch (req.params.view) {
      case 'tasks':
        await classificationMiddleware.index(req, res, next)
        return
      case 'items':
        await itemMiddleware.index(req, res, next)
        return
      default:
        next('route')
        return
    }
  } catch (error) {
    next(error)
  }
}

const createProject = async (req, res, next) => {
  try {
    const { files } = await extractFilesFromReq(req, res, { keepExtensions: true })

    if (!files.project) {
      throw generateError({
        code: 400,
        message: 'ERROR_MISSING_PROJECT_FILE',
      })
    }
    if (!files.items) {
      throw generateError({
        code: 400,
        message: 'ERROR_MISSING_ITEMS_FILE',
      })
    }

    const out = await importAllFromFiles({
      renameIfDuplicateName: req.query.renameIfDuplicateName || false,
      projectFile: files.project,
      itemsFile: files.items,
      predictionsFile: files.predictions,
      annotationsFile: files.annotations,
      _user: req._user,
    })

    res.status(200).json(out)
    return
  } catch (error) {
    logger.info(error)
    logger.error(error.stack)

    if (error.infos) {
      error.code = 400
      next(error)
      return
    }

    if (error && error.message && error.message.includes('E11000')) {
      next(
        generateError({
          code: 400,
          message: 'ERROR_PROJECT_CREATION_DUPLICATE_NAME',
        })
      )
      return
    }

    next(
      generateError({
        code: 400,
        message: 'ERROR_PROJECT_CREATION',
        infos: error.message,
      })
    )
  }
}

const prettyDate = (date) =>
  date
    .toISOString()
    .replace('T', '_')
    .replace(/\.[0-9]{3}Z$/, '')

/*
 * Creates Zip folder to export, includes files depending on req.query ( default : annotation file )
 * files are created using "tmp" module for auto delete, and added to a zip folder using "archiver" module.
 */
const download = async (req, res, next) => {
  const {
    params: { projectId },
    _project,
  } = req
  const date = prettyDate(new Date())
  const zipName = `export-${_project.name}-${date}.zip`

  let param

  if (req.query.config || req.query.annotationsAndComments || req.query.allItems) {
    param = req.query
  } else {
    param = { allItems: true }
  }

  try {
    const archive = await downloadCore.download(projectId, _project, param)

    // the pipe to res needs to be set before archive.finalize()
    // to avoid having full buffer situations (>7Mo files apparently)
    archive.pipe(res)

    res.attachment(zipName).type('application/zip')

    await archive.finalize()
  } catch (error) {
    next(
      generateError({
        code: 500,
        message: error.message,
      })
    )
  }
}

module.exports = {
  index,
  getById,
  getUsers,
  update,
  download,
  importAnnotations,
  remove,
  createProject,
  stats,
}
