import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encrypt } from "./src/lib/jwt";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const user = await prisma.user.findUnique({
  where: { email: "admin@xentria.co" },
  select: { id: true, role: true, sessionVersion: true },
});
if (!user) throw new Error("no user");

const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
const session = await encrypt({
  userId: user.id,
  role: user.role,
  sessionVersion: user.sessionVersion,
  expiresAt: expiresAt.toISOString(),
});
await writeFile("/tmp/russell-session.txt", session, "utf8");
await prisma.$disconnect();
