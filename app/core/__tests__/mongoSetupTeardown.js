const { beforeAll, afterAll, beforeEach } = require('@jest/globals')
const mongoose = require('mongoose')
const config = require('../../../config')

const mongoSetupTeardown = async () => {
  beforeAll(async () => {
    await mongoose.connect(config.mongo.url, config.mongo.options)
  })
  afterAll(async () => {
    await mongoose.disconnect()
  })

  beforeEach(async () => {
    const collections = await mongoose.connection.db.collections()

    for (const collection of collections) {
      await collection.deleteMany()
    }
  })
}

module.exports = mongoSetupTeardown
