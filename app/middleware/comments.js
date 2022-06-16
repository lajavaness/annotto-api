const { paginate, setCriteria, setParams, setQuery } = require('../utils/query-builder')('mongo')
const config = require('../../config')
const { saveComment } = require('../core/comments')
const Comment = require('../db/models/comments')

const index = async (req, res, next) => {
  try {
    const criteria = setCriteria({ ...req.query, ...req.params }, config.search.comment)
    const params = setParams(req.query, config.search.comment)
    const p = []

    p.push(Comment.countDocuments(criteria))
    p.push(setQuery(Comment.find(criteria), params))

    const [total, data] = await Promise.all(p)
    res.status(200).json(paginate({ ...params, total }, data))
  } catch (error) {
    next(error)
  }
}

const create = async (req, res, next) => {
  try {
    const comment = new Comment({ ...req.body, project: req._project._id })
    await saveComment(comment, req._user)

    index(req, res, next)
  } catch (error) {
    next(error)
  }
}

module.exports = {
  index,
  create,
}
