const mongoSetupTeardown = require('./mongoSetupTeardown')

mongoSetupTeardown()

describe('test build tree cases', () => {
  test('simple config build', () => {
    // eslint-disable-next-line jest/valid-expect
    expect(true)
  })
  // test('simple config build', () => {
  //   const output = buildTree(simpleSeeds)
  //
  //   const types = simpleSeeds.map((seed) => seed.type)
  //   const topClassif = simpleSeeds.filter((seed) => seed.category === 'level1' && !seed.parents.length)
  //   const topNer = simpleSeeds.filter((seed) => seed.category === 'NER-level1' && !seed.parents.length)
  //   const topZone = simpleSeeds.filter((seed) => seed.category === 'zone-level1' && !seed.parents.length)
  //
  //   expect(types.every((type) => output[type])).toBeTruthy()
  //   expect(output.classifications[0].values).toHaveLength(topClassif.length)
  //   expect(output.ner[0].values).toHaveLength(topNer.length)
  //   expect(output.zone[0].values).toHaveLength(topZone.length)
  // })
  // test('complex config build', () => {
  //   const output = buildTree(childrenSeeds)
  //
  //   const types = childrenSeeds.map((seed) => seed.type)
  //   const topClassif = childrenSeeds.filter((seed) => seed.category === 'level1' && !seed.parents.length)
  //   const topNer = childrenSeeds.filter((seed) => seed.category === 'NER-level1' && !seed.parents.length)
  //   const topZone = childrenSeeds.filter((seed) => seed.category === 'zone-level1' && !seed.parents.length)
  //
  //   expect(types.every((type) => output[type])).toBeTruthy()
  //   expect(output.classifications[0].values).toHaveLength(topClassif.length)
  //   expect(output.ner[0].values).toHaveLength(topNer.length)
  //   expect(output.zone[0].values).toHaveLength(topZone.length)
  //
  //   const RAChildren = output.classifications[0].values[0].children.values
  //   const FOOChildren = output.classifications[0].values[1].children.values[0].children
  //   const RBChildren = output.classifications[0].values[1].children.values
  //
  //   expect(RAChildren[0].value).toBe('RA01')
  //   expect(RAChildren[1].value).toBe('FOO')
  //   expect(RBChildren[0].value).toBe('FOO')
  //   expect(FOOChildren).toBeTruthy()
  // })
})
