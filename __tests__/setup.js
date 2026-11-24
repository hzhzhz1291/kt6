const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
require('dotenv').config();

const sourceUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!sourceUrl) throw new Error('Set TEST_DATABASE_URL or DATABASE_URL in .env before running tests');

const url = new URL(sourceUrl);
const schema = 'blog_test_' + randomUUID().replace(/-/g, '');
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = randomUUID() + randomUUID();
process.env.JWT_REFRESH_SECRET = randomUUID() + randomUUID();

const { prisma } = require('../src/config');

beforeAll(() => {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: process.env, stdio: 'pipe', timeout: 25000,
  });
}, 30000);

afterAll(async () => {
  try {
    // This name is created above using a fixed prefix and a UUID.
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
  } finally {
    await prisma.$disconnect();
  }
});

module.exports = { prisma };
