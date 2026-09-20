// Quién cuenta como «usuario de la plataforma» en el reporte de uso.
//
// El reporte se le entrega a la gerencia de Russell y mide el uso de SU equipo.
// Las cuentas de Xentria (`@xentria.co`), que construye y opera la plataforma,
// no son adopción del cliente: dejarlas dentro inflaba las operaciones, movía el
// top de usuarios y podía tapar una caída real del equipo de Russell —en el
// período del 1 al 20 de septiembre, dos cuentas de Xentria sumaban la mitad de
// las acciones—. Se excluyen de TODO el reporte, no solo de la lista de
// usuarios: al filtrar sus eventos caen también sus familias, sus acciones
// frecuentes y los clientes que solo ellas tocaron.
//
// Es la misma regla que ya usa `esActorSistema` para los actores técnicos, solo
// que identificada por dominio de correo.
//
// Módulo PURO.
import { correoEsDelDominio, DOMINIO_XENTRIA } from "@/lib/dominios-correo";

export type UsuarioPlataforma = { name: string; email: string };

/** ¿La cuenta es del equipo que construye la plataforma, no del cliente? */
export function esCuentaInterna(correo: string | null | undefined): boolean {
  return correoEsDelDominio(correo, DOMINIO_XENTRIA);
}

/** Las cuentas cuyo uso SÍ se reporta (todas menos las internas). */
export function usuariosDelReporte(usuarios: readonly UsuarioPlataforma[]): UsuarioPlataforma[] {
  return usuarios.filter((u) => !esCuentaInterna(u.email));
}

/**
 * Nombres para `calcularResumenUso({ usuariosRegistrados })`: la bitácora guarda
 * el NOMBRE del actor, así que ese es el filtro efectivo. Lo que no esté aquí
 * (cuentas internas, actores técnicos, usuarios borrados) queda fuera del reporte.
 */
export function nombresDelReporte(usuarios: readonly UsuarioPlataforma[]): string[] {
  return usuariosDelReporte(usuarios).map((u) => u.name);
}

/** Mapa nombre → correo, ya sin las cuentas internas. */
export function correosDelReporte(usuarios: readonly UsuarioPlataforma[]): Map<string, string> {
  return new Map(usuariosDelReporte(usuarios).map((u) => [u.name, u.email]));
}
