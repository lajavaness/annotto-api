const mongoose = require('mongoose')

const annotationSchema = new mongoose.Schema(
  {
    user: {
      _id: { type: String, index: true },
      firstName: String,
      lastName: String,
      email: String,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
    },
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    text: { type: String, default: undefined },
    zone: { type: [{ x: Number, y: Number }], default: undefined },
    ner: { type: { start: Number, end: Number }, default: undefined },
    status: { type: String, enum: ['draft', 'cancelled', 'refused', 'done'], default: 'done' },
    updatedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { toJSON: { virtuals: true } }
)

annotationSchema.pre('save', function save(next, params) {
  this.updatedAt = new Date()
  this._project = params.project

  next()
})

annotationSchema
  .pre('find', function find() {
    this.populate('task')
  })
  .pre('findOne', function findOne() {
    this.populate('task')
  })

annotationSchema.virtual('value').get(function value() {
  return this.task.value
})

module.exports = mongoose.model('Annotation', annotationSchema)
