const express = require('express')
const cors = require('cors')
const expressSwaggerGenerator = require('express-swagger-generator')
const { loggerMiddleware } = require('./utils/logger')
const { errorHandlerMiddleware, generateError } = require('./utils/error')
const getRouter = require('./router')

/**
 * Generate swagger option from config.
 * @param {object} cfg Config.
 * @returns {object}.
 */
const getSwaggerOptions = (cfg) => ({
  swaggerDefinition: {
    info: {
      description: 'Annotto API',
      title: '',
      version: '1.0.0',
    },
    // removing http:// from base url
    host: cfg.baseUrl.replace(/(^\w+:|^)\/\//, ''),
    basePath: '/api',
    produces: ['application/json'],
    securityDefinitions: {
      Bearer: {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
        value: 'Bearer <access_token>',
      },
    },
    schemes: ['https', 'http'],
  },
  basedir: __dirname, // app absolute path
  // Path to the API handle folder
  files: ['./router/*.js'],
})

const routeNotFoundHandler = (req, res, next) => {
  next(generateError({ code: 404, message: 'ERROR_ROUTE_NOT_FOUND' }))
}

const createServer = async (cfg) => {
  const app = express()
    .enable('trust proxy')
    .use(loggerMiddleware)
    .use(cors(cfg.cors))
    .use(express.json())
    .use(express.urlencoded({ extended: true }))

  app.set('config', cfg)

  const swaggerOptions = getSwaggerOptions(cfg)

  app.use('/api', getRouter())

  app.use(cfg.swagger.swaggerUi, (req, res, next) => next())
  app.use(cfg.swagger.apiDocs, (req, res, next) => next())
  app.use(`${cfg.swagger.apiDocs}.json`, (req, res, next) => next())

  expressSwaggerGenerator(app)(swaggerOptions)

  app.use(routeNotFoundHandler)
  app.use(errorHandlerMiddleware)

  return app
}

module.exports = createServer
