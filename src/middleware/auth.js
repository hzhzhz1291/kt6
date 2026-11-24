const { prisma } = require('../config');
const { HttpError } = require('./errorHandler');
const { verifyAccess } = require('../utils/jwt');
const { publicUser } = require('../utils/users');

async function readAccessUser(token) {
  let payload;
  try {
    payload = verifyAccess(token);
  } catch {
    throw new HttpError(401, 'Invalid or expired access token');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: publicUser });
  if (!user) throw new HttpError(401, 'User no longer exists');
  return { user, expiresAt: payload.exp * 1000 };
}

async function authenticate(req, res, next) {
  const match = /^Bearer (\S+)$/i.exec(req.get('Authorization') || '');
  if (!match) throw new HttpError(401, 'Bearer access token required');
  const { user } = await readAccessUser(match[1]);
  req.user = user;
  next();
}

module.exports = { authenticate, readAccessUser };
