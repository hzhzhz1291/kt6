async function paginate(prisma, model, query, options) {
  const { page, limit } = query;
  const { where } = options;
  const [total, data] = await prisma.$transaction([
    model.count({ where }),
    model.findMany({ ...options, skip: (page - 1) * limit, take: limit }),
  ], { isolationLevel: 'RepeatableRead' });
  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}

module.exports = { paginate };
