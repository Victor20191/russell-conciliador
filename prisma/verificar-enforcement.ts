// ============================================================
// Verificación de integración del ENFORCEMENT por matriz.
//
// Lee la matriz rol×permiso REAL desde `roles_permisos` (igual que
// getMatriz en runtime) y comprueba, con el resolver puro `tienePermiso`,
// que la autorización refleja la segregación del PDF y la herencia legado.
//
// Ejecutar:  npx tsx prisma/verificar-enforcement.ts
// ============================================================

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { tienePermiso, type Matriz } from "../src/lib/rbac/permisos";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

let fallos = 0;
function check(cond: boolean, msg: string) {
  if (cond) {
    console.log("✓ " + msg);
  } else {
    console.error("❌ " + msg);
    fallos++;
  }
}

async function main() {
  // Réplica de getMatriz(): construye la matriz desde roles_permisos.
  const filas = await prisma.rolePermission.findMany({
    select: { role: { select: { code: true } }, permission: { select: { code: true } } },
  });
  const matriz: Matriz = {};
  for (const f of filas) (matriz[f.role.code] ??= []).push(f.permission.code);

  console.log(`Matriz leída de BD: ${filas.length} concesiones, ${Object.keys(matriz).length} roles.\n`);

  // 1) Segregación operativa: solo Staff ejecuta conciliaciones.
  check(tienePermiso(matriz, "Staff", "conciliaciones:ejecutar"), "Staff PUEDE ejecutar conciliaciones");
  check(!tienePermiso(matriz, "Senior", "conciliaciones:ejecutar"), "Senior NO ejecuta (revisa, no opera)");
  check(!tienePermiso(matriz, "Gerente", "conciliaciones:ejecutar"), "Gerente NO ejecuta");
  check(!tienePermiso(matriz, "Socio", "conciliaciones:ejecutar"), "Socio NO ejecuta");

  // 2) CAMBIO de segregación esperado: el Administrador YA NO opera.
  check(!tienePermiso(matriz, "Administrador", "conciliaciones:ejecutar"), "Administrador NO ejecuta (cambio vs. jerarquía legado)");

  // 3) Configuración de negocio (Senior) y administración (Admin).
  check(tienePermiso(matriz, "Senior", "equipos:asignar"), "Senior gestiona equipos/cartera (equipos:asignar)");
  check(tienePermiso(matriz, "Administrador", "roles:configurar"), "Administrador edita la matriz (roles:configurar)");
  check(!tienePermiso(matriz, "Senior", "roles:configurar"), "Senior NO edita la matriz");

  // 4) Regresión LEGADO (matrizConLegado): los usuarios actuales conservan acceso.
  check(tienePermiso(matriz, "Auditor", "conciliaciones:ejecutar"), "Auditor (legado≈Staff) conserva ejecución");
  check(tienePermiso(matriz, "Líder", "equipos:asignar"), "Líder (legado≈Senior) conserva gestión de equipos");
  check(tienePermiso(matriz, "Administrador", "usuarios:crear"), "Administrador conserva administración de usuarios");
  check(tienePermiso(matriz, "Consulta", "conciliaciones:ver"), "Consulta (legado) conserva la lectura general");
  check(!tienePermiso(matriz, "Consulta", "conciliaciones:ejecutar"), "Consulta (legado) NO puede operar");

  console.log(fallos === 0 ? "\n✅ Enforcement por matriz verificado." : `\n❌ ${fallos} aserción(es) fallaron.`);
  if (fallos > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
