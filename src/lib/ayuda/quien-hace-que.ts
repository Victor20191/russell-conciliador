// Ayuda en pantalla — «¿Quién hace qué?»: las acciones de las fichas por rol de la operación
// (puro). Se arma de las MISMAS fichas y reglas que la ayuda de cada pantalla: no es otra fuente.
// No se muestra en el panel (decisión del usuario): alimenta un documento aparte, para que Russell
// lo revise y valide.

import { ROLES_ALCANCE_GLOBAL } from "@/lib/rbac/jerarquia";
import { normalizarBusqueda } from "./buscar";
import { fichaAyuda } from "./fichas";
import { PANTALLAS } from "./pantallas";
import type { FichaId } from "./resolver";
import { rolesDeRegla, ROLES_OPERACION, type RolesAyuda } from "./roles";
import type { AccionAyuda } from "./tipos";

export type RolOperacion = (typeof ROLES_OPERACION)[number];

/** Si el rol puede la acción y si es solo en sus clientes. */
export type CeldaRol = { puede: boolean; enSusClientes: boolean };

export type FilaQuienHaceQue = {
  accion: string;
  /** Pestaña de la pantalla donde está la acción, si no es de la pantalla entera. */
  pestana: string | null;
  roles: Record<RolOperacion, CeldaRol>;
  /** Solo la hace la administración (ningún rol de la operación). */
  soloAdministracion: boolean;
  /** La hacen los cuatro roles de la operación. */
  todos: boolean;
};

export type PantallaQuienHaceQue = { fichaId: FichaId; titulo: string; href: string | null; permiso?: string; filas: FilaQuienHaceQue[] };
export type AreaQuienHaceQue = { titulo: string; pantallas: PantallaQuienHaceQue[] };

/** Las áreas en el orden del menú. Las de módulos se arman con el módulo elegido. */
export const AREAS_QUIEN_HACE_QUE: readonly { titulo: string; fichas: readonly FichaId[] }[] = [
  {
    titulo: "Balance de comprobación",
    fichas: ["balance.listado", "balance.detalle", "balance.diff", "balance.terceros", "balance.borradores", "balance.borrador"],
  },
  {
    titulo: "Módulos de conciliación",
    fichas: ["modulo.cargados", "modulo.borradores", "modulo.borrador", "modulo.cargue", "modulo.patrones", "modulo.patrones_manuales"],
  },
  { titulo: "Catálogos contables", fichas: ["catalogo.plan_russell", "catalogo.mapeo_cliente", "catalogo.conceptos_nomina"] },
  { titulo: "Clientes y equipo", fichas: ["equipo.clientes", "equipo.usuarios", "equipo.estructura", "equipo.perfil"] },
  { titulo: "Parametrización", fichas: ["parametros.filtros_cuentas", "parametros.alertas"] },
  { titulo: "Mesa de ayuda", fichas: ["soporte.mesa_ayuda"] },
];

function fila(accion: AccionAyuda, pestana: string | null, roles: RolesAyuda): FilaQuienHaceQue {
  const lista = rolesDeRegla(accion.regla, roles);
  const operacion = lista.filter((r) => !ROLES_ALCANCE_GLOBAL.has(r.rol));
  const celdas = Object.fromEntries(
    ROLES_OPERACION.map((rol) => {
      const r = operacion.find((x) => x.rol === rol);
      return [rol, { puede: !!r, enSusClientes: r?.alcance === "propios" }];
    }),
  ) as Record<RolOperacion, CeldaRol>;
  return {
    accion: accion.nombre,
    pestana,
    roles: celdas,
    soloAdministracion: operacion.length === 0 && lista.length > 0,
    todos: operacion.length === ROLES_OPERACION.length,
  };
}

/**
 * La tabla por área y pantalla. Sin `incluirTodos`, deja fuera lo que pueden hacer los cuatro roles
 * (consultar, buscar, exportar…), que no distingue a nadie. `texto` filtra sin tildes por acción,
 * pestaña o pantalla.
 */
export function quienHaceQue(
  roles: RolesAyuda,
  modulo: string,
  opciones: { incluirTodos?: boolean; texto?: string } = {},
): AreaQuienHaceQue[] {
  const palabras = normalizarBusqueda(opciones.texto ?? "").split(" ").filter(Boolean);
  const coincide = (...t: (string | null)[]) => {
    const pajar = normalizarBusqueda(t.filter(Boolean).join(" "));
    return palabras.every((p) => pajar.includes(p));
  };
  return AREAS_QUIEN_HACE_QUE.flatMap((area) => {
    const pantallas = area.fichas.flatMap((fichaId) => {
      const ficha = fichaAyuda({ fichaId, modulo });
      if (!ficha) return [];
      const filas = [
        ...ficha.etapas.flatMap((e) => e.acciones.map((a) => fila(a, null, roles))),
        ...(ficha.pestanas ?? []).flatMap((p) => p.etapas.flatMap((e) => e.acciones.map((a) => fila(a, p.titulo, roles)))),
      ].filter((f) => (opciones.incluirTodos || !f.todos) && coincide(f.accion, f.pestana, ficha.titulo));
      if (filas.length === 0) return [];
      const pantalla = PANTALLAS[fichaId];
      return [{ fichaId, titulo: ficha.titulo, href: pantalla ? pantalla.href(modulo) : null, permiso: pantalla?.permiso, filas }];
    });
    return pantallas.length > 0 ? [{ titulo: area.titulo, pantallas }] : [];
  });
}
