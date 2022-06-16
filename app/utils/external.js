const fetch = require('node-fetch')

/**
 * Get similarity uuids.
 * @param {string} url Similarity endpoint.
 * @param {string} text String to match.
 * @param {string[]} negativeTexts Opposite strings used to match.
 * @param {int} limit Uuids length limit of response.
 * @returns {*} Uuids.
 */
const getSimilarityUuids = async (url, text, negativeTexts = [], limit = 50) => {
  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      pos_text: text,
      neg_texts: negativeTexts,
      K: limit,
    }),
    headers: {
      'Content-type': 'application/json',
    },
  })

  const json = await response.json()

  return json.uuids
}

module.exports = {
  getSimilarityUuids,
}
