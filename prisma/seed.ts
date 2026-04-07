import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.settings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      followers: 0,
      totalPosts: 0,
      likesAndSaves: 0,
      launchDate: new Date("2025-06-15T00:00:00.000Z"),
    },
    update: {},
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void prisma.$disconnect();
    process.exit(1);
  });
