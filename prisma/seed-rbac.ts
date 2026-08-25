// ============================================================
// Seed RBAC — Roles, permisos, matriz rol×permiso y datos de prueba
// (jerarquía organizacional + responsables por cliente) para validar
// la autorización.
//
// SEPARADO del seed principal (prisma/seed.ts) a propósito:
//   - No toca ni borra los datos del seed principal.
//   - Es idempotente (upsert + limpieza scoped de tablas RBAC).
//   - Requiere que las tablas RBAC existan: ejecutar DESPUÉS de migrar.
//
// Ejecutar:  npm run db:seed:rbac
//
// Fuente única de roles/permisos/escenario: src/lib/rbac/*  (la misma
// que validan las pruebas, así el seed y los tests no divergen).
// ============================================================

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ROLES, PERMISOS, matrizConLegado } from "../src/lib/rbac/catalogo";
import {
  DEMO_USUARIOS,
  DEMO_JERARQUIA,
  asignacionesDemo,
} from "../src/lib/rbac/escenario-demo";
import { exigirBaseDesechable } from "./guardia-destructiva";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Borra TODAS las asignaciones de responsables y la jerarquía: solo en base desechable.
  // Para reconciliar la matriz sin destruir nada, usar `npm run db:sync:rbac`.
  await exigirBaseDesechable(prisma, "db:seed:rbac");

  console.log("🌱 Seed RBAC (roles, permisos, jerarquía y responsables de prueba)…");

  // 1) Limpieza idempotente de las tablas RBAC (no toca usuarios/clientes).
  await prisma.clientAssignment.deleteMany();
  await prisma.userHierarchy.deleteMany();
  await prisma.rolePermission.deleteMany();

  // 2) Catálogo de ROLES (upsert por code: conserva ediciones del Administrador).
  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description, rank: r.rank, isOperative: r.isOperative, isSystem: r.isSystem },
      create: { code: r.code, name: r.name, description: r.description, rank: r.rank, isOperative: r.isOperative, isSystem: r.isSystem },
    });
  }

  // 3) Catálogo de PERMISOS (upsert por code).
  for (const p of PERMISOS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, action: p.action, label: p.label, description: p.description ?? null },
      create: { code: p.code, module: p.module, action: p.action, label: p.label, description: p.description ?? null },
    });
  }

  // 4) MATRIZ rol×permiso COMPLETA: los 5 roles del PDF + los roles legado,
  //    que heredan los permisos de su rol del PDF según MAPEO_LEGADO_PDF
  //    (Auditor≈Staff, Líder≈Senior, Administrador identidad, Consulta=lectura).
  //    Así ningún rol queda sin permisos y no hay que reescribir usuarios.rol.
  const matriz = matrizConLegado();
  const roles = await prisma.role.findMany({
    where: { code: { in: Object.keys(matriz) } },
    select: { id: true, code: true },
  });
  const permisos = await prisma.permission.findMany({
    where: { code: { in: PERMISOS.map((permiso) => permiso.code) } },
    select: { id: true, code: true },
  });
  const roleIdByCode = new Map(roles.map((role) => [role.code, role.id]));
  const permissionIdByCode = new Map(
    permisos.map((permission) => [permission.code, permission.id]),
  );
  const filas = Object.entries(matriz).flatMap(([roleCode, codes]) =>
    codes.map((permissionCode) => ({
      roleId: roleIdByCode.get(roleCode)!,
      permissionId: permissionIdByCode.get(permissionCode)!,
    })),
  );
  if (filas.some((fila) => !fila.roleId || !fila.permissionId)) {
    throw new Error("No fue posible resolver todos los roles y permisos a IDs numéricos.");
  }
  await prisma.rolePermission.createMany({ data: filas });

  // 5) Usuarios de prueba (upsert por email: NO borra usuarios reales).
  const passwordHash = await bcrypt.hash("Russell2026*", 10);
  const idPorEmail = new Map<string, number>();
  for (const u of DEMO_USUARIOS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, initials: u.initials },
      create: { email: u.email, password: passwordHash, name: u.name, role: u.role, initials: u.initials },
    });
    idPorEmail.set(u.email, user.id);
  }

  // 6) Jerarquía organizacional demo (Socio → Gerente → Senior → Staffs).
  await prisma.userHierarchy.createMany({
    data: DEMO_JERARQUIA.map((a) => ({
      superiorId: idPorEmail.get(a.superiorEmail)!,
      subordinateId: idPorEmail.get(a.subordinadoEmail)!,
    })),
  });

  // 7) Responsables por cliente (asignaciones_cliente) sobre clientes reales
  //    del seed: staff escribe; senior y gerente leen. El Socio NO se asigna
  //    (deriva lectura por jerarquía en runtime).
  const asignaciones = asignacionesDemo();
  const seniorId = idPorEmail.get("senior.demo@russellbedford.co") ?? null;
  const clientes = await prisma.client.findMany({
    where: { code: { in: asignaciones.map((asignacion) => asignacion.clientCode) } },
    select: { id: true, code: true },
  });
  const clientIdByCode = new Map(clientes.map((client) => [client.code, client.id]));
  if (clientIdByCode.size !== new Set(asignaciones.map((a) => a.clientCode)).size) {
    throw new Error("Faltan clientes del escenario RBAC. Ejecuta primero el seed principal.");
  }
  await prisma.clientAssignment.createMany({
    data: asignaciones.map((a) => ({
      clientId: clientIdByCode.get(a.clientCode)!,
      userId: idPorEmail.get(a.userEmail)!,
      role: a.funcion,
      readScope: a.readScope,
      writeScope: a.writeScope,
      assignedById: seniorId,
    })),
  });

  console.log(
    `✅ RBAC sembrado: ${ROLES.length} roles · ${PERMISOS.length} permisos · ${filas.length} concesiones · ` +
      `${DEMO_USUARIOS.length} usuarios demo · ${DEMO_JERARQUIA.length} aristas de jerarquía · ${asignaciones.length} asignaciones de responsables.`,
  );
  console.log("ℹ️  Roles legado con permisos heredados (Auditor≈Staff, Líder≈Senior, Consulta=lectura). Conversión de usuarios.rol: opcional vía prisma/backfill-roles.ts.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
