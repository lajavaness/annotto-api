const userService = require('../services/user')

const index = async (req, res, next) => {
  try {
    const user = await userService.find(req.query, req.token.token)
    res.status(200).json(user)
  } catch (error) {
    next(error)
  }
}

const getById = async (req, res, next) => {
  try {
    const user = await userService.findById(req.params.idUser, req.token.token)
    res.status(200).json(user)
  } catch (error) {
    next(error)
  }
}

const update = async (req, res, next) => {
  try {
    const user = await userService.update(req.params.idUser, req.body, req.token.token)
    res.status(200).json(user)
  } catch (error) {
    next(error)
  }
}

const destroy = async (req, res, next) => {
  try {
    await userService.destroy(req.params.idUser, req.token.token)
    res.status(200).end()
  } catch (error) {
    next(error)
  }
}

const register = async (req, res, next) => {
  try {
    const user = await userService.create(req.body, req.token.token)
    res.status(201).json(user)
  } catch (error) {
    next(error)
  }
}

const me = async (req, res) => {
  res.status(200).json(req._user)
}

const forgotPassword = async (req, res) => {
  res.status(200).json({
    message: 'Should send magic link to generate new password',
  })
}

const resetPassword = async (req, res) => {
  res.status(200).json({
    message: 'Should change password',
  })
}

module.exports = {
  index,
  getById,
  update,
  destroy,
  register,
  me,
  forgotPassword,
  resetPassword,
}
