const mongoose = require('mongoose')

const filterSchema = new mongoose.Schema(
  {
    user: {
      _id: { type: String, index: true },
      firstName: String,
      lastName: String,
      email: String,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      index: true,
    },
    payload: {},
    criteria: {},
  },
  {
    safe: false,
  }
)

module.exports = mongoose.model('Filter', filterSchema)
