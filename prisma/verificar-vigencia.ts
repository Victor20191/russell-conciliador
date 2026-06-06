// ============================================================
// Verificación de integración del filtro de VIGENCIA temporal.
//
// Prueba, contra la BD real, que la condición de vigencia usada por
// `src/lib/rbac/contexto.ts` (getAsignacionesUsuario) excluye las
// membresías/asignaciones EXPIRADAS o aún NO iniciadas, e incluye las
// vigentes. Crea datos desechables (userId sentinela, equipos temporales),
// asevera, y limpia siempre al final.
//
// Ejecutar:  npx tsx prisma/verificar-vigencia.ts
// ============================================================

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Usuario/cliente SENTINELA (FK lógicas, sin constraint): no chocan con datos reales.
const USER = 990001;
const CLIENT = 990777;

const DIA = 24 * 60 * 60 * 1000;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("❌ " + msg);
  console.log("✓ " + msg);
}

async function limpiar() {
  await prisma.clientAssignment.deleteMany({ where: { userId: USER } });
  await prisma.teamMember.deleteMany({ where: { userId: USER } });
  await prisma.team.deleteMany({ where: { name: { startsWith: "__verif_vigencia__" } } });
}

async function main() {
  await limpiar();
  const base = new Date();
  const hace2dias = new Date(base.getTime() - 2 * DIA);
  const ayer = new Date(base.getTime() - DIA);
  const manana = new Date(base.getTime() + DIA);
  const futuro = new Date(base.getTime() + 30 * DIA);

  // Tres equipos desechables (el UNIQUE [equipo_id, usuario_id] obliga a equipos distintos).
  const tExpirado = await prisma.team.create({ data: { name: "__verif_vigencia__expirado" } });
  const tVigente = await prisma.team.create({ data: { name: "__verif_vigencia__vigente" } });
  const tFuturo = await prisma.team.create({ data: { name: "__verif_vigencia__futuro" } });

  // Membresías: expirada (venció ayer), vigente (hasta mañana) y aún no iniciada (desde futuro).
  await prisma.teamMember.create({ data: { teamId: tExpirado.id, userId: USER, validFrom: hace2dias, validUntil: ayer } });
  await prisma.teamMember.create({ data: { teamId: tVigente.id, userId: USER, validFrom: ayer, validUntil: manana } });
  await prisma.teamMember.create({ data: { teamId: tFuturo.id, userId: USER, validFrom: futuro } });

  // Asignaciones de cliente directas: una expirada y una vigente.
  await prisma.clientAssignment.create({ data: { clientId: CLIENT, userId: USER, readScope: true, writeScope: true, validFrom: hace2dias, validUntil: ayer } });
  await prisma.clientAssignment.create({ data: { clientId: CLIENT + 1, userId: USER, readScope: true, writeScope: true, validFrom: ayer, validUntil: manana } });

  // ===== Réplica EXACTA del where de getAsignacionesUsuario (contexto.ts) =====
  // `ahora` se captura al CONSULTAR (como en la app), no al sembrar.
  const ahora = new Date();
  const noExpirada = [{ validUntil: null }, { validUntil: { gte: ahora } }];

  const miembros = await prisma.teamMember.findMany({
    where: { userId: USER, active: true, validFrom: { lte: ahora }, OR: noExpirada },
    select: { teamId: true },
  });
  const equipos = miembros.map((m) => m.teamId);

  const asignaciones = await prisma.clientAssignment.findMany({
    where: {
      active: true,
      validFrom: { lte: ahora },
      AND: [{ OR: noExpirada }, { OR: [{ userId: USER }, { teamId: { in: equipos } }] }],
    },
    select: { clientId: true, validUntil: true },
  });

  // ===== Aserciones =====
  assert(equipos.includes(tVigente.id), "membresía VIGENTE (hasta mañana) SÍ alcanza");
  assert(!equipos.includes(tExpirado.id), "membresía EXPIRADA (venció ayer) NO alcanza");
  assert(!equipos.includes(tFuturo.id), "membresía FUTURA (inicia en 30 días) aún NO alcanza");
  assert(equipos.length === 1, `solo 1 equipo vigente de 3 sembrados (obtenidos: ${equipos.length})`);

  const clientesVigentes = asignaciones.map((a) => a.clientId).sort();
  assert(clientesVigentes.includes(CLIENT + 1), "cartera VIGENTE SÍ aparece");
  assert(!clientesVigentes.includes(CLIENT), "cartera EXPIRADA NO aparece");

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
