const CryptoJS = require('crypto-js')

const config = require('../../config')

const encrypt = (text) => CryptoJS.AES.encrypt(text, config.encryptSecretKey).toString()

const decrypt = (text) => {
  const bytes = CryptoJS.AES.decrypt(text, config.encryptSecretKey)

  return bytes.toString(CryptoJS.enc.Utf8)
}

module.exports = {
  encrypt,
  decrypt,
}
