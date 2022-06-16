const { createReadStream } = require('fs')
const itemSchemas = require('../../router/validation/item')
const { generateError } = require('../../utils/error')

const jsonLinesErrors = async (file, promise) => {
  try {
    // await instead of return is important to catch errors in this function
    const result = await promise
    return result
  } catch (error) {
    if (error.message && error.message.startsWith('Could not parse row')) {
      throw generateError(
        {
          code: 400,
          message: 'ERROR_PROJECT_VALIDATION',
          infos: `Invalid JSON (${file.path}:${error.lineNumber})`,
        },
        error
      )
    }
    if (!Number.isNaN(error.lineNumber)) {
      throw generateError(
        {
          code: 400,
          message: 'ERROR_PROJECT_VALIDATION',
          infos: `Invalid format (${file.path}:${error.lineNumber})`,
        },
        error
      )
    }
    throw error
  }
}

const importJsonLines = async ({ file, field, handler, ...options }) => {
  const stream = createReadStream(file.path)
  return jsonLinesErrors(file, handler({ ...options, stream }))
}

const validateItem = (item, projectType, lineNumber) => {
  let validation

  if (projectType === 'text') validation = itemSchemas.jsonlinesItemTextSchema.validate(item)
  else validation = itemSchemas.jsonlinesItemImageSchema.validate(item)

  if (validation && validation.error) {
    const error = new Error(validation.error.details[0].message)
    error.lineNumber = lineNumber
    throw error
  }
}

const validateAnnotation = (annotation, lineNumber) => {
  const validation = itemSchemas.jsonlinesAnnotationImportSchema.validate(annotation)

  if (validation && validation.error) {
    const error = new Error(validation.error.details[0].message)
    error.lineNumber = lineNumber
    throw error
  }
}

const validatePrediction = async (prediction, tasks, lineNumber) => {
  try {
    await itemSchemas.jsonlinesPredictionsSchema.validateAsync(prediction, { context: { tasks } })
  } catch (error) {
    const err = new Error(error.message)
    err.lineNumber = lineNumber
    throw err
  }
}

module.exports = {
  validatePrediction,
  validateItem,
  validateAnnotation,
  importJsonLines,
}
