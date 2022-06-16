// Setup for initKeycloak
const session = require('express-session')
const Keycloak = require('keycloak-connect')
const config = require('../../config')
const { logger } = require('../utils/logger')

const _memoryStore = new session.MemoryStore()
const _session = session({
  secret: 'some secret',
  resave: false,
  saveUninitialized: true,
  store: _memoryStore,
})

let _keycloak

/**
 * Initialize keycloak connection and return it.
 */
function initKeycloak() {
  if (_keycloak) {
    logger.info('Returning existing Keycloak instance')
    return _keycloak
  }
  _keycloak = new Keycloak({}, config.keycloak)

  return _keycloak
}

/**
 * By default, all unauthorized requests will be redirected to the Keycloak login page unless your client is bearer-only.
 * However, a confidential or public client may host both browsable and API endpoints.
 * To prevent redirects on unauthenticated API requests and instead return an HTTP 401,
 * you can override the redirectToLogin function.
 *
 * For example, this override checks if the URL contains /api/ and disables login redirects:
 * @param {express.Request} req
 * @returns {boolean}
 */
Keycloak.prototype.redirectToLogin = function (req) {
  const apiReqMatcher = /\/api\//i
  return !apiReqMatcher.test(req.originalUrl || req.url)
}

module.exports = { keycloak: initKeycloak(), session: _session }
