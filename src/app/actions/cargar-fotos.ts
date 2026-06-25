"use server";

import { revalidatePath } from "next/cache";
import JSZip from "jszip";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mensajeErrorBD } from "@/lib/errores";
import {
  almacenamientoDisponible,
  subirObjeto,
  eliminarObjeto,
} from "@/lib/storage/objetos";
import { validarImagen, keyAvatar, emparejarFotosPorCedula, AVATAR_MAX_BYTES } from "@/lib/avatares";

// Tamaño DESCOMPRIMIDO de una entrada del zip (jszip no lo expone en su API
// pública, pero lo guarda en `_data` tras `loadAsync`). Sirve para frenar un
// "zip bomb" sin tener que leer la entrada en memoria primero.
function tamDescomprimido(entry: JSZip.JSZipObject): number {
  return (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
}

const MAX_ARCHIVOS_ZIP = 2000;
const MAX_DESCOMPRIMIDO = 300 * 1024 * 1024; // 300 MB en total

export type CargarFotosState = {
  ok?: boolean;
  message?: string;
  resumen?: {
    asignadas: number;
    sinUsuario: string[]; // imágenes cuya cédula no coincide con ningún usuario
    invalidas: { archivo: string; motivo: string }[]; // imágenes corruptas/formato no válido
    duplicados: string[]; // varias imágenes para la misma cédula (se usó la primera)
    ignorados: string[]; // archivos del zip que no son imágenes
  };
};

const MAX_ZIP_BYTES = 60 * 1024 * 1024; // 60 MB

// Carga masiva inicial de fotos de perfil. Recibe un .zip con imágenes nombradas
// por la cédula del usuario (ej. 52123456.jpg). Empareja por cédula normalizada
// (misma normalización que el import de maestros), valida cada imagen por su
// contenido real y sube a almacenamiento de objetos. Requiere permiso de edición
// de usuarios. Las fotos NO se guardan en la BD: solo la `key` del objeto.
export async function cargarFotosUsuarios(
  _prev: CargarFotosState,
  formData: FormData,
): Promise<CargarFotosState> {
  const authz = await authorizePermiso("usuarios:editar");
  if (!authz.ok) return { ok: false, message: authz.message };
  if (!almacenamientoDisponible()) {
    return {
      ok: false,
      message: "El almacenamiento de fotos no está configurado (S3/MinIO/R2). Define las variables S3_*.",
    };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, message: "Adjunta un archivo .zip con las fotos." };
  }
  if (archivo.size > MAX_ZIP_BYTES) {
    return { ok: false, message: "El ZIP supera 60 MB." };
  }

  try {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(await archivo.arrayBuffer());
    } catch {
      return { ok: false, message: "No se pudo leer el ZIP. Asegúrate de subir un .zip válido." };
    }

    const entradas = Object.values(zip.files);
    if (entradas.length > MAX_ARCHIVOS_ZIP) {
      return { ok: false, message: `El ZIP contiene demasiados archivos (máx. ${MAX_ARCHIVOS_ZIP}).` };
    }
    const totalDescomprimido = entradas.reduce((s, e) => s + tamDescomprimido(e), 0);
    if (totalDescomprimido > MAX_DESCOMPRIMIDO) {
      return {
        ok: false,
        message: `El contenido descomprimido del ZIP supera ${Math.round(MAX_DESCOMPRIMIDO / 1024 / 1024)} MB.`,
      };
    }

    const nombres = entradas.map((e) => e.name);
    const usuarios = await prisma.user.findMany({
      select: { id: true, cedula: true, name: true, avatarKey: true },
    });
    const emp = emparejarFotosPorCedula(
      nombres,
      usuarios.map((u) => ({ id: u.id, cedula: u.cedula, name: u.name })),
    );

    const keyAnteriorPorId = new Map(usuarios.map((u) => [u.id, u.avatarKey]));
    const invalidas: { archivo: string; motivo: string }[] = [];
    let asignadas = 0;

    for (const m of emp.emparejados) {
      const entry = zip.file(m.nombreArchivo);
      if (!entry) continue;
      // Guardia anti-OOM: no leer en memoria una entrada gigante (el máximo por
      // foto es AVATAR_MAX_BYTES); se descarta antes de descomprimirla.
      if (tamDescomprimido(entry) > AVATAR_MAX_BYTES) {
        invalidas.push({
          archivo: m.nombreArchivo,
          motivo: `La imagen supera ${Math.round(AVATAR_MAX_BYTES / 1024 / 1024)} MB.`,
        });
        continue;
      }
      const bytes = await entry.async("uint8array");
      const val = validarImagen(bytes);
      if (!val.ok) {
        invalidas.push({ archivo: m.nombreArchivo, motivo: val.error });
        continue;
      }
      const key = keyAvatar(m.userId, val.tipo);
      const anterior = keyAnteriorPorId.get(m.userId);
      await subirObjeto({ key, cuerpo: bytes, contentType: val.contentType });
      try {
        await prisma.user.update({ where: { id: m.userId }, data: { avatarKey: key } });
      } catch (e) {
        // Compensa el huérfano: borra el objeto recién subido si era nuevo.
        if (anterior !== key) await eliminarObjeto(key).catch(() => {});
        throw e;
      }
      if (anterior && anterior !== key) await eliminarObjeto(anterior).catch(() => {});
      asignadas++;
    }

    const resumen = {
      asignadas,
      sinUsuario: emp.sinUsuario,
      invalidas,
      duplicados: emp.duplicados,
      ignorados: emp.ignorados,
    };

    if (asignadas === 0) {
      return {
        ok: false,
        message:
          "Ninguna imagen se asignó. Nombra cada archivo con la cédula del usuario (ej. 52123456.jpg).",
        resumen,
      };
    }

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "CARGÓ FOTOS DE USUARIOS",
      entity: "usuarios",
      detail: `asignadas ${asignadas}`,
    });
    revalidatePath("/config/usuarios");
    return { ok: true, resumen };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("cargarFotosUsuarios", e) };
  }
}
