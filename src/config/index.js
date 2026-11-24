require('dotenv').config();

const Joi = require('joi');
const { PrismaClient } = require('@prisma/client');

const schema = Joi.object({
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).invalid(Joi.ref('JWT_ACCESS_SECRET')).required(),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(5).default(0),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }),
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
}).unknown(true);

const { error, value } = schema.validate(process.env);
if (error) throw new Error('Invalid environment: ' + error.message);

module.exports = { env: value, prisma: new PrismaClient() };
