const { Router } = require('express');
const Joi = require('joi');
const { prisma } = require('../config');
const { validate, idParams, pageFields } = require('../middleware/validate');
const { allowRoles, allowSelfOr } = require('../middleware/rbac');
const { HttpError } = require('../middleware/errorHandler');
const { paginate } = require('../utils/pagination');
const { createUser, publicUser } = require('../utils/users');
const { signup, updateUser, changeRole } = require('../validation/user');

const router = Router();
const adminRouter = Router();

router.get('/', allowRoles('MODERATOR', 'ADMIN'), validate(Joi.object(pageFields), 'query'), async (req, res) => {
  res.json(await paginate(prisma, prisma.user, res.locals.query, { select: publicUser, orderBy: { id: 'asc' } }));
});

router.get('/:id', validate(idParams, 'params'), allowSelfOr('MODERATOR', 'ADMIN'), async (req, res) => {
  const user = await prisma.user.findUnique({
    where: res.locals.params,
    select: { ...publicUser, posts: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] } },
  });
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ data: user });
});

router.post('/', allowRoles('ADMIN'), validate(signup), async (req, res) => {
  const user = await createUser(res.locals.body);
  res.location('/api/users/' + user.id).status(201).json({ data: user });
});

router.patch('/:id', validate(idParams, 'params'), allowSelfOr('ADMIN'), validate(updateUser), async (req, res) => {
  const user = await prisma.user.update({ where: res.locals.params, data: res.locals.body, select: publicUser });
  res.json({ data: user });
});

router.delete('/:id', allowRoles('ADMIN'), validate(idParams, 'params'), async (req, res) => {
  await prisma.user.delete({ where: res.locals.params });
  res.sendStatus(204);
});

adminRouter.patch('/:id/role', allowRoles('ADMIN'), validate(idParams, 'params'), validate(changeRole), async (req, res) => {
  const user = await prisma.user.update({ where: res.locals.params, data: res.locals.body, select: publicUser });
  res.json({ data: user });
});

module.exports = { router, adminRouter };
