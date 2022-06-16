/* global jest */
const AWS = jest.genMockFromModule('aws-sdk')

AWS.S3.mockReturnValue({
  getObject: jest.fn(() => {
    return {
      promise: () =>
        Promise.resolve({
          ContentType: 'FOO',
          Body: Buffer.from('BAR'),
        }),
    }
  }),
})

module.exports = AWS
