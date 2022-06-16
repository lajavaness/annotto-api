const mongoose = require('mongoose')

const clientSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  description: String,
  isActive: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
})

module.exports = mongoose.model('Client', clientSchema)
