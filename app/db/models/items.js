const mongoose = require('mongoose')
require('./projects')

const itemSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      index: true,
    },
    uuid: { type: String, sparse: true },
    compositeUuid: { type: String, unique: true, sparse: true },
    data: { type: Object },
    body: String,
    description: String,
    type: { type: String, enum: ['text', 'image'], default: 'text' },
    status: { type: String, enum: ['todo', 'done'], default: 'todo' },
    annotated: { type: Boolean, default: false, index: true },
    annotatedBy: { type: [String], default: [], index: true },
    annotationValues: { type: [String], default: [], index: true },
    entitiesRelations: { type: [{}] },
    predictions: {},
    raw: {},
    highlights: { type: [{}] },
    tags: { default: [], type: [String], index: true },
    annotatedAt: { type: Date, default: null },
    seenAt: { type: Date, index: true },
    updatedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    velocity: { type: Number, default: null },
    annotationTimes: { type: [Number], default: [] },
    lastAnnotator: { type: {}, default: null },
    commentCount: { type: Number, default: 0 },
    logCount: { type: Number, default: 0 },
    metadata: { type: Object, default: {} },
    sourceHighlights: [String],
  },
  {
    skipVersioning: {
      logCount: true, // avoid having versionning issues in log count (this field is not important enough)
    },
  }
)

itemSchema.virtual('firstAnnotationVirtual')
itemSchema.virtual('annotationsVirtual')

itemSchema.post('init', function init(doc) {
  this._original = doc.toObject({ transform: false })
})

itemSchema.pre('save', function save(next, params) {
  this.updatedAt = new Date()
  this._user = params._user
  next()
})

module.exports = mongoose.model('Item', itemSchema)
