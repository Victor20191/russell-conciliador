// QUÉ TRAE CADA ARCHIVO de un cargue de Ingresos: facturas, notas crédito o ambas (29/Sep/2026).
//
// Un cargue de Ingresos llega de dos formas: un archivo con facturas y notas crédito, cada una
// con su signo (las notas ya vienen restando), o dos archivos —facturas y, aparte, SOLO notas
// crédito—. En el segundo caso muchos ERP imprimen las notas en POSITIVO, y leídas tal cual
// sumarían en vez de restar. Por eso la carga pregunta SIEMPRE qué trae el archivo (es del
// cargue, no del formato: un mismo patrón sirve para los dos reportes) y, si son notas crédito,
// el motor decide el signo mirando el archivo entero: mayoría en positivo → se invierte todo;
// ya en negativo → se deja igual (una reversa que venga al revés queda sumando, y se avisa).
// Las notas crédito van a un renglón PROPIO del Consolidado por concepto («Notas crédito ·
// Ventas nacionales»), para asignarlas a la 417505 o a la cuenta de la venta.
//
// Desde el 17/Oct/2026 el signo no se adivina: con notas crédito en el archivo (mixto o solo notas)
// la carga pregunta SIEMPRE con qué signo vienen. «En positivo» invierte el archivo de solo notas
// entero y, en un archivo mixto, las filas cuyo concepto o documento nombra una nota crédito (si no
// se reconoce ninguna, la carga no sigue). Si lo declarado contradice lo que trae el archivo, el
// borrador lo avisa (contenido dudoso) sin cambiar la declaración.
//
// Puro y sin dependencias del motor: lo usan la transformación, la acción y las pantallas.

export const CONTENIDOS_ARCHIVO = ["mixto", "facturas", "notas_credito"] as const;
export type ContenidoArchivo = (typeof CONTENIDOS_ARCHIVO)[number];

export const INFO_CONTENIDO_ARCHIVO: Record<ContenidoArchivo, { rotulo: string; opcion: string; ayuda: string }> = {
  mixto: {
    rotulo: "Facturas y notas crédito",
    opcion: "Facturas y notas crédito",
    ayuda: "Cada fila con su signo: las facturas suman y las notas crédito ya vienen en negativo.",
  },
  facturas: {
    rotulo: "Facturas",
    opcion: "Solo facturas",
    ayuda: "Los valores se leen con el signo del archivo.",
  },
  notas_credito: {
    rotulo: "Notas crédito",
    opcion: "Solo notas crédito (sus valores restan)",
    ayuda: "Si vienen en positivo se cambian a negativo; si ya vienen en negativo se dejan igual. Quedan en renglones propios del Consolidado.",
  },
};

export function esContenidoArchivo(v: unknown): v is ContenidoArchivo {
  return typeof v === "string" && (CONTENIDOS_ARCHIVO as readonly string[]).includes(v);
}

/** Con qué signo trae el archivo sus notas crédito (lo declara el analista en cada carga). */
export const SIGNOS_NOTAS_CREDITO = ["negativo", "positivo"] as const;
export type SignoNotasCredito = (typeof SIGNOS_NOTAS_CREDITO)[number];

export const INFO_SIGNO_NOTAS_CREDITO: Record<SignoNotasCredito, { opcion: string; ayuda: string }> = {
  negativo: { opcion: "En negativo (ya restan)", ayuda: "Se leen con el signo del archivo." },
  positivo: { opcion: "En positivo (hay que cambiarlas a negativo)", ayuda: "Se cambian a negativo para que resten." },
};

export function esSignoNotasCredito(v: unknown): v is SignoNotasCredito {
  return typeof v === "string" && (SIGNOS_NOTAS_CREDITO as readonly string[]).includes(v);
}

/** ¿El contenido declarado trae notas crédito? Entonces se pregunta su signo. */
export function exigeSignoNotasCredito(contenido: ContenidoArchivo | null | undefined): boolean {
  return contenido === "mixto" || contenido === "notas_credito";
}

export type ConteoSignos = { positivos: number; negativos: number; suma: number };

/** Cuántos valores vienen en positivo y cuántos en negativo (los vacíos y los ceros no cuentan). */
export function contarSignos(valores: Iterable<number | null | undefined>): ConteoSignos {
  let positivos = 0;
  let negativos = 0;
  let suma = 0;
  for (const v of valores) {
    if (v == null || !Number.isFinite(v) || v === 0) continue;
    if (v > 0) positivos++; else negativos++;
    suma += v;
  }
  return { positivos, negativos, suma: Math.round(suma * 100) / 100 };
}

/**
 * ¿Un archivo de SOLO notas crédito viene en positivo y hay que invertirlo? Manda la mayoría de
 * filas; en un empate, la suma. Sin valores no se invierte nada.
 */
export function invertirNotasCredito(c: ConteoSignos): boolean {
  if (c.positivos !== c.negativos) return c.positivos > c.negativos;
  return c.suma > 0;
}

/** Lo que la lectura hizo con el signo de ESTE archivo; viaja en el spec del lote. */
export type SignoContenido = {
  contenido: ContenidoArchivo;
  invertido: boolean;
  positivos: number;
  negativos: number;
  /** Signo declarado de las notas crédito (cargas desde el 17/Oct/2026). */
  declarado?: SignoNotasCredito;
  /**
   * Archivo mixto: filas reconocidas como notas crédito (por su concepto o documento), cuántas venían
   * en positivo y cuántas se cambiaron de signo por la declaración.
   */
  notasCredito?: { reconocidas: number; enPositivo: number; invertidas: number };
};

export const PREFIJO_NOTAS_CREDITO = "Notas crédito";

const normalizar = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** ¿El texto ya nombra una nota crédito («Nota Crédito» de SAP, «NC ventas», «Notas crédito · …»)? */
export function nombraNotaCredito(texto: string | null | undefined): boolean {
  const n = normalizar(texto ?? "");
  return /\bnotas? (de )?credito\b/.test(n) || /^n c\b/.test(n) || /^nc(\b|\d)/.test(n);
}

/**
 * Archivo mixto: ¿la fila es una nota crédito? Lo es si su concepto o su documento lo dice
 * («Nota Crédito», «NC-1043», «N.C. 12»). Es la única forma de separarlas cuando el ERP las imprime
 * en positivo junto a las facturas.
 */
export function esFilaNotaCredito(concepto: unknown, documento: unknown): boolean {
  const texto = (v: unknown) => (v == null ? "" : String(v));
  return nombraNotaCredito(texto(concepto)) || nombraNotaCredito(texto(documento));
}

/**
 * El renglón del Consolidado de una fila de un archivo de notas crédito: «Notas crédito ·
 * <concepto>», o solo «Notas crédito» si la fila no trae concepto. Si el concepto ya nombra una
 * nota crédito se deja igual, así un renglón que el cliente ya tenía asignado conserva su cuenta.
 * Idempotente.
 */
export function clasificadorNotaCredito(clasificador: string | null | undefined): string {
  const texto = (clasificador ?? "").replace(/\s+/g, " ").trim();
  if (!texto) return PREFIJO_NOTAS_CREDITO;
  if (nombraNotaCredito(texto)) return texto;
  return `${PREFIJO_NOTAS_CREDITO} · ${texto}`;
}

const entero = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);

/** El contenido declarado y lo que se hizo con el signo, tal como quedó en el spec del lote. */
export function leerContenidoDeLote(specJson: unknown): SignoContenido | null {
  if (specJson == null || typeof specJson !== "object") return null;
  const crudo = (specJson as Record<string, unknown>).signoContenido;
  if (crudo == null || typeof crudo !== "object") return null;
  const o = crudo as Record<string, unknown>;
  if (!esContenidoArchivo(o.contenido)) return null;
  const nc = o.notasCredito != null && typeof o.notasCredito === "object" ? (o.notasCredito as Record<string, unknown>) : null;
  return {
    contenido: o.contenido,
    invertido: o.invertido === true,
    positivos: entero(o.positivos),
    negativos: entero(o.negativos),
    ...(esSignoNotasCredito(o.declarado) ? { declarado: o.declarado } : {}),
    ...(nc ? { notasCredito: { reconocidas: entero(nc.reconocidas), enPositivo: entero(nc.enPositivo), invertidas: entero(nc.invertidas) } } : {}),
  };
}

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-CO")} ${n === 1 ? uno : varios}`;

/** Texto para la bitácora: « · contenido: Notas crédito (signo invertido)». */
export function detalleAuditoriaContenido(s: SignoContenido | null): string {
  if (!s) return "";
  const base = ` · contenido: ${INFO_CONTENIDO_ARCHIVO[s.contenido].rotulo}${s.declarado ? ` · notas crédito declaradas en ${s.declarado}` : ""}`;
  if (s.contenido === "mixto" && s.notasCredito) {
    return `${base} (${plural(s.notasCredito.reconocidas, "nota crédito reconocida", "notas crédito reconocidas")}${s.notasCredito.invertidas ? `, ${s.notasCredito.invertidas} con el signo cambiado` : ""})`;
  }
  if (s.contenido !== "notas_credito") return base;
  const conteo = `${plural(s.positivos, "valor en positivo", "valores en positivo")}, ${plural(s.negativos, "en negativo", "en negativo")}`;
  return `${base} (${s.invertido ? "signo invertido" : "signo del archivo"}: ${conteo})`;
}

export type AvisoContenido = { tono: "info" | "aviso"; texto: string };

/** Lo que el borrador cuenta sobre el contenido declarado y el signo. */
export function avisosContenido(s: SignoContenido): AvisoContenido[] {
  const avisos: AvisoContenido[] = [];
  // Contenido dudoso: lo declarado contradice lo que trae el archivo. Solo informa.
  if (s.contenido === "notas_credito" && s.declarado) {
    if (s.declarado === "positivo" && s.negativos > s.positivos) {
      avisos.push({
        tono: "aviso",
        texto: `Declaraste que las notas crédito vienen en positivo, pero la mayoría venía en negativo (${plural(s.negativos, "fila", "filas")}): al cambiarles el signo quedaron SUMANDO. Si te equivocaste, descarta el borrador y vuelve a cargarlo eligiendo «${INFO_SIGNO_NOTAS_CREDITO.negativo.opcion}».`,
      });
    } else if (s.declarado === "negativo" && s.positivos > s.negativos) {
      avisos.push({
        tono: "aviso",
        texto: `Declaraste que las notas crédito vienen en negativo, pero la mayoría venía en positivo (${plural(s.positivos, "fila", "filas")}): se dejaron con su signo y quedaron SUMANDO. Si te equivocaste, descarta el borrador y vuelve a cargarlo eligiendo «${INFO_SIGNO_NOTAS_CREDITO.positivo.opcion}».`,
      });
    }
  }
  if (s.contenido === "mixto" && s.notasCredito) {
    const nc = s.notasCredito;
    if (s.declarado === "positivo" && nc.invertidas > 0) {
      avisos.push({
        tono: "info",
        texto: `Se reconocieron ${plural(nc.reconocidas, "nota crédito", "notas crédito")} por su concepto o documento y, como declaraste que vienen en positivo, se cambiaron a negativo (${plural(nc.invertidas, "fila", "filas")}).`,
      });
    } else if (s.declarado === "negativo" && nc.enPositivo > 0) {
      avisos.push({
        tono: "aviso",
        texto: `${plural(nc.enPositivo, "nota crédito viene", "notas crédito vienen")} en positivo y ${nc.enPositivo === 1 ? "quedó" : "quedaron"} SUMANDO, aunque declaraste que vienen en negativo. Si son reversas está bien; si no, descarta el borrador y vuelve a cargarlo eligiendo «${INFO_SIGNO_NOTAS_CREDITO.positivo.opcion}».`,
      });
    }
  }
  if (s.contenido === "notas_credito") {
    if (s.invertido) {
      avisos.push({
        tono: "info",
        texto: `Declaraste este archivo como notas crédito y sus valores venían en positivo (${plural(s.positivos, "fila", "filas")}): se cambiaron a negativo para que resten. Van en renglones propios del Consolidado («${PREFIJO_NOTAS_CREDITO} · …»).`,
      });
      if (s.negativos > 0) {
        avisos.push({
          tono: "aviso",
          texto: `${plural(s.negativos, "fila venía", "filas venían")} en negativo y quedaron sumando. Si son reversas de notas crédito está bien; si no, revisa el archivo.`,
        });
      }
    } else if (s.positivos + s.negativos > 0) {
      avisos.push({
        tono: "info",
        texto: `Declaraste este archivo como notas crédito y sus valores ya venían en negativo: se dejaron con su signo. Van en renglones propios del Consolidado («${PREFIJO_NOTAS_CREDITO} · …»).`,
      });
      if (s.positivos > 0) {
        avisos.push({
          tono: "aviso",
          texto: `${plural(s.positivos, "fila viene", "filas vienen")} en positivo y ${s.positivos === 1 ? "suma" : "suman"}. Si son reversas de notas crédito está bien; si no, revisa el archivo.`,
        });
      }
    }
  } else if (s.contenido === "facturas" && s.negativos > s.positivos) {
    avisos.push({
      tono: "aviso",
      texto: `Declaraste solo facturas, pero la mayoría de los valores viene en negativo (${plural(s.negativos, "fila", "filas")}). Si el archivo es de notas crédito, descarta este borrador y vuelve a cargarlo eligiendo «${INFO_CONTENIDO_ARCHIVO.notas_credito.opcion}».`,
    });
  }
  return avisos;
}

// ===== Contenido por archivo del cargue (`modulo_dato_encabezado.contenido_archivos`) =====

/** Un archivo del cargue con lo que traía. `previo`: lo cargado antes de guardar este dato. */
export type ContenidoArchivoCargue = {
  loteId: string | null;
  archivo: string;
  contenido: ContenidoArchivo | null;
  signoInvertido: boolean;
  filas: number;
  total: number;
  previo?: boolean;
};

const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Lista guardada, tolerante: `null` = cargue anterior a este dato (o ilegible). */
export function leerContenidoArchivos(json: unknown): ContenidoArchivoCargue[] | null {
  if (!Array.isArray(json)) return null;
  const lista: ContenidoArchivoCargue[] = [];
  for (const item of json) {
    if (item == null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.archivo !== "string") continue;
    lista.push({
      loteId: typeof o.loteId === "string" ? o.loteId : null,
      archivo: o.archivo,
      contenido: esContenidoArchivo(o.contenido) ? o.contenido : null,
      signoInvertido: o.signoInvertido === true,
      filas: entero(o.filas),
      total: numero(o.total),
      ...(o.previo === true ? { previo: true } : {}),
    });
  }
  return lista.length > 0 ? lista : null;
}

/**
 * La lista tras sumar un archivo al cargue. Si el cargue es anterior a este dato (sin lista), la
 * lista arranca con lo que ya tenía como una entrada `previo` sin contenido conocido.
 */
export function agregarContenidoArchivo(
  actual: ContenidoArchivoCargue[] | null,
  previo: { loteId: string | null; archivo: string | null; filas: number; total: number },
  nuevo: ContenidoArchivoCargue,
): ContenidoArchivoCargue[] {
  if (actual && actual.length > 0) return [...actual, nuevo];
  return [
    {
      loteId: previo.loteId,
      archivo: previo.archivo?.trim() || "Archivos anteriores",
      contenido: null,
      signoInvertido: false,
      filas: previo.filas,
      total: previo.total,
      previo: true,
    },
    nuevo,
  ];
}

// ===== ¿Agregar este archivo al cargue vigente del período? =====

/** El cargue vigente del período, como lo ve el modal de carga. */
export type VigentePeriodoModulo = {
  encabezadoId: number;
  version: number;
  periodo: string;
  total: number;
  filas: number;
  congelado: boolean;
  enFirme: boolean;
  /** Lo que trae cada archivo del cargue; `null` si es anterior a este dato. */
  contenidos: (ContenidoArchivo | null)[] | null;
  /**
   * Activos fijos: qué lados tiene ya el cargue (costo y/o depreciación), leídos de su detalle.
   * `null` en los demás módulos. Lo usa `ofertaAnexoActivos`.
   */
  lados?: { conCosto: boolean; conDepreciacion: boolean } | null;
};

/**
 * Con «Cargar» (no «Agregar archivo»), un archivo de notas crédito sobre un período que ya tiene
 * cargue es casi siempre la segunda mitad de ese cargue: crear una versión nueva solo con ellas
 * reemplazaría a las facturas. Se ofrece agregarlo (y también el caso inverso: facturas sobre un
 * cargue que solo tiene notas crédito). `aviso` explica por qué no se puede cuando no se puede.
 */
export function ofertaAnexo(
  contenido: ContenidoArchivo | null,
  vigente: VigentePeriodoModulo | null,
): { ofrecer: boolean; aviso: string | null } {
  if (!contenido || !vigente) return { ofrecer: false, aviso: null };
  const soloNotas = vigente.contenidos != null
    && vigente.contenidos.length > 0
    && vigente.contenidos.every((c) => c === "notas_credito");
  const complementa = contenido === "notas_credito" || (contenido === "facturas" && soloNotas);
  if (!complementa) return { ofrecer: false, aviso: null };
  const destino = `la v${vigente.version} de ${vigente.periodo}`;
  if (vigente.enFirme) {
    return { ofrecer: false, aviso: `La conciliación de ${vigente.periodo} está en firme: no se le pueden agregar archivos. Desbloquéala primero si este archivo es parte del cargue.` };
  }
  if (vigente.congelado) {
    return { ofrecer: false, aviso: `${destino[0].toUpperCase()}${destino.slice(1)} está congelada: este archivo creará una versión nueva que la reemplaza.` };
  }
  return { ofrecer: true, aviso: null };
}
