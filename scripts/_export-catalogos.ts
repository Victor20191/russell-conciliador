import "dotenv/config";
import prisma from "../src/lib/prisma";

async function main() {
  const [usuarios, aristas, modules, dianForms, clients] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, active: true, cedula: true, cargo: true },
    }),
    prisma.userHierarchy.findMany({ select: { superiorId: true, subordinateId: true } }),
    prisma.module.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.dianForm.findMany({ orderBy: { code: "asc" }, select: { id: true, key: true, code: true, name: true } }),
    prisma.client.findMany({ select: { erp: true, sector: true } }),
  ]);

  const erps = [...new Set(clients.map((c) => c.erp).filter(Boolean))].sort();
  const sectors = [...new Set(clients.map((c) => c.sector).filter(Boolean))].sort();

  console.log(
    JSON.stringify({ usuarios, aristas, modules, dianForms, erps, sectors }, null, 2),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERROR_EXPORT", e?.message ?? e);
    process.exit(1);
  });
