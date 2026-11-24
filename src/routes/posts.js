const { Router } = require('express');
const Joi = require('joi');
const { prisma } = require('../config');
const { validate, id, idParams, pageFields } = require('../middleware/validate');
const { HttpError } = require('../middleware/errorHandler');
const { paginate } = require('../utils/pagination');

const router = Router();
const postFields = {
  title: Joi.string().trim().min(1).max(200),
  content: Joi.string().max(8000).allow('', null),
  published: Joi.boolean().strict(),
  authorId: id.strict(),
  tags: Joi.array().items(Joi.string().trim().min(1).max(50)).max(20),
};
const { authorId: postAuthorId, ...editableFields } = postFields;
const listQuery = Joi.object({
  ...pageFields,
  search: Joi.string().trim().min(1).max(200),
  published: Joi.boolean(),
  authorId: id,
});
const postRelations = {
  author: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
  tags: { orderBy: { name: 'asc' } },
};

function postData(input, replaceTags = false) {
  const { tags, ...data } = input;
  if (tags !== undefined) {
    data.tags = {
      ...(replaceTags ? { set: [] } : {}),
      connectOrCreate: [...new Set(tags)].sort().map((name) => ({
        where: { name },
        create: { name },
      })),
    };
  }
  return data;
}

async function savePost(operation) {
  // Two requests can try to create the same tag before either insert commits.
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (error.code !== 'P2002' || attempt >= 3) throw error;
    }
  }
}

router.get('/', validate(listQuery, 'query'), async (req, res) => {
  const { search, published, authorId } = res.locals.query;
  const where = { published, authorId };
  if (search !== undefined) {
    where.title = { contains: search.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' };
  }
  res.json(await paginate(prisma, prisma.post, res.locals.query, {
    where,
    include: postRelations,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  }));
});

router.get('/:id', validate(idParams, 'params'), async (req, res) => {
  const post = await prisma.post.findUnique({ where: res.locals.params, include: postRelations });
  if (!post) throw new HttpError(404, 'Post not found');
  res.json({ data: post });
});

async function editablePost(req, res, next) {
  const post = await prisma.post.findUnique({ where: res.locals.params, select: { authorId: true } });
  if (!post) throw new HttpError(404, 'Post not found');
  if (req.user.role === 'USER' && req.user.id !== post.authorId) throw new HttpError(403, 'Access denied');
  res.locals.editWhere = req.user.role === 'USER'
    ? { ...res.locals.params, authorId: req.user.id } : res.locals.params;
  next();
}

router.post('/', validate(Joi.object({
  ...postFields,
  title: postFields.title.required(),
  authorId: postAuthorId.optional(),
})), async (req, res) => {
  const { authorId, ...body } = res.locals.body;
  if (authorId !== undefined && authorId !== req.user.id) throw new HttpError(403, 'Use your own authorId');
  const data = postData({ ...body, authorId: req.user.id });
  const post = await savePost(() => prisma.post.create({ data, include: postRelations }));
  res.location('/api/posts/' + post.id).status(201).json({ data: post });
});

router.patch('/:id', validate(idParams, 'params'), editablePost, validate(Joi.object(editableFields).min(1)), async (req, res) => {
  const data = postData(res.locals.body, true);
  const post = await savePost(() => prisma.post.update({ where: res.locals.editWhere, data, include: postRelations }));
  res.json({ data: post });
});

router.delete('/:id', validate(idParams, 'params'), editablePost, async (req, res) => {
  await prisma.post.delete({ where: res.locals.editWhere });
  res.sendStatus(204);
});

module.exports = router;
