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
 * un apellido que simplemente contenga esas letras. Quedan fuera de TODO el uso
 * reportado (`usuariosDelReporte`); solo el gasto de IA las sigue contando.
 */
export function esCuentaDePrueba(nombre: string | null | undefined): boolean {
  const n = normalizarNombre(nombre);
  if (!n) return false;
  return /\bpruebas?/.test(n) || /^russell \d+$/.test(n) || n === "administrador russell";
}

/**
 * Las cuentas cuyo uso SÍ se reporta: las del equipo de Russell, sin las de
 * Xentria ni las de prueba o genéricas. Antes las de prueba solo salían del
 * comparativo y el resto del tablero las contaba: en nov/2026 dos de ellas sumaban
 * 591 de las 1.471 acciones y aparecían en el top de usuarios como si fueran
 * personas del equipo.
 */
export function usuariosDelReporte<T extends UsuarioPlataforma>(usuarios: readonly T[]): T[] {
  return usuarios.filter((u) => !esCuentaInterna(u.email) && !esCuentaDePrueba(u.name));
}

/**
 * Las cuentas cuyo uso entra en el COMPARATIVO («¿Subió o bajó el uso?»): las
 * mismas del reporte. Con las de prueba dentro, una sola llegó a ser el 89 % de las
 * operaciones del período previo y el comparativo anunciaba una subida del 674 %
 * que era solo ese ruido.
 */
export function usuariosDelComparativo<T extends UsuarioPlataforma>(usuarios: readonly T[]): T[] {
  return usuariosDelReporte(usuarios);
}

/**
 * Nombres para `calcularResumenUso({ usuariosRegistrados })`: la bitácora guarda
 * el NOMBRE del actor, así que ese es el filtro efectivo. Lo que no esté aquí
 * (cuentas internas, de prueba, actores técnicos, usuarios borrados) queda fuera
 * del uso reportado.
 */
export function nombresDelReporte(usuarios: readonly UsuarioPlataforma[]): string[] {
  return usuariosDelReporte(usuarios).map((u) => u.name);
}

/**
 * Nombres cuyo consumo de IA entra en «Costos de IA»: todas las cuentas menos las
 * de Xentria. A diferencia del uso, las de prueba SÍ cuentan: lo que consumen se
 * paga igual.
 */
export function nombresDelGastoIA(usuarios: readonly UsuarioPlataforma[]): string[] {
  return usuarios.filter((u) => !esCuentaInterna(u.email)).map((u) => u.name);
}

/** Mapa nombre → correo de las cuentas del reporte. */
export function correosDelReporte(usuarios: readonly UsuarioPlataforma[]): Map<string, string> {
  return new Map(usuariosDelReporte(usuarios).map((u) => [u.name, u.email]));
}

/**
 * Cuentas de prueba que usa una persona del equipo y cuya actividad se SUMA a la
 * cuenta personal de esa persona (pedido de la gerencia, 23/Nov/2026): Camilo y
 * Yuli operan la plataforma como administradores desde su cuenta «Pruebas», y su
 * cuenta personal casi no tiene actividad. Por correo, porque el nombre de la
 * cuenta de prueba ya cambió una vez (se le agregó «Pruebas»).
 */
export const CUENTAS_QUE_SE_SUMAN: ReadonlyArray<{ deCorreo: string; aCorreo: string }> = [
  { deCorreo: "russell4@rbcol.co", aCorreo: "camiloperez@rbcol.co" }, // Camilo Pérez Rojo
  { deCorreo: "russell@russellbedford.com.co", aCorreo: "yuliatehortua@rbcol.co" }, // Yuli Andrea Atehortúa Giraldo
];

export type CuentaSumada<T> = {
  /** La cuenta personal: la que se mide y la que aparece en el reporte. */
  persona: T;
  /** La cuenta de prueba cuya actividad se le suma. */
  cuenta: T;
  /**
   * Nombres (normalizados) con los que la bitácora registra a la cuenta de prueba:
   * el actual y el que tenía antes de llevar «Pruebas», salvo que ese sea el de
   * otra cuenta.
   */
  nombres: string[];
};

const sinPalabraPruebas = (nombre: string): string =>
  normalizarNombre(nombre.replace(/\bpruebas?\b/gi, " "));

/** Las cuentas de prueba que se suman a una persona, cuando las dos cuentas existen. */
export function cuentasSumadas<T extends UsuarioPlataforma>(usuarios: readonly T[]): CuentaSumada<T>[] {
  const porCorreo = new Map(usuarios.map((u) => [u.email.trim().toLowerCase(), u]));
  const nombresDeCuentas = new Set(usuarios.map((u) => normalizarNombre(u.name)));
  return CUENTAS_QUE_SE_SUMAN.flatMap(({ deCorreo, aCorreo }) => {
    const cuenta = porCorreo.get(deCorreo);
    const persona = porCorreo.get(aCorreo);
    if (!cuenta || !persona || cuenta === persona) return [];
    const actual = normalizarNombre(cuenta.name);
    const anterior = sinPalabraPruebas(cuenta.name);
    const nombres = [actual];
    if (anterior && anterior !== actual && !nombresDeCuentas.has(anterior)) nombres.push(anterior);
    return [{ persona, cuenta, nombres }];
  });
}

/** Nombre de la bitácora (normalizado) → nombre de la cuenta personal a la que se suma. */
export function aliasDeActores(usuarios: readonly UsuarioPlataforma[]): Map<string, string> {
  const alias = new Map<string, string>();
  for (const { persona, nombres } of cuentasSumadas(usuarios)) {
    for (const nombre of nombres) alias.set(nombre, persona.name);
  }
  return alias;
}

/** El actor como debe contarse en el reporte: el de la cuenta personal si se le suma. */
export function actorUnificado(nombre: string, alias: ReadonlyMap<string, string>): string {
  return alias.get(normalizarNombre(nombre)) ?? nombre;
}

/** Los mismos eventos, con el actor de las cuentas que se suman ya pasado a la persona. */
export function unificarActores<T extends { user: string }>(
  eventos: readonly T[],
  alias: ReadonlyMap<string, string>,
): T[] {
  if (alias.size === 0) return [...eventos];
  return eventos.map((e) => {
    const user = actorUnificado(e.user, alias);
    return user === e.user ? e : { ...e, user };
  });
}
