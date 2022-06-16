const _ = require('lodash')
const Busboy = require('busboy')
const mongoose = require('mongoose')

const { ObjectId } = mongoose.Types
const { pipeline } = require('stream/promises')
const { paginate, setCriteria, setParams } = require('../utils/query-builder')('mongo')
const { logger } = require('../utils/logger')

const Annotation = require('../db/models/annotations')
const Item = require('../db/models/items')
const Filter = require('../db/models/filters')
const Project = require('../db/models/projects')

const { generateError } = require('../utils/error')
const { handleItemStream, handleItemPredictionStream } = require('../core/file-upload/stream-handler')
const { getProjectTags } = require('../core/projects')
const { browse, updateHighlights, putImgContentInItem, saveItem } = require('../core/items')
const annotateItem = require('../core/items/annotateItem')

const config = require('../../config')

const _indexByFilter = async (req, res, next) => {
  try {
    const p = []
    const params = setParams(req.query, config.search.item)

    p.push(Item.countDocuments(req.filterCriteria))
    p.push(browse(req.filterCriteria, params))

    const [total, data] = await Promise.all(p)

    res.status(200).json(paginate({ ...params, total }, data))
  } catch (error) {
    next(error)
  }
}

const index = async (req, res, next) => {
  try {
    if (req.query.filterId) {
      const filter = await Filter.findById(req.query.filterId)

      if (!filter) {
        throw generateError({
          code: 404,
          message: 'ERROR_FILTER_NOT_FOUND',
        })
      }
      req.filterCriteria = JSON.parse(filter.criteria)

      if (req.filterCriteria) {
        await _indexByFilter(req, res, next)
        return
      }
    }
    const criteria = setCriteria({ ...req.query, ...req.params }, config.search.item)
    const params = setParams(req.query, config.search.item)

    const data = await browse(criteria, params)

    res.status(200).json(paginate({ ...params, total: req._project.itemCount || 0 }, data))
  } catch (error) {
    next(error)
  }
}

const fetchMostRelevantNextItem = async (projectId) => {
  const alreadySeen = {
    project: projectId,
    seenAt: { $ne: null },
  }

  const neverSeen = [
    {
      $match: {
        project: ObjectId(projectId),
        seenAt: null,
      },
    },
    {
      $sample: { size: 1 }, // mongodb "random" selector
    },
  ]

  const items = await Item.aggregate(neverSeen)

  if (!items.length) {
    return Item.findOne(alreadySeen).sort({ seenAt: 'asc' })
  }

  return Item.hydrate(items[0])
}

const sanitizeFilterCriteria = (criteria, projectId) => {
  const customQuery = JSON.parse(criteria)

  // filter out empty or wrong filter.criteria
  if (!customQuery || customQuery.project !== projectId || Object.keys(customQuery).length === 1) {
    return null
  }
  return customQuery
}

const saveAndPopulateItem = async (req, item) => {
  const hl = await updateHighlights(req._project.highlights, item.sourceHighlights, item.body)
  item.highlights = hl.highlights
  item.sourceHighlights = hl.sourceHighlights

  item.seenAt = new Date()
  await saveItem(item, req._user)

  if (req._project.s3 && item?.data?.url) {
    item = await putImgContentInItem(item, req._project.s3, nextItem) // eslint-disable-line no-use-before-define
  }

  return item
}

/*
  Find one item, by oldest seenAt date
  update item’s seenAt before res
  update item’s highlights ( a first time and when project highlights have been updated or removed )
  Sends content as base64 if s3 was set in project config
*/
const nextItem = async (req, res, next) => {
  try {
    const { projectId } = req.params
    const { filterId } = req.query
    let item
    let customQuery

    if (filterId) {
      const filter = await Filter.findById(filterId)

      if (!filter) {
        throw generateError({
          code: 404,
          message: 'ERROR_FILTER_NOT_FOUND',
        })
      }
      customQuery = sanitizeFilterCriteria(filter.criteria, projectId)
    }

    if (customQuery) {
      item = await Item.findOne(customQuery).sort({ seenAt: 'asc' })
    } else {
      item = await fetchMostRelevantNextItem(projectId)
    }

    if (!item) {
      res.sendStatus(200)
      return
    }

    item = await saveAndPopulateItem(req, item)
    res.status(200).json(item)
  } catch (error) {
    next(error)
  }
}

const getById = async (req, res, next) => {
  try {
    const { projectId, itemId } = req.params

    let item = await Item.findById(itemId)
    if (!item) {
      throw generateError({
        code: 404,
        message: 'ERROR_ITEM_NOT_FOUND',
      })
    }

    if (!item.project.equals(projectId)) {
      throw generateError({
        code: 404,
        message: 'ERROR_PROJECT_NOT_FOUND',
      })
    }

    item = await saveAndPopulateItem(req, item)
    res.status(200).json(item)
  } catch (error) {
    next(error)
  }
}

const getByUuid = async (req, res, next) => {
  try {
    const { projectId, itemUuid } = req.params

    let item = await Item.findOne({ uuid: itemUuid })
    if (!item) {
      throw generateError({
        code: 404,
        message: 'ERROR_ITEM_NOT_FOUND',
      })
    }

    if (!item.project.equals(projectId)) {
      throw generateError({
        code: 404,
        message: 'ERROR_PROJECT_NOT_FOUND',
      })
    }

    item = await saveAndPopulateItem(req, item)
    res.status(200).json(item)
  } catch (error) {
    next(error)
  }
}

const annotations = async (req, res, next) => {
  try {
    res.status(200).json(await Annotation.find({ item: req.params.itemId }))
  } catch (error) {
    next(error)
  }
}

const update = async (req, res, next) => {
  try {
    const { itemId } = req.params

    const item = await Item.findById(itemId)
    if (!item) {
      throw generateError({
        code: 404,
        message: 'ERROR_ITEM_NOT_FOUND',
      })
    }

    if (req.body._id) {
      delete req.body._id
    }

    const updated = _.extend(item, req.body)

    await saveItem(updated, req._user)

    res.status(200).json(updated)
  } catch (error) {
    next(error)
  }
}

const annotate = async (req, res, next) => {
  try {
    const { itemId, projectId } = req.params

    const params = {
      _user: req._user,
      project: await Project.findById(projectId),
    }
    const item = await Item.findById(itemId)
    if (!item) {
      throw generateError({
        code: 404,
        message: 'ERROR_ITEM_NOT_FOUND',
      })
    }

    res.status(200).json(await annotateItem(item, req.body, params))
  } catch (error) {
    logger.info(error)
    next(error)
  }
}

const getTags = async (req, res, next) => {
  try {
    const projectTags = await getProjectTags(req.params.projectId)
    const tags = _.uniq(projectTags)

    res.status(200).json(tags)
  } catch (error) {
    next(error)
  }
}

/*
  Insert items in stream to control mem usage and in batch to reduce latency : Pipe req stream to busboy
*/
const itemsUpload = async (req, res, next) => {
  const { projectId } = req.params
  const project = await Project.findById(projectId)

  if (!project) {
    next(
      generateError({
        code: 404,
        message: 'ERROR_PROJECT_NOT_FOUND',
        infos: projectId,
      })
    )
    return
  }

  if (!req.headers['content-type']) {
    next(
      generateError({
        code: 400,
        message: 'MISSING_CONTENT_TYPE',
      })
    )
    return
  }

  const busboyStream = new Busboy({ headers: req.headers })

  busboyStream.on('file', async (fieldname, stream) => {
    try {
      const response = await handleItemStream({
        isUpdate: req.query.isUpdate === 'true',
        stream,
        project,
      })

      res.status(200).json(response)
    } catch (error) {
      logger.info(error)

      next(
        generateError({
          code: 400,
          message: 'ERROR_ITEMS',
          infos: error.message,
        })
      )
    }
  })

  try {
    await pipeline(req, busboyStream)
  } catch (error) {
    if (res.headerSent) return

    next(
      generateError({
        code: 500,
        message: 'BUSBOY_STREAM_ERROR',
        infos: error.message,
      })
    )
  }
}

const predictionUpload = async (req, res, next) => {
  const { projectId } = req.params
  const project = await Project.findById(projectId)

  if (!project) {
    next(
      generateError({
        code: 404,
        message: 'ERROR_PROJECT_NOT_FOUND',
        infos: projectId,
      })
    )
    return
  }

  if (!req.headers['content-type']) {
    next(
      generateError({
        code: 400,
        message: 'MISSING_CONTENT_TYPE',
      })
    )
    return
  }

  const busboyStream = new Busboy({ headers: req.headers })

  busboyStream.on('file', async (fieldname, stream) => {
    try {
      const result = await handleItemPredictionStream({
        stream,
        _user: req._user,
        project,
      })

      res.status(200).json(result)
    } catch (error) {
      logger.info(error)

      next(
        generateError({
          code: 400,
          message: 'ERROR_PREDICTIONS',
          infos: error.message,
        })
      )
    }
  })

  try {
    await pipeline(req, busboyStream)
  } catch (error) {
    logger.info(error)

    if (res.headerSent) return
    next(
      generateError({
        code: 500,
        message: 'BUSBOY_STREAM_ERROR',
        infos: error.message,
      })
    )
  }
}

module.exports = {
  index,
  getById,
  getByUuid,
  next: nextItem,
  annotations,
  annotate,
  update,
  getTags,
  itemsUpload,
  predictionUpload,
}
