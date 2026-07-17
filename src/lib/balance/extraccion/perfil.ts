// Conversión entre el MappingSpec del pipeline y el PERFIL de carga persistido
// (`perfiles_carga_balance`, spec aplanado en columnas tipadas). Puro y testeable:
// no toca BD — la Server Action lee/escribe el modelo Prisma y usa estos helpers.
import type { ConvencionSigno, MappingSpec, SpecCarga } from "./esquema";

// Espejo 1:1 de las columnas de layout del modelo Prisma `PerfilCargaBalance`
// (sin id/clienteId/huella/metadatos): un objeto listo para esparcir en el upsert.
export type PerfilPlano = {
  hoja: string;
  filaEncabezado: number;
  primeraFilaDatos: number;
  colCodigo: number;
  colNombre: number;
  colSaldoInicial: number;
  colDebitos: number;
  colCreditos: number;
  colSaldoFinal: number;
  colSaldoFinalDebito: number;
  colSaldoFinalCredito: number;
  colTercero: number;
  signoCredito: ConvencionSigno;
  reglaDetalleTipo: "prefijo" | "columna";
  reglaDetalleColumna: number | null;
  reglaDetalleValor: string | null;
  agregarPorTercero: boolean;
};

/** Aplana el spec (o un MappingSpec completo) a las columnas del perfil. */
export function aplanarSpec(spec: SpecCarga): PerfilPlano {
  return {
    hoja: spec.hoja,
    filaEncabezado: spec.filaEncabezado,
    primeraFilaDatos: spec.primeraFilaDatos,
    colCodigo: spec.columnas.codigo,
    colNombre: spec.columnas.nombre,
    colSaldoInicial: spec.columnas.saldoInicial,
    colDebitos: spec.columnas.debitos,
    colCreditos: spec.columnas.creditos,
    colSaldoFinal: spec.columnas.saldoFinal,
    colSaldoFinalDebito: spec.columnas.saldoFinalDebito,
    colSaldoFinalCredito: spec.columnas.saldoFinalCredito,
    colTercero: spec.columnas.tercero,
    signoCredito: spec.signoCredito,
    reglaDetalleTipo: spec.reglaDetalle.tipo,
    reglaDetalleColumna: spec.reglaDetalle.columna,
    reglaDetalleValor: spec.reglaDetalle.valor,
    agregarPorTercero: spec.agregarPorTercero,
  };
}

/** El SpecCarga contenido en un perfil plano (para persistir en el lote/editor). */
export function specCargaDesdePerfil(p: PerfilPlano): SpecCarga {
  return {
    hoja: p.hoja,
    filaEncabezado: p.filaEncabezado,
    primeraFilaDatos: p.primeraFilaDatos,
    columnas: {
      codigo: p.colCodigo,
      nombre: p.colNombre,
      saldoInicial: p.colSaldoInicial,
      debitos: p.colDebitos,
      creditos: p.colCreditos,
      saldoFinal: p.colSaldoFinal,
      saldoFinalDebito: p.colSaldoFinalDebito,
      saldoFinalCredito: p.colSaldoFinalCredito,
      tercero: p.colTercero,
    },
    signoCredito: p.signoCredito,
    reglaDetalle: {
      tipo: p.reglaDetalleTipo,
      columna: p.reglaDetalleColumna,
      valor: p.reglaDetalleValor,
    },
    agregarPorTercero: p.agregarPorTercero,
  };
}

/**
 * Reconstruye un MappingSpec COMPLETO desde el perfil, con metadatos neutros:
 * importable, confianza 1 (el perfil ya fue validado al guardarse), sin
 * excepciones, y cabecera sin determinar (el NIT lo aporta `detectarNit` y el
 * estándar/período los parámetros del asistente vía `resolverCabecera`).
 */
export function specDesdePerfil(p: PerfilPlano): MappingSpec {
  return {
    ...specCargaDesdePerfil(p),
    nit: { valor: null, fuente: "NINGUNO" },
    periodoInicial: { valor: null, fuente: "NINGUNO" },
    periodoFinal: { valor: null, fuente: "NINGUNO" },
    estandar: "AUTO",
    importable: true,
    motivoNoImportable: null,
    excepciones: [],
    confianza: 1,
    notas: "Perfil de carga guardado del cliente",
  };
}
