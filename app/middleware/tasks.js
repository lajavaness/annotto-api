const { paginate, setCriteria, setParams } = require('../utils/query-builder')('mongo')
const config = require('../../config')
const { browse } = require('../core/tasks')

const index = async (req, res, next) => {
  try {
    const criteria = setCriteria({ ...req.query, ...req.params }, config.search.tasks)
    const params = setParams(req.query, config.search.tasks)

    const data = await browse(criteria, params)

    res.status(200).json(paginate({ ...params, total: req._project.tasks.length || 0 }, data))
  } catch (error) {
    next(error)
  }
}

module.exports = {
  index,
}
