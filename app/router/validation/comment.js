const Joi = require('joi')
const { checkObjectId } = require('./utils')

const createCommentSchema = Joi.object({
  comment: Joi.string().required(),
  item: Joi.string().custom(checkObjectId),
  project: Joi.string().custom(checkObjectId),
  batch: Joi.string().custom(checkObjectId),
})

module.exports = {
  createCommentSchema,
}
