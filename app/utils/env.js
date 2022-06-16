const checkForMandatoryEnv = (mandatoryEnv) => {
  const envKeys = Object.keys(process.env)
  mandatoryEnv.forEach((key) => {
    if (!envKeys.includes(key)) {
      throw Error(`Error: Missing process.env.${key}`)
    }
  })
}

module.exports = { checkForMandatoryEnv }
