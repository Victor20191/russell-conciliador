// Arranque del servidor en Node (lo llama `src/instrumentation.ts`).
//
// En el servidor de producción anota el despliegue: si arrancó con una versión de
// package.json nueva, las versiones de Novedades que entraron toman hoy como
// «Desplegada el» (ver `src/lib/novedades/registro-despliegue.ts`). Solo en el
// proceso de PM2 (`RUSSELL_INSTALACION=produccion`, en ecosystem.config.js): la app
// local apunta a la misma base y no debe anotar nada. Un fallo no impide arrancar.

const LIMITE_MS = 10_000;

export async function registrarDespliegueEnProduccion(): Promise<void> {
  if (process.env.RUSSELL_INSTALACION !== "produccion") return;

  try {
    const { registrarDespliegueAlArrancar } = await import("@/lib/novedades/registro-despliegue-servidor");
    const resultado = await Promise.race([
      registrarDespliegueAlArrancar(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LIMITE_MS)),
    ]);
    if (resultado === null) {
      console.error("[despliegue] El registro del despliegue no terminó a tiempo; el servidor arranca igual.");
    } else if (resultado.registrado) {
      console.log(
        `[despliegue] Versión ${resultado.version} registrada (anterior: ${resultado.anterior ?? "ninguna"}). ` +
          `Desplegadas el ${resultado.dia}: ${resultado.fechadas.join(", ") || "ninguna"}.`,
      );
    }
  } catch (error) {
    console.error("[despliegue] No se pudo registrar el despliegue; el servidor arranca igual.", error);
  }
}
