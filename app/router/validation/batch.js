const Joi = require('joi')

const createBatchSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().required(),
})

module.exports = {
  createBatchSchema,
}
