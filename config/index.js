const _ = require('lodash')
const coreConfig = require('./config')

function getEnvConfig(forceEnv) {
  const env = forceEnv || process.env.NODE_ENV || 'development'
  const envConfig = require(`./${env}`)
  return _.merge({}, coreConfig, envConfig)
}

module.exports = getEnvConfig(process.env.NODE_ENV)
