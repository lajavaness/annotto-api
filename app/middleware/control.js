const config = require('../../config')
const { name, version } = require('../../package.json')

const health = (req, res) => {
  res.status(200).json({
    status: 'green',
    version,
    name,
    environment: process.env.NODE_ENV || 'development',
  })
}

module.exports = {
  health,
}
