/**
 * Builds a standardized payload for paginated queries.
 * @param {*} params Params passed to the query or build from query context.
 * @param {*} data List of data fetched from DB.
 */
const paginate = (params, data) => {
  const limit = params.limit ? parseInt(params.limit) : undefined

  return {
    count: data.length,
    index: params.index || 0,
    limit,
    pageCount: limit > 0 ? parseInt(params.total / limit) + (params.total % limit === 0 ? 0 : 1) : 1,
    total: params.total,
    data,
  }
}

module.exports = {
  paginate,
}
