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
// Desde el 19/Oct/2026 también se declara el signo de las VENTAS (con facturas en el archivo, mixto
// o solo facturas). Hay ERP que exportan el auxiliar con el signo CONTABLE —los ingresos son
// créditos y salen en negativo; las devoluciones, en positivo— y la cédula presenta la clase 4 en
// positivo: el cruce mostraba el módulo con el signo contrario y una diferencia del doble (Kakaraka,
// dic-2025: −71.338 millones contra 71.489 millones). «En negativo» invierte el archivo ENTERO antes
// de leerlo, por la misma vía que las notas crédito; así las ventas quedan sumando y lo que venía en
// positivo (devoluciones, notas crédito) queda restando. El signo de las notas crédito de un archivo
// mixto se lee FRENTE al de las ventas: solo las que vienen con el mismo signo hay que reconocerlas
// y cambiarlas.
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

/** Con qué signo trae el archivo sus VENTAS (facturas); lo declara el analista en cada carga. */
export const SIGNOS_VENTAS = ["positivo", "negativo"] as const;
export type SignoVentas = (typeof SIGNOS_VENTAS)[number];

export const INFO_SIGNO_VENTAS: Record<SignoVentas, { opcion: string; ayuda: string }> = {
  positivo: { opcion: "En positivo", ayuda: "Se leen con el signo del archivo." },
  negativo: {
    opcion: "En negativo (signo contable: los ingresos son créditos)",
    ayuda: "Se invierte el archivo entero: las ventas quedan en positivo y lo que venía en positivo (devoluciones, notas crédito) queda restando.",
  },
};

export function esSignoVentas(v: unknown): v is SignoVentas {
  return typeof v === "string" && (SIGNOS_VENTAS as readonly string[]).includes(v);
}

/** ¿El contenido declarado trae ventas? Entonces se pregunta su signo. */
export function exigeSignoVentas(contenido: ContenidoArchivo | null | undefined): boolean {
  return contenido === "mixto" || contenido === "facturas";
}

/**
 * Archivo mixto: ¿las notas crédito vienen con el MISMO signo que las ventas? Entonces hay que
 * reconocerlas por su concepto o documento y cambiarles el signo para que resten. Sin signo de las
 * ventas declarado (cargas anteriores al 19/Oct/2026) las ventas se toman en positivo.
 */
export function notasConSignoDeVentas(notas: SignoNotasCredito, ventas: SignoVentas | null | undefined): boolean {
  return notas === (ventas ?? "positivo");
}

/**
 * Opción y ayuda del signo de las notas crédito, dichas frente al de las ventas: con las ventas en
 * negativo, notas «en positivo» ya restan (el archivo se invierte) y «en negativo» hay que cambiarlas.
 */
export function infoSignoNotasCredito(
  signo: SignoNotasCredito,
  ventas: SignoVentas | null | undefined,
): { opcion: string; ayuda: string } {
  if (ventas !== "negativo") return INFO_SIGNO_NOTAS_CREDITO[signo];
  return signo === "positivo"
    ? { opcion: "En positivo, al revés de las ventas (ya restan)", ayuda: "Al invertir el archivo quedan en negativo y restan." }
    : { opcion: "En negativo, igual que las ventas (hay que cambiarles el signo)", ayuda: "Se les cambia el signo para que resten." };
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
  /**
   * El archivo ENTERO cambió de signo: solo notas crédito que venían en positivo o, desde el
   * 19/Oct/2026, ventas declaradas en negativo (mixto o solo facturas).
   */
  invertido: boolean;
  /** Valores en positivo y en negativo TAL COMO VENÍAN en el archivo (antes de invertir). */
  positivos: number;
  negativos: number;
  /** Signo declarado de las notas crédito (cargas desde el 17/Oct/2026). */
  declarado?: SignoNotasCredito;
  /** Signo declarado de las ventas (cargas desde el 19/Oct/2026). */
  ventas?: SignoVentas;
  /**
   * Archivo mixto: filas reconocidas como notas crédito (por su concepto o documento), cuántas
   * quedaban SUMANDO después de invertir el archivo (las que venían en positivo, si no se invirtió)
   * y cuántas se cambiaron de signo por la declaración.
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
    ...(esSignoVentas(o.ventas) ? { ventas: o.ventas } : {}),
    ...(nc ? { notasCredito: { reconocidas: entero(nc.reconocidas), enPositivo: entero(nc.enPositivo), invertidas: entero(nc.invertidas) } } : {}),
  };
}

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-CO")} ${n === 1 ? uno : varios}`;

/** Texto para la bitácora: « · contenido: Notas crédito (signo invertido)». */
export function detalleAuditoriaContenido(s: SignoContenido | null): string {
  if (!s) return "";
  const ventas = s.ventas ? ` · ventas declaradas en ${s.ventas}${s.invertido ? " (archivo invertido)" : ""}` : "";
  const base = `${` · contenido: ${INFO_CONTENIDO_ARCHIVO[s.contenido].rotulo}`}${ventas}${s.declarado ? ` · notas crédito declaradas en ${s.declarado}` : ""}`;
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
  // Ventas: lo declarado contra lo que trae el archivo (mayoría de filas, como las notas crédito).
  if (exigeSignoVentas(s.contenido) && s.ventas) {
    if (s.ventas === "positivo" && s.negativos > s.positivos) {
      avisos.push({
        tono: "aviso",
        texto: `Declaraste que las ventas vienen en positivo, pero la mayoría de los valores venía en negativo (${plural(s.negativos, "fila", "filas")}): el total quedó en negativo y en el cruce se verá con el signo contrario a la contabilidad. Si el archivo trae el signo contable (los ingresos en negativo), descarta el borrador y vuelve a cargarlo eligiendo «${INFO_SIGNO_VENTAS.negativo.opcion}»${s.contenido === "facturas" ? `; si es un archivo de notas crédito, elige «${INFO_CONTENIDO_ARCHIVO.notas_credito.opcion}»` : ""}.`,
      });
    } else if (s.ventas === "negativo" && s.positivos > s.negativos) {
      avisos.push({
        tono: "aviso",
        texto: `Declaraste que las ventas vienen en negativo, pero la mayoría de los valores venía en positivo (${plural(s.positivos, "fila", "filas")}): al invertir el archivo quedaron RESTANDO. Si te equivocaste, descarta el borrador y vuelve a cargarlo eligiendo «${INFO_SIGNO_VENTAS.positivo.opcion}».`,
      });
    } else if (s.ventas === "negativo") {
      const restan = s.positivos > 0
        ? ` y ${plural(s.positivos, "fila que venía en positivo (devolución o nota crédito) quedó", "filas que venían en positivo (devoluciones, notas crédito) quedaron")} restando`
        : "";
      avisos.push({
        tono: "info",
        texto: `Declaraste que las ventas vienen en negativo (signo contable): se invirtió el archivo entero, así las ventas quedaron en positivo${restan}.`,
      });
    }
  }
  if (s.contenido === "mixto" && s.notasCredito && s.declarado) {
    const nc = s.notasCredito;
    const ventasNegativas = s.ventas === "negativo";
    if (notasConSignoDeVentas(s.declarado, s.ventas)) {
      if (nc.invertidas > 0) {
        avisos.push({
          tono: "info",
          texto: `Se reconocieron ${plural(nc.reconocidas, "nota crédito", "notas crédito")} por su concepto o documento y, como declaraste que vienen en ${s.declarado}${ventasNegativas ? ", igual que las ventas" : ""}, se les cambió el signo para que resten (${plural(nc.invertidas, "fila", "filas")}).`,
        });
      }
    } else if (nc.enPositivo > 0) {
      // Notas que quedaron sumando: venían con el MISMO signo de las ventas aunque se declaró el contrario.
      const opuesto: SignoNotasCredito = s.declarado === "positivo" ? "negativo" : "positivo";
      avisos.push({
        tono: "aviso",
        texto: `${plural(nc.enPositivo, "nota crédito viene", "notas crédito vienen")} en ${opuesto}${ventasNegativas ? ", igual que las ventas," : ""} y ${nc.enPositivo === 1 ? "quedó" : "quedaron"} SUMANDO, aunque declaraste que vienen en ${s.declarado}. Si son reversas está bien; si no, descarta el borrador y vuelve a cargarlo eligiendo «${infoSignoNotasCredito(opuesto, s.ventas).opcion}».`,
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
  } else if (s.contenido === "facturas" && !s.ventas && s.negativos > s.positivos) {
    // Lote anterior a la declaración del signo de las ventas.
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
