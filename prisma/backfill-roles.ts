// ============================================================
// Backfill OPCIONAL de usuarios.rol: legado → rol del PDF.
//
// Convierte el valor de usuarios.rol según MAPEO_LEGADO_PDF:
//   Auditor → Staff · Líder → Senior
//   Administrador → (sin cambio, identidad) · Consulta → (sin cambio)
//
// ⚠️ NO es necesario para que los permisos funcionen: el seed RBAC ya
//    da a los roles legado los permisos de su equivalente del PDF
//    (herencia en la matriz). Este script solo cambia el LITERAL del rol.
//
// ⚠️ ANTES DE APLICAR: la navegación y can() (src/lib/nav.ts,
//    src/lib/roles.ts) todavía comparan por RANGO legado. Convertir a
//    roles del PDF sin migrar primero la autorización a la matriz puede
//    alterar el acceso (p.ej. Socio/Gerente tienen rango ≥ Administrador).
//    Aplicar solo cuando la app autorice por permisos.
//
// Uso:
//   npm run db:backfill:roles            → DRY-RUN (no escribe nada)
//   npm run db:backfill:roles -- --apply → aplica los cambios
// ============================================================

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { MAPEO_LEGADO_PDF } from "../src/lib/rbac/catalogo";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const APLICAR = process.argv.includes("--apply");

// Solo se convierten los mapeos con destino PDF distinto del legado.
// (Administrador = identidad y Consulta = sin equivalente → no se tocan.)
const CAMBIOS = new Map<string, string>(
  MAPEO_LEGADO_PDF
    .filter((m) => m.pdf != null && m.pdf !== m.legacy)
    .map((m) => [m.legacy, m.pdf as string] as [string, string]),
);

async function main() {
  console.log(APLICAR ? "✍️  Backfill de usuarios.rol (APLICAR)…" : "🔎 Backfill de usuarios.rol (DRY-RUN, no escribe)…");

  const usuarios = await prisma.user.findMany({ select: { email: true, role: true } });
  const conteo = new Map<string, number>();
  for (const u of usuarios) conteo.set(u.role, (conteo.get(u.role) ?? 0) + 1);

  console.log("\nRol actual            →  Rol propuesto         (usuarios)");
  console.log("──────────────────────────────────────────────────────────");
  for (const [rol, n] of [...conteo.entries()].sort()) {
    const destino = CAMBIOS.get(rol);
    const flecha = destino ? `→  ${destino.padEnd(20)}` : "·  (sin cambio)        ";
    console.log(`${rol.padEnd(20)}  ${flecha} (${n})`);
  }

  if (!APLICAR) {
    console.log("\nℹ️  DRY-RUN: no se modificó nada. Re-ejecuta con `-- --apply` para aplicar.");
    return;
  }

  let total = 0;
  for (const [legacy, pdf] of CAMBIOS) {
    const res = await prisma.user.updateMany({ where: { role: legacy }, data: { role: pdf } });
    if (res.count > 0) console.log(`  ${legacy} → ${pdf}: ${res.count} usuario(s) actualizado(s).`);
    total += res.count;
  }
  console.log(`\n✅ Backfill aplicado: ${total} usuario(s) convertido(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
