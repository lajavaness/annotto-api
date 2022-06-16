const { describe, test, expect } = require('@jest/globals')
const { haveAccessRole } = require('../service')

const Profile = require('../../db/models/profiles')

const mockFindOneLean = jest.fn()
jest.spyOn(Profile, 'findOne').mockImplementation(() => ({
  lean: mockFindOneLean,
}))

jest.spyOn(Profile.prototype, 'save').mockImplementation(() => Promise.resolve())

describe('role/profile access', () => {
  test('haveAccessRole - projectRole not exist', () => {
    const projectRole = 'cooker'
    const email = 'user@test.com'
    const project = {
      users: ['user@test.com'],
      dataScientists: [],
      admins: [],
    }
    expect(haveAccessRole(projectRole, email, project)).toBeUndefined()
  })
  test('haveAccessRole - projectRole dataScientists as user', () => {
    const projectRole = 'dataScientist'
    const email = 'user@test.com'
    const _project = {
      users: ['user@test.com'],
      dataScientists: [],
      admins: [],
    }
    expect(haveAccessRole(projectRole, email, _project)).toBe(false)
  })
  test('haveAccessRole - projectRole user as dataScientist', () => {
    const projectRole = 'user'
    const email = 'user@test.com'
    const _project = {
      users: [],
      dataScientists: ['user@test.com'],
      admins: [],
    }
    expect(haveAccessRole(projectRole, email, _project)).toBe(true)
  })
  test('haveAccessRole - projectRole user as user', () => {
    const projectRole = 'user'
    const email = 'user@test.com'
    const _project = {
      users: ['user@test.com'],
      dataScientists: [],
      admins: [],
    }
    expect(haveAccessRole(projectRole, email, _project)).toBe(true)
  })
})
