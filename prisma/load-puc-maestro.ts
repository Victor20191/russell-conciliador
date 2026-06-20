import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pucMaster from "./data/puc-maestro-russell.json";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const codes = new Set<string>();
  for (const account of pucMaster.accounts) {
    if (codes.has(account.code)) throw new Error(`Cuenta duplicada en maestro: ${account.code}`);
    codes.add(account.code);
  }

  await prisma.$transaction([
    prisma.standardAccount.deleteMany(),
    prisma.standardAccount.createMany({ data: pucMaster.accounts }),
  ]);

  console.log(`PUC maestro cargado: ${pucMaster.accounts.length} cuentas desde ${pucMaster.source}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
