// Seeds users on NEXT and STAGING

const user = {
  email: 'userProfile-42@lajavaness.com',
  firstName: 'Edouard',
  lastName: 'Paul',
  password: 'LJN2017305720374',
}

const admin = {
  email: 'admin@lajavaness.com',
  firstName: 'The',
  lastName: 'Narrator',
  password: 'w5V!H!C?+>=+}9c7',
}

const adminOauth = {
  username: 'admin',
  password: 'test',
  email: 'admin@test.com'
}

const dataOauth = {
  username: 'data',
  password: 'test',
  email: 'data@test.com'
}

const userOauth = {
  username: 'user',
  password: 'test',
  email: 'user@test.com'
}

const datascientist = {
  email: 'datascientistProfile-42@lajavaness.com',
  password: 'LJN123953862398',
  firstName: 'Tom',
  lastName: 'Bill',
}

const projectUser = {
  email: 'user@test.com',
  password: 'LJN402983492834',
  firstName: 'Jack',
  lastName: 'Smith',
}

const projectDatascientist = {
  email: 'data@test.com',
  password: 'LJN10293819283',
  firstName: 'Jean',
  lastName: 'Louis',
}

const projectAdmin = {
  email: 'admin@test.com',
  password: 'LJN13209238273',
  firstName: 'Pierre',
  lastName: 'Jacques',
}

module.exports = {
  admin,
  user,
  datascientist,
  projectUser,
  projectDatascientist,
  projectAdmin,
  adminOauth,
  userOauth,
  dataOauth
}
