const Joi = require('joi')
const { checkObjectId } = require('./utils')

const authentificationLocalSchema = Joi.object({
  email: Joi.string().required(),
  password: Joi.string().required(),
  name: Joi.string(),
})

const registerSchema = Joi.object({
  email: Joi.string().required(),
  password: Joi.string().required(),
  name: Joi.string(),
})

const meSchema = Joi.object({
  email: Joi.string().required(),
})

const updateBodySchema = Joi.object({
  email: Joi.string(),
  firstName: Joi.string(),
  lastName: Joi.string(),
})

const idUserSchema = Joi.object({
  idUser: Joi.string().custom(checkObjectId).required(),
})

module.exports = {
  authentificationLocalSchema,
  registerSchema,
  meSchema,
  updateBodySchema,
  idUserSchema,
}
