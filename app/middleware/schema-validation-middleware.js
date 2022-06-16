/**
 * Schema validation middleware used to validate express payload and query. This methods takes a schema and validate it and throw an error
 * in case of any error. Otherwise it continues with  the next middleware.
 * @param {schemaBody {Joi.Schema|null}, schemaQuery {Joi.Schema|null}} The Schema to validate the query or body.
 * @returns {(function(*=, *, *): (*))|*}
 */
const { logger } = require('../utils/logger')

const schemaValidationMiddleware =
  ({ schemaQuery, schemaBody, schemaParams }) =>
  (req, res, next) => {
    const { error: errorQuery } = { ...schemaQuery?.validate(req.query) }
    const { error: errorBody } = { ...schemaBody?.validate(req.body) }
    const { error: errorParams } = { ...schemaParams?.validate(req.params) }
    if (errorQuery || errorBody || errorParams) {
      const error = errorQuery || errorBody || errorParams
      logger.error(error)
      return res.status(400).send({
        code: 400,
        message: 'ERROR_CLIENT_VALIDATION',
        infos: error.details,
      })
    }

    return next()
  }

module.exports = { schemaValidationMiddleware }
