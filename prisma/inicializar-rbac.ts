// Inicialización aditiva del catálogo mínimo RBAC para una base nueva.
// No representa una copia de la configuración vigente de otra instalación.
// Conserva roles, permisos y concesiones existentes; agrega los faltantes del
// catálogo. No crea usuarios, jerarquías ni responsables por cliente.
//
// Uso: npm run db:inicializar:rbac

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ROLES, PERMISOS, matrizConLegado } from "../src/lib/rbac/catalogo";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Inicializando catálogo mínimo RBAC para una base nueva (aditivo)…");
  console.log("Este catálogo no es una copia de la configuración vigente de producción.");

  // skipDuplicates conserva también los nombres y las ediciones de cada fila
  // existente, además de cualquier rol o permiso ajeno al catálogo de fábrica.
  const rolesCreados = await prisma.role.createMany({
    data: ROLES.map((r) => ({
      code: r.code, name: r.name, description: r.description,
      rank: r.rank, isOperative: r.isOperative, isSystem: r.isSystem,
    })),
    skipDuplicates: true,
  });
  const permisosCreados = await prisma.permission.createMany({
    data: PERMISOS.map((p) => ({
      code: p.code, module: p.module, action: p.action,
      label: p.label, description: p.description ?? null,
    })),
    skipDuplicates: true,
  });

  const matriz = matrizConLegado();
  const [roles, permisos] = await Promise.all([
    prisma.role.findMany({
      where: { code: { in: Object.keys(matriz) } },
      select: { id: true, code: true },
    }),
    prisma.permission.findMany({
      where: { code: { in: PERMISOS.map((permiso) => permiso.code) } },
      select: { id: true, code: true },
    }),
  ]);
  const roleIdByCode = new Map(roles.map((role) => [role.code, role.id]));
  const permissionIdByCode = new Map(permisos.map((permission) => [permission.code, permission.id]));
  const filas = Object.entries(matriz).flatMap(([roleCode, codes]) =>
    codes.map((permissionCode) => {
      const roleId = roleIdByCode.get(roleCode);
      const permissionId = permissionIdByCode.get(permissionCode);
      if (!roleId || !permissionId) {
        throw new Error(`No fue posible resolver ${roleCode} → ${permissionCode}.`);
      }
      return { roleId, permissionId };
    }),
  );
  const concesionesCreadas = await prisma.rolePermission.createMany({
    data: filas,
    skipDuplicates: true,
  });

  console.log(
    `RBAC inicializado: ${rolesCreados.count} roles, ${permisosCreados.count} permisos ` +
      `y ${concesionesCreadas.count} concesiones agregados.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
