const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const swagger = require('swagger-ui-express');
const { env, prisma } = require('./config');
const openapi = require('./config/swagger');
const { authenticate } = require('./middleware/auth');
const { HttpError, notFound, errorHandler } = require('./middleware/errorHandler');
const { createAuthRouter } = require('./routes/auth');
const posts = require('./routes/posts');
const users = require('./routes/users');

function createApp({ loginStore, redis } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY_HOPS) app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(helmet(env.NODE_ENV === 'production' ? {} : {
    contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } },
  }));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  app.get('/health', async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      if (redis) await redis.ping();
    } catch {
      throw new HttpError(503, 'A required service is unavailable');
    }
    res.json({ data: { status: 'ok', redis: redis ? 'up' : 'disabled' } });
  });
  app.get('/api/docs.json', (req, res) => res.json(openapi));
  app.use('/api/docs', swagger.serve, swagger.setup(openapi, { customSiteTitle: openapi.info.title }));

  app.use('/auth', createAuthRouter({ loginStore }));
  app.use('/api/users', authenticate, users.router);
  app.use('/admin/users', authenticate, users.adminRouter);
  app.use('/api/posts', authenticate, posts);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
