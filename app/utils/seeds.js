const fs = require('fs')
const path = require('path')
const { logger } = require('./logger')

const { user } = require('../../tests/integration/seed/seed')

const core = require('../core/projects/import')

const Project = require('../db/models/projects')

const toFile = (dirname, filename) => ({ path: path.join(dirname, filename) })

const createDemo = async () => {
  const demoPath = path.join(__dirname, '../../statics/demo/')
  const demoFiles = fs.readdirSync(demoPath).map((name) => [name, fs.readdirSync(path.join(demoPath, name))])

  try {
    // Creating demos in series to check duplicate index errors mistake
    await demoFiles.reduce((promiseChain, [demoName, files]) => {
      return promiseChain.then(async () => {
        if (!files.includes('config.json')) {
          logger.info(`Ignoring Demo (${demoName}) missing config.json`)
          return
        }
        if (!files.includes('items.jsonlines')) {
          logger.info(`Ignoring Demo (${demoName}) missing items.jsonlines`)
          return
        }
        const demo = path.join(demoPath, demoName)
        const config = require(path.join(demo, 'config.json')) // eslint-disable-line import/no-dynamic-require, global-require
        const existingProject = await Project.findOne({ name: config.name })
        if (existingProject) return

        await core.importAllFromFiles({
          projectFile: toFile(demo, 'config.json'),
          itemsFile: toFile(demo, 'items.jsonlines'),
          predictionsFile: files.includes('predictions.jsonlines') && toFile(demo, 'predictions.jsonlines'),
          annotationsFile: files.includes('annotations.jsonlines') && toFile(demo, 'annotations.jsonlines'),
          renameIfDuplicateName: false,
          _user: user,
        })

        logger.info(`Created seed (${demoName})`)
      })
    }, Promise.resolve())
  } catch (error) {
    logger.info(error)
  }
}

module.exports = {
  createDemo,
}
