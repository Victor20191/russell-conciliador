// ============================================================
// Sincroniza la matriz RBAC de la BD con el catálogo
// (src/lib/rbac/catalogo.ts), SIN tocar jerarquía, asignaciones ni
// usuarios.
//
// A diferencia de `db:seed:rbac` (que borra y re-crea la jerarquía y
// las asignaciones demo), este script solo reconcilia:
//   1) roles      — upsert por code (no borra roles extra: solo avisa)
//   2) permisos   — upsert por code (no borra permisos extra: solo avisa)
//   3) roles_permisos (la MATRIZ) — la deja EXACTAMENTE igual al
//      catálogo: inserta concesiones faltantes y elimina las sobrantes
//      (p. ej. concedidas a mano desde /config/permisos).
//
// Uso:
//   npm run db:sync:rbac                # dry-run: muestra el diff, no toca nada
//   npm run db:sync:rbac -- --aplicar   # aplica los cambios
//
// Tras aplicar: el Data Cache de Next (tag rbac-matriz) puede servir la
// matriz vieja hasta 1 hora; reinicia `npm run dev` para verla al instante.
// ============================================================

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ROLES, PERMISOS, matrizConLegado } from "../src/lib/rbac/catalogo";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const APLICAR = process.argv.includes("--aplicar");

async function main() {
  console.log(`🔁 Sync matriz RBAC ← catálogo ${APLICAR ? "(APLICANDO)" : "(dry-run: usa --aplicar para ejecutar)"}…\n`);

  // 1) Roles del catálogo (upsert por code; no borra los que sobren en BD).
  for (const r of ROLES) {
    if (APLICAR) {
      await prisma.role.upsert({
        where: { code: r.code },
        update: { name: r.name, description: r.description, rank: r.rank, isOperative: r.isOperative, isSystem: r.isSystem },
        create: { code: r.code, name: r.name, description: r.description, rank: r.rank, isOperative: r.isOperative, isSystem: r.isSystem },
      });
    }
  }
  const rolesBD = await prisma.role.findMany({ select: { id: true, code: true } });
  for (const r of rolesBD) {
    if (!ROLES.some((c) => c.code === r.code)) {
      console.log(`⚠️  Rol en BD fuera del catálogo (no se toca): ${r.code}`);
    }
  }

  // 2) Permisos del catálogo (upsert por code; no borra los que sobren en BD).
  for (const p of PERMISOS) {
    if (APLICAR) {
      await prisma.permission.upsert({
        where: { code: p.code },
        update: { module: p.module, action: p.action, label: p.label, description: p.description ?? null },
        create: { code: p.code, module: p.module, action: p.action, label: p.label, description: p.description ?? null },
      });
    }
  }
  const permisosBD = await prisma.permission.findMany({ select: { id: true, code: true } });
  for (const p of permisosBD) {
    if (!PERMISOS.some((c) => c.code === p.code)) {
      console.log(`⚠️  Permiso en BD fuera del catálogo (no se toca): ${p.code}`);
    }
  }
  const rolIdPorCode = new Map(rolesBD.map((r) => [r.code, r.id]));
  const permisoIdPorCode = new Map(permisosBD.map((p) => [p.code, p.id]));

  // 3) MATRIZ exacta: catálogo (con herencia de roles legado) vs BD.
  const esperado = matrizConLegado();
  const actuales = await prisma.rolePermission.findMany({
    select: { id: true, role: { select: { code: true } }, permission: { select: { code: true } } },
  });
  const actualPorClave = new Map(actuales.map((f) => [`${f.role.code}→${f.permission.code}`, f.id]));

  const faltantes: { rol: string; permiso: string }[] = [];
  for (const [rol, permisos] of Object.entries(esperado)) {
    for (const permiso of permisos) {
      if (!actualPorClave.has(`${rol}→${permiso}`)) faltantes.push({ rol, permiso });
    }
  }
  const sobrantes = actuales.filter(
    (f) => !(esperado[f.role.code] ?? []).includes(f.permission.code),
  );

  if (!faltantes.length && !sobrantes.length) {
    console.log("✓ La matriz en BD ya coincide EXACTAMENTE con el catálogo.");
  } else {
    for (const f of faltantes) console.log(`  + conceder  ${f.rol} ← ${f.permiso}`);
    for (const s of sobrantes) console.log(`  – revocar   ${s.role.code} ← ${s.permission.code}`);
    console.log(`\n  Total: +${faltantes.length} concesiones · –${sobrantes.length} revocaciones`);

    if (APLICAR) {
      // Validación previa: toda concesión faltante debe poder resolver ids
      // (tras los upserts de arriba siempre resuelven; defensa extra).
      const datos = faltantes.map((f) => {
        const roleId = rolIdPorCode.get(f.rol);
        const permissionId = permisoIdPorCode.get(f.permiso);
        if (!roleId || !permissionId) throw new Error(`No resuelve ids para ${f.rol}→${f.permiso}`);
        return { roleId, permissionId };
      });
      await prisma.$transaction([
        ...(sobrantes.length
          ? [prisma.rolePermission.deleteMany({ where: { id: { in: sobrantes.map((s) => s.id) } } })]
          : []),
        ...(datos.length ? [prisma.rolePermission.createMany({ data: datos, skipDuplicates: true })] : []),
      ]);
      console.log("\n✅ Matriz sincronizada con el catálogo.");
      console.log("ℹ️  Reinicia `npm run dev` (o espera la revalidación) para refrescar el Data Cache de la matriz.");
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
