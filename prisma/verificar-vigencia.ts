// ============================================================
// Verificación de integración del filtro de VIGENCIA temporal.
//
// Prueba, contra la BD real, que la condición de vigencia usada por
// `src/lib/rbac/contexto.ts` (getAsignacionesUsuario) excluye las
// asignaciones de responsable EXPIRADAS o aún NO iniciadas, e incluye
// las vigentes. Crea datos desechables (userId/clientIds sentinela),
// asevera, y limpia siempre al final.
//
// Ejecutar:  npx tsx prisma/verificar-vigencia.ts
// ============================================================

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Usuario/clientes SENTINELA (FK lógicas, sin constraint): no chocan con datos reales.
const USER = 990001;
const CLIENT_EXPIRADO = 990777;
const CLIENT_VIGENTE = 990778;
const CLIENT_FUTURO = 990779;

const DIA = 24 * 60 * 60 * 1000;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("❌ " + msg);
  console.log("✓ " + msg);
}

async function limpiar() {
  await prisma.clientAssignment.deleteMany({ where: { userId: USER } });
}

async function main() {
  await limpiar();
  const base = new Date();
  const hace2dias = new Date(base.getTime() - 2 * DIA);
  const ayer = new Date(base.getTime() - DIA);
  const manana = new Date(base.getTime() + DIA);
  const futuro = new Date(base.getTime() + 30 * DIA);

  // Asignaciones de responsable (funcion="staff") sobre 3 clientes sentinela
  // distintos (el UNIQUE [cliente_id, funcion] obliga a clientes distintos):
  // expirada (venció ayer), vigente (hasta mañana) y aún no iniciada.
  await prisma.clientAssignment.create({
    data: { clientId: CLIENT_EXPIRADO, userId: USER, role: "staff", readScope: true, writeScope: true, validFrom: hace2dias, validUntil: ayer },
  });
  await prisma.clientAssignment.create({
    data: { clientId: CLIENT_VIGENTE, userId: USER, role: "staff", readScope: true, writeScope: true, validFrom: ayer, validUntil: manana },
  });
  await prisma.clientAssignment.create({
    data: { clientId: CLIENT_FUTURO, userId: USER, role: "staff", readScope: true, writeScope: true, validFrom: futuro },
  });

  // ===== Réplica EXACTA del where de getAsignacionesUsuario (contexto.ts) =====
  // `ahora` se captura al CONSULTAR (como en la app), no al sembrar.
  const ahora = new Date();
  const noExpirada = [{ validUntil: null }, { validUntil: { gte: ahora } }];

  const asignaciones = await prisma.clientAssignment.findMany({
    where: { active: true, validFrom: { lte: ahora }, OR: noExpirada, userId: USER },
    select: { clientId: true, validUntil: true },
  });

  // ===== Aserciones =====
  const clientesVigentes = asignaciones.map((a) => a.clientId).sort();
  assert(clientesVigentes.includes(CLIENT_VIGENTE), "asignación VIGENTE (hasta mañana) SÍ alcanza");
  assert(!clientesVigentes.includes(CLIENT_EXPIRADO), "asignación EXPIRADA (venció ayer) NO alcanza");
  assert(!clientesVigentes.includes(CLIENT_FUTURO), "asignación FUTURA (inicia en 30 días) aún NO alcanza");
  assert(clientesVigentes.length === 1, `solo 1 asignación vigente de 3 sembradas (obtenidas: ${clientesVigentes.length})`);

  console.log("\n✅ Filtro de vigencia temporal verificado correctamente.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await limpiar();
    await prisma.$disconnect();
  });
