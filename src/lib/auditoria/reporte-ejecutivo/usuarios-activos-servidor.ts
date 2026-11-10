// Lectura de las cuentas y de su actividad para el indicador «Usuarios activos».
//
// Solo lee. Trae los cuatro insumos que `calcularUsuariosActivos` (pura y
// probada) necesita y deja la regla en un solo lugar:
//   - las cuentas, con id, estado, creación y último inicio de sesión;
//   - quién tuvo un ingreso o una navegación en el período, POR `userId`
//     (hay nombres repetidos, así que el nombre no sirve para los accesos);
//   - quién dejó acciones en la bitácora en el período, por nombre: es lo único
//     que ella guarda. «GENERÓ REPORTE IA» no cuenta, igual que en el resto del
//     reporte;
//   - quién tiene algún acceso en toda la historia retenida (para «nunca han
//     ingresado»). La tabla de accesos es pequeña y se agrupa a lo sumo por
//     cuenta, así que no hace falta un índice nuevo.
// De cada grupo se trae también su registro MÁS RECIENTE: la función pura lo
// compara con la creación de la cuenta para descartar los accesos que quedaron
// pegados a un id reutilizado (ver `usuarios-activos.ts`).
//
// Cualquier actividad cuenta, aunque sea de un módulo aún no publicado: aquí se
// mide si la persona usa la plataforma, no qué parte. Las fechas se comparan como
// las demás consultas del reporte (`gte desde` / `lte hasta`, sin zona propia).
//
// Nunca lanza: ante un fallo devuelve null y el reporte omite el indicador en vez
// de mostrar una cifra falsa.
import "server-only";
import prisma from "@/lib/prisma";
import { calcularUsuariosActivos, type UsuariosActivos } from "./usuarios-activos";

export async function construirUsuariosActivos(params: {
  desde: Date;
  hasta: Date;
}): Promise<UsuariosActivos | null> {
  try {
    const periodo = { gte: params.desde, lte: params.hasta };
    const [cuentas, accesosPeriodo, accionesPeriodo, accesosHistoricos] = await Promise.all([
      prisma.user.findMany({
        select: { id: true, name: true, email: true, active: true, lastLoginAt: true, createdAt: true },
      }),
      prisma.accessLog.groupBy({
        by: ["userId"],
        where: { userId: { not: null }, kind: { in: ["ingreso", "navegacion"] }, createdAt: periodo },
        _max: { createdAt: true },
      }),
      prisma.auditEntry.groupBy({
        by: ["user"],
        where: { createdAt: periodo, action: { not: "GENERÓ REPORTE IA" } },
        _max: { createdAt: true },
      }),
      prisma.accessLog.groupBy({
        by: ["userId"],
        where: { userId: { not: null } },
        _max: { createdAt: true },
      }),
    ]);

    const accesos = (
      filas: Array<{ userId: number | null; _max: { createdAt: Date | null } }>,
    ): Array<{ userId: number; ultimoEn: Date }> =>
      filas.flatMap((f) => (f.userId !== null && f._max.createdAt ? [{ userId: f.userId, ultimoEn: f._max.createdAt }] : []));

    return calcularUsuariosActivos({
      cuentas,
      accesosEnPeriodo: accesos(accesosPeriodo),
      accionesEnPeriodo: accionesPeriodo.flatMap((a) =>
        a._max.createdAt ? [{ nombre: a.user, ultimaEn: a._max.createdAt }] : [],
      ),
      accesosHistoricos: accesos(accesosHistoricos),
    });
  } catch {
    return null;
  }
}
