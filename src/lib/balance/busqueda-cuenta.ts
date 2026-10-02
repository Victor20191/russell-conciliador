import { coincideComodin, tieneComodin } from "@/lib/filtro-comodin";

function normalizarTextoBusqueda(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Los códigos se buscan desde su primera posición, no por fragmentos internos. Un `*` (o `?`) vale
 * UN carácter cualquiera en esa posición: «**25» trae 112505 y 11250501, pero no 110510.
 */
export function codigoEmpiezaPor(
  codigo: string | null | undefined,
  entrada: string,
): boolean {
  const prefijo = normalizarTextoBusqueda(entrada);
  if (prefijo === "") return true;
  if (tieneComodin(prefijo)) return coincideComodin(codigo, prefijo);
  return normalizarTextoBusqueda(codigo).startsWith(prefijo);
}

/**
 * Búsqueda compartida de las tablas de balance: prefijo para códigos (con comodín de posición) y
 * coincidencia parcial para el nombre de la cuenta. Con comodines solo se buscan códigos: un `*`
 * en el nombre de una cuenta no significa nada.
 */
export function coincideBusquedaCuenta(
  codigos: readonly (string | null | undefined)[],
  nombre: string | null | undefined,
  entrada: string,
): boolean {
  const busqueda = normalizarTextoBusqueda(entrada);
  if (busqueda === "") return true;
  if (tieneComodin(busqueda)) return codigos.some((codigo) => coincideComodin(codigo, busqueda));

  return codigos.some((codigo) => normalizarTextoBusqueda(codigo).startsWith(busqueda))
    || normalizarTextoBusqueda(nombre).includes(busqueda);
}
