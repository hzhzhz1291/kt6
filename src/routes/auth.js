const { randomBytes, randomUUID } = require('node:crypto');
const { Router } = require('express');
const bcrypt = require('bcrypt');
const { rateLimit } = require('express-rate-limit');
const { env, prisma } = require('../config');
const { authenticate } = require('../middleware/auth');
const { HttpError } = require('../middleware/errorHandler');
const { validate } = require('../middleware/validate');
const { signup, login } = require('../validation/user');
const { createUser } = require('../utils/users');
const { ACCESS_TTL, REFRESH_TTL, issueAccess, issueRefresh, verifyRefresh, tokenHash } = require('../utils/jwt');

const refreshCookie = 'refreshToken';
const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'strict', path: '/auth' };
const dummyPasswordHash = bcrypt.hashSync(randomBytes(24).toString('hex'), 12);

function loginResponse(res, userId, refreshToken) {
  res.cookie(refreshCookie, refreshToken, { ...cookieOptions, maxAge: REFRESH_TTL * 1000 });
  res.json({ data: { accessToken: issueAccess(userId), tokenType: 'Bearer', expiresIn: ACCESS_TTL } });
}

function createAuthRouter({ loginStore } = {}) {
  const router = Router();
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(loginStore ? { store: loginStore } : {}),
    handler: (req, res, next) => next(new HttpError(429, 'Too many login requests')),
  });

  router.post('/register', validate(signup), async (req, res) => {
    const user = await createUser(res.locals.body);
    res.status(201).json({ data: user });
  });

  router.post('/login', loginLimit, validate(login), async (req, res) => {
    const { email, password } = res.locals.body;
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
    const ok = await bcrypt.compare(password, user?.passwordHash || dummyPasswordHash);
    if (!ok || !user?.passwordHash) throw new HttpError(401, 'Invalid email or password');

    const sessionId = randomUUID();
    const refresh = issueRefresh(user.id, sessionId);
    await prisma.$transaction([
      prisma.refreshSession.deleteMany({ where: { userId: user.id, expiresAt: { lte: new Date() } } }),
      prisma.refreshSession.create({
        data: { id: sessionId, userId: user.id, tokenHash: tokenHash(refresh), expiresAt: new Date(Date.now() + REFRESH_TTL * 1000) },
      }),
    ]);
    loginResponse(res, user.id, refresh);
  });

  router.post('/refresh', async (req, res) => {
    const token = req.cookies[refreshCookie];
    let payload;
    try {
      payload = verifyRefresh(token);
    } catch {
      throw new HttpError(401, 'Invalid or expired refresh token');
    }
    const now = new Date();
    const replacement = issueRefresh(payload.userId, payload.sessionId);
    const saved = await prisma.refreshSession.updateMany({
      where: { id: payload.sessionId, userId: payload.userId, tokenHash: tokenHash(token), expiresAt: { gt: now } },
      data: { tokenHash: tokenHash(replacement), expiresAt: new Date(now.getTime() + REFRESH_TTL * 1000) },
    });
    if (saved.count !== 1) throw new HttpError(401, 'Refresh session expired or already used');
    loginResponse(res, payload.userId, replacement);
  });

  router.post('/logout', async (req, res) => {
    const token = req.cookies[refreshCookie];
    if (typeof token === 'string') {
      await prisma.refreshSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
    }
    res.clearCookie(refreshCookie, cookieOptions);
    res.sendStatus(204);
  });

  router.get('/me', authenticate, (req, res) => res.json({ data: req.user }));
  return router;
}

module.exports = { createAuthRouter };
