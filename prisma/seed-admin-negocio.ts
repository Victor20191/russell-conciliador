// ============================================================
// Seed ADITIVO — concede al Administrador la gestión de la
// configuración de negocio (clientes y sus responsables).
//
// Solo INSERTA las concesiones faltantes para el rol Administrador
// (createMany skipDuplicates): no borra ni toca otros roles ni ajustes
// manuales de /config/permisos.
//
// Ejecutar:  npx tsx prisma/seed-admin-negocio.ts
// ============================================================

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const CODES = [
  "clientes:crear",
  "clientes:editar",
  "clientes:configurar",
];

async function main() {
  const admin = await prisma.role.findUnique({ where: { code: "Administrador" }, select: { id: true } });
  if (!admin) throw new Error("No existe el rol Administrador (¿corriste el seed RBAC?).");

  const permisos = await prisma.permission.findMany({
    where: { code: { in: CODES } },
    select: { id: true, code: true },
  });
  if (permisos.length !== CODES.length) {
    const faltan = CODES.filter((c) => !permisos.some((p) => p.code === c));
    throw new Error(`Faltan permisos en BD: ${faltan.join(", ")} (corre el seed RBAC).`);
  }

  const res = await prisma.rolePermission.createMany({
    data: permisos.map((p) => ({ roleId: admin.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  console.log(`✅ Administrador: ${CODES.length} permisos objetivo · ${res.count} nuevos concedidos (los ya existentes se respetaron).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
