import "server-only";
import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { tomarCandadoTransaccion } from "@/lib/candados";
import { BALANCE_UPLOAD_CHUNK_BYTES } from "./limites-archivo";

const VIGENCIA_ARCHIVO_TEMPORAL_MS = 2 * 60 * 60 * 1000;

type ResultadoOperacion =
  | { ok: true }
  | { ok: false; message: string; status: number };

async function conArchivoBloqueado<T>(
  loteId: string,
  operar: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // El candado coordina también el caso todavía inexistente y la recreación.
    await tomarCandadoTransaccion(tx, `balance-archivo-temporal:${loteId}`);
    // El bloqueo de fila hace que la purga por vencimiento también espere.
    await tx.$queryRaw`SELECT lote_id FROM balance_archivo_temporal WHERE lote_id = ${loteId} FOR UPDATE`;
    return operar(tx);
  }, { maxWait: 5_000, timeout: 10_000 });
}

async function purgarArchivosExpirados(): Promise<void> {
  await prisma.balanceArchivoTemporal.deleteMany({
    where: { expiraEn: { lt: new Date() } },
  });
}

export async function iniciarArchivoBalanceTemporal(args: {
  loteId: string;
  usuarioId: number;
  nombreArchivo: string;
  tipoContenido: string;
  tamanoBytes: number;
}): Promise<ResultadoOperacion & { tamanoParte?: number; totalPartes?: number }> {
  const totalPartes = Math.ceil(args.tamanoBytes / BALANCE_UPLOAD_CHUNK_BYTES);
  try {
    await purgarArchivosExpirados();
    return await conArchivoBloqueado(args.loteId, async (tx) => {
      const existente = await tx.balanceArchivoTemporal.findUnique({
        where: { loteId: args.loteId },
        select: { usuarioId: true },
      });
      if (existente && existente.usuarioId !== args.usuarioId) {
        return { ok: false, message: "El identificador de carga ya pertenece a otro usuario.", status: 409 };
      }
      if (existente) {
        await tx.balanceArchivoTemporal.delete({ where: { loteId: args.loteId } });
      }
      await tx.balanceArchivoTemporal.create({
        data: {
          loteId: args.loteId,
          usuarioId: args.usuarioId,
          nombreArchivo: args.nombreArchivo,
          tipoContenido: args.tipoContenido || "application/octet-stream",
          tamanoBytes: args.tamanoBytes,
          tamanoParte: BALANCE_UPLOAD_CHUNK_BYTES,
          totalPartes,
          completado: false,
          expiraEn: new Date(Date.now() + VIGENCIA_ARCHIVO_TEMPORAL_MS),
        },
      });
      return { ok: true, tamanoParte: BALANCE_UPLOAD_CHUNK_BYTES, totalPartes };
    });
  } catch {
    return { ok: false, message: "No se pudo preparar la carga fragmentada del balance.", status: 500 };
  }
}

/**
 * Descarta el archivo temporal de una lectura CANCELADA por el usuario. Borra
 * también sus fragmentos (FK dura en cascada) y es idempotente: si ya no existe
 * —o nunca llegó a crearse— responde ok igual. Solo el dueño puede descartarlo.
 */
export async function descartarArchivoBalanceTemporal(args: {
  loteId: string;
  usuarioId: number;
}): Promise<ResultadoOperacion> {
  try {
    await conArchivoBloqueado(args.loteId, (tx) => tx.balanceArchivoTemporal.deleteMany({
      where: { loteId: args.loteId, usuarioId: args.usuarioId },
    }));
    return { ok: true };
  } catch {
    // No es un error del usuario: el purgado por vigencia lo recoge después.
    return { ok: false, message: "No se pudo liberar el archivo temporal de la lectura.", status: 500 };
  }
}

export async function guardarParteArchivoBalance(args: {
  loteId: string;
  usuarioId: number;
  numero: number;
  contenido: Uint8Array;
}): Promise<ResultadoOperacion> {
  return conArchivoBloqueado(args.loteId, async (tx) => {
    const archivo = await tx.balanceArchivoTemporal.findUnique({
      where: { loteId: args.loteId },
      select: {
        usuarioId: true,
        tamanoBytes: true,
        tamanoParte: true,
        totalPartes: true,
        completado: true,
        expiraEn: true,
      },
    });
    if (!archivo || archivo.expiraEn < new Date()) {
      return { ok: false, message: "La carga temporal expiró. Vuelve a seleccionar el archivo.", status: 410 };
    }
    if (archivo.usuarioId !== args.usuarioId) {
      return { ok: false, message: "No tienes acceso a esta carga temporal.", status: 403 };
    }
    if (archivo.completado) {
      return { ok: false, message: "La carga temporal ya fue completada.", status: 409 };
    }
    if (args.numero < 1 || args.numero > archivo.totalPartes) {
      return { ok: false, message: "El número de fragmento no es válido.", status: 400 };
    }
    const esperado = args.numero === archivo.totalPartes
      ? archivo.tamanoBytes - archivo.tamanoParte * (archivo.totalPartes - 1)
      : archivo.tamanoParte;
    if (args.contenido.byteLength !== esperado) {
      return { ok: false, message: "El fragmento llegó incompleto. Reintenta la carga.", status: 400 };
    }

    // Prisma 7 tipa Bytes como Uint8Array<ArrayBuffer>; normalizamos cualquier
    // vista recibida para no propagar un posible SharedArrayBuffer.
    const contenido = Uint8Array.from(args.contenido);

    await tx.balanceArchivoTemporalParte.upsert({
      where: { loteId_numero: { loteId: args.loteId, numero: args.numero } },
      create: {
        loteId: args.loteId,
        numero: args.numero,
        tamanoBytes: args.contenido.byteLength,
        contenido,
      },
      update: {
        tamanoBytes: args.contenido.byteLength,
        contenido,
      },
    });
    return { ok: true };
  });
}

export async function completarArchivoBalanceTemporal(args: {
  loteId: string;
  usuarioId: number;
}): Promise<ResultadoOperacion> {
  return conArchivoBloqueado(args.loteId, async (tx) => {
    const archivo = await tx.balanceArchivoTemporal.findUnique({
      where: { loteId: args.loteId },
      select: {
        usuarioId: true,
        tamanoBytes: true,
        totalPartes: true,
        completado: true,
        expiraEn: true,
      },
    });
    if (!archivo || archivo.expiraEn < new Date()) {
      return { ok: false, message: "La carga temporal expiró. Vuelve a seleccionar el archivo.", status: 410 };
    }
    if (archivo.usuarioId !== args.usuarioId) {
      return { ok: false, message: "No tienes acceso a esta carga temporal.", status: 403 };
    }
    if (archivo.completado) return { ok: true };

    const resumen = await tx.balanceArchivoTemporalParte.aggregate({
      where: { loteId: args.loteId },
      _count: { _all: true },
      _sum: { tamanoBytes: true },
    });
    if (
      resumen._count._all !== archivo.totalPartes
      || Number(resumen._sum.tamanoBytes ?? 0) !== archivo.tamanoBytes
    ) {
      return { ok: false, message: "Faltan fragmentos del archivo. Reintenta la carga.", status: 409 };
    }
    await tx.balanceArchivoTemporal.update({
      where: { loteId: args.loteId },
      data: {
        completado: true,
        expiraEn: new Date(Date.now() + VIGENCIA_ARCHIVO_TEMPORAL_MS),
      },
    });
    return { ok: true };
  });
}

export type ArchivoBalanceTemporalConsumido = {
  nombre: string;
  tipo: string;
  tamano: number;
  contenido: ArrayBuffer;
};

export async function consumirArchivoBalanceTemporal(args: {
  loteId: string;
  usuarioId: number;
}): Promise<
  | { ok: true; archivo: ArchivoBalanceTemporalConsumido }
  | { ok: false; message: string }
> {
  return conArchivoBloqueado(args.loteId, async (tx) => {
    const archivo = await tx.balanceArchivoTemporal.findUnique({
      where: { loteId: args.loteId },
    });
    if (!archivo || !archivo.completado || archivo.expiraEn < new Date()) {
      return { ok: false, message: "No se encontró el archivo completo. Vuelve a seleccionarlo y reintenta." };
    }
    if (archivo.usuarioId !== args.usuarioId) {
      return { ok: false, message: "No tienes acceso al archivo temporal de esta lectura." };
    }
    // Los bytes se consultan solo después de autorizar al dueño y manteniendo el
    // mismo bloqueo hasta consumir: no pueden mezclarse con otra generación/lote.
    const partes = await tx.balanceArchivoTemporalParte.findMany({
      where: { loteId: args.loteId }, orderBy: { numero: "asc" },
    });
    const total = partes.reduce((suma, parte) => suma + parte.tamanoBytes, 0);
    if (partes.length !== archivo.totalPartes || total !== archivo.tamanoBytes) {
      return { ok: false, message: "El archivo temporal está incompleto. Vuelve a cargarlo." };
    }

    const contenido = new Uint8Array(archivo.tamanoBytes);
    let offset = 0;
    for (const parte of partes) {
      contenido.set(parte.contenido, offset);
      offset += parte.tamanoBytes;
    }
    await tx.balanceArchivoTemporal.delete({ where: { loteId: args.loteId } });
    return {
      ok: true,
      archivo: {
        nombre: archivo.nombreArchivo,
        tipo: archivo.tipoContenido,
        tamano: archivo.tamanoBytes,
        contenido: contenido.buffer,
      },
    };
  });
}
