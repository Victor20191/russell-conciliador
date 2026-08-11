import "server-only";
import prisma from "@/lib/prisma";
import { BALANCE_UPLOAD_CHUNK_BYTES } from "./limites-archivo";

const VIGENCIA_ARCHIVO_TEMPORAL_MS = 2 * 60 * 60 * 1000;

type ResultadoOperacion =
  | { ok: true }
  | { ok: false; message: string; status: number };

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
    const existente = await prisma.balanceArchivoTemporal.findUnique({
      where: { loteId: args.loteId },
      select: { usuarioId: true },
    });
    if (existente && existente.usuarioId !== args.usuarioId) {
      return { ok: false, message: "El identificador de carga ya pertenece a otro usuario.", status: 409 };
    }

    await prisma.$transaction(async (tx) => {
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
    });
    return {
      ok: true,
      tamanoParte: BALANCE_UPLOAD_CHUNK_BYTES,
      totalPartes,
    };
  } catch {
    return { ok: false, message: "No se pudo preparar la carga fragmentada del balance.", status: 500 };
  }
}

export async function guardarParteArchivoBalance(args: {
  loteId: string;
  usuarioId: number;
  numero: number;
  contenido: Uint8Array;
}): Promise<ResultadoOperacion> {
  const archivo = await prisma.balanceArchivoTemporal.findUnique({
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

  await prisma.balanceArchivoTemporalParte.upsert({
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
}

export async function completarArchivoBalanceTemporal(args: {
  loteId: string;
  usuarioId: number;
}): Promise<ResultadoOperacion> {
  const archivo = await prisma.balanceArchivoTemporal.findUnique({
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

  const resumen = await prisma.balanceArchivoTemporalParte.aggregate({
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
  await prisma.balanceArchivoTemporal.update({
    where: { loteId: args.loteId },
    data: {
      completado: true,
      expiraEn: new Date(Date.now() + VIGENCIA_ARCHIVO_TEMPORAL_MS),
    },
  });
  return { ok: true };
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
  const archivo = await prisma.balanceArchivoTemporal.findUnique({
    where: { loteId: args.loteId },
    include: { partes: { orderBy: { numero: "asc" } } },
  });
  if (!archivo || !archivo.completado || archivo.expiraEn < new Date()) {
    return { ok: false, message: "No se encontró el archivo completo. Vuelve a seleccionarlo y reintenta." };
  }
  if (archivo.usuarioId !== args.usuarioId) {
    return { ok: false, message: "No tienes acceso al archivo temporal de esta lectura." };
  }
  const total = archivo.partes.reduce((suma, parte) => suma + parte.tamanoBytes, 0);
  if (archivo.partes.length !== archivo.totalPartes || total !== archivo.tamanoBytes) {
    return { ok: false, message: "El archivo temporal está incompleto. Vuelve a cargarlo." };
  }

  const contenido = new Uint8Array(archivo.tamanoBytes);
  let offset = 0;
  for (const parte of archivo.partes) {
    contenido.set(parte.contenido, offset);
    offset += parte.tamanoBytes;
  }
  await prisma.balanceArchivoTemporal.delete({ where: { loteId: args.loteId } });
  return {
    ok: true,
    archivo: {
      nombre: archivo.nombreArchivo,
      tipo: archivo.tipoContenido,
      tamano: archivo.tamanoBytes,
      contenido: contenido.buffer,
    },
  };
}
