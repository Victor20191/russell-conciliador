// Registro del despliegue al arrancar el servidor de producción (ver
// `src/instrumentation.ts` y `registro-despliegue.ts`). Solo corre en el proceso
// de PM2 del servidor (`RUSSELL_INSTALACION=produccion` en ecosystem.config.js):
// la app local usa la misma base y no debe anotar despliegues.
import prisma from "@/lib/prisma";
import packageJson from "../../../package.json";
import { despliegueAlPublicar, fechaDespliegueTexto } from "./despliegue";
import { esVersionValida, versionMayor, versionesQueEntran } from "./registro-despliegue";

export type ResultadoRegistroDespliegue =
  | { registrado: false; motivo: "version_invalida" | "ya_registrada" }
  | { registrado: true; version: string; anterior: string | null; fechadas: string[]; dia: string };

/**
 * Anota que el servidor arrancó con `version`. Si es la primera vez con esa
 * versión, le pone el día de hoy (en Colombia) como «Desplegada el» a las versiones
 * de Novedades que entraron desde la anterior. Un reinicio con la misma versión
 * no hace nada.
 */
export async function registrarDespliegue(params: {
  version: string;
  ahora?: Date;
}): Promise<ResultadoRegistroDespliegue> {
  const version = params.version.trim();
  if (!esVersionValida(version)) return { registrado: false, motivo: "version_invalida" };
  const ahora = params.ahora ?? new Date();
  const dia = despliegueAlPublicar(ahora);

  try {
    return await prisma.$transaction(async (tx) => {
      const previos = await tx.platformDeployment.findMany({ select: { version: true } });
      if (previos.some((p) => p.version === version)) {
        return { registrado: false as const, motivo: "ya_registrada" as const };
      }
      const anterior = versionMayor(previos.map((p) => p.version));
      await tx.platformDeployment.create({ data: { version, startedAt: ahora, origin: "servidor" } });

      const versiones = await tx.platformVersion.findMany({ select: { id: true, number: true, deployedAt: true } });
      const entran = versionesQueEntran({ versiones, anterior, actual: version });
      if (entran.length) {
        await tx.platformVersion.updateMany({
          where: { id: { in: entran.map((v) => v.id) } },
          data: { deployedAt: dia },
        });
      }
      const fechadas = entran.map((v) => v.number);
      // Directo y no con `logAudit`: al arrancar no hay solicitud de la que leer la IP.
      await tx.auditEntry.create({
        data: {
          user: "Sistema",
          action: "REGISTRÓ DESPLIEGUE",
          entity: "Novedades",
          detail: anterior
            ? `El servidor de producción arrancó con la versión ${version} (antes ${anterior}). ${
                fechadas.length
                  ? `Desplegadas el ${fechaDespliegueTexto(dia)}: ${fechadas.map((n) => `v${n}`).join(", ")}.`
                  : "Ninguna versión de Novedades sin fecha entró en este despliegue."
              }`
            : `El servidor de producción arrancó con la versión ${version}. Primer registro: no se le puso fecha a versiones anteriores.`,
        },
      });
      return { registrado: true as const, version, anterior, fechadas, dia: fechaDespliegueTexto(dia)! };
    });
  } catch (e) {
    // Dos arranques simultáneos con la misma versión: el otro ya la anotó.
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { registrado: false, motivo: "ya_registrada" };
    }
    throw e;
  }
}

/** Lo que llama el arranque del servidor: la versión es la de package.json del build. */
export async function registrarDespliegueAlArrancar(): Promise<ResultadoRegistroDespliegue> {
  return registrarDespliegue({ version: String(packageJson.version ?? "") });
}
