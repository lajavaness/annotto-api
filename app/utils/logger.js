const { createLogger, transports, format } = require('winston')

const morgan = require('morgan')

const myFormat = format.printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level} ${message}`
})

const logger = createLogger({
  transports: new transports.Console(),
  level: process.env.LOG_LEVEL,
  format: format.combine(format.timestamp(), myFormat),
})

const loggerMiddleware = morgan(':method :url :status :res[content-length] - :response-time ms', {
  stream: {
    // Configure Morgan to use our custom logger with the http severity
    write: (message) => logger.debug(message.trim()),
  },
})

module.exports = {
  logger,
  loggerMiddleware,
}
