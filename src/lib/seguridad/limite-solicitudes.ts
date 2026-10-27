import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import prisma from "@/lib/prisma";

/** Cuotas compartidas por todas las instancias, con reloj y exclusión atómica de PostgreSQL. */
export type PoliticaCuota = {
  ambito: string;
  limiteIndividual: number;
  limiteGlobal: number;
  ventanaSegundos: number;
};

export const CUOTA_SOPORTE_PUBLICO: PoliticaCuota = {
  ambito: "soporte-publico",
  limiteIndividual: 5,
  limiteGlobal: 50,
  ventanaSegundos: 15 * 60,
};

// Incluye cuentas desconocidas y accesos correctos: el bloqueo por cuenta no
// limita el costo de bcrypt cuando se rotan correos. El global no depende de la IP.
export const CUOTA_LOGIN: PoliticaCuota = {
  ambito: "login",
  limiteIndividual: 30,
  limiteGlobal: 1_000,
  ventanaSegundos: 15 * 60,
};

class CuotaAgotada extends Error {}

/** La IP viene del proxy: debe sobrescribir X-Forwarded-For y cerrar el acceso directo a Node. */
export function claveIdentidadCuota(ambito: string, ip: string): string {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto || Buffer.byteLength(secreto, "utf8") < 32) throw new Error("La clave del servidor no está configurada.");
  const limpia = ip.trim();
  const tipo = isIP(limpia);
  // Las formas equivalentes de IPv6 comparten cuota; una cabecera inválida no crea claves ilimitadas.
  const identidad = tipo === 6 ? new URL(`http://[${limpia}]/`).hostname : tipo === 4 ? limpia : "desconocida";
  return `${ambito}:ip:${createHmac("sha256", secreto).update(identidad).digest("hex")}`;
}

export async function consumirCuotaSolicitud(
  politica: PoliticaCuota,
  ip: string,
): Promise<{ permitida: boolean; reintentarEnSegundos: number }> {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(politica.ambito)
    || ![politica.limiteIndividual, politica.limiteGlobal, politica.ventanaSegundos].every((n) => Number.isSafeInteger(n) && n > 0)) {
    throw new Error("Política de solicitudes inválida.");
  }
  const individual = claveIdentidadCuota(politica.ambito, ip);
  const global = `${politica.ambito}:global`;
  try {
    await prisma.$transaction(async (tx) => {
      // Siempre global primero: el mismo orden evita interbloqueos. Un rechazo individual
      // lanza y revierte TAMBIÉN el cupo global. Rotar cabeceras no evita el máximo global.
      for (const [clave, limite] of [[global, politica.limiteGlobal], [individual, politica.limiteIndividual]] as const) {
        const aceptadas = await tx.$queryRaw<{ clave: string }[]>`
          INSERT INTO "limites_solicitud" ("clave", "solicitudes", "vence_en", "actualizado_en")
          VALUES (${clave}, 1, CURRENT_TIMESTAMP + ${politica.ventanaSegundos} * INTERVAL '1 second', CURRENT_TIMESTAMP)
          ON CONFLICT ("clave") DO UPDATE SET
            "solicitudes" = CASE WHEN "limites_solicitud"."vence_en" <= CURRENT_TIMESTAMP
              THEN 1 ELSE "limites_solicitud"."solicitudes" + 1 END,
            "vence_en" = CASE WHEN "limites_solicitud"."vence_en" <= CURRENT_TIMESTAMP
              THEN CURRENT_TIMESTAMP + ${politica.ventanaSegundos} * INTERVAL '1 second'
              ELSE "limites_solicitud"."vence_en" END,
            "actualizado_en" = CURRENT_TIMESTAMP
          WHERE "limites_solicitud"."vence_en" <= CURRENT_TIMESTAMP
            OR "limites_solicitud"."solicitudes" < ${limite}
          RETURNING "clave"
        `;
        if (aceptadas.length !== 1) throw new CuotaAgotada();
      }
      // Limpieza acotada: como solo persistimos identidades aceptadas, la cuota global
      // también acota el crecimiento. SKIP LOCKED conserva las filas en uso por otra instancia.
      await tx.$executeRaw`
        DELETE FROM "limites_solicitud" WHERE "clave" IN (
          SELECT "clave" FROM "limites_solicitud"
          WHERE "vence_en" < CURRENT_TIMESTAMP
          ORDER BY "vence_en" LIMIT 100 FOR UPDATE SKIP LOCKED
        )
      `;
    }, { maxWait: 5_000, timeout: 10_000 });
    return { permitida: true, reintentarEnSegundos: 0 };
  } catch (error) {
    if (error instanceof CuotaAgotada) return { permitida: false, reintentarEnSegundos: politica.ventanaSegundos };
    // Fallo de BD o migración pendiente: nunca abrir el endpoint sin protección.
    throw error;
  }
}
