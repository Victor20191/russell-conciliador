import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import catalogo from "./data/subgrupos-russell.json";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const codes = new Set<string>();
  for (const s of catalogo.subgrupos) {
    if (codes.has(s.codigo)) throw new Error(`Subgrupo duplicado: ${s.codigo}`);
    codes.add(s.codigo);
  }

  await prisma.$transaction([
    prisma.subgrupoEstandar.deleteMany(),
    prisma.subgrupoEstandar.createMany({ data: catalogo.subgrupos }),
  ]);

  console.log(`Subgrupos estándar cargados: ${catalogo.subgrupos.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
