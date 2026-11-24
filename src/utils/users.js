const bcrypt = require('bcrypt');
const { prisma } = require('../config');

const publicUser = { id: true, email: true, name: true, role: true, createdAt: true };

async function createUser({ email, name, password }) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.create({ data: { email, name, passwordHash }, select: publicUser });
}

module.exports = { publicUser, createUser };
