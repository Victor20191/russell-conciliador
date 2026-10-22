// Ayuda en pantalla — qué ficha corresponde a la ruta actual (puro).

import { descriptorModulo, MODULOS_IMPORT } from "@/lib/modulos/descriptores";

export type FichaId =
  | "balance.listado"
  | "balance.detalle"
  | "balance.diff"
  | "balance.terceros"
  | "balance.borradores"
  | "balance.borrador"
  | "modulo.cargados"
  | "modulo.borradores"
  | "modulo.borrador"
  | "modulo.patrones"
  | "modulo.patrones_manuales"
  | "modulo.cargue"
  | "catalogo.plan_russell"
  | "catalogo.mapeo_cliente"
  | "catalogo.conceptos_nomina"
  | "equipo.clientes"
  | "equipo.usuarios"
  | "equipo.estructura"
  | "equipo.perfil"
  | "parametros.filtros_cuentas"
  | "parametros.alertas"
  | "soporte.mesa_ayuda";

/** La ficha de la ruta y, en las fichas por módulo, el código del módulo en mayúsculas («NOM»). */
export type AyudaResuelta = { fichaId: FichaId; modulo?: string };

const ENTERO = /^[1-9]\d*$/;

/** Rutas de una sola pantalla, sin parámetros. */
const RUTAS_FIJAS: Readonly<Record<string, FichaId>> = {
  "config/mapeo": "catalogo.plan_russell",
  "config/mapeo-cliente": "catalogo.mapeo_cliente",
  "config/conceptos-nomina": "catalogo.conceptos_nomina",
  "config/clientes": "equipo.clientes",
  "config/usuarios": "equipo.usuarios",
  estructura: "equipo.estructura",
  perfil: "equipo.perfil",
  "config/parametros": "parametros.alertas",
  reportes: "soporte.mesa_ayuda",
};

/** La ficha de ayuda de una ruta, o null si la pantalla aún no tiene ayuda. */
export function resolverAyuda(pathname: string): AyudaResuelta | null {
  const s = pathname.split("?")[0]!.split("/").filter(Boolean);
  const fija = RUTAS_FIJAS[s.join("/")];
  if (fija) return { fichaId: fija };
  if (s[0] === "balance") return resolverBalance(s.slice(1));
  if (s[0] === "modulos" && s[1]) {
    const modulo = descriptorModulo(s[1].toUpperCase())?.codigo;
    if (!modulo) return null;
    const fichaId = resolverModulo(s.slice(2));
    return fichaId ? { fichaId, modulo } : null;
  }
  // Filtros de cuentas: uno por módulo; sin módulo la página lleva al primero del menú (Ingresos).
  if (s[0] === "config" && s[1] === "prevalidador" && s.length <= 3) {
    const modulo = s[2] ? descriptorModulo(s[2].toUpperCase())?.codigo : "ING";
    return modulo ? { fichaId: "parametros.filtros_cuentas", modulo } : null;
  }
  // El detalle de una novedad es la misma Mesa de ayuda.
  if (s[0] === "reportes" && s.length === 2 && ENTERO.test(s[1]!)) return { fichaId: "soporte.mesa_ayuda" };
  return null;
}

function resolverBalance(s: string[]): AyudaResuelta | null {
  if (s.length === 0) return { fichaId: "balance.listado" };
  if (s[0] === "borradores") {
    if (s.length === 1) return { fichaId: "balance.borradores" };
    return s.length === 2 ? { fichaId: "balance.borrador" } : null;
  }
  if (!ENTERO.test(s[0]!)) return null;
  if (s.length === 1) return { fichaId: "balance.detalle" };
  if (s.length === 2 && s[1] === "diff") return { fichaId: "balance.diff" };
  if (s.length === 2 && s[1] === "terceros") return { fichaId: "balance.terceros" };
  return null;
}

function resolverModulo(s: string[]): FichaId | null {
  if (s.length === 0) return "modulo.cargados";
  if (s[0] === "borradores") {
    if (s.length === 1) return "modulo.borradores";
    return s.length === 2 ? "modulo.borrador" : null;
  }
  // Nuevo patrón (`/patrones/nueva`) y la edición de una versión comparten la ficha de patrones.
  if (s[0] === "patrones") return s.length <= 2 ? "modulo.patrones" : null;
  if (s[0] === "patrones-manuales") return s.length === 1 ? "modulo.patrones_manuales" : null;
  if (s.length === 1 && ENTERO.test(s[0]!)) return "modulo.cargue";
  return null;
}

/** Los módulos en el orden del menú (para elegir uno por defecto). */
export const CODIGOS_MODULOS = Object.values(MODULOS_IMPORT).map((d) => d.codigo);
