import { prisma } from './src/lib/db';
async function main() {
  const users = await prisma.adminUser.findMany();
  console.log(users);
}
main().finally(() => prisma.$disconnect());