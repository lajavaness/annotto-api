const mongoose = require('mongoose')

const { logger } = require('./app/utils/logger')
const config = require('./config')
const createServer = require('./app/server')
const { createDemo } = require('./app/utils/seeds')

mongoose
  .connect(config.mongo.url, config.mongo.options)
  .then(() => logger.info('Mongo connection UP'))
  .then(() => createServer(config))
  .then((app) =>
    app.listen(config.port, () =>
      logger.info(`NODE_ENV=${process.env.NODE_ENV} : Server listening on port ${config.port}`)
    )
  )
  .then(async () => {
    if (config.demo) {
      logger.info('-------------------------')
      logger.info('Creating demo ...')
      await createDemo()
      mongoose.set('debug', ['test', 'development'].includes(process.env.NODE_ENV) ? true : {color: false})
      logger.info('-------------------------')
      logger.info('Demo created successfully')
    }
  })
  .catch(logger.error)
