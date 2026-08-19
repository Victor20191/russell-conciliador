import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const users = await prisma.user.findMany({
  select: {
    email: true,
    role: true,
    active: true,
    blockedUntil: true,
    failedLoginAttempts: true,
  },
});
console.log(JSON.stringify(users, null, 2));
await prisma.$disconnect();
