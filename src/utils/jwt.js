const { createHash, randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { env } = require('../config');

const ACCESS_TTL = 15 * 60;
const REFRESH_TTL = 7 * 24 * 60 * 60;
const issuer = 'blog-api';

function sign(userId, secret, audience, ttl, sessionId) {
  return jwt.sign(sessionId ? { sessionId } : {}, secret, {
    algorithm: 'HS256', issuer, audience, subject: String(userId), expiresIn: ttl, jwtid: randomUUID(),
  });
}

function issueAccess(userId) {
  return sign(userId, env.JWT_ACCESS_SECRET, 'blog-access', ACCESS_TTL);
}

function issueRefresh(userId, sessionId) {
  return sign(userId, env.JWT_REFRESH_SECRET, 'blog-refresh', REFRESH_TTL, sessionId);
}

function verify(token, secret, audience) {
  const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience });
  if (!/^[1-9][0-9]*$/.test(payload.sub) || Number(payload.sub) > 2147483647) {
    throw new Error('Invalid token subject');
  }
  return { ...payload, userId: Number(payload.sub) };
}

function verifyAccess(token) {
  return verify(token, env.JWT_ACCESS_SECRET, 'blog-access');
}

function verifyRefresh(token) {
  const payload = verify(token, env.JWT_REFRESH_SECRET, 'blog-refresh');
  if (typeof payload.sessionId !== 'string' || !payload.sessionId) throw new Error('Invalid session');
  return payload;
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

module.exports = { ACCESS_TTL, REFRESH_TTL, issueAccess, issueRefresh, verifyAccess, verifyRefresh, tokenHash };
