const mongoose = require('mongoose')
const dayjs = require('dayjs')

const projectSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
    },
    defaultTags: { type: [String], default: [] },
    itemTags: { type: [String], default: [], select: false },
    type: String,
    description: { type: String, default: null },
    s3: { type: {}, select: false },
    name: { type: String, unique: true },
    active: { type: Boolean, default: true },
    admins: { type: [String], default: [] },
    users: { type: [String], default: [] },
    dataScientists: { type: [String], default: [] },
    tasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
      },
    ],
    filterPredictionsMinimum: { type: Number, default: 0.4 },
    highlights: [String],
    entitiesRelationsGroup: [
      {
        name: String,
        min: Number,
        max: Number,
        values: [
          {
            value: String,
            label: String,
            hotkey: String,
            color: String,
            description: String,
            exposed: { type: Boolean, default: true },
          },
        ],
      },
    ],
    guidelines: String,
    itemCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    deadline: { type: Date, default: null },
    progress: { type: Number, default: null },
    velocity: { type: Number, default: null },
    remainingWork: { type: Number, default: null },
    lastAnnotationTime: { type: Date, default: null },
    similarityEndpoint: String,
    showPredictions: { type: Boolean, default: true },
    prefillPredictions: { type: Boolean, default: true },
    annotators: [],
  },
  { toJSON: { virtuals: true } }
)

projectSchema.pre('save', function save(next, params) {
  this.updatedAt = new Date()
  this._wasNew = this.isNew
  this._user = params._user

  next()
})

projectSchema.virtual('status').get(function status() {
  if (dayjs().isAfter(dayjs(this.deadline))) {
    return 'out of time'
  }
  return 'Ongoing'
})

module.exports = mongoose.model('Project', projectSchema)
