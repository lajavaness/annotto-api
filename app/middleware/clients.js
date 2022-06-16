const _ = require('lodash')
const { paginate, setCriteria, setParams, setQuery } = require('../utils/query-builder')('mongo')
const Client = require('../db/models/clients')
const { generateError } = require('../utils/error')
const config = require('../../config')

const index = async (req, res, next) => {
  try {
    const criteria = setCriteria({ ...req.query, ...req.params }, config.search.client)
    const params = setParams(req.query, config.search.client)
    const promise = []

    promise.push(Client.countDocuments(criteria))
    promise.push(setQuery(Client.find(criteria), params))

    const [total, data] = await Promise.all(promise)

    res.status(200).json(paginate({ ...params, total }, data))
  } catch (error) {
    next(error)
  }
}

const findClient = async (clientId, lean) => {
  const q = Client.findById(clientId)
  const client = await (lean ? q.lean() : q)

  if (!client) {
    throw generateError({
      code: 404,
      message: 'ERROR_CLIENT_NOT_FOUND',
    })
  }
  return client
}

const getById = async (req, res, next) => {
  try {
    const { clientId } = req.params
    const client = await findClient(clientId, true)

    res.status(200).json(client)
  } catch (error) {
    next(error)
  }
}

const create = async (req, res, next) => {
  try {
    const client = new Client(req.body)
    await client.save()
    res.status(201).json(client)
  } catch (error) {
    next(error)
  }
}

const update = async (req, res, next) => {
  try {
    const { clientId } = req.params
    const client = await findClient(clientId)

    const updated = _.extend(client, req.body)
    await updated.save()

    res.status(200).json(updated)
  } catch (error) {
    next(error)
  }
}

const destroy = async (req, res, next) => {
  try {
    const { clientId } = req.params

    const client = await findClient(clientId)

    await client.remove()

    res.status(200).end()
  } catch (error) {
    next(error)
  }
}

module.exports = {
  index,
  getById,
  create,
  update,
  destroy,
}
