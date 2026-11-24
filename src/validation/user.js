const Joi = require('joi');

const email = Joi.string().trim().lowercase().email().max(254);
const name = Joi.string().trim().min(1).max(100);
const role = Joi.string().valid('USER', 'MODERATOR', 'ADMIN');
const password = Joi.string().min(8).custom((value, helpers) => (
  Buffer.byteLength(value, 'utf8') <= 72 ? value : helpers.error('any.invalid')
)).messages({ 'any.invalid': 'password must be at most 72 bytes' });

const signup = Joi.object({ email: email.required(), name: name.required(), password: password.required() });
const login = Joi.object({ email: email.required(), password: password.required() });
const updateUser = Joi.object({ email, name }).min(1);
const changeRole = Joi.object({ role: role.required() });

module.exports = { signup, login, updateUser, changeRole, email };
