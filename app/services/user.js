const fetch = require('node-fetch')
const config = require('../../config')

const HEADERS = { 'content-type': 'application/json' }

/**
 * @typedef KCCredentials
 * @property {string} type (default: "password").
 * @property {string} value (i.e "123").
 * @property {boolean} temporary (default: false).
 */

/**
 * @typedef KCUserRepresentation
 * @property {string} username
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} email
 * @property {KCCredentials} credentials
 */

/**
 * @typedef Options
 * @property {string} path REST API Path.
 * @property {string} method REST HTTP Method.
 * @property {string} token Access token.
 * @property {KCUserRepresentation} [body] Data.
 */
/**
 * Use this method to make a REST call to keycloak.
 * @param {Options} options
 * @returns {Promise<*>}
 * @private
 */
async function _callApi(options) {
  const response = await fetch(
    `${config.keycloak['auth-server-url']}/admin/realms/${config.keycloak.realm}${options.path}`,
    {
      method: options.method,
      headers: { Authorization: `Bearer ${options.token}`, ...HEADERS },
      ...(options.body && { body: JSON.stringify(options.body) }),
    }
  )
  const json = await response.json()
  return json
}

/**
 * Find all users. This will call keycloak Admin Rest API and fetch all users.
 * @param {string} token Access Token with "view-users" role.
 * @returns {Promise<Array<KCUserRepresentation>>}
 */
const find = async (query, token) => {
  return _callApi({ path: '/users', method: 'GET', token })
}

/**
 * Fetch user by id.
 * @param {string} id User uuid as it appears in keycloak.
 * @param {string} token Access Token with "view-users" role.
 * @returns {Promise<KCUserRepresentation>}
 */
const findById = async (id, token) => {
  return _callApi({ path: `/users/${id}`, method: 'GET', token })
}

/**
 * Create a new user.
 * @param {KCUserRepresentation} body
 * @param {string} token Access Token with "view-users" role.
 * @returns {Promise<KCUserRepresentation>}
 */
const create = async (body, token) => {
  // Add default value necessary for KC Admin API. If they are taken care of in the front, remove this
  if (body.credentials) {
    body.credentials.type = 'password'
    body.credentials.temporary = false
  }

  return _callApi({ path: '/users', method: 'POST', token, body })
}

/**
 * Create a new user.
 * @param {string} id User uuid as it appears in keycloak.
 * @param {KCUserRepresentation} body
 * @param {string} token Access Token with "view-users" role.
 * @returns {Promise<KCUserRepresentation>}
 */
const update = async (id, body, token) => {
  return _callApi({ path: `/users/${id}`, method: 'PUT', token, body })
}

/**
 * Delete a user.
 * @param {string} id User uuid as it appears in keycloak.
 * @param {string} token Access Token with "view-users" role.
 * @returns {Promise<*>}
 */
const destroy = async (id, token) => {
  return _callApi({ path: `/users/${id}`, method: 'DELETE', token })
}

module.exports = {
  find,
  findById,
  create,
  update,
  destroy,
}
