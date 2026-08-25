// ============================================================
// Guarda contra borrados masivos accidentales.
//
// Nació del incidente del 24-ago-2026: un agente ejecutó `npm run db:seed`
// contra la base de PRODUCCIÓN y borró 96.597 filas. Se recuperaron desde el
// WAL por pura suerte (los segmentos aún no se habían reciclado).
//
// Comprobar solo el host NO alcanza: el VPS de producción ES la máquina donde
// se trabaja, así que ahí `localhost` también apunta a los datos reales. Por eso
// la señal decisiva es el CONTENIDO: si la base tiene volumen de producción, no
// es un escenario de pruebas y el script se niega a correr.
//
// Para forzarlo de manera deliberada:
//   PERMITIR_BORRADO_MASIVO=si-borrar-todo npm run db:seed
// ============================================================

import type { PrismaClient } from "../src/generated/prisma/client";

const VARIABLE_CONFIRMACION = "PERMITIR_BORRADO_MASIVO";
const VALOR_CONFIRMACION = "si-borrar-todo";

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1"]);

/** Volumen máximo que puede tener una base "desechable" (el seed demo queda muy por debajo). */
const UMBRALES = [
  { etiqueta: "clientes", maximo: 25 },
  { etiqueta: "usuarios", maximo: 25 },
  { etiqueta: "balances cargados", maximo: 20 },
  { etiqueta: "registros de auditoría", maximo: 500 },
] as const;

function hostDe(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

async function contar(prisma: PrismaClient) {
  const [clientes, usuarios, balances, auditoria] = await Promise.all([
    prisma.client.count(),
    prisma.user.count(),
    prisma.balancePruebaEncabezado.count(),
    prisma.auditEntry.count(),
  ]);
  return [clientes, usuarios, balances, auditoria];
}

/**
 * Aborta el proceso si la base de datos apuntada parece la de producción.
 * Llamar SIEMPRE antes del primer `deleteMany()` sin filtro.
 */
export async function exigirBaseDesechable(prisma: PrismaClient, script: string): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  const host = hostDe(url);
  const motivos: string[] = [];

  if (host && !HOSTS_LOCALES.has(host)) {
    motivos.push(`la base no es local (host: ${host})`);
  }
  if (process.env.NODE_ENV === "production") {
    motivos.push('NODE_ENV está en "production"');
  }

  const filas = await contar(prisma);
  UMBRALES.forEach((umbral, i) => {
    if (filas[i] > umbral.maximo) {
      motivos.push(`hay ${filas[i]} ${umbral.etiqueta} (una base de pruebas no pasa de ${umbral.maximo})`);
    }
  });

  if (motivos.length === 0) return;

  const forzado = process.env[VARIABLE_CONFIRMACION] === VALOR_CONFIRMACION;
  const detalle = motivos.map((m) => `  • ${m}`).join("\n");

  if (forzado) {
    console.warn(
      `\n⚠️  ${script}: se detectó una base con datos reales y se continúa porque ` +
        `${VARIABLE_CONFIRMACION} está activo.\n${detalle}\n`,
    );
    return;
  }

  console.error(
    `\n🛑 ${script} ABORTADO: esto borraría datos reales.\n\n${detalle}\n\n` +
      `Este script vacía tablas completas y no se puede deshacer.\n` +
      `Si de verdad quieres borrar esta base, ejecútalo así:\n\n` +
      `    ${VARIABLE_CONFIRMACION}=${VALOR_CONFIRMACION} <comando>\n\n` +
      `Antes de hacerlo, asegúrate de tener un respaldo reciente:\n` +
      `    pg_dump "$DATABASE_URL" -Fc -f respaldo.dump\n`,
  );
  await prisma.$disconnect();
  process.exit(1);
}
