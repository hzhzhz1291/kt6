const ref = (name) => ({ $ref: '#/components/schemas/' + name });
const id = { type: 'integer', minimum: 1, example: 1 };
const isoDate = { type: 'string', format: 'date-time' };
const email = { type: 'string', format: 'email', maxLength: 254, example: 'student@example.com' };
const name = { type: 'string', minLength: 1, maxLength: 100, example: 'Student' };
const role = { type: 'string', enum: ['USER', 'MODERATOR', 'ADMIN'] };
const password = { type: 'string', format: 'password', minLength: 8, description: 'Maximum 72 UTF-8 bytes' };
const list = (items) => ({ type: 'array', items });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required });
const data = (schema) => object({ data: schema });
const paginated = (schema) => object({ data: list(schema), meta: ref('Meta') });
const json = (schema) => ({ 'application/json': { schema } });
const response = (description, schema) => ({ description, ...(schema ? { content: json(schema) } : {}) });
const requestBody = (name) => ({ required: true, content: json(ref(name)) });
const failures = (statuses) => Object.fromEntries(statuses.map((status) => [
  status, { $ref: '#/components/responses/Error' + status },
]));
const bearer = [{ bearerAuth: [] }];
const refresh = [{ refreshCookie: [] }];
const pathId = [{ in: 'path', name: 'id', required: true, schema: id }];
const query = (name, description, schema) => ({ in: 'query', name, description, schema });
const pagination = [
  query('page', 'Page number, starting at one', { ...id, maximum: 1000000, default: 1 }),
  query('limit', 'Items per page', { ...id, maximum: 100, default: 10 }),
];
const postInput = {
  title: { type: 'string', minLength: 1, maxLength: 200, example: 'Learning Prisma' },
  content: { type: 'string', nullable: true, maxLength: 8000 },
  published: { type: 'boolean', default: false },
  tags: { ...list({ type: 'string', minLength: 1, maxLength: 50 }), maxItems: 20, example: ['node', 'prisma'] },
};
const tokenResponse = response('New access token and refresh cookie', data(ref('AccessToken')));
tokenResponse.headers = {
  'Set-Cookie': { description: 'Rotating HttpOnly refreshToken cookie', schema: { type: 'string' } },
};

function operation(tag, summary, status, success, { security = bearer, params, body, description, errors = [500] } = {}) {
  return {
    tags: [tag], summary, security,
    ...(description ? { description } : {}),
    ...(params ? { parameters: params } : {}),
    ...(body ? { requestBody: requestBody(body) } : {}),
    responses: { [status]: success, ...failures(errors) },
  };
}

const doc = {
  openapi: '3.0.3',
  info: { title: 'Blog Platform API', version: '1.0.0', description: 'REST API for users, posts and tags.' },
  servers: [{ url: '/' }],
  paths: {
    '/health': {
      get: operation('System', 'Check PostgreSQL and Redis', 200, response('Application is ready', data(ref('Health'))),
        { security: [], errors: [503] }),
    },
    '/api/docs': {
      get: operation('System', 'Open Swagger UI', 200, { description: 'Swagger UI page', content: { 'text/html': { schema: { type: 'string' } } } },
        { security: [], errors: [] }),
    },
    '/api/docs.json': {
      get: operation('System', 'Read the OpenAPI document', 200, response('OpenAPI JSON', { type: 'object' }),
        { security: [], errors: [] }),
    },
    '/auth/register': {
      post: operation('Auth', 'Register a USER', 201, response('Account created', data(ref('User'))),
        { security: [], body: 'Register', errors: [400, 409, 413, 500] }),
    },
    '/auth/login': {
      post: operation('Auth', 'Log in', 200, tokenResponse,
        { security: [], body: 'Login', errors: [400, 401, 413, 429, 500] }),
    },
    '/auth/refresh': {
      post: operation('Auth', 'Rotate the refresh token', 200, tokenResponse,
        { security: refresh, errors: [401, 500] }),
    },
    '/auth/logout': {
      post: operation('Auth', 'Revoke the session and clear the cookie', 204, response('Logged out'),
        { security: [], errors: [500] }),
    },
    '/auth/me': {
      get: operation('Auth', 'Read the current user', 200, response('Current user', data(ref('User'))),
        { errors: [401, 500] }),
    },
    '/api/users': {
      get: operation('Users', 'List users', 200, response('Users page', paginated(ref('User'))),
        { params: pagination, description: 'MODERATOR or ADMIN.', errors: [400, 401, 403, 500] }),
      post: operation('Users', 'Create a user as an administrator', 201, response('New user', data(ref('User'))),
        { body: 'Register', description: 'ADMIN. Creates a USER account.', errors: [400, 401, 403, 409, 413, 500] }),
    },
    '/api/users/{id}': {
      get: operation('Users', 'Get a user with their posts', 200, response('User and posts', data(ref('UserWithPosts'))),
        { params: pathId, description: 'The same user, MODERATOR or ADMIN. Newest post first.', errors: [400, 401, 403, 404, 500] }),
      patch: operation('Users', 'Edit a user profile', 200, response('Updated user', data(ref('User'))),
        { params: pathId, body: 'UpdateUser', description: 'The same user or ADMIN.', errors: [400, 401, 403, 404, 409, 413, 500] }),
      delete: operation('Users', 'Delete a user', 204, response('User and dependent records deleted'),
        { params: pathId, description: 'ADMIN. Also deletes the user’s posts and refresh sessions.', errors: [400, 401, 403, 404, 500] }),
    },
    '/admin/users/{id}/role': {
      patch: operation('Users', 'Change a user role', 200, response('Updated user', data(ref('User'))),
        { params: pathId, body: 'ChangeRole', description: 'ADMIN only.', errors: [400, 401, 403, 404, 413, 500] }),
    },
    '/api/posts': {
      get: operation('Posts', 'List posts', 200, response('Posts page', paginated(ref('Post'))),
        { params: [...pagination,
            query('search', 'Title substring, case-insensitive', { type: 'string', maxLength: 200 }),
            query('published', 'Publication status', { type: 'boolean' }),
            query('authorId', 'Author ID', id)], errors: [400, 401, 500] }),
      post: operation('Posts', 'Create a post', 201, response('New post', data(ref('Post'))),
        { body: 'CreatePost', description: 'The current user is the author. Tag names are reused or created.', errors: [400, 401, 403, 409, 413, 500] }),
    },
    '/api/posts/{id}': {
      get: operation('Posts', 'Get a post with author and tags', 200, response('Post', data(ref('Post'))),
        { params: pathId, errors: [400, 401, 404, 500] }),
      patch: operation('Posts', 'Edit a post', 200, response('Updated post', data(ref('Post'))),
        { params: pathId, body: 'UpdatePost', description: 'Owner, MODERATOR or ADMIN. A supplied tags array replaces the current tags.', errors: [400, 401, 403, 404, 409, 413, 500] }),
      delete: operation('Posts', 'Delete a post', 204, response('Post deleted'),
        { params: pathId, description: 'Owner, MODERATOR or ADMIN.', errors: [400, 401, 403, 404, 500] }),
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      refreshCookie: { type: 'apiKey', in: 'cookie', name: 'refreshToken' },
    },
    schemas: {
      User: object({ id, email, name, role, createdAt: isoDate }),
      Tag: object({ id, name: { type: 'string' } }),
      PostSummary: object({ id, title: postInput.title, content: postInput.content, published: postInput.published, createdAt: isoDate, authorId: id }),
      Post: { allOf: [ref('PostSummary'), object({ author: ref('User'), tags: list(ref('Tag')) })] },
      UserWithPosts: { allOf: [ref('User'), object({ posts: list(ref('PostSummary')) })] },
      Meta: object({ total: { type: 'integer', minimum: 0 }, page: id, limit: id, pages: { type: 'integer', minimum: 0 } }),
      Register: object({ email, name, password }),
      Login: object({ email, password }),
      AccessToken: object({ accessToken: { type: 'string' }, tokenType: { type: 'string', enum: ['Bearer'] }, expiresIn: { type: 'integer', example: 900 } }),
      UpdateUser: { ...object({ email, name }, []), minProperties: 1 },
      ChangeRole: object({ role }),
      CreatePost: object({ ...postInput, authorId: id }, ['title']),
      UpdatePost: { ...object(postInput, []), minProperties: 1 },
      Health: object({ status: { type: 'string', enum: ['ok'] }, redis: { type: 'string', enum: ['up', 'disabled'] } }),
      Error: object({ error: object({ message: { type: 'string' }, details: list({ type: 'string' }) }, ['message']) }),
    },
    responses: Object.fromEntries([
      [400, 'Invalid input'], [401, 'Authentication required'], [403, 'Access denied'], [404, 'Not found'],
      [409, 'Conflict'], [413, 'Request body too large'], [429, 'Too many login requests'],
      [500, 'Internal error'], [503, 'Database or Redis is unavailable'],
    ].map(([status, description]) => ['Error' + status, response(description, ref('Error'))])),
  },
};

module.exports = doc;
