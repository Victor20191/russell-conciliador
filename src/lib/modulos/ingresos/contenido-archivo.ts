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
};

export const PREFIJO_NOTAS_CREDITO = "Notas crédito";

const normalizar = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** ¿El texto ya nombra una nota crédito («Nota Crédito» de SAP, «NC ventas», «Notas crédito · …»)? */
export function nombraNotaCredito(texto: string | null | undefined): boolean {
  const n = normalizar(texto ?? "");
  return /\bnotas? (de )?credito\b/.test(n) || /^n c\b/.test(n) || /^nc\b/.test(n);
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
  return { contenido: o.contenido, invertido: o.invertido === true, positivos: entero(o.positivos), negativos: entero(o.negativos) };
}

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-CO")} ${n === 1 ? uno : varios}`;

/** Texto para la bitácora: « · contenido: Notas crédito (signo invertido)». */
export function detalleAuditoriaContenido(s: SignoContenido | null): string {
  if (!s) return "";
  const base = ` · contenido: ${INFO_CONTENIDO_ARCHIVO[s.contenido].rotulo}`;
  if (s.contenido !== "notas_credito") return base;
  const conteo = `${plural(s.positivos, "valor en positivo", "valores en positivo")}, ${plural(s.negativos, "en negativo", "en negativo")}`;
  return `${base} (${s.invertido ? "signo invertido" : "signo del archivo"}: ${conteo})`;
}

export type AvisoContenido = { tono: "info" | "aviso"; texto: string };

/** Lo que el borrador cuenta sobre el contenido declarado y el signo. */
export function avisosContenido(s: SignoContenido): AvisoContenido[] {
  const avisos: AvisoContenido[] = [];
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
