const { prisma } = require('./setup');
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');

const password = 'Test-pass-123';
let api;
let counter = 0;

beforeEach(() => {
  api = request(createApp());
});

async function register() {
  const body = { email: 'user' + (++counter) + '@example.com', name: 'Student', password };
  const response = await api.post('/auth/register').send(body);
  expect(response.status).toBe(201);
  return { ...response.body.data, password };
}

async function login(user) {
  const response = await api.post('/auth/login').send({ email: user.email, password });
  expect(response.status).toBe(200);
  return response;
}

async function asUser(user) {
  return 'Bearer ' + (await login(user)).body.data.accessToken;
}

async function createPost(auth, body = {}) {
  const response = await api.post('/api/posts').set('Authorization', auth).send({ title: 'A post', ...body });
  expect(response.status).toBe(201);
  return response.body.data;
}

function cookie(response) {
  return response.headers['set-cookie'][0].split(';')[0];
}

test('registers a user and stores a bcrypt hash', async () => {
  const user = await register();
  const stored = await prisma.user.findUnique({ where: { id: user.id } });
  expect(await bcrypt.compare(password, stored.passwordHash)).toBe(true);
  expect(user.passwordHash).toBeUndefined();
  expect(user.role).toBe('USER');
});

test('rejects duplicate email', async () => {
  const user = await register();
  await api.post('/auth/register').send({ email: user.email, name: 'Other', password }).expect(409);
});

test('logs in with an access token and an HttpOnly refresh cookie', async () => {
  const result = await login(await register());
  expect(result.body.data.accessToken).toEqual(expect.any(String));
  expect(result.headers['set-cookie'][0]).toMatch(/refreshToken=.+HttpOnly/);
  expect(result.body.data.refreshToken).toBeUndefined();
});

test('rejects the wrong password', async () => {
  const { email } = await register();
  await api.post('/auth/login').send({ email, password: 'wrong-pass' }).expect(401);
});

test('returns the current user with a token', async () => {
  const user = await register();
  const result = await api.get('/auth/me').set('Authorization', await asUser(user)).expect(200);
  expect(result.body.data.id).toBe(user.id);
});

test('rejects a protected request without a token', async () => {
  await api.get('/auth/me').expect(401);
});

test('the owner can delete a post', async () => {
  const auth = await asUser(await register());
  const post = await createPost(auth);
  await api.delete('/api/posts/' + post.id).set('Authorization', auth).expect(204);
  await api.get('/api/posts/' + post.id).set('Authorization', auth).expect(404);
});

test('a different USER cannot delete the post', async () => {
  const owner = await asUser(await register());
  const other = await asUser(await register());
  const post = await createPost(owner);
  await api.delete('/api/posts/' + post.id).set('Authorization', other).expect(403);
});

test('moderator can edit a post from another user and list users', async () => {
  const owner = await asUser(await register());
  const moderator = await register();
  const auth = await asUser(moderator);
  await prisma.user.update({ where: { id: moderator.id }, data: { role: 'MODERATOR' } });
  const post = await createPost(owner);
  const result = await api.patch('/api/posts/' + post.id).set('Authorization', auth).send({ title: 'Updated' }).expect(200);
  expect(result.body.data.title).toBe('Updated');
  await api.get('/api/users').set('Authorization', auth).expect(200);
  await api.get('/api/users').set('Authorization', owner).expect(403);
});

test('only the administrator can change roles', async () => {
  const admin = await register();
  const user = await register();
  const adminAuth = await asUser(admin);
  const userAuth = await asUser(user);
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  await api.patch('/admin/users/' + user.id + '/role').set('Authorization', userAuth).send({ role: 'ADMIN' }).expect(403);
  const result = await api.patch('/admin/users/' + user.id + '/role')
    .set('Authorization', adminAuth).send({ role: 'MODERATOR' }).expect(200);
  expect(result.body.data.role).toBe('MODERATOR');
});

test('filters and paginates posts and reuses an existing tag', async () => {
  const user = await register();
  const auth = await asUser(user);
  await createPost(auth, { title: 'Prisma Basics', published: true, tags: ['orm'] });
  await createPost(auth, { title: 'prisma DRAFT', published: false, tags: ['orm', 'orm'] });
  await createPost(auth, { title: 'Another PRISMA post', published: true, tags: ['orm'] });
  const result = await api.get('/api/posts').query({ search: 'PRISMA', published: true, authorId: user.id, page: 2, limit: 1 })
    .set('Authorization', auth).expect(200);
  expect(result.body.meta).toEqual({ total: 2, pages: 2, page: 2, limit: 1 });
  expect(result.body.data[0].title).toBe('Prisma Basics');
  expect(await prisma.tag.count({ where: { name: 'orm' } })).toBe(1);
});

test('rotates refresh tokens and revokes the session on logout', async () => {
  const first = cookie(await login(await register()));
  const refreshed = await api.post('/auth/refresh').set('Cookie', first).expect(200);
  const second = cookie(refreshed);
  expect(second).not.toBe(first);
  await api.post('/auth/refresh').set('Cookie', first).expect(401);
  const logout = await api.post('/auth/logout').set('Cookie', second).expect(204);
  expect(cookie(logout)).toBe('refreshToken=');
  await api.post('/auth/refresh').set('Cookie', second).expect(401);
});

test('applies Helmet, the 10kb limit and the login rate limit', async () => {
  const base = await api.get('/auth/me').expect(401);
  expect(base.headers['x-content-type-options']).toBe('nosniff');
  expect(base.headers['x-frame-options']).toBe('SAMEORIGIN');
  await api.post('/auth/register').send({ payload: 'a'.repeat(10300) }).expect(413);
  for (let i = 0; i < 10; i += 1) await api.post('/auth/login').send({}).expect(400);
  await api.post('/auth/login').send({}).expect(429);
});

test('publishes health and Swagger with the HTTP routes and model schemas', async () => {
  const health = await api.get('/health').expect(200);
  expect(health.body.data.status).toBe('ok');
  const docs = await api.get('/api/docs/').expect(200);
  expect(docs.text).toContain('<title>кт6</title>');
  const result = await api.get('/api/docs.json').expect(200);
  expect(result.body.openapi).toBe('3.0.3');
  expect(Object.keys(result.body.paths)).toHaveLength(13);
  expect(result.body.paths['/api/posts'].get.parameters.map(({ name }) => name))
    .toEqual(['page', 'limit', 'search', 'published', 'authorId']);
  expect(result.body.components.schemas).toHaveProperty('Post');
  expect(result.body.components.schemas).toHaveProperty('Tag');
});
