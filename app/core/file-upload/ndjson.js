const through = require('through2')
const split = require('split2')
const { EOL } = require('os')
const stringify = require('json-stringify-safe')

module.exports.stringify = (opts) =>
  through.obj(opts, (obj, _, cb) => {
    cb(null, stringify(obj) + EOL)
  })

module.exports.parse = (opts) => {
  opts = opts || {}
  opts.strict = opts.strict !== false

  let count = 0

  function parseRow(row) {
    try {
      if (row) {
        const parsed = JSON.parse(row)
        count++
        return parsed
      }
      return null
    } catch (e) {
      if (opts.strict) {
        const error = new Error(`Could not parse row ${row.slice(0, 50)}...`)
        error.lineNumber = count
        this.emit('error', error)
      }
      return null
    }
  }

  return split(parseRow, opts)
}
