// EL MAPEO CON QUE SE LEE UN CARGUE: el del patrón (o el que se armó en la carga) más las
// respuestas del modal de carga. Puro, sin BD.
//
// Es la ÚNICA puerta por la que una respuesta de la carga cambia el mapeo, y la usan los tres
// caminos que leen un archivo de módulo:
//  - la carga (`leerDatosModulo`): con patrón, con el mapeo armado en la carga y con formato propio;
//  - la prueba del mapeo dentro de la carga (`probarMapeoCarga`), con las respuestas del modal;
//  - la prueba del mapeo del editor de patrones (`probarMapeoPatron`), con las respuestas que el
//    administrador supone en el panel de la prueba.
// Si una respuesta se aplicara en un solo camino, la prueba mostraría una lectura y el borrador
// otra: en INDAER (27/Nov/2026) la prueba sacaba los «Total cliente» y el borrador los sumaba,
// porque la respuesta sobre el total pisaba la marcadora del patrón solo en la carga.
// `mapeo-de-carga.test.ts` falla si otro archivo aplica respuestas de la carga por su cuenta.
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { motivoFechaFutura } from "@/lib/fecha-cargue";
import type { DescriptorModulo } from "./descriptores";
import type { SpecModulo } from "./extraccion/esquema";
import { impedimentoValorSinConfirmar } from "./extraccion/valor-sin-impuestos";
import { aCeldaMuestra, textoCeldaMuestra } from "./extraccion/vista-analisis";
import { esMonedaExtranjera } from "./cartera/moneda";
import { INFO_CONTENIDO_ARCHIVO, type ContenidoArchivo } from "./ingresos/contenido-archivo";
import { INFO_CONTENIDO_ACTIVOS, type ContenidoActivos } from "./activos/contenido-archivo";
import { etiquetaAgruparPor, type AgruparPorNomina } from "./nomina/agrupar-por";
import { letraColumnaModulo, modoClasificadorDe, normalizarSpecModuloArchivo } from "./perfil-modulo";
import {
  aplicarAgrupadorDeCarga,
  aplicarAgruparPorDeCarga,
  aplicarClasificadorDeCarga,
  aplicarContenidoActivosDeCarga,
  aplicarContenidoDeCarga,
  aplicarTotalDeCarga,
  CLASIFICADOR_GLOBAL_CARGA,
  ROL_AGRUPADOR_CARGA,
  type EleccionClasificador,
  type EleccionTotal,
} from "./patrones/aplicar";

/**
 * Lo que se responde en el modal de carga. Con patrón, la fecha de corte, la TRM, el total y el
 * clasificador llegan aquí; sin patrón ya vienen dentro del mapeo que se armó en el modal.
 */
export type RespuestasCarga = {
  fechaCorte?: string | null;
  trmCierre?: number | null;
  /** «¿El archivo trae el valor total?» (`confirmarTotalEnCarga`). */
  total?: EleccionTotal | null;
  /**
   * La celda del total escrita como en Excel («M160»), en vez de columna + fila de la grilla. La
   * usa la prueba del editor de patrones, que no tiene el selector de columnas del modal.
   */
  celdaTotal?: string | null;
  /** Fila del total de un patrón «manual» en un módulo sin la pregunta anterior. */
  subtotalesFila?: number | null;
  /** Inventarios: la columna del clasificador que se confirma en la carga. */
  clasificador?: EleccionClasificador | null;
  /** Nómina: «¿Separar por centro de costo?». */
  separarAgrupador?: boolean | null;
  /** Nómina: «¿Cómo agrupar los conceptos?». */
  agruparPor?: string | null;
  /** Ingresos: «¿Qué trae este archivo?» y con qué signo vienen ventas y notas crédito. */
  contenidoArchivo?: string | null;
  signoNotasCredito?: string | null;
  signoVentas?: string | null;
  /** Activos fijos: costo, depreciación o ambos. */
  contenidoActivos?: string | null;
  /** Mes del cargue (AAAA-MM): en Nómina es el mes de corte de las filas. */
  periodo?: string | null;
};

export type OpcionesMapeoCarga = {
  /** El mapeo viene de un patrón del aplicativo (no del editor del modal). */
  conPatron: boolean;
  /** Nómina: un anexo se agrupa como el cargue al que se suma. */
  anexoAgruparPor?: AgruparPorNomina | null;
  /**
   * «rechazar» (la carga): lo que falte o no sirva impide crear el borrador.
   * «seguir» (las pruebas): ese paso se salta, queda en `pendientes` y la lectura sigue.
   */
  faltantes?: "rechazar" | "seguir";
  ahora?: Date;
};

export type MapeoDeCarga =
  | {
      ok: true;
      /** El mapeo con que se lee el archivo (normalizado para ESTE archivo). */
      spec: SpecModulo;
      clasificadorCambiado: boolean;
      /** Texto de auditoría de la respuesta sobre el total (solo con patrón). */
      totalDelCargue: string | null;
      /** Nómina: el formato trae centro de costo y este cargue no lo separa. */
      sinCentro: boolean;
      agruparPor: AgruparPorNomina | null;
      contenido: ContenidoArchivo | null;
      contenidoActivos: ContenidoActivos | null;
      /** Las respuestas que se aplicaron, en palabras del modal (para mostrarlas en la prueba). */
      aplicadas: string[];
      /** Solo con `faltantes: "seguir"`: lo que la carga pediría o no aceptaría con estas respuestas. */
      pendientes: string[];
    }
  | { ok: false; message: string; noProcesable: boolean };

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Las respuestas tal como las manda el modal de carga. Las pruebas del mapeo mandan los MISMOS
 * campos, así que también se leen aquí: un solo lector para los tres caminos.
 */
export function respuestasCargaDeFormulario(fd: FormData): RespuestasCarga {
  const t = (clave: string) => texto(fd.get(clave));
  const n = (clave: string): number | null => {
    const v = t(clave);
    if (v == null) return null;
    const numero = Number(v);
    return Number.isFinite(numero) ? numero : null;
  };
  const totalArchivo = t("totalArchivo");
  const separar = t("separarAgrupador");
  const conClasificador = t("clasificadorColumna") != null || t("clasificadorModo") != null;
  return {
    fechaCorte: t("fechaCorte"),
    trmCierre: n("trmCierre"),
    total: totalArchivo === "si"
      ? { trae: true, columna: n("subtotalesColumna") ?? 0, fila: n("subtotalesFila") ?? 0 }
      : totalArchivo === "no" ? { trae: false } : null,
    celdaTotal: t("celdaTotal"),
    subtotalesFila: n("subtotalesFila"),
    clasificador: conClasificador ? { columna: n("clasificadorColumna") ?? 0, modo: t("clasificadorModo") } : null,
    separarAgrupador: separar === "si" ? true : separar === "no" ? false : null,
    agruparPor: t("agruparPor"),
    contenidoArchivo: t("contenidoArchivo"),
    signoNotasCredito: t("signoNotasCredito"),
    signoVentas: t("signoVentas"),
    contenidoActivos: t("contenidoActivos"),
    periodo: (t("periodoFin") ?? t("periodoInicio"))?.slice(0, 7) ?? null,
  };
}

/**
 * Aplica al mapeo las respuestas de la carga, en el orden en que siempre lo hizo la carga, y
 * vuelve a leer del original la celda del total que se ubicó. Con `faltantes: "seguir"` nunca
 * falla: lo que la carga rechazaría queda en `pendientes` y la lectura sigue sin ese paso.
 */
export function mapeoDeCarga(
  descriptor: DescriptorModulo,
  specBase: SpecModulo,
  hoja: GridHoja,
  respuestas: RespuestasCarga,
  opciones: OpcionesMapeoCarga,
): MapeoDeCarga {
  const seguir = opciones.faltantes === "seguir";
  const pendientes: string[] = [];
  const aplicadas: string[] = [];
  // En la carga, el primer problema corta; en la prueba se anota y se sigue.
  const fallo = (message: string, noProcesable = false): MapeoDeCarga | null => {
    if (seguir) {
      pendientes.push(message);
      return null;
    }
    return { ok: false, message, noProcesable };
  };
  const letra = (columna: number) => letraColumnaModulo(columna + (hoja.columnaInicial ?? 0));
  const ancho = hoja.filas.reduce((max, fila) => Math.max(max, fila?.length ?? 0), 0);

  let spec: SpecModulo = { ...specBase };
  let clasificadorCambiado = false;
  let totalDelCargue: string | null = null;

  // PATRÓN DEL APLICATIVO: del navegador solo llegan los datos de ESTE cargue.
  if (opciones.conPatron) {
    const fechaCorte = texto(respuestas.fechaCorte) ?? "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte)) spec = { ...spec, fechaCorte };
    const trm = Number(respuestas.trmCierre);
    if (respuestas.trmCierre != null && Number.isFinite(trm) && trm > 0) {
      spec = { ...spec, trmCierre: trm };
      aplicadas.push(`TRM de cierre: ${trm.toLocaleString("es-CO")}`);
    }
    const filaTotal = Number(respuestas.subtotalesFila);
    if (!descriptor.confirmarTotalEnCarga && spec.subtotales === "manual" && Number.isInteger(filaTotal) && filaTotal > 0) {
      spec = { ...spec, subtotalesFila: filaTotal };
    }
    // Inventarios: el analista confirma el clasificador en cada cargue.
    if (descriptor.confirmarClasificadorEnCarga) {
      const eleccion = aplicarClasificadorDeCarga(descriptor, spec, respuestas.clasificador ?? { columna: 0, modo: null }, ancho);
      if (!eleccion.ok) {
        const corte = fallo(eleccion.message, true);
        if (corte) return corte;
      } else {
        spec = eleccion.spec;
        clasificadorCambiado = eleccion.cambio;
        const rol = descriptor.clasificador;
        const etiqueta = descriptor.columnas.find((c) => c.nombre === rol)?.etiqueta ?? "Clasificador";
        aplicadas.push(modoClasificadorDe(spec) === "global"
          ? `${etiqueta}: uno solo para todo el archivo`
          : `${etiqueta}: columna ${letra(spec.columnas[rol] ?? 0)}`);
      }
    }
    // «¿El archivo trae el valor total?»
    if (descriptor.confirmarTotalEnCarga) {
      const total = aplicarTotalDeCarga(descriptor, spec, eleccionTotal(respuestas, hoja), ancho);
      if (!total.ok) {
        const corte = fallo(total.message);
        if (corte) return corte;
      } else {
        spec = total.spec;
        totalDelCargue = spec.subtotalesFila != null
          ? `total del archivo en ${letra(spec.subtotalesColumna ?? 0)}${spec.subtotalesFila}`
          : "el archivo no trae total";
        aplicadas.push(spec.subtotalesFila != null
          ? `¿Trae el valor total? Sí, en ${letra(spec.subtotalesColumna ?? 0)}${spec.subtotalesFila}`
          : "¿Trae el valor total? No");
      }
    }
  }

  spec = normalizarSpecModuloArchivo(descriptor, spec);

  // Nómina: «¿Separar por centro de costo?». Con «No» ESTE cargue no lee la columna del centro.
  const columnaCentroFormato = spec.columnas[ROL_AGRUPADOR_CARGA] ?? 0;
  let sinCentro = false;
  const centro = aplicarAgrupadorDeCarga(descriptor, spec, respuestas.separarAgrupador ?? null);
  if (!centro.ok) {
    const corte = fallo(centro.message);
    if (corte) return corte;
  } else {
    spec = centro.spec;
    sinCentro = descriptor.confirmarAgrupadorEnCarga === true && columnaCentroFormato >= 1 && !centro.separado;
    if (descriptor.confirmarAgrupadorEnCarga && columnaCentroFormato >= 1) {
      aplicadas.push(`¿Separar por centro de costo? ${centro.separado ? "Sí" : "No"}`);
    }
  }

  // Nómina: «¿Cómo agrupar los conceptos?». Un anexo se agrupa como el cargue al que se suma.
  let agruparPor: AgruparPorNomina | null = null;
  const respuestaAgrupar = opciones.anexoAgruparPor ?? texto(respuestas.agruparPor);
  const agrupar = aplicarAgruparPorDeCarga(descriptor, spec, respuestaAgrupar);
  if (!agrupar.ok) {
    const corte = fallo(opciones.anexoAgruparPor
      ? `El cargue al que agregas este archivo agrupa por ${etiquetaAgruparPor(opciones.anexoAgruparPor).toLocaleLowerCase("es")}: este archivo no trae esa columna mapeada.`
      : agrupar.message);
    if (corte) return corte;
  } else {
    spec = agrupar.spec;
    agruparPor = agrupar.agruparPor;
    if (agruparPor) aplicadas.push(`Agrupar los conceptos por ${etiquetaAgruparPor(agruparPor).toLocaleLowerCase("es")}`);
  }

  // Ingresos: qué trae ESTE archivo y con qué signo.
  let contenido: ContenidoArchivo | null = null;
  const contenidoCarga = aplicarContenidoDeCarga(descriptor, spec, respuestas.contenidoArchivo, respuestas.signoNotasCredito, respuestas.signoVentas);
  if (!contenidoCarga.ok) {
    const corte = fallo(contenidoCarga.message);
    if (corte) return corte;
  } else {
    spec = contenidoCarga.spec;
    contenido = contenidoCarga.contenido;
    if (contenido) {
      const signos = [
        spec.signoVentas ? `ventas en ${spec.signoVentas}` : null,
        spec.signoNotasCredito ? `notas crédito en ${spec.signoNotasCredito}` : null,
      ].filter(Boolean);
      aplicadas.push(`¿Qué trae este archivo? ${INFO_CONTENIDO_ARCHIVO[contenido].rotulo}${signos.length ? ` · ${signos.join(" · ")}` : ""}`);
    }
  }

  // Activos fijos: costo, depreciación o ambos.
  let contenidoActivos: ContenidoActivos | null = null;
  const activosCarga = aplicarContenidoActivosDeCarga(descriptor, spec, respuestas.contenidoActivos);
  if (!activosCarga.ok) {
    const corte = fallo(activosCarga.message);
    if (corte) return corte;
  } else {
    spec = activosCarga.spec;
    contenidoActivos = activosCarga.contenido;
    if (contenidoActivos) aplicadas.push(`¿Qué trae este archivo? ${INFO_CONTENIDO_ACTIVOS[contenidoActivos].rotulo}`);
  }

  // Ingresos: una columna de «total» como valor exige confirmar que excluye el IVA.
  const sinConfirmar = impedimentoValorSinConfirmar(descriptor, spec, hoja.filas[spec.filaEncabezado - 1] ?? []);
  if (sinConfirmar) {
    const corte = fallo(sinConfirmar);
    if (corte) return corte;
  }

  // Nómina: el mes de corte del cargue. Entran las filas del año hasta ese mes.
  const periodo = texto(respuestas.periodo);
  if (descriptor.nomina?.periodoPorFila && periodo && /^\d{4}-\d{2}$/.test(periodo)) {
    const { periodoDesde: _desde, ...resto } = spec;
    void _desde;
    spec = { ...resto, periodoHasta: periodo };
    aplicadas.push(`Mes de corte: ${periodo}`);
  }

  // La fecha de corte no puede ser futura.
  const corteFuturo = spec.fechaCorte ? motivoFechaFutura(spec.fechaCorte, "La fecha de corte", opciones.ahora) : null;
  if (corteFuturo) {
    const corte = fallo(corteFuturo);
    if (corte) return corte;
  }

  // Importes en divisa: sin la TRM de cierre se leerían dólares como si fueran pesos.
  if (descriptor.crucePorTercero.detalleTercero && esMonedaExtranjera(spec.monedaArchivo) && !(spec.trmCierre != null && spec.trmCierre > 0)) {
    const corte = fallo(`Los importes de esta hoja están en ${spec.monedaArchivo}: indica la TRM de cierre para convertirlos a pesos.`, true);
    if (corte) return corte;
  }

  // La coordenada del total es autoridad solo para ESTE original: se vuelve a resolver contra la
  // grilla íntegra y se fija el texto real de esa celda, sin confiar en el que mande el navegador.
  if (spec.subtotales === "manual" || spec.subtotalesFila != null) {
    const columna = spec.subtotalesColumna ?? 0;
    const fila = spec.subtotalesFila ?? 0;
    if (columna < 1) {
      const corte = fallo("Indica la columna del archivo donde está el total.", true);
      if (corte) return corte;
    } else if (!Number.isInteger(fila) || fila < 1) {
      const corte = fallo("Ubica la celda exacta del total para este archivo antes de crear el borrador.", true);
      if (corte) return corte;
    } else {
      const indiceFila = hoja.filasFisicas ? hoja.filasFisicas.findIndex((numero) => numero === fila) : fila - 1;
      const textoUbicado = indiceFila >= 0 ? textoCeldaMuestra(aCeldaMuestra(hoja.filas[indiceFila]?.[columna - 1] ?? null)) : "";
      if (!textoUbicado) {
        const corte = fallo(`La celda ${letra(columna)}${fila} no existe o está vacía en este archivo.`, true);
        if (corte) return corte;
      } else if (textoUbicado.length > 80) {
        const corte = fallo(`La celda ${letra(columna)}${fila} no puede usarse como total porque supera 80 caracteres.`, true);
        if (corte) return corte;
      } else {
        spec = { ...spec, subtotalesColumna: columna, subtotalesFila: fila, subtotalesTexto: textoUbicado };
      }
    }
  }

  return {
    ok: true,
    spec,
    clasificadorCambiado,
    totalDelCargue,
    sinCentro,
    agruparPor,
    contenido,
    contenidoActivos,
    aplicadas,
    pendientes: [...new Set(pendientes)],
  };
}

/** «M160» → columna física 13 (A = 1) y fila 160; `null` si no es una celda. */
export function celdaDeTexto(celda: string): { columna: number; fila: number } | null {
  const m = /^\s*([A-Za-z]{1,3})\s*(\d{1,7})\s*$/.exec(celda);
  if (!m) return null;
  const columna = [...m[1].toUpperCase()].reduce((total, letra) => total * 26 + (letra.charCodeAt(0) - 64), 0);
  const fila = Number(m[2]);
  return fila >= 1 ? { columna, fila } : null;
}

/**
 * La respuesta sobre el total en columnas de la GRILLA (`hoja.columnaInicial`: un .xls sin datos en
 * la A arranca la grilla en la B). La celda escrita como en Excel se traduce aquí; una que no se
 * entiende va con columna 0 y `aplicarTotalDeCarga` pide la columna, como en el modal.
 */
function eleccionTotal(respuestas: RespuestasCarga, hoja: GridHoja): EleccionTotal {
  const total = respuestas.total ?? { trae: null };
  const escrita = texto(respuestas.celdaTotal);
  if (total.trae !== true || escrita == null) return total;
  const celda = celdaDeTexto(escrita);
  return celda
    ? { trae: true, columna: celda.columna - (hoja.columnaInicial ?? 0), fila: celda.fila }
    : { trae: true, columna: 0, fila: 0 };
}

/**
 * Las preguntas que hace el modal de carga de un módulo, para que la prueba del editor de
 * patrones las haga también. Sale del descriptor, como en el modal: es serializable para pasarla
 * del servidor a la pantalla.
 */
export type PreguntasCarga = {
  /** «¿El archivo trae el valor total?» */
  total: boolean;
  /** Inventarios: la columna del clasificador (la prueba toma la del patrón). */
  clasificador: boolean;
  /** Nómina: «¿Separar por centro de costo?» (solo si el mapeo lee el centro). */
  centroCosto: boolean;
  /** Nómina: «¿Cómo agrupar los conceptos?», con el rol que cada opción exige mapeado. */
  agruparPor: { id: AgruparPorNomina; etiqueta: string; rol: string }[] | null;
  /** Ingresos: «¿Qué trae este archivo?» y los signos. */
  contenido: boolean;
  /** Activos fijos: costo, depreciación o ambos. */
  contenidoActivos: boolean;
  /** Nómina: el mes de corte de las filas. */
  mesDeCorte: boolean;
  /** Cartera y CxP: la TRM de cierre de una hoja en divisa. */
  trm: boolean;
};

export function preguntasCargaDeModulo(descriptor: DescriptorModulo): PreguntasCarga {
  return {
    total: descriptor.confirmarTotalEnCarga === true,
    clasificador: descriptor.confirmarClasificadorEnCarga === true,
    centroCosto: descriptor.confirmarAgrupadorEnCarga === true,
    agruparPor: descriptor.consolidado?.agruparPor?.length
      ? descriptor.consolidado.agruparPor.map((o) => ({ id: o.id, etiqueta: o.etiqueta, rol: o.rol }))
      : null,
    contenido: descriptor.confirmarContenidoEnCarga === true,
    contenidoActivos: descriptor.confirmarContenidoActivosEnCarga === true,
    mesDeCorte: descriptor.nomina?.periodoPorFila === true,
    trm: descriptor.crucePorTercero.detalleTercero === true,
  };
}

/** La columna del clasificador del patrón como respuesta de la carga (lo que propone el modal). */
export function clasificadorDelPatron(descriptor: DescriptorModulo, spec: SpecModulo): EleccionClasificador {
  return modoClasificadorDe(spec) === "global"
    ? { columna: CLASIFICADOR_GLOBAL_CARGA, modo: "global" }
    : { columna: spec.columnas[descriptor.clasificador] ?? 0, modo: modoClasificadorDe(spec) };
}
