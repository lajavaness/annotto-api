const config = require('../../config')

const Filter = require('../db/models/filters')

const { getSimilarityUuids } = require('../utils/external')
const { generateError } = require('../utils/error')
const { reduceBodyInFilterQuery } = require('../core/filters')
/*
  Building criteria query from payload, and save it as string to avoid mongo restriction
  on saving query $keys in objects.
  Returns the filter, with the criteria query in JSON
*/
const create = async (req, res, next) => {
  try {
    const previousFilter = await Filter.findOne({
      project: req._project._id,
      'user._id': req._user._id,
    })
    if (previousFilter) {
      throw generateError({
        code: 400,
        message: 'ERROR_FILTER_EXIST_FOR_PROJECT_AND_USER',
        infos: previousFilter,
      })
    }

    const criteria = await reduceBodyInFilterQuery(req._project, req.body, getSimilarityUuids)

    const filter = new Filter({
      user: req._user,
      project: req._project._id,
      payload: req.body,
      criteria: JSON.stringify(criteria),
    })
    await filter.save()

    res.status(200).json({
      ...filter.toObject(),
      criteria,
    })
  } catch (error) {
    next(error)
  }
}

const update = async (req, res, next) => {
  try {
    let criteria

    if (req.body.length) {
      criteria = await reduceBodyInFilterQuery(req._project, req.body, getSimilarityUuids)
    } else {
      criteria = {}
    }

    // always ensure that the project key is safe to avoid security issues
    criteria.project = req._project._id

    const filter = await Filter.findOneAndUpdate(
      {
        'user._id': req._user._id,
        project: req._project._id,
      },
      {
        payload: req.body,
        criteria: JSON.stringify(criteria),
      },
      { new: true }
    )

    if (!filter) {
      res.status(200).end()
      return
    }

    res.status(200).json({
      ...filter.toObject(),
      criteria,
    })
  } catch (error) {
    next(error)
  }
}

const getByProjectAndUser = async (req, res, next) => {
  try {
    const filter = await Filter.findOne({
      'user._id': req._user._id,
      project: req._project._id,
    })

    if (!filter) {
      res.status(200).end()
      return
    }

    res.status(200).json({
      ...filter.toObject(),
      criteria: JSON.parse(filter.criteria),
    })
  } catch (error) {
    next(error)
  }
}

const deleteFilter = async (req, res, next) => {
  try {
    const query = await Filter.deleteOne({
      'user._id': req._user._id,
      project: req._project._id,
    })
    res.status(200).json(query)
  } catch (error) {
    next(error)
  }
}

/*
  Return filters operators for FORM creation
  removing fields.key ( mongo name fields ), useless to front
*/
const getOperators = async (req, res) => {
  const filterItemConfig = config.filter.items

  filterItemConfig.fields = Object.fromEntries(
    Object.entries(filterItemConfig.fields).map(([key, value]) => {
      delete value.key
      return [key, value]
    })
  )
  res.status(200).json(filterItemConfig)
}

module.exports = {
  create,
  update,
  getByProjectAndUser,
  delete: deleteFilter,
  getOperators,
}
