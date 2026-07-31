/**
 * Convención de producto para controles de expandir/contraer (árboles, secciones
 * colapsables y botones masivos «Expandir todo» / «Contraer todo»):
 *
 * - Abierto / expandido → chevron hacia abajo (`chev-d`)
 * - Cerrado / contraído → chevron hacia la derecha (`chev-r`)
 *
 * En una misma sección, todos los botones masivos muestran el estado ACTUAL
 * compartido del contenido, no la acción que ejecutará cada botón. Un estado
 * parcialmente expandido se considera abierto.
 *
 * No aplica a navegación, breadcrumbs, paginación ni dropdowns clásicos
 * (abajo↔arriba).
 */

export type ChevronDivulgacion = "chev-d" | "chev-r";

/** Icono según el estado de un control de divulgación (nodo, sección, grupo). */
export function chevronDivulgacion(abierto: boolean): ChevronDivulgacion {
  return abierto ? "chev-d" : "chev-r";
}
