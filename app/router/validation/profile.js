const Joi = require('joi')

const rolesSchema = Joi.object({ role: Joi.string().valid('user', 'dataScientist', 'admin') })

module.exports = {
  rolesSchema,
}
