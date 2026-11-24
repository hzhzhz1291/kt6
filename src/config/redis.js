const { createClient } = require('redis');
const { RedisStore } = require('rate-limit-redis');
const { env } = require('./index');

async function connectRedis() {
  if (!env.REDIS_URL) return {};
  const redis = createClient({
    url: env.REDIS_URL,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) => retries < 5 ? Math.min(250 * 2 ** retries, 2000) : false,
    },
  });
  redis.on('error', (error) => console.error('Redis:', error.name));
  await redis.connect();
  const loginStore = new RedisStore({
    prefix: 'blog:login:',
    sendCommand: (...args) => redis.sendCommand(args),
  });
  return { redis, loginStore };
}

module.exports = { connectRedis };
