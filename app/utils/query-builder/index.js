const common = require('./common')

const load = (odm) => {
  // eslint-disable-next-line global-require,import/no-dynamic-require
  const lib = require(`./${odm}`)
  return {
    ...common,
    ...lib,
  }
}
module.exports = load
