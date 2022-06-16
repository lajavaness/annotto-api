const { ObjectId } = require('mongoose').Types

const checkObjectId = (value, helpers) => {
  if (!ObjectId.isValid(value)) {
    return helpers.error('any.invalid')
  }
  return value
}

const checkAnnotationsLengthWithRelations = (value) => {
  if (value.annotations && !value.annotations.length && value.entitiesRelations && value.entitiesRelations.length) {
    throw new Error('RELATION_WITH_EMPTY_ANNOTATIONS')
  }
}

module.exports = {
  checkObjectId,
  checkAnnotationsLengthWithRelations,
}
