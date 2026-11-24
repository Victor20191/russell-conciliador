// Arranque del servidor de Next (`register` corre una vez por instancia, antes de
// atender solicitudes; ver node_modules/next/dist/docs/01-app/02-guides/
// instrumentation.md). Lo de Node va dentro del `if` con la importación adentro,
// como pide la guía: así Next lo descarta al compilar para el runtime edge (con un
// `return` temprano intentaba empaquetar Prisma y `node:*` para edge y fallaba).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registrarDespliegueEnProduccion } = await import("./instrumentation-node");
    await registrarDespliegueEnProduccion();
  }
}
