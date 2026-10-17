// Búsqueda dentro del PUC de un cliente (`/config/mapeo-cliente` › «Mapeo cuentas cliente»).
// Lógica PURA: la pantalla le pasa el término escrito y las cuentas; aquí se decide
// cuáles coinciden. Existe porque «para encontrar una cuenta específica había que
// buscar balance por balance»: la barra busca sobre el PUC completo acumulado.

import { coincideComodin, tieneComodin } from "@/lib/filtro-comodin";

export type CuentaBuscable = { code: string; name: string; cuenta6Russell: string | null };

/** Término sin espacios sobrantes, mayúsculas ni tildes: «depreciación» encuentra «DEPRECIACION». */
export function normalizarBusqueda(texto: string): string {
  return texto.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * ¿La cuenta coincide con el término (ya normalizado con `normalizarBusqueda`)?
 *
 * - Término con COMODÍN (`*` o `?`) → posición en el código del cliente o de su cuenta
 *   estándar, anclada al principio: «**05» trae 110505, 110510 y 11051001 (0 y 5 en los
 *   dígitos 3 y 4). Solo códigos: un `*` en un nombre no significa nada.
 * - Término NUMÉRICO → PREFIJO del código del cliente o de su cuenta estándar: es el
 *   modelo mental contable («las que empiezan por…»), así «6165» trae todo el
 *   subárbol y «151605» todas las cuentas homologadas a esa estándar. Un
 *   `includes` traería ruido de códigos que contienen las cifras en el medio.
 * - Término con letras → aparece en el nombre del ERP o en el de la cuenta estándar,
 *   sin distinguir mayúsculas ni tildes.
 * - Término vacío → coincide todo.
 */
export function coincideBusquedaPuc(
  cuenta: CuentaBuscable,
  termino: string,
  nombresEstandar?: ReadonlyMap<string, string>,
): boolean {
  if (!termino) return true;
  if (tieneComodin(termino)) {
    return coincideComodin(cuenta.code, termino) || (!!cuenta.cuenta6Russell && coincideComodin(cuenta.cuenta6Russell, termino));
  }
  if (/^\d+$/.test(termino)) {
    return cuenta.code.startsWith(termino) || (cuenta.cuenta6Russell ?? "").startsWith(termino);
  }
  if (normalizarBusqueda(cuenta.name).includes(termino)) return true;
  const nombreEstandar = cuenta.cuenta6Russell ? nombresEstandar?.get(cuenta.cuenta6Russell) ?? "" : "";
  return normalizarBusqueda(nombreEstandar).includes(termino);
}
