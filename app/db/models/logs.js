const mongoose = require('mongoose')
const Annotation = require('./annotations')

const logSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'comment-add',
      'comment-remove',
      'tags-add',
      'tags-remove',
      'project-add',
      'project-remove',
      'mission-add',
      'mission-remove',
      'annotation-add',
      'annotation-remove',
      'prediction-add',
      'relation-add',
      'relation-remove',
      'text-add',
      'text-update',
    ],
  },
  comment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    index: true,
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    index: true,
  },
  mission: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mission',
    index: true,
  },
  annotations: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Annotation',
      index: true,
    },
  ],
  relations: [{}],
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    index: true,
  },
  user: {
    _id: { type: String, index: true },
    firstName: String,
    lastName: String,
    email: String,
  },
  commentMessage: { type: String },
  tags: [String],
  createdAt: { type: Date, default: Date.now },
})

/**
 * Because find clauses may contain "include" clauses,
 * We cannot filter out the useless fields. Instead, we need to enumerate
 * all the fields that we want.
 * @returns {object.<string, 1>} Returns the object stripped from its unused props.
 */
const excludeUselessFields = () => {
  const excluded = ['user', '__v', 'createdAt']
  return Object.keys(Annotation.schema.paths)
    .filter((path) => !path.includes('.') && !excluded.includes(path))
    .reduce((a, b) => ({ ...a, [b]: 1 }), {})
}

logSchema.pre('find', function find() {
  this.populate('annotations', {
    path: 'annotations',
    select: excludeUselessFields(),
  })
})

module.exports = mongoose.model('Log', logSchema)
