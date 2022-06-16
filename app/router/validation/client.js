const Joi = require('joi')

const createClientSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string(),
  isActive: Joi.boolean(),
})

const updateClientSchema = Joi.object({
  name: Joi.string(),
  description: Joi.string(),
  isActive: Joi.boolean(),
})

module.exports = {
  createClientSchema,
  updateClientSchema,
}
