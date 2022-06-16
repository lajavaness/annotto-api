const { ObjectId } = require('mongoose').Types

const mongoSetupTeardown = require('./mongoSetupTeardown')

const { changeAnnotationsStatus } = require('../annotations')

const {
  isZoneAnnotationToCancel,
  isNerAnnotationToCancel,
  isClassificationAnnotationToCancel,
} = require('../annotations')

const zoneID = ObjectId()
const zonePayload = {
  value: 'bbox_name',
  zone: [
    { x: 0.17368421052631576, y: 0.11869918699186992 },
    { x: 0.8621052631578947, y: 0.11869918699186992 },
    { x: 0.8621052631578947, y: 0.022764227642276424 },
    { x: 0.47368421052631576, y: 0.022764227642276424 },
  ],
  task: {
    _id: zoneID,
  },
}
const zoneChangeCoordinates = {
  value: 'bbox_name',
  zone: [
    { x: 0.27368421052631576, y: 0.31869918699186992 },
    { x: 0.9621052631578947, y: 0.21869918699186992 },
    { x: 0.9621052631578947, y: 0.122764227642276424 },
    { x: 0.57368421052631576, y: 0.022764227642276424 },
  ],
  task: {
    _id: zoneID,
  },
}
const zoneChangeID = {
  value: 'bbox_name',
  zone: [
    { x: 0.17368421052631576, y: 0.11869918699186992 },
    { x: 0.8621052631578947, y: 0.11869918699186992 },
    { x: 0.8621052631578947, y: 0.022764227642276424 },
    { x: 0.47368421052631576, y: 0.022764227642276424 },
  ],
  task: {
    _id: ObjectId(),
  },
}

const nerID = ObjectId()
const ner = {
  value: 'name',
  ner: { start: 0, end: 10 },
  task: {
    _id: nerID,
  },
}
const nerChangeChars = {
  value: 'name',
  ner: { start: 10, end: 20 },
  task: {
    _id: nerID,
  },
}
const nerChangeID = {
  value: 'name',
  ner: { start: 0, end: 10 },
  task: {
    _id: ObjectId(),
  },
}

const classifID = ObjectId()
const task = {
  value: 'formation',
  task: {
    _id: classifID,
  },
}
const classificationChangeID = {
  value: 'formation',
  task: {
    _id: ObjectId(),
  },
}

mongoSetupTeardown()

describe('Annotation payload comparison', () => {
  test('Classification annotation with different ObjectID', () => {
    expect(isClassificationAnnotationToCancel(task, [classificationChangeID])).toBe(true)
  })
  test('Zone annotation with different coordinates or ObjectID', () => {
    expect(isZoneAnnotationToCancel(zonePayload, [zoneChangeCoordinates])).toBe(true)
    expect(isZoneAnnotationToCancel(zonePayload, [zoneChangeID])).toBe(true)
  })
  test('Ner annotation with different character position or ObjectID', () => {
    expect(isNerAnnotationToCancel(ner, [nerChangeChars])).toBe(true)
    expect(isNerAnnotationToCancel(ner, [nerChangeID])).toBe(true)
  })
})

describe('annotation statics', () => {
  const payload = [
    {
      _id: ObjectId(),
      status: 'done',
      tags: [],
    },
    {
      task: ObjectId(),
      status: 'done',
      tags: [],
    },
    {
      _id: ObjectId(),
      status: 'cancelled',
      tags: [],
    },
    {
      task: ObjectId(),
      status: 'cancelled',
      tags: [],
    },
    {
      task: ObjectId(),
      status: 'done',
      tags: [],
    },
    {
      _id: ObjectId(),
      status: 'done',
      tags: [],
    },
  ]

  test('changeAnnotationStatus default to cancelled', () => {
    changeAnnotationsStatus(payload)
    payload.forEach((annotation) => expect(annotation.status).toBe('cancelled'))
  })

  test('ChangeAnnotationStatus status in param', () => {
    const status = 'draft'
    changeAnnotationsStatus(payload, status)
    payload.forEach((annotation) => expect(annotation.status).toBe(status))
  })
})
