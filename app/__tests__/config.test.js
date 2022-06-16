const { projectConfigV2Schema } = require('../router/validation/project')

const validConfig1 = require('../../tests/integration/seed/config/valid/config1.json')
const validConfig2 = require('../../tests/integration/seed/config/valid/config2.json')
const validConfig3 = require('../../tests/integration/seed/config/valid/config3.json')
const validConfig4 = require('../../tests/integration/seed/config/valid/config4.json')
const validConfig5 = require('../../tests/integration/seed/config/valid/config5.json')

const invalidConfig1 = require('../../tests/integration/seed/config/invalid/config1.json')
const invalidConfig2 = require('../../tests/integration/seed/config/invalid/config2.json')
const invalidConfig3 = require('../../tests/integration/seed/config/invalid/config3.json')
const invalidConfig4 = require('../../tests/integration/seed/config/invalid/config4.json')
const invalidConfig5 = require('../../tests/integration/seed/config/invalid/config5.json')
const invalidConfig6 = require('../../tests/integration/seed/config/invalid/config6.json')

const valids = [validConfig1, validConfig2, validConfig3, validConfig4, validConfig5]
const invalids = [invalidConfig1, invalidConfig2, invalidConfig3, invalidConfig4, invalidConfig5, invalidConfig6]

describe('valid configs', () => {
  test.each(valids)('Should validate config', (config) => {
    expect(projectConfigV2Schema.validate(config).error).toBe(undefined)
  })
})

describe('invalid configs', () => {
  test.each(invalids)('Should reject invalid config', (config) => {
    expect(projectConfigV2Schema.validate(config).error).toBeTruthy()
  })
})
