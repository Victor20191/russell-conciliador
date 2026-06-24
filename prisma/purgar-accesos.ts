// ============================================================
// Purga de `registros_acceso` por antigüedad (retención).
//
// Borra los accesos/navegaciones más antiguos que la ventana de retención para
// que la tabla no crezca sin límite. Pensado para ejecutarse por cron.
//
// Retención (meses): ACCESS_LOG_RETENCION_MESES (env) o el valor por defecto
// (MESES_RETENCION_DEFECTO = 18).
//
// Uso:
//   npm run db:purgar:accesos                 # dry-run: cuenta lo que se borraría
//   npm run db:purgar:accesos -- --aplicar    # ejecuta el borrado
//   ACCESS_LOG_RETENCION_MESES=24 npm run db:purgar:accesos -- --aplicar
// ============================================================
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  MESES_RETENCION_DEFECTO,
  fechaCorteRetencion,
} from "../src/lib/access-log-retencion";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const APLICAR = process.argv.includes("--aplicar");
const meses = Number(process.env.ACCESS_LOG_RETENCION_MESES ?? MESES_RETENCION_DEFECTO);

async function main() {
  if (!Number.isFinite(meses) || meses <= 0) {
    console.error(`✖ Retención inválida: "${process.env.ACCESS_LOG_RETENCION_MESES}". Usa un número de meses > 0.`);
    process.exit(1);
  }

  const corte = fechaCorteRetencion(meses, new Date());
  console.log(
    `🧹 Purga registros_acceso (retención ${meses} meses) — corte: ${corte.toISOString()} ${APLICAR ? "(APLICANDO)" : "(dry-run: usa --aplicar para ejecutar)"}\n`,
  );

  const where = { createdAt: { lt: corte } };

  if (!APLICAR) {
    const n = await prisma.accessLog.count({ where });
    console.log(`  Se borrarían ${n} registro(s) anteriores al corte.`);
    return;
  }

  const { count } = await prisma.accessLog.deleteMany({ where });
  console.log(`✅ ${count} registro(s) eliminado(s).`);
}

main()
  .catch((e) => {
    console.error("ERR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
