/**
 * Preferencia de la barra de navegación (colapsada / abierta) en escritorio.
 *
 * Vive en una cookie —no en localStorage— para que el servidor la lea en el
 * layout y pinte el menú ya en su estado final: con almacenamiento solo de
 * cliente el primer render saldría abierto y se "cerraría" tras hidratar.
 * Es una cookie de sesión del navegador y se limpia también al cerrar sesión
 * en la plataforma o iniciar una nueva, para no heredar otra sesión/cuenta.
 * Módulo puro (sin `server-only` ni `"use client"`): lo importan el layout
 * (servidor) y el cascarón (cliente).
 */
export const COOKIE_NAV_COLAPSADA = "nav_colapsada";

/** Valor guardado en la cookie → booleano. Ausente o desconocido = abierta. */
export function navColapsadaDesdeCookie(valor: string | undefined): boolean {
  return valor === "1";
}

/**
 * Guarda la decisión EXPLÍCITA del usuario. Nunca lanza: si el navegador
 * bloquea las cookies, el menú sigue funcionando y solo se pierde la memoria.
 * No es httpOnly a propósito (la escribe el cliente, la lee el servidor).
 */
export function guardarNavColapsada(colapsada: boolean): void {
  try {
    const segura = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_NAV_COLAPSADA}=${colapsada ? "1" : "0"}; Path=/; SameSite=Lax${segura}`;
  } catch {
    // Cookies deshabilitadas o entorno sin DOM: la preferencia no se recuerda.
  }
}
