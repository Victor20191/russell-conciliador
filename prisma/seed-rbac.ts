// ============================================================
// Seed RBAC — Roles, permisos, matriz rol×permiso y datos de prueba
// (equipo + cartera con alcance) para validar la autorización.
//
// SEPARADO del seed principal (prisma/seed.ts) a propósito:
//   - No toca ni borra los datos del seed principal.
//   - Es idempotente (upsert + limpieza scoped de tablas RBAC).
//   - Requiere que las 6 tablas nuevas existan: ejecutar DESPUÉS de
//     migrar el bloque de control de acceso del schema.
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
  DEMO_EQUIPO,
  DEMO_USUARIOS,
  DEMO_INTEGRANTES,
  DEMO_ASIGNACIONES,
} from "../src/lib/rbac/escenario-demo";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seed RBAC (roles, permisos, equipos y cartera de prueba)…");

  // 1) Limpieza idempotente de las tablas RBAC (no toca usuarios/clientes).
  await prisma.clientAssignment.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
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
  const filas = Object.entries(matriz).flatMap(([roleCode, codes]) =>
    codes.map((permissionCode) => ({ roleCode, permissionCode })),
  );
  await prisma.rolePermission.createMany({ data: filas });

  // 5) Usuarios de prueba (upsert por email: NO borra usuarios reales).
  const passwordHash = await bcrypt.hash("Russell2026*", 10);
  const idPorEmail = new Map<string, string>();
  for (const u of DEMO_USUARIOS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, initials: u.initials },
      create: { email: u.email, password: passwordHash, name: u.name, role: u.role, initials: u.initials },
    });
    idPorEmail.set(u.email, user.id);
  }

  // 6) Equipo de trabajo demo + integrantes.
  const liderId = idPorEmail.get(DEMO_EQUIPO.leadEmail) ?? null;
  await prisma.team.create({
    data: {
      id: DEMO_EQUIPO.id,
      name: DEMO_EQUIPO.name,
      description: DEMO_EQUIPO.description,
      leadUserId: liderId,
      members: {
        create: DEMO_INTEGRANTES.map((m) => ({ userId: idPorEmail.get(m.email)!, roleCode: m.roleCode })),
      },
    },
  });

  // 7) Cartera + alcance (asignaciones_cliente) sobre clientes reales del seed.
  await prisma.clientAssignment.createMany({
    data: DEMO_ASIGNACIONES.map((a) => ({
      clientId: a.clientId,
      teamId: a.team ? DEMO_EQUIPO.id : null,
      userId: a.userEmail ? idPorEmail.get(a.userEmail)! : null,
      readScope: a.readScope,
      writeScope: a.writeScope,
      assignedById: liderId,
    })),
  });

  console.log(
    `✅ RBAC sembrado: ${ROLES.length} roles · ${PERMISOS.length} permisos · ${filas.length} concesiones · ` +
      `${DEMO_USUARIOS.length} usuarios demo · 1 equipo · ${DEMO_ASIGNACIONES.length} asignaciones de cartera.`,
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
