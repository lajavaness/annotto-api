const _sortObj = (args, sortObj = {}, _fields) => {
  const order = args[0] === '-' ? 'desc' : 'asc'
  const column = args.replace(/^-/, '')
  if (!_fields[column]) return

  sortObj[_fields[column].key] = order
}

const _selectObj = (args, select = {}) =>
  Object.entries(args).forEach(([key, value]) => {
    select[key] = value
  })

/**
 * Builds params object to pass to db function to : order, limit, offset.
 * @param {*} args Values used to set query params.
 * @param {*} _defaults Defaults values to use.
 */
const setParams = (args, _defaults) => {
  const params = {}

  if (_defaults.limit || _defaults.limit === 0) {
    params.limit = parseInt(_defaults.limit)
  }
  if (args.limit || args.limit === 0) params.limit = parseInt(args.limit)

  params.sort = {}

  if (args.sort) {
    if (Array.isArray(args.sort)) {
      args.sort.forEach((s) => {
        _sortObj(s, params.sort, _defaults.fields)
      })
    } else {
      _sortObj(args.sort, params.sort, _defaults.fields)
    }
  }

  if (!Object.keys(params.sort).length) {
    // Default values
    _defaults.orderBy.forEach((s) => {
      _sortObj(s, params.sort, _defaults.fields)
    })
  }

  if (args.index && params.limit) {
    params.index = parseInt(args.index) || 0
    params.skip = params.index * params.limit
  }

  params.select = {}
  if (_defaults.select) _selectObj(_defaults.select, params.select)

  return params
}

/**
 * Builds whereClause object to query in the db.
 * @param {*} args Values to be added in the criteria.
 * @param {*} _defaults Fields and prefix allowed to query in DB.
 */
const setCriteria = (args, _defaults) => {
  const criteria = {}

  Object.entries(_defaults.fields).forEach(([k, value]) => {
    if (args[k]) {
      if (Array.isArray(args[k])) criteria[value.key] = { $in: args[k] }
      else if (value.type === 'array') criteria[value.key] = { $in: [args[k]] }
      else if (value.type === 'text') {
        criteria[value.key] = new RegExp(args[k].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')
      } else criteria[value.key] = args[k]
    }
  })
  return criteria
}

const setQuery = (query, params) => {
  if (params.sort) query.sort(params.sort)
  if (params.limit) query.limit(params.limit)
  if (params.skip) query.skip(params.skip)
  if (params.select) query.select(params.select)

  return query
}

module.exports = {
  setCriteria,
  setParams,
  setQuery,
}
