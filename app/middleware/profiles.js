const { paginate, setCriteria, setParams, setQuery } = require('../utils/query-builder')('mongo')
const { generateError } = require('../utils/error')

const config = require('../../config')
const Profiles = require('../db/models/profiles')

const index = async (req, res, next) => {
  try {
    const criteria = setCriteria({ ...req.query, ...req.params }, config.search.comment)
    const params = setParams(req.query, config.search.comment)
    const p = []

    p.push(Profiles.countDocuments(criteria))
    p.push(setQuery(Profiles.find(criteria), params))

    const [total, data] = await Promise.all(p)
    res.status(200).json(paginate({ ...params, total }, data))
  } catch (error) {
    next(error)
  }
}

const update = async (req, res, next) => {
  try {
    if (!req.params.profileId) {
      throw generateError({
        code: 400,
        message: 'ERROR_PROFILE_QUERY_ID',
      })
    }

    const profile = await Profiles.findOne({ _id: req.params.profileId })

    if (!profile) {
      throw generateError({
        code: 400,
        message: 'ERROR_PROFILE_NOT_FOUND',
      })
    }
    if (profile._id.equals(req._user.profile._id)) {
      throw generateError({
        code: 400,
        message: 'ERROR_PROFILE_CANNOT_UPDATE_OWN_PROFILE',
      })
    }

    profile.role = req.query.role
    await profile.save()

    res.status(200).json(profile)
  } catch (error) {
    next(error)
  }

  res.status(200).end()
}

module.exports = {
  index,
  update,
}
