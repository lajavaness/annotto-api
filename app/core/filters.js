const { escapeRegExp } = require('lodash')
const config = require('../../config')
const { logger } = require('../utils/logger')

/*
  Builds query from req.body : for each object, gets field matching alias field from config
  and adds query object matching operator to global query.
*/
const reduceConditionsToAndQuery = async (project, conditions, getSimilarityUuids) => {
  const { fields } = config.filter.items
  const queryParams = []

  for (const condition of conditions) {
    if (!fields[condition.field]) return null

    const field = fields[condition.field].key

    switch (condition.operator) {
      case 'similarTo': {
        if (!project.similarityEndpoint) return null

        const uuids = await getSimilarityUuids(
          project.similarityEndpoint,
          condition.value,
          condition.neg_values,
          condition.limit
        )
        const compositeUuids = uuids.map((uuid) => `${project._id}_${uuid}`)
        queryParams.push({ [field]: { $in: compositeUuids } })
        break
      }
      case 'equal':
        queryParams.push({ [field]: condition.value })
        break
      case 'size':
        queryParams.push({ [field]: { $size: condition.value } })
        break
      case 'textContains':
        queryParams.push({ [field]: { $regex: escapeRegExp(condition.value) } })
        break
      case 'containsAny':
        queryParams.push({ [field]: { $in: condition.value } })
        break
      case 'containsAll':
        queryParams.push({ [field]: { $all: condition.value } })
        break
      case 'range':
        queryParams.push({ [field]: { $gt: condition.value.from, $lt: condition.value.to } })
        break
      // has any prediction.X > threshold
      case 'greaterThanAny': {
        const filterQuery = condition.value.reduce(
          (tmpQuery, value) => {
            tmpQuery.$or.push({
              [`${field}.${value}`]: { $gt: condition.threshold || 0.5 },
            })
            return tmpQuery
          },
          { $or: [] }
        )

        queryParams.push(filterQuery)
        break
      }
      // has all prediction.X > threshold
      case 'greaterThanAll': {
        const filterQuery = condition.value.reduce(
          (tmpQuery, value) => {
            tmpQuery.$and.push({
              [`${field}.${value}`]: { $gt: condition.threshold || 0.5 },
            })
            return tmpQuery
          },
          { $and: [] }
        )

        queryParams.push(filterQuery)
        break
      }
      // has any prediction.X > treshold that's not in non empty annotationValues
      case 'wrongPredictions': {
        const filterQuery = condition.value.reduce(
          (tmpQuery, value) => {
            tmpQuery.$and[1].$or.push({
              $and: [
                { [`${field}.${value}`]: { $gt: condition.threshold || 0.5 } },
                { annotatedValue: { $nin: [value] } },
              ],
            })
            return tmpQuery
          },
          {
            $and: [{ 'annotationValues.0': { $exists: true } }, { $or: [] }],
          }
        )

        queryParams.push(filterQuery)
        break
      }
      default: {
        logger.info('unknown operator', condition.operator)
      }
    }
  }

  return queryParams
}

/**
 * Builds Mongo Query from conditions, minimum query created : { project: project._id }
 * See unit tests for input/output examples.
 * @param {*} project The project.
 * @param {*} body The body.
 * @param {Function} getSimilarityUuids The similarity uuid function.
 * @returns {Promise.<{project: any, $or: Array, $and: Array}>} The generated mongo query.
 */
const reduceBodyInFilterQuery = async (project, body, getSimilarityUuids) => {
  const mongoQuery = {
    project: project._id,
  }

  // Filter And conditions
  const andConditions = body.filter((condition) => !condition.or)

  // Filter Or conditions and merge eventual multiple Or arrays
  const orConditions = body
    .filter((condition) => condition.or)
    .reduce((aggregate, condition) => {
      aggregate.push(...condition.or)

      return aggregate
    }, [])

  if (orConditions.length) {
    const or = []
    if (andConditions.length) {
      const parsedAndConditions = await reduceConditionsToAndQuery(project, andConditions, getSimilarityUuids)
      if (parsedAndConditions.length) {
        or.push({ $and: parsedAndConditions })
      }
    }

    const parsedOrConditions = await reduceConditionsToAndQuery(project, orConditions, getSimilarityUuids)
    if (parsedOrConditions.length) {
      or.push({ $or: parsedOrConditions })
    }
    if (or.length) {
      mongoQuery.$or = or
    }
  } else {
    const and = await reduceConditionsToAndQuery(project, andConditions, getSimilarityUuids)
    if (and.length) {
      mongoQuery.$and = and
    }
  }

  return mongoQuery
}

module.exports = {
  reduceBodyInFilterQuery,
}
