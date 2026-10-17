// ALERTAS QUE EXIGEN COMENTARIO para cerrar la conciliación de un módulo (17/Oct/2026) — puro, sin BD.
//
// Algunas validaciones del archivo no bloquean la carga ni el cruce, pero alguien tiene que dejar
// constancia de que las miró: para cerrar la conciliación, cada TIPO de alerta presente en el cargue
// necesita un comentario (mínimo 10 caracteres). El comentario vive por (cliente, módulo, período,
// tipo) —como las marcas, sobrevive a las versiones nuevas— y congela cuántas referencias y qué
// valor tenía la alerta cuando se escribió: si una versión nueva o un archivo agregado los cambia,
// queda «por revisar» y vuelve a impedir el cierre hasta que alguien lo confirme o lo edite.
//
// Qué tipos exigen comentario lo declara cada descriptor (`alertasConComentario`): Inventarios
// (negativos y costo) y Cartera y CxP (las validaciones del auxiliar por tercero).
import type { DescriptorModulo } from "./descriptores";
import { ALERTAS_COSTO, detectarAlertasCosto, detectarNegativos, type FilaValidable, type TipoAlertaCosto } from "./validaciones";
import type { ValidacionesTercero } from "./cartera/validaciones-tercero";
import { diasEntre } from "./cartera/fecha-corte";
import type { ValidacionesActivos } from "./activos/validaciones-activos";

/** Cartera y CxP: validaciones del auxiliar por tercero que exigen comentario. */
export type TipoAlertaTercero =
  | "documentos_vs_cliente"
  | "edades_vs_total"
  | "saldo_contrario_tercero"
  | "dias_vs_corte"
  | "edad_vs_corte"
  | "corte_deducido";

/** Activos fijos: validaciones por activo que exigen comentario. */
export type TipoAlertaActivos = "activos_negativos" | "falta_costo";

/** Tipos de alerta que pueden exigir comentario. */
export type TipoAlertaComentario = "valores_negativos" | TipoAlertaCosto | TipoAlertaTercero | TipoAlertaActivos;

export type UnidadAlerta = { uno: string; varios: string };
const ITEMS: UnidadAlerta = { uno: "ítem", varios: "ítems" };
const DOCUMENTOS: UnidadAlerta = { uno: "documento", varios: "documentos" };

/** Nombre, unidad de lo que se cuenta y si el valor se lee como pesos. En el orden de presentación. */
const DEFINICIONES: { tipo: TipoAlertaComentario; etiqueta: string; unidad: UnidadAlerta; muestraValor: boolean }[] = [
  { tipo: "valores_negativos", etiqueta: "Valores negativos", unidad: ITEMS, muestraValor: false },
  ...ALERTAS_COSTO.map((a) => ({ tipo: a.tipo, etiqueta: a.etiqueta, unidad: { uno: "referencia", varios: "referencias" }, muestraValor: true })),
  { tipo: "documentos_vs_cliente", etiqueta: "Documentos vs. total del cliente", unidad: { uno: "tercero", varios: "terceros" }, muestraValor: true },
  { tipo: "edades_vs_total", etiqueta: "Edades vs. total", unidad: { uno: "fila", varios: "filas" }, muestraValor: true },
  { tipo: "saldo_contrario_tercero", etiqueta: "Saldo contrario a la naturaleza", unidad: { uno: "saldo", varios: "saldos" }, muestraValor: true },
  { tipo: "dias_vs_corte", etiqueta: "Días vencidos vs. corte", unidad: DOCUMENTOS, muestraValor: false },
  { tipo: "edad_vs_corte", etiqueta: "Rango de edad vs. corte", unidad: DOCUMENTOS, muestraValor: false },
  { tipo: "corte_deducido", etiqueta: "Fecha de corte deducida", unidad: { uno: "fecha", varios: "fechas" }, muestraValor: false },
  { tipo: "activos_negativos", etiqueta: "Activos con costo o neto negativo", unidad: { uno: "activo", varios: "activos" }, muestraValor: true },
  { tipo: "falta_costo", etiqueta: "Depreciación sin costo de adquisición", unidad: { uno: "cargue", varios: "cargues" }, muestraValor: false },
];
const POR_TIPO = new Map(DEFINICIONES.map((d) => [d.tipo, d]));
const ORDEN: TipoAlertaComentario[] = DEFINICIONES.map((d) => d.tipo);

export const MIN_COMENTARIO_ALERTA = 10;
export const MAX_COMENTARIO_ALERTA = 2000;

export function esTipoAlertaComentario(valor: unknown): valor is TipoAlertaComentario {
  return typeof valor === "string" && POR_TIPO.has(valor as TipoAlertaComentario);
}

export function etiquetaAlertaComentario(tipo: TipoAlertaComentario): string {
  return POR_TIPO.get(tipo)!.etiqueta;
}

/** Una alerta presente en el cargue: cuántas referencias la tienen y su valor (la huella del cambio). */
export type AlertaComentable = {
  tipo: TipoAlertaComentario;
  etiqueta: string;
  /** Casos que la tienen, contados como los lista Novedades. */
  referencias: number;
  /**
   * La otra mitad de la huella del cambio. Costo: Σ del valor total; negativos: Σ de los
   * negativos; documentos y edades: Σ de las diferencias; saldo contrario: Σ de los saldos; fecha
   * de corte deducida: días entre el corte del cargue y la fecha deducida. Días y rangos: 0.
   */
  valor: number;
  /** Qué se cuenta («documento» / «documentos»). */
  unidad: UnidadAlerta;
  /** El valor se lee como pesos (si no, la pantalla solo muestra el conteo). */
  muestraValor: boolean;
  /** Texto que reemplaza el conteo cuando lo dice mejor (la fecha de corte deducida). */
  detalle?: string;
};

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

function alerta(tipo: TipoAlertaComentario, referencias: number, valor: number, detalle?: string): AlertaComentable {
  const def = POR_TIPO.get(tipo)!;
  return {
    tipo,
    etiqueta: def.etiqueta,
    referencias,
    valor: redondear(valor),
    unidad: def.unidad,
    muestraValor: def.muestraValor,
    ...(detalle ? { detalle } : {}),
  };
}

const ordenar = (alertas: AlertaComentable[]) => alertas.sort((a, b) => ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo));

/**
 * Inventarios: las alertas del cargue que exigen comentario, solo las que tienen al menos una
 * referencia, en el orden de presentación. Sobre las mismas filas que pinta Novedades.
 */
export function alertasQueExigenComentario(descriptor: DescriptorModulo, filas: FilaValidable[]): AlertaComentable[] {
  const tipos = new Set(descriptor.alertasConComentario ?? []);
  if (tipos.size === 0) return [];
  const salida: AlertaComentable[] = [];
  if (tipos.has("valores_negativos")) {
    const negativos = detectarNegativos(descriptor, filas);
    if (negativos.length > 0) salida.push(alerta("valores_negativos", negativos.length, negativos.reduce((s, n) => s + n.valor, 0)));
  }
  const costo = detectarAlertasCosto(descriptor, filas);
  for (const { tipo } of ALERTAS_COSTO) {
    if (!tipos.has(tipo)) continue;
    const propias = costo.filter((a) => a.tipo === tipo);
    if (propias.length > 0) salida.push(alerta(tipo, propias.length, propias.reduce((s, a) => s + (a.total ?? 0), 0)));
  }
  return ordenar(salida);
}

/**
 * Cartera y CxP: las validaciones del auxiliar por tercero (las mismas de Novedades) que exigen
 * comentario y están presentes. La posible colisión de clave sigue solo informando, y el documento
 * repetido y el vencimiento imposible no se comentan: bloquean aprobar el borrador.
 */
export function alertasTerceroQueExigenComentario(descriptor: DescriptorModulo, v: ValidacionesTercero): AlertaComentable[] {
  const tipos = new Set(descriptor.alertasConComentario ?? []);
  const salida: AlertaComentable[] = [];
  const documentos = v.formato.documentosVsCliente;
  if (tipos.has("documentos_vs_cliente") && documentos && documentos.diferencias.cantidad > 0) {
    salida.push(alerta("documentos_vs_cliente", documentos.diferencias.cantidad, documentos.totales.diferencia));
  }
  if (tipos.has("edades_vs_total") && v.edadesVsTotal.cantidad > 0) {
    salida.push(alerta("edades_vs_total", v.edadesVsTotal.cantidad, v.edadesVsTotal.suma));
  }
  if (tipos.has("saldo_contrario_tercero") && v.saldosContrarios.cantidad > 0) {
    salida.push(alerta("saldo_contrario_tercero", v.saldosContrarios.cantidad, v.saldosContrarios.suma));
  }
  if (tipos.has("dias_vs_corte") && v.diasVsCorte.cantidad > 0) salida.push(alerta("dias_vs_corte", v.diasVsCorte.cantidad, 0));
  if (tipos.has("edad_vs_corte") && v.edadVsCorte.cantidad > 0) salida.push(alerta("edad_vs_corte", v.edadVsCorte.cantidad, 0));
  if (tipos.has("corte_deducido") && v.corte.fecha && v.corte.deducido) {
    salida.push(alerta(
      "corte_deducido",
      1,
      diasEntre(v.corte.fecha, v.corte.deducido.fecha),
      `El archivo calculó sus días al ${v.corte.deducido.fecha}; el corte del cargue es ${v.corte.fecha}.`,
    ));
  }
  return ordenar(salida);
}

/**
 * Activos fijos: activos con costo o neto negativo, y un cargue que trae depreciación sin ningún
 * costo de adquisición (el caso contrario solo informa).
 */
export function alertasActivosQueExigenComentario(descriptor: DescriptorModulo, v: ValidacionesActivos): AlertaComentable[] {
  const tipos = new Set(descriptor.alertasConComentario ?? []);
  const salida: AlertaComentable[] = [];
  if (tipos.has("activos_negativos") && v.negativos.cantidad > 0) {
    salida.push(alerta("activos_negativos", v.negativos.cantidad, v.negativos.suma));
  }
  if (tipos.has("falta_costo") && v.faltaCosto) {
    salida.push(alerta("falta_costo", 1, 0, "El cargue trae la depreciación y ningún costo de adquisición: la cédula compara el neto contra un costo en cero."));
  }
  return ordenar(salida);
}

/** «3 documentos», «1 tercero». */
export function contarAlerta(n: number, unidad: UnidadAlerta): string {
  return `${n.toLocaleString("es-CO")} ${n === 1 ? unidad.uno : unidad.varios}`;
}

/** Valida el comentario escrito; devuelve el texto limpio o el motivo. */
export function validarComentarioAlerta(texto: unknown): { ok: true; texto: string } | { ok: false; message: string } {
  const limpio = String(texto ?? "").trim();
  if (limpio.length < MIN_COMENTARIO_ALERTA) {
    return { ok: false, message: `El comentario debe tener al menos ${MIN_COMENTARIO_ALERTA} caracteres.` };
  }
  if (limpio.length > MAX_COMENTARIO_ALERTA) {
    return { ok: false, message: `El comentario no puede superar ${MAX_COMENTARIO_ALERTA} caracteres.` };
  }
  return { ok: true, texto: limpio };
}

/** El comentario guardado de un tipo de alerta, con lo que tenía la alerta cuando se escribió. */
export type ComentarioAlerta = {
  tipo: TipoAlertaComentario;
  comentario: string;
  referencias: number;
  valor: number;
  comentadoPor: string | null;
  /** Fecha ya formateada para la UI. */
  comentadoEn: string;
};

export type EstadoComentarioAlerta = "pendiente" | "por_revisar" | "comentada";

export type AlertaConComentario = AlertaComentable & {
  estado: EstadoComentarioAlerta;
  comentario: ComentarioAlerta | null;
};

/** ¿La alerta cambió desde que se comentó? Otro número de referencias o otro valor (al centavo). */
export function alertaCambio(alerta: Pick<AlertaComentable, "referencias" | "valor">, comentario: Pick<ComentarioAlerta, "referencias" | "valor">): boolean {
  return alerta.referencias !== comentario.referencias || Math.abs(alerta.valor - comentario.valor) > 0.005;
}

/**
 * Pega a cada alerta del cargue su comentario y decide su estado. Los comentarios de tipos que ya no
 * aparecen en el cargue no se devuelven: sin alerta no hay nada que impida cerrar.
 */
export function anotarAlertasConComentarios(
  alertas: readonly AlertaComentable[],
  comentarios: readonly ComentarioAlerta[],
): AlertaConComentario[] {
  const porTipo = new Map(comentarios.map((c) => [c.tipo, c]));
  return alertas.map((alerta) => {
    const comentario = porTipo.get(alerta.tipo) ?? null;
    const estado: EstadoComentarioAlerta = !comentario ? "pendiente" : alertaCambio(alerta, comentario) ? "por_revisar" : "comentada";
    return { ...alerta, estado, comentario };
  });
}
