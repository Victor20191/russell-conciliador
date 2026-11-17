// AYUDA DE LA MATRIZ DE PERMISOS («Permisos por rol», /config/permisos) — puro, sin BD.
//
// Junto al nombre de cada renglón, qué abarca ese módulo de permisos:
//   - las pantallas del menú que abre: salen de `nav.ts` (el permiso con el que se entra a cada
//     una), así que no se desactualizan cuando el menú cambia;
//   - qué concede cada nivel del desplegable: las etiquetas de sus permisos, con el mismo reparto
//     por nivel que usa la matriz (`nivelDeAccion`);
//   - una nota escrita a mano con lo que el menú no dice: pantallas de otro renglón donde también
//     pesa, o el renglón del que depende algo que parece de este.
import type { NavItem } from "@/lib/nav";
import { NIVELES, nivelDeAccion, type Nivel } from "./niveles";

/** Un permiso de la fila, como lo trae la BD. */
export type PermisoAyuda = { code: string; action: string; label: string | null };

export type AyudaFilaMatriz = {
  /** Pantallas del menú a las que se entra con algún permiso de este renglón. */
  pantallas: string[];
  /** Qué concede cada nivel, del más bajo al más alto (cada nivel incluye los anteriores). */
  niveles: { nivel: Nivel; permisos: string[] }[];
  /** Lo que no se deduce del menú. */
  nota: string | null;
};

/** Permisos que existen en la BD pero que ninguna pantalla ni acción usa: no se listan. */
const PERMISOS_SIN_USO: ReadonlySet<string> = new Set(["mapeo:editar"]);

/**
 * Notas por renglón: dependencias entre renglones y pantallas donde un permiso pesa fuera de su
 * sección del menú. Describen cómo funciona hoy (el servidor es la autoridad).
 */
export const NOTAS_MATRIZ: Readonly<Record<string, string>> = {
  balance:
    "«Revisar balance» es homologar el balance cargado (también la memoria del cliente en Mapeo cuentas cliente), cerrarlo y abrirlo, y aprobar el prevalidador. Lo que toca los datos de un cliente vale solo en los clientes asignados; los administradores, en todos.",
  conciliaciones:
    "Además de esas pantallas, «Cerrar conciliación de módulo» y «Desbloquear» son el cierre en firme y su desbloqueo en los módulos de conciliación y en las revisiones de Impuestos · DIAN, y con «Cerrar» se aprueban las alertas que piden la aprobación del Senior. Solo valen en los clientes donde la persona es el senior o gerente asignado (los administradores, en todos).",
  impuestos:
    "Lo que toca una revisión vale en los clientes asignados. Cerrar en firme una revisión, o desbloquearla, no sale de este renglón: es «Cerrar» y «Desbloquear» de Conciliaciones.",
  mapeo:
    "Ver abre las dos pantallas. «Administrar» es editar el Plan Estándar Russell (cuentas, subcuentas y subgrupos), que vale para todos los clientes. Homologar en Mapeo cuentas cliente no sale de este renglón: es «Revisar balance» de Balance de comprobación, en los clientes asignados.",
  clientes:
    "«Editar datos operativos» vale en los clientes asignados. La ficha completa incluye nombre, NIT, tipo, socio y responsables.",
  parametros:
    "Vale para todos los clientes: las cuentas que concilia cada módulo con los prefijos del prevalidador, y los umbrales de las alertas.",
  publicacion_modulos: "Decide qué módulos se ven en el menú; no concede permisos.",
};

const moduloDePermiso = (permiso?: string): string | null => (permiso ? permiso.split(":")[0] : null);
const abreCon = (x: { permiso?: string; permisoAlterno?: string }, modulo: string): boolean =>
  moduloDePermiso(x.permiso) === modulo || moduloDePermiso(x.permisoAlterno) === modulo;

/**
 * Pantallas del menú que se abren con un permiso del módulo. Una entrada con hijos se nombra con
 * sus hijos entre paréntesis («Auditoría (Registro de acciones, …)»); un hijo de otra sección, con
 * su sección delante.
 */
export function pantallasDeModulo(modulo: string, nav: readonly NavItem[]): string[] {
  const salida: string[] = [];
  for (const item of nav) {
    const hijos = (item.children ?? []).filter((h) => abreCon(h, modulo)).map((h) => h.label).filter((l) => l !== item.label);
    if (abreCon(item, modulo)) salida.push(hijos.length > 0 ? `${item.label} (${hijos.join(", ")})` : item.label);
    else salida.push(...hijos.map((h) => `${item.label} › ${h}`));
  }
  return [...new Set(salida)];
}

/** La ayuda de un renglón de la matriz. */
export function ayudaFilaMatriz(modulo: string, permisos: readonly PermisoAyuda[], nav: readonly NavItem[]): AyudaFilaMatriz {
  const usados = permisos.filter((p) => !PERMISOS_SIN_USO.has(p.code));
  const niveles = NIVELES.filter((n) => n !== "ninguno")
    .map((nivel) => ({
      nivel,
      permisos: usados.filter((p) => nivelDeAccion(p.action) === nivel).map((p) => p.label?.trim() || p.code),
    }))
    .filter((n) => n.permisos.length > 0);
  return { pantallas: pantallasDeModulo(modulo, nav), niveles, nota: NOTAS_MATRIZ[modulo] ?? null };
}
