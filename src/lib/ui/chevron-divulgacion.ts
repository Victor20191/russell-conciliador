/**
 * Convención de producto para controles de expandir/contraer (árboles, secciones
 * colapsables, botones masivos «Expandir todo» / «Contraer todo»):
 *
 * - Abierto / expandido → chevron hacia abajo (`chev-d`)
 * - Cerrado / contraído → chevron hacia la derecha (`chev-r`)
 *
 * Los botones masivos usan el mismo icono que el estado sobre el que actúan
 * (el de las filas que el usuario «toca» al hacer clic en el botón):
 * - Expandir* → derecha (filas cerradas →)
 * - Contraer* / Colapsar* → abajo (filas abiertas ↓)
 *
 * No aplica a navegación, breadcrumbs, paginación ni dropdowns clásicos
 * (abajo↔arriba).
 */

export type ChevronDivulgacion = "chev-d" | "chev-r";

/** Icono según el estado de un control de divulgación (nodo, sección, grupo). */
export function chevronDivulgacion(abierto: boolean): ChevronDivulgacion {
  return abierto ? "chev-d" : "chev-r";
}

/**
 * Icono de los botones masivos: coincide con el estado de las filas que la
 * acción opera (cerradas → Expandir; abiertas → Contraer/Colapsar).
 */
export function chevronAccionMasiva(
  accion: "expandir" | "contraer",
): ChevronDivulgacion {
  return accion === "expandir" ? "chev-r" : "chev-d";
}
