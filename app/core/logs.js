const mongoose = require('mongoose')

const { ObjectId } = mongoose.Types
const { isEqual } = require('lodash')
const Log = require('../db/models/logs')

const toId = (item) => (ObjectId.isValid(item) ? item : item._id)

/**
 * Don't update __v when saving logs.
 * @param {*} item The item.
 * @param {*} logCount The logCount.
 */
const updateLogCount = async (item, logCount) => {
  if (!item) return
  const _id = toId(item)
  await mongoose.model('Item').collection.updateOne({ _id }, { $inc: { logCount } })
}

const splitLogCountPerItem = (logs) => {
  const perItem = {}
  for (const log of logs) {
    const id = toId(log.item).toString()
    if (!perItem[id]) {
      perItem[id] = 0
    }
    perItem[id]++
  }
  return Object.entries(perItem)
}

const saveLogs = (logs) =>
  Promise.all([
    Log.insertMany(logs, { ordered: false }),
    ...splitLogCountPerItem(logs).map(([id, logCount]) => updateLogCount(new ObjectId(id), logCount)),
  ])

const saveLog = async (log) => {
  await log.save()
  await updateLogCount(log.item, 1)
  return log
}

const logNewAnnotations = (annotations, item, user, project) =>
  new Log({
    type: 'annotation-add',
    project,
    user,
    item,
    annotations,
  })

const logRemoveAnnotations = (annotations, item, user, project) =>
  new Log({
    type: 'annotation-remove',
    project,
    user,
    item,
    annotations,
  })

const logComment = (comment) => {
  const log = {
    type: 'comment-add',
    user: comment.user,
    comment: comment._id,
    commentMessage: comment.comment,
    project: comment.project,
    mission: comment.mission,
    annotation: comment.annotation,
    item: comment.item,
    commentType: 'Create',
  }
  const nLog = new Log(log)
  return saveLog(nLog)
}

const diffFields = (prev = [], current = []) => {
  const diff = {
    added: current.filter((elem) => !prev.includes(elem)),
    deleted: prev.filter((elem) => !current.includes(elem)),
  }
  return diff
}

const genLogTagsPayloads = (item) => {
  const prev = item._original

  const tags = prev && Array.isArray(prev.tags) ? prev.tags : []
  const diff = diffFields(tags, item.tags || [])
  const logs = []

  if (diff.added.length) {
    logs.push({
      type: 'tags-add',
      item: item._id,
      project: item.project,
      user: item._user,
      tags: diff.added,
    })
  }

  if (diff.deleted.length) {
    logs.push({
      type: 'tags-remove',
      item: item._id,
      project: item.project,
      user: item._user,
      tags: diff.deleted,
    })
  }

  return logs
}

const logTags = async (item) => {
  return Log.insertMany(genLogTagsPayloads(item), { ordered: false })
}

/**
 * Compare item current entitiesRelations with payload to log added and removed relations.
 * When a diff is found, looks for relation object in project to create a log with the relation label
 * for UI to display.
 * @param {*} item The item.
 * @param {*} payloads The payloads.
 * @param {*} project The project.
 * @param {*} params The params.
 */
const logRelations = async (item, payloads, project, params) => {
  const removedRelations = item.entitiesRelations.reduce((relations, currentRelation) => {
    const isStillPresent = payloads.find((payload) => isEqual(payload, currentRelation))

    if (!isStillPresent) {
      project.entitiesRelationsGroup.forEach((group) => {
        const entitiesRelation = group.values.find((relationObj) => relationObj.value === currentRelation.value)

        if (entitiesRelation) {
          relations.push({
            src: currentRelation.src,
            dest: currentRelation.dest,
            entitiesRelation,
          })
        }
      })
    }
    return relations
  }, [])

  const addedRelations = payloads.reduce((relations, payload) => {
    const isPresent = item.entitiesRelations.find((currentRelation) => isEqual(currentRelation, payload))

    if (!isPresent) {
      project.entitiesRelationsGroup.forEach((group) => {
        const entitiesRelation = group.values.find((relationObj) => relationObj.value === payload.value)

        if (entitiesRelation) {
          relations.push({
            src: payload.src,
            dest: payload.dest,
            entitiesRelation,
          })
        }
      })
    }
    return relations
  }, [])

  if (removedRelations.length) {
    const log = new Log({
      type: 'relation-remove',
      project: params.project,
      user: params._user,
      item,
      relations: removedRelations,
    })

    await saveLog(log)
  }
  if (addedRelations.length) {
    const log = new Log({
      type: 'relation-add',
      project: params.project,
      user: params._user,
      item,
      relations: addedRelations,
    })

    await saveLog(log)
  }
}

const logProject = async (project) => {
  if (project._wasNew) {
    const log = {
      type: 'project-add',
      user: project._user,
      project: project._id,
    }

    const nLog = new Log(log)

    return saveLog(nLog)
  }
  return null
}

module.exports = {
  logNewAnnotations,
  logRemoveAnnotations,
  logComment,
  logTags,
  logRelations,
  logProject,
  genLogTagsPayloads,
  saveLogs,
}
