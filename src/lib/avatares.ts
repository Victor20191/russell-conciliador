// Lógica PURA de fotos de perfil (sin I/O): validación de imagen, construcción
// de la `key` del objeto, URL servida y emparejamiento por cédula para la carga
// masiva. La subida/lectura real al almacenamiento vive en `lib/storage` y las
// Server Actions; aquí todo es determinista y testeable.

import { normalizarCedula } from "@/lib/import/maestros";

export const AVATAR_MAX_BYTES = 4 * 1024 * 1024; // 4 MB por foto

export type TipoImagen = "jpg" | "png" | "webp";

export function mimeDeTipo(tipo: TipoImagen): string {
  return tipo === "png" ? "image/png" : tipo === "webp" ? "image/webp" : "image/jpeg";
}

/** Extensión (en minúsculas, sin punto) del nombre de archivo; "" si no tiene. */
export function extensionDeNombre(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? nombre; // descarta rutas del zip
  const punto = base.lastIndexOf(".");
  return punto >= 0 ? base.slice(punto + 1).toLowerCase() : "";
}

const EXT_IMAGEN = new Set(["jpg", "jpeg", "png", "webp"]);
export function pareceImagen(nombre: string): boolean {
  return EXT_IMAGEN.has(extensionDeNombre(nombre));
}

/** Detecta el tipo real por los magic bytes. No confía en la extensión (defensa
 *  ante archivos renombrados). Devuelve null si no es JPG/PNG/WEBP. */
export function detectarTipoImagen(bytes: Uint8Array): TipoImagen | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  // WEBP = "RIFF" + 4 bytes de tamaño + "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export type ValidacionImagen =
  | { ok: true; tipo: TipoImagen; contentType: string }
  | { ok: false; error: string };

/** Valida una imagen por tamaño y contenido real (magic bytes). */
export function validarImagen(bytes: Uint8Array): ValidacionImagen {
  if (bytes.length === 0) return { ok: false, error: "El archivo está vacío." };
  if (bytes.length > AVATAR_MAX_BYTES) {
    return {
      ok: false,
      error: `La imagen supera ${Math.round(AVATAR_MAX_BYTES / 1024 / 1024)} MB.`,
    };
  }
  const tipo = detectarTipoImagen(bytes);
  if (!tipo) return { ok: false, error: "Formato no admitido (usa JPG, PNG o WEBP)." };
  return { ok: true, tipo, contentType: mimeDeTipo(tipo) };
}

/** Key del objeto para la foto de un usuario. Incluye la extensión real para
 *  servir el Content-Type correcto; al cambiar de formato la key cambia y la
 *  anterior se elimina en la acción. */
export function keyAvatar(userId: number, tipo: TipoImagen): string {
  return `avatares/usuario-${userId}.${tipo}`;
}

/** URL (misma-origen, autenticada) para pintar la foto, con cache-busting por
 *  versión (updatedAt). Devuelve null si el usuario no tiene foto. */
export function urlAvatar(user: {
  id: number;
  avatarKey: string | null;
  updatedAt?: Date | string | number | null;
}): string | null {
  if (!user.avatarKey) return null;
  const v = user.updatedAt ? new Date(user.updatedAt).getTime() : 0;
  return `/api/usuarios/${user.id}/foto${v ? `?v=${v}` : ""}`;
}

// ===== Carga masiva: emparejar archivos del ZIP con usuarios por cédula =====

export type UsuarioCedula = { id: number; cedula: string | null; name: string };

export type Emparejamiento = {
  /** archivo → usuario resuelto por cédula */
  emparejados: { userId: number; nombreArchivo: string; name: string }[];
  /** archivos de imagen cuya cédula no coincide con ningún usuario */
  sinUsuario: string[];
  /** archivos descartados por no ser imágenes reconocibles (o ser carpetas) */
  ignorados: string[];
  /** archivos de imagen con una cédula ya emparejada antes en el mismo ZIP */
  duplicados: string[];
};

/** Empareja los nombres de archivo del ZIP (esperados como `<cedula>.jpg`) con
 *  los usuarios por su cédula normalizada (misma normalización que el import de
 *  maestros). Determinista: respeta el orden de entrada. */
export function emparejarFotosPorCedula(
  nombresArchivo: string[],
  usuarios: UsuarioCedula[],
): Emparejamiento {
  const porCedula = new Map<string, UsuarioCedula>();
  for (const u of usuarios) {
    if (!u.cedula) continue;
    const ced = normalizarCedula(u.cedula);
    if (ced) porCedula.set(ced, u);
  }

  const emp: Emparejamiento = {
    emparejados: [],
    sinUsuario: [],
    ignorados: [],
    duplicados: [],
  };
  const cedulasUsadas = new Set<string>();

  for (const nombre of nombresArchivo) {
    // Carpetas del zip (terminan en "/") o no-imágenes: ignoradas.
    if (nombre.endsWith("/") || !pareceImagen(nombre)) {
      if (!nombre.endsWith("/")) emp.ignorados.push(nombre);
      continue;
    }
    const base = nombre.split(/[\\/]/).pop() ?? nombre;
    const sinExt = base.slice(0, base.length - extensionDeNombre(base).length - 1);
    const ced = normalizarCedula(sinExt);
    const usuario = ced ? porCedula.get(ced) : undefined;
    if (!usuario) {
      emp.sinUsuario.push(nombre);
      continue;
    }
    if (cedulasUsadas.has(ced)) {
      emp.duplicados.push(nombre);
      continue;
    }
    cedulasUsadas.add(ced);
    emp.emparejados.push({ userId: usuario.id, nombreArchivo: nombre, name: usuario.name });
  }

  return emp;
}
