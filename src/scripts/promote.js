const { prisma } = require('../config');
const { email } = require('../validation/user');

async function main() {
  const { error, value } = email.required().validate(process.argv[2]);
  if (error) throw new Error('Usage: npm run admin:promote -- email@example.com');
  const user = await prisma.user.update({ where: { email: value }, data: { role: 'ADMIN' }, select: { email: true } });
  console.log(user.email + ' is now ADMIN');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
