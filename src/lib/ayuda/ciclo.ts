// Ayuda en pantalla — el ciclo del cliente: los pasos del trabajo, en orden, con quién hace cada
// uno y dónde (puro). Cada paso usa la MISMA regla que la acción de su ficha (lo comprueba una
// prueba), así que sus roles salen de la matriz como en el resto de la ayuda.

import { normalizarBusqueda } from "./buscar";
import { PANTALLAS } from "./pantallas";
import { REGLAS } from "./reglas";
import type { AyudaResuelta, FichaId } from "./resolver";
import type { Regla } from "./tipos";

export type LugarPaso = { fichaId: FichaId; pestana?: string };

export type PasoCiclo = {
  titulo: string;
  descripcion: string;
  regla: Regla;
  /** Dónde se hace (el primero es el de la acción); marca «estás aquí». */
  donde: readonly LugarPaso[];
  /** La pantalla a la que lleva «Ir a la pantalla» (los detalles se abren desde su listado). */
  irA: FichaId;
};

export const PASOS_CICLO: readonly PasoCiclo[] = [
  {
    titulo: "Asignar el equipo del cliente",
    descripcion: "En la ficha del cliente se eligen su gerente, su senior y su staff: así cada uno ve y opera ese cliente.",
    regla: REGLAS.configurarCliente,
    donde: [{ fichaId: "equipo.clientes" }],
    irA: "equipo.clientes",
  },
  {
    titulo: "Cargar el balance",
    descripcion: "Se sube el archivo del ERP y se revisa la lectura antes de pasarla al borrador.",
    regla: REGLAS.cargarBalance,
    donde: [{ fichaId: "balance.listado" }],
    irA: "balance.listado",
  },
  {
    titulo: "Revisar el borrador y cargarlo",
    descripcion: "Se corrige la lectura, se justifica un descuadre si lo hay y se carga como balance oficial.",
    regla: REGLAS.cargarBalance,
    donde: [{ fichaId: "balance.borrador" }, { fichaId: "balance.borradores" }],
    irA: "balance.borradores",
  },
  {
    titulo: "Homologar al Plan Russell",
    descripcion: "Cada cuenta del cliente queda con su cuenta Russell; lo homologado se recuerda para las próximas cargas.",
    regla: REGLAS.revisarBalance,
    donde: [{ fichaId: "balance.detalle", pestana: "breakdown" }, { fichaId: "catalogo.mapeo_cliente" }],
    irA: "balance.listado",
  },
  {
    titulo: "Dar OK a la naturaleza contraria",
    descripcion: "Cada saldo contrario a su naturaleza, por encima del umbral, se valida con un comentario.",
    regla: REGLAS.cargarBalance,
    donde: [{ fichaId: "balance.detalle", pestana: "breakdown" }],
    irA: "balance.listado",
  },
  {
    titulo: "Aprobar el prevalidador",
    descripcion: "Se revisa que la homologación respete la naturaleza de las cuentas y se aprueba con una justificación.",
    regla: REGLAS.revisarBalance,
    donde: [{ fichaId: "balance.detalle", pestana: "prevalidador" }],
    irA: "balance.listado",
  },
  {
    titulo: "Cerrar el balance",
    descripcion: "Queda inmutable y disponible para que los módulos concilien contra él.",
    regla: REGLAS.revisarBalance,
    donde: [{ fichaId: "balance.detalle" }],
    irA: "balance.listado",
  },
  {
    titulo: "Cargar los archivos del módulo",
    descripcion: "Se sube cada archivo del módulo, se revisa su borrador y se confirma la carga.",
    regla: REGLAS.cargarModulo,
    donde: [{ fichaId: "modulo.cargados" }, { fichaId: "modulo.borradores" }, { fichaId: "modulo.borrador" }],
    irA: "modulo.cargados",
  },
  {
    titulo: "Asignar cuentas en el Consolidado",
    descripcion: "Cada grupo del archivo queda con su cuenta Russell; se recuerda para los próximos meses del cliente.",
    regla: REGLAS.editarModulo,
    donde: [{ fichaId: "modulo.cargue", pestana: "consolidado" }],
    irA: "modulo.cargados",
  },
  {
    titulo: "Marcar las diferencias",
    descripcion: "En el cruce contable, cada diferencia desde la tolerancia se documenta con una marca y sus soportes.",
    regla: REGLAS.editarModulo,
    donde: [{ fichaId: "modulo.cargue", pestana: "cruce" }, { fichaId: "modulo.cargue", pestana: "cruceTercero" }],
    irA: "modulo.cargados",
  },
  {
    titulo: "Comentar las alertas",
    descripcion: "En Novedades, cada tipo de alerta que lo exige lleva su comentario.",
    regla: REGLAS.comentarAlertaModulo,
    donde: [{ fichaId: "modulo.cargue", pestana: "novedades" }],
    irA: "modulo.cargados",
  },
  {
    titulo: "Cerrar la conciliación en firme",
    descripcion: "Deja en firme el saldo final de las cuentas del módulo y vuelve el cargue de solo lectura.",
    regla: REGLAS.cerrarConciliacion,
    donde: [{ fichaId: "modulo.cargue", pestana: "cruce" }],
    irA: "modulo.cargados",
  },
];

/**
 * ¿La pantalla ofrece la vista del ciclo? Solo Balance (con sus borradores) y los Módulos, donde
 * ocurre la operación (decisión del usuario); en catálogos, equipo, parametrización y demás, no.
 */
export function cicloDisponible(actual: AyudaResuelta | null): boolean {
  return !!actual && (actual.fichaId.startsWith("balance.") || actual.fichaId.startsWith("modulo."));
}

/** ¿El usuario está en una de las pantallas (y pestañas) del paso? */
export function estaEnPaso(paso: PasoCiclo, actual: AyudaResuelta | null, pestana: string | null): boolean {
  if (!actual) return false;
  return paso.donde.some((l) => l.fichaId === actual.fichaId && (!l.pestana || l.pestana === pestana));
}

/** El enlace del paso para el módulo dado. */
export function enlaceDePaso(paso: PasoCiclo, modulo: string): { href: string; permiso?: string } | null {
  const pantalla = PANTALLAS[paso.irA];
  return pantalla ? { href: pantalla.href(modulo), permiso: pantalla.permiso } : null;
}

/** Los pasos que coinciden con el texto (todos si está vacío), con su número original. */
export function filtrarPasos(texto: string): { numero: number; paso: PasoCiclo }[] {
  const palabras = normalizarBusqueda(texto).split(" ").filter(Boolean);
  return PASOS_CICLO.map((paso, i) => ({ numero: i + 1, paso })).filter(({ paso }) => {
    const pajar = normalizarBusqueda(`${paso.titulo} ${paso.descripcion}`);
    return palabras.every((p) => pajar.includes(p));
  });
}
