const { ObjectId } = require('mongoose').Types
const crypto = require('crypto')
const mongoSetupTeardown = require('./mongoSetupTeardown')

const { logComment } = require('../logs')
const { saveComment } = require('../comments')

const Comment = require('../../db/models/comments')
const Log = require('../../db/models/logs')

mongoSetupTeardown()

describe('logs', () => {
  test('logComment', async () => {
    const comment = {
      comment: 'toto',
      _user: {
        _id: ObjectId().toString(),
        email: `${crypto.randomBytes(10).toString('hex')}@lajavaness.com`,
        firstName: `${crypto.randomBytes(10).toString('hex')}`,
        lastName: `${crypto.randomBytes(10).toString('hex')}@lajavaness.com`,
      },
    }

    const res = await logComment(comment)
    expect(res.commentMessage).toBe(comment.comment)
    expect(res.type).toBe('comment-add')
  })
})

describe('comment model', () => {
  test('Comment save', async () => {
    const newComment = new Comment({
      comment: crypto.randomBytes(10).toString('hex'),
    })
    const user = {
      _id: ObjectId(),
      firstName: 'Taylor',
      lastName: 'Durden',
      email: 'taylor@fighclub.com',
    }

    const n = await saveComment(newComment, user)
    expect(n._id).toBeDefined()
    expect(n.comment).toBe(newComment.comment)
    const l = await Log.findOne({
      comment: n._id,
      commentMessage: n.comment,
    })
    expect(l.comment.toString()).toBe(n._id.toString())
    expect(l.commentMessage).toBe(n.comment)
    expect(l.user._id.toString()).toBe(n.user._id.toString())
    expect(l.user.firstName).toBe(n.user.firstName)
    expect(l.user.lastName).toBe(n.user.lastName)
    expect(l.user.email).toBe(n.user.email)
    expect(l.type).toBe('comment-add')
  })
})
