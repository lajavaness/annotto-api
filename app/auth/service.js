const Project = require('../db/models/projects')
const Profile = require('../db/models/profiles')
const config = require('../../config')
const { keycloak } = require('./index')
const { logger } = require('../utils/logger')

const roleToProjectGroups = [
  { value: 'user', groups: ['users', 'dataScientists', 'admins'] },
  { value: 'dataScientist', groups: ['dataScientists', 'admins'] },
  { value: 'admin', groups: ['admins'] },
]

/**
 * Search projects groups, corresponding to route projectRole permission, for user email
 * ( eg : if projectRole on route is user, will look in all 3 project's user groups for user email ).
 * @param {string} projectRole
 * @param {string} email
 * @param {Project.model} project
 * @returns {boolean} True or false the project is associated with a user that has the role we want.
 * @private
 */
const haveAccessRole = (projectRole, email, project) => {
  const roleAndGroups = roleToProjectGroups.find((elem) => elem.value === projectRole)

  return roleAndGroups && roleAndGroups.groups.some((groupName) => project[groupName].includes(email))
}

/**
 * Get the profile out of the token and save it if not found.
 * @param {express.Request} req Express Request.
 * @param {express.Response} res Express Response.
 * @param {express.NextFunction} next Next middleware to run.
 * @private
 * @returns {Promise<void>}
 */
const _getProfile = async (req, res, next) => {
  try {
    let profile = await Profile.findOne({ user: req._user._id }).lean()

    if (!profile) {
      // const role = findRole(standardUsers, req._user.email)
      profile = new Profile({
        user: req._user._id,
        email: req._user.email,
        // TODO : Warning about this. There can be multiple roles coming from OAuth. So either take the first one, or,
        // make sure the DB can hold an array of roles
        role: req.token.content.resource_access[config.keycloak.realm].roles[0],
      })
      await profile.save()
    }

    req._user.profile = profile
    next()
  } catch (err) {
    logger.info(err)
    logger.error(err.stack)

    res.status(500).json({
      code: 500,
      message: 'INTERNAL_SERVER_ERROR',
    })
  }
}

/**
 * Sets the project from the request by id into the request.
 * @param {express.Request} req
 * @param {express.Response} res
 * @param {express.NextFunction} next
 * @returns {Promise<void>}
 * @private
 */
const _getProject = async (req, res, next) => {
  try {
    if (req.params.projectId) {
      const project = await Project.findById(req.params.projectId).select('+s3').populate('tasks')

      if (!project) {
        res.status(404).json({
          code: 404,
          message: 'ERROR_PROJECT_NOT_FOUND',
        })
        return
      }
      req._project = project
    }
    next()
  } catch (err) {
    logger.info(err)
    logger.error(err.stack)

    res.status(500).json({
      code: 500,
      message: 'INTERNAL_SERVER_ERROR',
    })
  }
}

/**
 * Express middleware
 * Verify the role wanted from the role in the token and the role associated with the project.
 * @param {string|null} projectRole Project role.
 * @param {string|null} realmRole Realm role.
 * @returns {express.RequestHandler}
 * @private
 */
const _verifyPermissions = (projectRole, realmRole) => (req, res, next) => {
  // Test roles hierarchy admin > dataScientist > user
  if (realmRole) {
    if (realmRole === 'admin' && req.token.hasRole('admin')) {
      next()
      return
    }
    if (realmRole === 'dataScientist' && (req.token.hasRole('dataScientist') || req.token.hasRole('admin'))) {
      next()
      return
    }
    if (
      realmRole === 'user' &&
      (req.token.hasRole('dataScientist') || req.token.hasRole('admin') || req.token.hasRole('user'))
    ) {
      next()
      return
    }

    res.status(403).json({
      code: 403,
      message: 'FORBIDDEN_PROFILE_NOT_ALLOWED',
    })
    return
  }

  if (projectRole) {
    if (haveAccessRole(projectRole, req._user.profile.email, req._project)) {
      next()
      return
    }
    res.status(403).json({
      code: 403,
      message: 'FORBIDDEN_ROLE_NOT_ALLOWED',
    })
    return
  }

  next()
}

/**
 * Retrieve the token from the request, save it to the request.
 * @returns {GuardFn}
 * @private
 */
function _retrieveAndSaveToken() {
  // eslint-disable-next-line no-unused-vars
  return (token, request, response) => {
    request._user = {
      _id: token.content.sub,
      email: token.content.email,
      firstName: token.content.given_name,
      lastName: token.content.family_name,
    }
    request.token = token

    return true
  }
}

/**
 * Generates an authentication middleware.
 * @param {object} opts The options.
 * @param {string|null} [opts.projectRole] Role regarding a specific project.
 * @param {string|null} [opts.realmRole] Realm role (platform-wise).
 * @returns {Array<express.RequestHandler>} The middlewares.
 */
const isAuthenticated = ({ projectRole = null, realmRole = null }) => {
  return [
    keycloak.protect(_retrieveAndSaveToken()),
    _getProfile,
    _getProject,
    _verifyPermissions(projectRole, realmRole),
  ]
}

module.exports = {
  isAuthenticated,
  haveAccessRole,
}
