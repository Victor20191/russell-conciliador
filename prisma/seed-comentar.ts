// ============================================================
// Seed ADITIVO — permisos "<modulo>:comentar".
//
// A diferencia de seed-rbac.ts (que BORRA y reconstruye la matriz,
// la jerarquía y las asignaciones demo), este script solo INSERTA los
// permisos de comentar y sus concesiones por rol. Es idempotente y NO
// toca ningún ajuste manual de /config/permisos ni la jerarquía o las
// asignaciones existentes.
//
// Ejecutar:  npx tsx prisma/seed-comentar.ts
// ============================================================

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PERMISOS, matrizConLegado } from "../src/lib/rbac/catalogo";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const comentar = PERMISOS.filter((p) => p.action === "comentar");
  console.log(`🌱 Sembrando ${comentar.length} permisos :comentar (aditivo)…`);

  // 1) Upsert de los permisos por code (no duplica).
  for (const p of comentar) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, action: p.action, label: p.label, description: p.description ?? null },
      create: { code: p.code, module: p.module, action: p.action, label: p.label, description: p.description ?? null },
    });
  }

  // 2) Concesiones por rol (PDF + legado heredado), SOLO para los códigos
  //    de comentar. createMany skipDuplicates respeta el UNIQUE y no pisa nada.
  const comentarCodes = new Set(comentar.map((p) => p.code));
  const matriz = matrizConLegado();

  const roles = await prisma.role.findMany({
    where: { code: { in: Object.keys(matriz) } },
    select: { id: true, code: true },
  });
  const permisos = await prisma.permission.findMany({
    where: { code: { in: [...comentarCodes] } },
    select: { id: true, code: true },
  });
  const roleId = new Map(roles.map((r) => [r.code, r.id]));
  const permId = new Map(permisos.map((p) => [p.code, p.id]));

  const filas = Object.entries(matriz).flatMap(([roleCode, codes]) =>
    codes
      .filter((c) => comentarCodes.has(c))
      .map((c) => ({ roleId: roleId.get(roleCode)!, permissionId: permId.get(c)! })),
  );
  const insertadas = await prisma.rolePermission.createMany({ data: filas, skipDuplicates: true });

  console.log(
    `✅ Listo: ${comentar.length} permisos asegurados · ${filas.length} concesiones objetivo · ` +
      `${insertadas.count} nuevas (las ya existentes se respetaron).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
