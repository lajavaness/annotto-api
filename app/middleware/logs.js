const {
  Types: { ObjectId },
} = require('mongoose')
const { paginate, setCriteria, setParams } = require('../utils/query-builder')('mongo')
const Log = require('../db/models/logs')
const Annotation = require('../db/models/annotations')
const Tasks = require('../db/models/tasks')
const config = require('../../config')

const index = async (req, res, next) => {
  try {
    const criteria = setCriteria({ ...req.query, ...req.params }, config.search.log)
    const params = setParams(req.query, config.search.log)

    Object.keys(criteria)
      .filter((key) => ObjectId.isValid(criteria[key]))
      .forEach((key) => {
        criteria[key] = new ObjectId(criteria[key])
      })

    const limits = []

    if (params.skip) {
      limits.push({ $skip: params.skip })
    }

    if (params.limit) {
      limits.push({ $limit: params.limit })
    }

    // sort should be after skip and limit to avoid sorting the whole collection
    if (params.sort) {
      Object.keys(params.sort).forEach((key) => {
        if (params.sort[key] === 'desc') params.sort[key] = -1
        else if (params.sort[key] === 'asc') params.sort[key] = 1
      })

      limits.push({ $sort: params.sort })
    }

    const pipeline = [
      {
        $match: criteria,
      },
      ...limits,
      {
        $lookup: {
          from: Annotation.collection.collectionName,
          localField: 'annotations',
          foreignField: '_id',
          as: 'annotations',
        },
      },
      {
        $project: {
          _id: 0,
          relations: 1,
          tags: 1,
          type: 1,
          item: 1,
          'user.firstName': 1,
          'user.lastName': 1,
          commentMessage: 1,
          createdAt: 1,
          'annotations._id': 1,
          'annotations.task': 1,
        },
      },
    ]

    const [total, tasks, logs] = await Promise.all([
      Log.countDocuments(criteria),
      Tasks.find({ project: req.params.projectId }).select('type label'),
      Log.aggregate(pipeline),
    ])

    logs.forEach((log) => {
      log.annotations.forEach((annotation) => {
        annotation.task = tasks.find((c) => c._id.equals(annotation.task))
      })
    })

    res.status(200).json(paginate({ ...params, total }, logs))
  } catch (error) {
    next(error)
  }
}

module.exports = {
  index,
}
