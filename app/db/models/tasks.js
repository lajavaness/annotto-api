const mongoose = require('mongoose')

const taskSchema = new mongoose.Schema({
  hotkey: { type: String, maxLength: 1 },
  shortDescription: String,
  description: String,
  conditions: [
    {
      type: String,
    },
  ],
  category: { type: String, required: true },
  exposed: { type: Boolean, default: true },
  type: {
    type: String,
    required: true,
    enum: ['classifications', 'ner', 'zone', 'text'],
    default: 'classifications',
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    index: true,
  },
  color: String,
  label: { type: String, required: true },
  value: { type: String, required: true },
  annotationPourcent: { type: Number, default: 0 },
  annotationCount: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  min: { type: Number },
  max: { type: Number },
})

module.exports = mongoose.model('Task', taskSchema)
