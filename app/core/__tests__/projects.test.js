const { ObjectId } = require('mongoose').Types
const crypto = require('crypto')

const Item = require('../../db/models/items')
const Project = require('../../db/models/projects')
const Log = require('../../db/models/logs')

const mongoSetupTeardown = require('./mongoSetupTeardown')
const { getProjectTags, saveProject } = require('../projects')
const { logProject } = require('../logs')
const { saveItem } = require('../items')

const { validateTasksAndAddObject } = require('../projects')

mongoSetupTeardown()

describe('logs', () => {
  const createProject = () => {
    const project = new Project({ name: 'myProject' })

    return saveProject(project, {
      _id: ObjectId().toString(),
      email: `${crypto.randomBytes(10).toString('hex')}@lajavaness.com`,
      firstName: `${crypto.randomBytes(10).toString('hex')}`,
      lastName: `${crypto.randomBytes(10).toString('hex')}@lajavaness.com`,
    })
  }

  test('logProject - new', async () => {
    const project = await createProject()
    project._wasNew = true

    const res = await logProject(project)
    expect(res._id).toBeDefined()
    expect(res.type).toBe('project-add')
    expect(res.user).toEqual(project._user)
  })

  test('logProject - not new', async () => {
    const project = await createProject()

    project._wasNew = false
    const res = await logProject(project)
    expect(res).toBeFalsy()
  })

  describe('tags', () => {
    test('$addToSet', async () => {
      const project = await createProject()

      const newItem = new Item({ tags: ['a', 'b'], project: project._id })
      await saveItem(newItem)

      expect(await getProjectTags(project._id)).toEqual(['a', 'b'])

      const item = await Item.findById(newItem._id)
      item.tags = ['b', 'c']
      await saveItem(item)

      expect(await getProjectTags(project._id)).toEqual(['a', 'b', 'c'])
    })
  })
})

describe('Project creation', () => {
  const user = {
    _id: ObjectId().toString(),
    firstName: 'Taylor',
    lastName: 'Durden',
    email: 'taylor@theclub.com',
  }
  const createProject = () => {
    const payload = {
      name: crypto.randomBytes(10).toString('hex'),
      description: crypto.randomBytes(10).toString('hex'),
      active: true,
    }

    const newProject = new Project(payload)
    return saveProject(newProject, user)
  }

  test('create', async () => {
    const project = await createProject()

    expect(project._id).toBeDefined()
    expect(project.name).toBeDefined()
    expect(project.description).toBeDefined()
    expect(project.active).toBeDefined()
  })

  test('project logs', async () => {
    const project = await createProject()

    const logs = await Log.find({ project: project._id })

    expect(logs[0]._id).toBeDefined()
    expect(logs[0].type).toBe('project-add')
    expect(logs[0].user._id).toEqual(user._id)
    expect(logs[0].user.email).toEqual(user.email)
    expect(logs[0].user.firstName).toEqual(user.firstName)
    expect(logs[0].user.lastName).toEqual(user.lastName)
  })
})

describe('Projects statics', () => {
  const parent = {
    _id: ObjectId(),
    value: 'RA',
    parents: [],
  }

  const child = {
    _id: ObjectId(),
    value: 'RA_01',
    parents: [parent],
  }

  const tasks = [parent, child]
  tasks[1].parents = [tasks[0]._id]

  test('validateIdsWithProject - valid', () => {
    const annotations = {
      annotations: [{ value: 'RA' }],
    }

    expect(() => validateTasksAndAddObject({ tasks }, annotations)).not.toThrow()
  })

  test('validateIdsWithProject - invalid', () => {
    const annotations = {
      annotations: [{ value: 'RA' }, { value: 'FOO' }],
    }

    expect(() => validateTasksAndAddObject({ tasks }, annotations)).toThrow()
  })
})
