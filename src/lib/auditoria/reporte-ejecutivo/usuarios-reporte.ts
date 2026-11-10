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

/**
 * Nombre para comparar sin depender de mayúsculas, acentos ni espacios dobles
 * («WENDY  MENA MORENO» y «Wendy Mena Moreno» son la misma persona).
 */
export function normalizarNombre(nombre: string | null | undefined): string {
  return (nombre ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ¿Es una cuenta de prueba o genérica del equipo (no una persona)? Se identifica
 * por el NOMBRE —no hay un campo que las marque— con tres formas:
 *   - lleva «prueba» o «pruebas» (p. ej. «Camilo Perez Rojo Pruebas»);
 *   - es «Russell <número>» (las cuentas compartidas «Russell 1», «Russell 2»…);
 *   - es «Administrador Russell».
 *
 * «Prueba» se busca al inicio de una palabra, para que no atrape a quien tenga
 * un apellido que simplemente contenga esas letras. Solo la usa el indicador de
 * usuarios activos: el resto del reporte no excluye estas cuentas.
 */
export function esCuentaDePrueba(nombre: string | null | undefined): boolean {
  const n = normalizarNombre(nombre);
  if (!n) return false;
  return /\bpruebas?/.test(n) || /^russell \d+$/.test(n) || n === "administrador russell";
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
