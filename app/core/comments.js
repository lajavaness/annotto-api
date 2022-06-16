const mongoose = require('mongoose')

const { ObjectId } = mongoose.Types
const Comment = require('../db/models/comments')
const Log = require('../db/models/logs')
const Project = require('../db/models/projects')
const Item = require('../db/models/items')
const { logComment } = require('./logs')

const bulkInsertCommentLogs = (annotations, projectId) => {
  const query = annotations.flatMap((a) =>
    a.comments
      ? a.comments.map((c) => ({
          type: 'comment-add',
          comment: c._id,
          commentMessage: c.comment,
          user: {
            email: c.user?.email,
            firstName: c.user?.firstName,
            lastName: c.user?.lastName,
          },
          item: a.item._id,
          project: projectId,
          createdAt: new Date(c.createdAt),
        }))
      : []
  )
  return Log.insertMany(query, { ordered: false })
}

const bulkInsertComments = async (annotations, projectId) => {
  const query = annotations.flatMap((a) =>
    a.comments
      ? a.comments.map((c) => {
          c._id = new ObjectId()
          return {
            _id: c._id,
            comment: c.comment,
            user: {
              email: c.user?.email,
              firstName: c.user?.firstName,
              lastName: c.user?.lastName,
            },
            item: a.item._id,
            project: projectId,
            updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
            createdAt: new Date(c.createdAt),
          }
        })
      : []
  )
  await Comment.insertMany(query, { ordered: false })
  return bulkInsertCommentLogs(annotations, projectId)
}

const saveComment = async (comment, user) => {
  await comment.save(user)
  if (comment.item) {
    await Item.findOneAndUpdate({ _id: comment.item }, { $inc: { commentCount: 1 } })
  }
  if (comment.project) {
    await Project.findOneAndUpdate({ _id: comment.project }, { $inc: { commentCount: 1 } })
  }
  await logComment(comment)
  return comment
}

module.exports = {
  bulkInsertComments,
  saveComment,
}
