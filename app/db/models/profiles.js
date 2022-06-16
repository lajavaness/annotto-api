const mongoose = require('mongoose')

const profileSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['admin', 'user', 'dataScientist'],
    default: 'user',
  },
  user: { type: String, index: true, required: true },
  email: { type: String, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

profileSchema.pre('save', function save(next) {
  this.updatedAt = new Date()
  next()
})

module.exports = mongoose.model('Profile', profileSchema)
