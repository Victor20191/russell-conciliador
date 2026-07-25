// Cruce determinista: novedades liberadas ↔ evidencia de uso en la bitácora.
// Puro y testeable: no toca BD ni IA.

import {
  ETIQUETA_FAMILIA,
  familiaDesdeModulo,
  type FamiliaProceso,
} from "./metricas";

export type EstadoAdopcion = "usada" | "sin_evidencia" | "no_medible";

export type CambioNovedadContexto = {
  versionNumero: string;
  versionTitulo: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  modulo: string | null;
  ruta: string | null;
  comoOperar: string | null;
  ejemplo: string | null;
  estadoFuncionalidad: string;
};

export type ItemAdopcion = {
  versionNumero: string;
  versionTitulo: string;
  titulo: string;
  tipo: string;
  modulo: string | null;
  ruta: string | null;
  familia: FamiliaProceso | null;
  familiaEtiqueta: string | null;
  accionesEnPeriodo: number;
  estado: EstadoAdopcion;
  estadoEtiqueta: string;
};

export type ResumenAdopcion = {
  totalCambios: number;
  evaluables: number;
  usadas: number;
  sinEvidencia: number;
  noMedibles: number;
  /** Porcentaje 0–100 sobre evaluables; null si no hay evaluables. */
  porcentajeAdopcion: number | null;
  items: ItemAdopcion[];
  porEstado: Array<{ nombre: string; total: number }>;
};

const ETIQUETA_ESTADO: Record<EstadoAdopcion, string> = {
  usada: "Usada en el período",
  sin_evidencia: "Sin evidencia de uso",
  no_medible: "No medible con bitácora",
};

export function evaluarAdopcion(params: {
  cambios: CambioNovedadContexto[];
  conteosPorFamilia: Record<FamiliaProceso, number>;
}): ResumenAdopcion {
  const items: ItemAdopcion[] = params.cambios.map((c) => {
    const familia = familiaDesdeModulo(c.modulo);
    if (!familia) {
      return {
        versionNumero: c.versionNumero,
        versionTitulo: c.versionTitulo,
        titulo: c.titulo,
        tipo: c.tipo,
        modulo: c.modulo,
        ruta: c.ruta,
        familia: null,
        familiaEtiqueta: null,
        accionesEnPeriodo: 0,
        estado: "no_medible" as const,
        estadoEtiqueta: ETIQUETA_ESTADO.no_medible,
      };
    }
    const acciones = params.conteosPorFamilia[familia] ?? 0;
    const estado: EstadoAdopcion = acciones > 0 ? "usada" : "sin_evidencia";
    return {
      versionNumero: c.versionNumero,
      versionTitulo: c.versionTitulo,
      titulo: c.titulo,
      tipo: c.tipo,
      modulo: c.modulo,
      ruta: c.ruta,
      familia,
      familiaEtiqueta: ETIQUETA_FAMILIA[familia],
      accionesEnPeriodo: acciones,
      estado,
      estadoEtiqueta: ETIQUETA_ESTADO[estado],
    };
  });

  const usadas = items.filter((i) => i.estado === "usada").length;
  const sinEvidencia = items.filter((i) => i.estado === "sin_evidencia").length;
  const noMedibles = items.filter((i) => i.estado === "no_medible").length;
  const evaluables = usadas + sinEvidencia;
  const porcentajeAdopcion =
    evaluables === 0 ? null : Math.round((usadas / evaluables) * 1000) / 10;

  return {
    totalCambios: items.length,
    evaluables,
    usadas,
    sinEvidencia,
    noMedibles,
    porcentajeAdopcion,
    items,
    porEstado: [
      { nombre: ETIQUETA_ESTADO.usada, total: usadas },
      { nombre: ETIQUETA_ESTADO.sin_evidencia, total: sinEvidencia },
      { nombre: ETIQUETA_ESTADO.no_medible, total: noMedibles },
    ],
  };
}
