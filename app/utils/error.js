const { logger } = require('./logger')

module.exports = {
  generateError: (errorObj, nestedError = null) => {
    const err = new Error()
    err.message = errorObj.message
    err.code = errorObj.code
    err.infos = errorObj.infos
    err.stack += `${errorObj.stack ? errorObj.stack : ''}${nestedError ? `\nCaused by: ${nestedError.stack}` : ''}`

    return err
  },

  errorHandlerMiddleware: (err, req, res, next) => {
    const message = err.message || 'ERROR_HANDLING_REQUEST'
    const { infos } = err

    let { code } = err
    if (!code || Number.isNaN(code) || code < 200 || code > 500) code = 500

    logger.error(err)

    res.status(code).json({ code, message, infos })
    next()
  },
}
