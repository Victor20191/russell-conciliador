// Destinatarios de las notificaciones programadas: reglas PURAS.

/** Tope razonable de destinatarios por programación (es un reporte para gerencia, no una lista masiva). */
export const TOPE_DESTINATARIOS = 50;

/** El correo como se guarda y se compara: sin espacios y en minúsculas. */
export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

export type DestinatarioGuardado = { correo: string; nombre?: string | null; activo: boolean };

/** Destinatarios activos a los que se envía, sin repetir correo (sin distinguir mayúsculas), en el orden de la lista. */
export function destinatariosDeEnvio<T extends DestinatarioGuardado>(destinatarios: readonly T[]): T[] {
  const vistos = new Set<string>();
  const salida: T[] = [];
  for (const d of destinatarios) {
    if (!d.activo) continue;
    const correo = normalizarCorreo(d.correo);
    if (!correo || vistos.has(correo)) continue;
    vistos.add(correo);
    salida.push(d);
  }
  return salida;
}

/** Correos a los que se envía: los activos, sin repetir (sin distinguir mayúsculas), en el orden de la lista. */
export function correosDeEnvio(destinatarios: readonly DestinatarioGuardado[]): string[] {
  return destinatariosDeEnvio(destinatarios).map((d) => normalizarCorreo(d.correo));
}

/** ¿Cabe un destinatario más? Se mide sobre todos los guardados, activos o no. */
export function puedeAgregarDestinatario(totalGuardados: number): boolean {
  return totalGuardados < TOPE_DESTINATARIOS;
}

/** «Ana Pérez <ana@correo.co>» o solo el correo, para la lista y el historial. */
export function etiquetaDestinatario(d: { correo: string; nombre?: string | null }): string {
  return d.nombre ? `${d.nombre} <${d.correo}>` : d.correo;
}

/** ¿El texto trae saltos de línea u otros caracteres de control? (el nombre solo se muestra en una línea) */
export function tieneCaracteresDeControl(texto: string): boolean {
  for (const caracter of texto) {
    const codigo = caracter.codePointAt(0) ?? 0;
    if (codigo < 0x20 || codigo === 0x7f) return true;
  }
  return false;
}
