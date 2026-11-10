// Comparativo de uso entre el período del reporte actual y el del reporte
// ANTERIOR: ¿el equipo de Russell usó más o menos la plataforma?
//
// Módulo PURO: recibe dos `ResumenUsoFactual` ya calculados y devuelve las
// variaciones. No consulta BD ni decide de dónde sale el período previo (eso
// vive en `comparativo-servidor.ts`).
//
// Dos cuidados que definen el diseño:
//  1. **Períodos de distinta duración.** Comparar 30 días contra 14 en cifras
//     absolutas engaña. Por eso cada variación viaja también en PROMEDIO DIARIO
//     y el comparativo se marca `comparable: false` cuando las duraciones
//     difieren más del 10 %: la UI lo advierte en vez de callarlo.
//  2. **Usuarios y clientes no se suman entre períodos.** `totalUsuarios` es un
//     conteo de distintos: su variación se lee como «cuántos operaron», nunca
//     como un acumulado.
//  3. **Una base pequeña exagera cualquier porcentaje.** Pasar de 4 a 565
//     operaciones no es «+14 000 %»: es que antes casi no se usaba. Cuando la base
//     previa es pequeña el titular dice las cifras y avisa; y cuando una sola
//     persona hace más de la mitad del uso, también se dice.
//
// Las dos listas que se comparan vienen SIN las cuentas de prueba ni genéricas
// (`usuariosDelComparativo`); de eso se encarga `comparativo-servidor.ts`.
import type { ConteoNombrado, ResumenUsoFactual } from "./metricas";

export type DireccionVariacion = "subio" | "bajo" | "igual";

export type VariacionUso = {
  etiqueta: string;
  actual: number;
  previo: number;
  diferencia: number;
  /** Variación porcentual; null si el período previo estaba en cero (no se divide por cero). */
  variacionPct: number | null;
  direccion: DireccionVariacion;
};

/** De dónde salió el período de comparación. */
export type BaseComparativo = "reporte_anterior" | "periodo_anterior";

export type PeriodoComparado = {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  dias: number;
};

export type ComparativoUso = {
  base: BaseComparativo;
  /** Cuándo se generó el reporte previo (solo cuando la base es un reporte). */
  generadoEn: string | null;
  actual: PeriodoComparado;
  previo: PeriodoComparado;
  /**
   * Ventana exacta del período previo, en ISO. `previo` trae las fechas ya
   * legibles (y traducidas a la zona de la operación); esto conserva los
   * extremos tal como se midieron, para que otra sección del reporte —el costo
   * de IA— pueda consultar EXACTAMENTE el mismo tramo y no uno corrido por horas.
   */
  ventanaPrevia: { desde: string; hasta: string };
  /** false cuando las duraciones difieren > 10 %: las cifras absolutas no son equiparables. */
  comparable: boolean;
  /** Operaciones, usuarios, conexiones, visitas y clientes. */
  totales: VariacionUso[];
  /** Operaciones por día: la lectura honesta cuando los períodos no miden igual. */
  promedioDiario: VariacionUso;
  porFamilia: VariacionUso[];
  /** Un renglón por persona que operó en alguno de los dos períodos. */
  porUsuario: VariacionUso[];
  /** Quiénes operan la plataforma, no solo cuánto se operó. */
  usuarios: CambioUsuarios;
};

/**
 * El detalle de PERSONAS detrás de «usuarios que operaron». El total puede
 * quedar igual y haber rotado el equipo entero, que para gerencia no es lo
 * mismo: por eso se nombran los que entraron y los que dejaron de operar.
 */
export type CambioUsuarios = {
  activosActual: number;
  activosPrevio: number;
  /** Operaron ahora y no antes. */
  nuevos: string[];
  /** Operaban antes y ahora no. */
  salieron: string[];
  /** Operaron en los dos períodos. */
  continuaron: number;
};

/** Aclaración que acompaña al bloque, en la pantalla y en el documento. */
export const NOTA_SIN_CUENTAS_DE_PRUEBA =
  "Este comparativo se hace sin las cuentas de prueba ni las genéricas del equipo, en los dos períodos.";

/**
 * Umbrales de «base pequeña» (período PREVIO). Con menos de 100 operaciones, 5 de
 * ellas —una sola sesión de trabajo— ya pesan el 5 % que el propio comparativo
 * considera material (`UMBRAL_ALERTA_USO_PCT`), así que el porcentaje mide el
 * azar de un día y no una tendencia. Con menos de 3 personas, que una sola entre
 * o salga mueve el conteo un 33 % o más, y las operaciones son las de una o dos
 * personas, no las del equipo. Basta que se cumpla UNA de las dos condiciones.
 */
export const UMBRAL_BASE_PEQUENA_OPERACIONES = 100;
export const UMBRAL_BASE_PEQUENA_PERSONAS = 3;

/** Una persona «concentra» el uso cuando hace más de la mitad de las operaciones. */
export const UMBRAL_CONCENTRACION_PCT = 50;

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Zona horaria de la operación. Los períodos se declaran en horas locales
 * (00:00 → 23:59:59) y se guardan en UTC: recortar el ISO mostraría el día
 * siguiente en la fecha final. Colombia es la sede de la operación.
 */
export const ZONA_HORARIA_OPERACION = "America/Bogota";

const formatoFecha = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA_OPERACION,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * ISO → YYYY-MM-DD legible.
 *
 * Los dos orígenes de un período no usan la misma convención: el reporte
 * generado toma las fechas del formulario y las fija a medianoche UTC, mientras
 * que el tablero arma su ventana con la hora LOCAL del servidor. Formatear todo
 * en una sola zona corría un día alguna de las dos. Por eso, un instante que ya
 * es una fecha de calendario declarada en UTC (medianoche exacta o el último
 * milisegundo del día) se lee tal cual, y cualquier otro se traduce a la zona de
 * la operación.
 */
export function soloFecha(iso: string): string {
  if (/T00:00:00(\.000)?Z$/.test(iso) || /T23:59:59(\.999)?Z$/.test(iso)) return iso.slice(0, 10);
  const t = Date.parse(iso);
  return Number.isFinite(t) ? formatoFecha.format(new Date(t)) : iso.slice(0, 10);
}

/**
 * Duración del período en días, por DIFERENCIA entre sus extremos redondeada.
 * Un período de 00:00 a 23:59:59 mide 29 d 23 h 59 min y debe leerse como 30,
 * y contar días de calendario fallaría con los que se guardaron a medianoche.
 */
export function diasDePeriodo(desdeIso: string, hastaIso: string): number {
  const desde = Date.parse(desdeIso);
  const hasta = Date.parse(hastaIso);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) return 1;
  return Math.max(1, Math.round((hasta - desde) / DIA_MS));
}

const redondear2 = (n: number): number => Math.round(n * 100) / 100;

/** Operaciones por persona: distingue «más gente» de «la misma gente trabajando más». */
function promedioPorUsuario(r: ResumenUsoFactual): number {
  return r.totalUsuarios > 0 ? r.totalAcciones / r.totalUsuarios : 0;
}

const formatoNumero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
/** Número en formato colombiano (coma decimal), para los textos de la alerta. */
const num = (n: number): string => formatoNumero.format(n);
const formatoUnDecimal = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
/** Promedios diarios: con un decimal se lee «0,3 → 47,1», no «0,29 → 47,08». */
const decimal1 = (n: number): string => formatoUnDecimal.format(n);
const plural = (n: number, singular: string, plural: string): string => `${num(n)} ${n === 1 ? singular : plural}`;

/** Una variación. `previo` en cero deja `variacionPct` en null: no hay base sobre la cual crecer. */
export function variacion(etiqueta: string, actual: number, previo: number): VariacionUso {
  const a = Number.isFinite(actual) ? actual : 0;
  const p = Number.isFinite(previo) ? previo : 0;
  const diferencia = redondear2(a - p);
  return {
    etiqueta,
    actual: redondear2(a),
    previo: redondear2(p),
    diferencia,
    variacionPct: p > 0 ? redondear2(((a - p) / p) * 100) : null,
    direccion: diferencia > 0 ? "subio" : diferencia < 0 ? "bajo" : "igual",
  };
}

/** Une dos listas nombradas por etiqueta, conservando el orden por magnitud actual. */
function unirConteos(actual: ConteoNombrado[], previo: ConteoNombrado[]): VariacionUso[] {
  const mapaPrevio = new Map(previo.map((c) => [c.nombre, c.total]));
  const mapaActual = new Map(actual.map((c) => [c.nombre, c.total]));
  const etiquetas = new Set([...mapaActual.keys(), ...mapaPrevio.keys()]);
  return Array.from(etiquetas)
    .map((etiqueta) => variacion(etiqueta, mapaActual.get(etiqueta) ?? 0, mapaPrevio.get(etiqueta) ?? 0))
    .sort((a, b) => b.actual - a.actual || Math.abs(b.diferencia) - Math.abs(a.diferencia) || a.etiqueta.localeCompare(b.etiqueta, "es"));
}

/** Tolerancia de duración: más allá de esto, las cifras absolutas no son equiparables. */
const TOLERANCIA_DURACION = 0.1;

export function compararUso(params: {
  actual: ResumenUsoFactual;
  previo: ResumenUsoFactual;
  base: BaseComparativo;
  generadoEn?: string | null;
  maxUsuarios?: number;
}): ComparativoUso {
  const { actual, previo } = params;
  const diasActual = diasDePeriodo(actual.periodoDesde, actual.periodoHasta);
  const diasPrevio = diasDePeriodo(previo.periodoDesde, previo.periodoHasta);
  const desvio = Math.abs(diasActual - diasPrevio) / Math.max(diasActual, diasPrevio);

  const totales = [
    variacion("Operaciones registradas", actual.totalAcciones, previo.totalAcciones),
    variacion("Usuarios que operaron", actual.totalUsuarios, previo.totalUsuarios),
    variacion("Operaciones por usuario", promedioPorUsuario(actual), promedioPorUsuario(previo)),
    variacion("Inicios de sesión", actual.totalConexiones, previo.totalConexiones),
    variacion("Visitas a módulos", actual.totalNavegaciones, previo.totalNavegaciones),
    variacion("Clientes con operaciones", actual.totalClientes, previo.totalClientes),
  ];

  // `detalleUsuarios` es la lista COMPLETA (el top viene recortado a 12), así que
  // es la única fuente que permite decir quién entró y quién dejó de operar.
  // Solo cuenta quien dejó operaciones: en ese detalle también hay gente que
  // únicamente inició sesión.
  const operadores = (r: ResumenUsoFactual): ConteoNombrado[] =>
    (r.detalleUsuarios?.length ? r.detalleUsuarios.filter((u) => u.totalAcciones > 0).map((u) => ({ nombre: u.usuario, total: u.totalAcciones })) : r.topUsuarios.map((u) => ({ nombre: u.usuario, total: u.total })));
  const usuariosActual = operadores(actual);
  const usuariosPrevio = operadores(previo);
  const nombresActual = new Set(usuariosActual.map((u) => u.nombre));
  const nombresPrevio = new Set(usuariosPrevio.map((u) => u.nombre));
  const ordenar = (nombres: string[]) => nombres.sort((a, b) => a.localeCompare(b, "es"));

  return {
    base: params.base,
    generadoEn: params.generadoEn ?? null,
    actual: { desde: soloFecha(actual.periodoDesde), hasta: soloFecha(actual.periodoHasta), dias: diasActual },
    previo: { desde: soloFecha(previo.periodoDesde), hasta: soloFecha(previo.periodoHasta), dias: diasPrevio },
    ventanaPrevia: { desde: previo.periodoDesde, hasta: previo.periodoHasta },
    comparable: desvio <= TOLERANCIA_DURACION,
    totales,
    promedioDiario: variacion(
      "Operaciones por día",
      actual.totalAcciones / diasActual,
      previo.totalAcciones / diasPrevio,
    ),
    porFamilia: unirConteos(actual.porFamilia, previo.porFamilia),
    porUsuario: unirConteos(usuariosActual, usuariosPrevio).slice(0, params.maxUsuarios ?? 12),
    usuarios: {
      activosActual: usuariosActual.length,
      activosPrevio: usuariosPrevio.length,
      nuevos: ordenar([...nombresActual].filter((n) => !nombresPrevio.has(n))),
      salieron: ordenar([...nombresPrevio].filter((n) => !nombresActual.has(n))),
      continuaron: [...nombresActual].filter((n) => nombresPrevio.has(n)).length,
    },
  };
}

/* ===== Lectura honesta: base pequeña y concentración ===== */

const OPERACIONES = "Operaciones registradas";
const PERSONAS = "Usuarios que operaron";

/** Una de las filas de totales, por su etiqueta (el orden no es contrato). */
function totalDe(c: ComparativoUso, etiqueta: string): VariacionUso {
  return c.totales.find((t) => t.etiqueta === etiqueta) ?? c.totales[0];
}

/**
 * ¿Es tan pequeña la base de operaciones del período previo que un porcentaje
 * exageraría la variación? Ver los umbrales arriba. Se mide sobre las cifras ya
 * SIN cuentas de prueba: con ellas, la base parecía sólida y era una sola cuenta.
 */
export function baseOperacionesPequena(c: ComparativoUso): boolean {
  return (
    totalDe(c, OPERACIONES).previo < UMBRAL_BASE_PEQUENA_OPERACIONES ||
    totalDe(c, PERSONAS).previo < UMBRAL_BASE_PEQUENA_PERSONAS
  );
}

/** ¿Operaron tan pocas personas en el período previo que un porcentaje de personas engaña? */
export function basePersonasPequena(c: ComparativoUso): boolean {
  return totalDe(c, PERSONAS).previo < UMBRAL_BASE_PEQUENA_PERSONAS;
}

export type ConcentracionOperaciones = {
  /** La persona que más operó en el período ACTUAL, tal como aparece en la bitácora. */
  persona: string;
  operaciones: number;
  /** Entero: «85» para el 85,3 %. */
  porcentaje: number;
};

/**
 * La persona que concentra más de la mitad de las operaciones del período actual,
 * o null. El total de operaciones y las de cada persona salen del propio
 * comparativo (`porUsuario` va ordenado por operaciones actuales).
 */
export function concentracionOperaciones(c: ComparativoUso): ConcentracionOperaciones | null {
  const total = totalDe(c, OPERACIONES).actual;
  const mayor = c.porUsuario[0];
  if (!mayor || total <= 0 || mayor.actual <= 0) return null;
  const pct = (mayor.actual / total) * 100;
  if (pct <= UMBRAL_CONCENTRACION_PCT) return null;
  return { persona: mayor.etiqueta, operaciones: mayor.actual, porcentaje: Math.round(pct) };
}

/** «El 85 % de las operaciones lo hizo una sola persona: …», o null si no hay concentración. */
export function textoConcentracion(c: ComparativoUso): string | null {
  const k = concentracionOperaciones(c);
  return k ? `El ${num(k.porcentaje)} % de las operaciones lo hizo una sola persona: ${k.persona}.` : null;
}

/** «de 4 a 565 operaciones (0,3 → 47,1 por día)»: las cifras que reemplazan al porcentaje. */
export function cifrasOperaciones(c: ComparativoUso): string {
  const ops = totalDe(c, OPERACIONES);
  return `de ${num(ops.previo)} a ${num(ops.actual)} operaciones (${decimal1(c.promedioDiario.previo)} → ${decimal1(c.promedioDiario.actual)} por día)`;
}

/** Avisos que acompañan a la alerta de operaciones: base pequeña y concentración. */
function avisosOperaciones(c: ComparativoUso): string[] {
  const avisos: string[] = [];
  if (baseOperacionesPequena(c)) {
    const ops = totalDe(c, OPERACIONES).previo;
    const personas = totalDe(c, PERSONAS).previo;
    avisos.push(
      `La base anterior es pequeña (${plural(ops, "operación", "operaciones")} y ${plural(personas, "persona", "personas")}): un porcentaje exageraría la variación, por eso se muestran las cifras.`,
    );
  }
  const concentracion = textoConcentracion(c);
  if (concentracion) avisos.push(concentracion);
  return avisos;
}

/**
 * Frase de titular para la UI y el documento. Se apoya en el promedio diario
 * cuando los períodos no miden lo mismo, que es cuando el total absoluto miente;
 * y con una base previa pequeña dice las cifras en vez del porcentaje.
 */
export function titularComparativo(c: ComparativoUso): string {
  const medida = c.comparable ? c.totales[0] : c.promedioDiario;
  const que = c.comparable ? "las operaciones" : "las operaciones por día";
  const desde = c.base === "reporte_anterior" ? "frente al reporte anterior" : "frente al período anterior";
  if (medida.direccion === "igual") return `El uso se mantuvo igual ${desde}.`;
  if (baseOperacionesPequena(c)) {
    return `El uso ${medida.direccion === "subio" ? "subió" : "bajó"}: ${cifrasOperaciones(c)} ${desde}.`;
  }
  const verbo = medida.direccion === "subio" ? "subieron" : "bajaron";
  const pct = medida.variacionPct == null ? null : Math.abs(medida.variacionPct);
  const magnitud = pct == null ? `${num(Math.abs(medida.diferencia))} ${que}` : `${num(pct)} %`;
  return `El uso ${medida.direccion === "subio" ? "subió" : "bajó"}: ${que} ${verbo} ${magnitud} ${desde}.`;
}

/* ===== Alerta visible de subida o bajada ===== */

export type NivelAlertaUso = "alza" | "baja" | "estable";

export type AlertaUso = {
  /** Qué mide: el volumen de operaciones o cuánta gente operó. */
  clave: "operaciones" | "usuarios";
  nivel: NivelAlertaUso;
  /** Titular corto para el banner. */
  titulo: string;
  /** Frase explicativa con la magnitud y el período de referencia. */
  mensaje: string;
  /**
   * Líneas de contexto, una por aviso: la base previa es pequeña (y por eso no
   * hay porcentaje) o una sola persona concentra el uso. Vacía si no hay nada
   * que advertir.
   */
  avisos: string[];
  /** La medida en la que se apoya la alerta (total o promedio diario). */
  medida: VariacionUso;
};

/**
 * Umbral de MATERIALIDAD en puntos porcentuales. Por debajo de esto el uso se
 * considera estable: sin él, un ±1 % de ruido dispararía una alerta cada mes y
 * la alerta dejaría de significar algo.
 */
export const UMBRAL_ALERTA_USO_PCT = 5;

/**
 * Alerta de uso para el tablero y el documento. Cuando los períodos no miden lo
 * mismo se apoya en el PROMEDIO DIARIO, que es la única comparación honesta ahí.
 * Con una base previa pequeña el titular lleva las cifras y no el porcentaje.
 */
export function alertaComparativo(c: ComparativoUso, umbralPct: number = UMBRAL_ALERTA_USO_PCT): AlertaUso {
  const medida = c.comparable ? c.totales[0] : c.promedioDiario;
  const referencia = c.base === "reporte_anterior" ? "al reporte anterior" : "al período anterior";
  const ventana = `${c.previo.desde} – ${c.previo.hasta}`;
  const pct = medida.variacionPct;
  const pequena = baseOperacionesPequena(c);
  const cifras = cifrasOperaciones(c);
  const avisos = avisosOperaciones(c);
  const magnitud = pct == null
    ? `${num(Math.abs(medida.diferencia))} ${c.comparable ? "operaciones" : "operaciones por día"}`
    : `${num(Math.abs(pct))} %`;

  if (pct != null && Math.abs(pct) < umbralPct) {
    return {
      clave: "operaciones",
      nivel: "estable",
      titulo: "El uso se mantuvo estable",
      mensaje: pequena
        ? `Las operaciones pasaron ${cifras} frente ${referencia} (${ventana}), una variación por debajo del umbral de ${num(umbralPct)} % que se considera relevante.`
        : `La variación frente ${referencia} (${ventana}) es de ${magnitud}, por debajo del umbral de ${num(umbralPct)} % que se considera relevante.`,
      avisos,
      medida,
    };
  }
  if (medida.direccion === "bajo") {
    return {
      clave: "operaciones",
      nivel: "baja",
      titulo: pequena ? `El uso bajó: ${cifras}` : `El uso bajó ${magnitud}`,
      mensaje: `${
        pequena
          ? `Frente ${referencia} (${ventana}), medido en cifras y no en porcentaje.`
          : `${c.comparable ? "Las operaciones registradas" : "Las operaciones por día"} cayeron ${magnitud} frente ${referencia} (${ventana}).`
      } Conviene revisar con el equipo qué cambió en el período antes de concluir.`,
      avisos,
      medida,
    };
  }
  if (medida.direccion === "subio") {
    return {
      clave: "operaciones",
      nivel: "alza",
      titulo: pequena ? `El uso subió: ${cifras}` : `El uso subió ${magnitud}`,
      mensaje: pequena
        ? `Frente ${referencia} (${ventana}), medido en cifras y no en porcentaje.`
        : `${c.comparable ? "Las operaciones registradas" : "Las operaciones por día"} crecieron ${magnitud} frente ${referencia} (${ventana}).`,
      avisos,
      medida,
    };
  }
  return {
    clave: "operaciones",
    nivel: "estable",
    titulo: "El uso se mantuvo estable",
    mensaje: `No hubo variación frente ${referencia} (${ventana}).`,
    avisos,
    medida,
  };
}

/**
 * Alerta de CUÁNTA GENTE operó. Va aparte de la de operaciones porque responde
 * otra pregunta: el volumen puede subir porque dos personas trabajaron el doble
 * mientras la mitad del equipo dejó de entrar, y eso no es más adopción.
 *
 * Como es un conteo de personas, no se normaliza por días: se compara tal cual.
 * Con menos de 3 personas en el período previo no hay porcentaje: «de 1 a 4» dice
 * más que «+300 %».
 */
export function alertaUsuarios(c: ComparativoUso, umbralPct: number = UMBRAL_ALERTA_USO_PCT): AlertaUso {
  const medida = totalDe(c, PERSONAS);
  const referencia = c.base === "reporte_anterior" ? "al reporte anterior" : "al período anterior";
  const cuantos = `${num(medida.previo)} a ${num(medida.actual)}`;
  const pct = medida.variacionPct;
  const pequena = basePersonasPequena(c);
  const magnitud = pct == null ? `${num(Math.abs(medida.diferencia))}` : `${num(Math.abs(pct))} %`;
  const rotacion = c.usuarios.nuevos.length > 0 || c.usuarios.salieron.length > 0
    ? ` Entraron ${c.usuarios.nuevos.length} y dejaron de operar ${c.usuarios.salieron.length}.`
    : "";
  const avisos = pequena
    ? [`En el período anterior ${medida.previo === 1 ? "operó" : "operaron"} ${plural(medida.previo, "persona", "personas")}: un porcentaje exageraría la variación, por eso se muestran las cifras.`]
    : [];

  if (medida.direccion === "igual" || (pct != null && Math.abs(pct) < umbralPct)) {
    return {
      clave: "usuarios",
      nivel: "estable",
      titulo: medida.actual === 1 ? "Operó 1 usuario, igual que antes" : `Operaron ${num(medida.actual)} usuarios, igual que antes`,
      mensaje: `La cantidad de personas que operó la plataforma se mantuvo (de ${cuantos}) frente ${referencia}.${rotacion}`,
      avisos: [],
      medida,
    };
  }
  if (medida.direccion === "bajo") {
    return {
      clave: "usuarios",
      nivel: "baja",
      titulo: pequena ? `Operaron menos usuarios: de ${cuantos}` : `Operaron ${magnitud} menos usuarios`,
      mensaje: `Pasaron de ${cuantos} personas operando la plataforma frente ${referencia}.${rotacion} Menos gente usando la herramienta merece revisarse aunque el volumen de operaciones no baje.`,
      avisos,
      medida,
    };
  }
  return {
    clave: "usuarios",
    nivel: "alza",
    titulo: pequena ? `Operaron más usuarios: de ${cuantos}` : `Operaron ${magnitud} más usuarios`,
    mensaje: `Pasaron de ${cuantos} personas operando la plataforma frente ${referencia}.${rotacion}`,
    avisos,
    medida,
  };
}

/** Las dos alertas del comparativo: volumen de operaciones y cuánta gente operó. */
export function alertasComparativo(c: ComparativoUso, umbralPct: number = UMBRAL_ALERTA_USO_PCT): AlertaUso[] {
  return [alertaComparativo(c, umbralPct), alertaUsuarios(c, umbralPct)];
}
