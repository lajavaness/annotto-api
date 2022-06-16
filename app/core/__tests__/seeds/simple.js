const {
  Types: { ObjectId },
} = require('mongoose')

const idRA = ObjectId()
const idRB = ObjectId()
const idNer1 = ObjectId()
const idZone1 = ObjectId()

module.exports = [
  {
    parents: [],
    type: 'classifications',
    _id: idRA,
    value: 'RA',
    hotkey: 'A',
    label: 'Category RA',
    category: 'level1',
    updatedAt: '2020-08-25T14:52:22.157Z',
    createdAt: '2020-08-25T14:52:22.157Z',
    __v: 0,
  },
  {
    parents: [],
    type: 'classifications',
    _id: idRB,
    value: 'RB',
    hotkey: 'C',
    label: 'Category RB',
    category: 'level1',
    updatedAt: '2020-08-25T14:52:22.161Z',
    createdAt: '2020-08-25T14:52:22.161Z',
    __v: 0,
  },
  {
    parents: [],
    type: 'ner',
    _id: idNer1,
    value: 'NER1',
    hotkey: 'E',
    label: 'Category NER1',
    category: 'NER-level1',
    updatedAt: '2020-08-25T14:52:22.163Z',
    createdAt: '2020-08-25T14:52:22.163Z',
    __v: 0,
  },
  {
    parents: [],
    type: 'zone',
    _id: idZone1,
    value: 'ZONE1',
    hotkey: 'F',
    label: 'Category ZONE1',
    category: 'zone-level1',
    updatedAt: '2020-08-25T14:52:22.163Z',
    createdAt: '2020-08-25T14:52:22.163Z',
    __v: 0,
  },
]
