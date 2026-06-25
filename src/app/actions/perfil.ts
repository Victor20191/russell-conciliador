"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mensajeErrorBD } from "@/lib/errores";
import {
  almacenamientoDisponible,
  subirObjeto,
  eliminarObjeto,
} from "@/lib/storage/objetos";
import { validarImagen, keyAvatar, AVATAR_MAX_BYTES } from "@/lib/avatares";
import type { ActionState } from "@/lib/definitions";

// Autoservicio: cada usuario gestiona SU PROPIA foto de perfil. No requiere un
// permiso de rol (es sobre la propia cuenta); basta tener sesión válida.

export async function actualizarMiFoto(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, message: "Sesión no válida." };
  if (!almacenamientoDisponible()) {
    return {
      ok: false,
      message: "El almacenamiento de fotos no está configurado. Avisa al administrador.",
    };
  }

  const archivo = formData.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, message: "Adjunta una imagen (JPG, PNG o WEBP)." };
  }
  if (archivo.size > AVATAR_MAX_BYTES) {
    return {
      ok: false,
      message: `La imagen supera ${Math.round(AVATAR_MAX_BYTES / 1024 / 1024)} MB.`,
    };
  }

  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const val = validarImagen(bytes);
    if (!val.ok) return { ok: false, message: val.error };

    // La key anterior se consulta ANTES de subir para poder (a) compensar un
    // huérfano si el update falla y (b) borrar la foto previa tras el éxito.
    const actual = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { avatarKey: true },
    });
    const key = keyAvatar(actor.id, val.tipo);
    await subirObjeto({ key, cuerpo: bytes, contentType: val.contentType });

    try {
      await prisma.user.update({ where: { id: actor.id }, data: { avatarKey: key } });
    } catch (e) {
      // Compensa el huérfano: borra el objeto recién subido SOLO si era nuevo
      // (no pisaba una key ya referenciada por el propio usuario).
      if (actual?.avatarKey !== key) await eliminarObjeto(key).catch(() => {});
      throw e;
    }

    // Tras el éxito, borra la foto anterior si tenía otra extensión (key distinta).
    if (actual?.avatarKey && actual.avatarKey !== key) {
      await eliminarObjeto(actual.avatarKey).catch(() => {});
    }

    await logAudit({
      user: actor.name,
      action: "ACTUALIZÓ SU FOTO",
      entity: "usuarios",
      detail: `usuario ${actor.id}`,
    });
    revalidatePath("/perfil");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("actualizarMiFoto", e) };
  }
}

export async function eliminarMiFoto(): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, message: "Sesión no válida." };

  try {
    const actual = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { avatarKey: true },
    });
    if (actual?.avatarKey) {
      await eliminarObjeto(actual.avatarKey).catch(() => {});
      await prisma.user.update({ where: { id: actor.id }, data: { avatarKey: null } });
    }
    await logAudit({
      user: actor.name,
      action: "QUITÓ SU FOTO",
      entity: "usuarios",
      detail: `usuario ${actor.id}`,
    });
    revalidatePath("/perfil");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarMiFoto", e) };
  }
}
