const mongoose = require('mongoose')

const commentSchema = new mongoose.Schema({
  comment: {
    type: String,
  },
  user: {
    _id: { type: String, index: true },
    firstName: String,
    lastName: String,
    email: String,
  },
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
  },
  batch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch',
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
  },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
})

commentSchema.pre('save', function save(next, params) {
  this.updatedAt = new Date()
  this.$locals.params = params
  this.user = params

  next()
})

module.exports = mongoose.model('Comment', commentSchema)
