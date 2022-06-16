/**
 * Convert predictions from front-end to back-end model.
 * @param {PredictionData} data
 * @param {number} minimalValue Filter the predictions that will return with that threshold that compares with the proba.
 *                               Used only for predictions from a type Classification.
 * @returns {{}}
 */
const convertToModel = (data, minimalValue) => {
  const ret = {}

  ret.raw = data
  ret.keys = []

  Object.values(data).forEach((category) => {
    if (category.entities) {
      ret.keys.push(
        ...category.entities.map((obj) => {
          // replace 'coords' with 'zone' for front end payload for zone predictions
          if (obj.coords) {
            return {
              value: obj.value,
              zone: obj.coords,
            }
          }
          return obj
        })
      )
    }
    // filter tasks with minimum score
    if (category.labels) {
      ret.keys.push(...category.labels.filter((obj) => obj.proba > minimalValue))
    }
  })

  return ret
}

module.exports = {
  convertToModel,
}
