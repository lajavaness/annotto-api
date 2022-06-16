const supertest = require('supertest')
const mongoose = require('mongoose')

const config = require('../../config')
const createServer = require('../../app/__tests__/create-server')
const { adminOauth, userOauth } = require('./seed/seed')
const getToken = require('../../app/__tests__/get-oauth-token')

let JWT
// let dataScientistJWT
let userJWT
// let projectUserJWT
// let projectDatascientistJWT
// let projectAdminJWT
let app

beforeAll(async () => {
  app = await createServer(config)
  await mongoose.connect(config.mongo.url, config.mongo.options)

  JWT = await getToken(adminOauth)
  // dataScientistJWT = await getToken(datascientist)
  userJWT = await getToken(userOauth)

  // projectUserJWT = await getToken(projectUser)
  // projectDatascientistJWT = await getToken(projectDatascientist)
  // projectAdminJWT = await getToken(projectAdmin)
}, 20000)

afterAll(() => mongoose.disconnect())

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections()

  for (const collection of collections) {
    await collection.deleteMany()
  }
})

describe('profiles', () => {
  test('GET api/profiles', () => {
    return supertest(app)
      .get('/api/profiles/')
      .set('Authorization', `Bearer ${JWT}`)
      .expect(200)
      .then((res) => res.body.data)
      .then((profiles) => expect(profiles).toHaveLength(1))
  })

  test('First request creates a profile', async () => {
    await supertest(app).get('/api/projects').set('Authorization', `Bearer ${userJWT}`).expect(200)

    const profiles = await supertest(app)
      .get('/api/profiles/')
      .set('Authorization', `Bearer ${JWT}`)
      .expect(200)
      .then((res) => res.body.data)

    expect(profiles).toHaveLength(2)
    const profile = profiles.find((p) => p.role === 'user')
    expect(profile).toBeTruthy()
  })

  test('PUT api/profiles/:id', async () => {
    // request to create a second non admin profile
    await supertest(app).get('/api/projects').set('Authorization', `Bearer ${userJWT}`).expect(200)

    const profiles = await supertest(app)
      .get('/api/profiles/')
      .set('Authorization', `Bearer ${JWT}`)
      .expect(200)
      .then((res) => res.body.data)

    const userProfile = profiles.find((profile) => profile.role === 'user')

    return supertest(app)
      .put(`/api/profiles/${userProfile._id}?role=dataScientist`)
      .set('Authorization', `Bearer ${JWT}`)
      .expect(200)
      .then((res) => res.body)
      .then((profile) => expect(profile.role).toBe('dataScientist'))
  })
})
