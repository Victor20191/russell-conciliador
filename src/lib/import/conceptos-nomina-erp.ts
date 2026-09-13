// Lector del CATÁLOGO DE CONCEPTOS tal como lo imprime el ERP del cliente (RF-NOM-07: «los
// ERP la generan»): SIIGO «INFORME CONCEPTOS DE NOMINA» (banner de 3 filas, TIPO CONCEPTO /
// CODIGO SIIGO / NOMBRE / CUENTA, pie «Procesado en»), INCODOL «EQUIVALENCIAS» (Concepto /
// Descripcion del concepto / Id. Grupo de C.Costos / Id. Cuenta PCGA), NOMINAI «MAESTRO DE
// CONCEPTOS» (Centro de Costo / AREA / Concepto / descrp / cuenta), SIESA, Buk…
//
// Trabaja sobre las grillas de `ingerir` (`GridHoja`), así que hereda la relectura de xlsx sin
// sharedStrings y la detección de hojas ocultas. Elige la hoja del catálogo por contenido y
// nombre, ubica el encabezado por sinónimos, resuelve la ambigüedad «Concepto» = código
// (numérico) + nombre en la columna de al lado, y devuelve entradas normalizadas
// (`ConceptoCatalogoEntrada`) para la MISMA Server Action que la plantilla RF-NOM-08.
//
// Puro: sin BD. Pruebas en `conceptos-nomina-erp.test.ts`.

import type { CeldaCruda, GridHoja } from "@/lib/balance/extraccion/ingesta";
import { codigoConceptoCanonico, digitosCuenta } from "@/lib/modulos/nomina/homologacion";
import { MIN_DIGITOS_CUENTA, type ConceptoCatalogoEntrada } from "./conceptos-nomina";

export type RolCatalogo = "codigo" | "concepto" | "cuenta" | "tipo" | "agrupador";

export type DeteccionCatalogo = {
  hoja: string;
  oculta: boolean;
  /** 1-based en la grilla compacta. */
  filaEncabezado: number;
  /** 1-based. */
  columnas: Partial<Record<RolCatalogo, number>>;
  /** Entradas distintas que se leerían. */
  entradas: number;
  /** Puntaje para ordenar las hojas (más alto = mejor candidata). */
  puntaje: number;
  motivos: string[];
};

export type LecturaCatalogo = {
  filas: ConceptoCatalogoEntrada[];
  avisos: string[];
  /** Filas descartadas por no traer código o cuenta legible. */
  descartadas: number;
};

const texto = (v: CeldaCruda): string => (v == null ? "" : String(v).trim());
const norm = (v: CeldaCruda): string =>
  texto(v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Sinónimos de encabezado por rol. El orden dentro de cada rol no importa; entre roles sí (ver `rolDeEncabezado`). */
const SINONIMOS: Record<RolCatalogo, RegExp[]> = {
  cuenta: [/^(id\.? )?cuenta( contable| pcga| niif| puc)?$/, /^cta\.?( contable)?$/, /^cuenta (debito|debe|gasto)$/, /^codigo (de )?cuenta$/, /^cuenta$/],
  codigo: [/^(codigo|cod)( (del |de )?\w+)*$/, /^(id\.? )?concepto$/, /^clave$/],
  concepto: [/^(nombre|descripcion|descrp|descr|desc)( del| de)?( concepto)?$/, /^nombre concepto$/, /^concepto nomina$/, /^detalle$/],
  tipo: [/^tipo( (de )?concepto)?$/, /^naturaleza( \w+)?$/, /^clasificacion$/, /^clase concepto$/],
  agrupador: [/^(id\.? )?(grupo de )?c\.? ?(costos?|cos\.?)$/, /^centro( de)? costos?$/, /^area$/, /^dependencia$/, /^grupo$/, /^clase$/, /^ccosto$/, /^id\.? grupo de c\.?costos$/],
};

/** Rol al que apunta un encabezado, o null. Los roles más específicos se prueban primero. */
export function rolDeEncabezado(h: CeldaCruda): RolCatalogo | null {
  const t = norm(h);
  if (!t) return null;
  // «Cuenta PCGA» (nombre de la cuenta, texto) vs «Id. Cuenta PCGA» (código): ambos son cuenta;
  // el contenido decide (ver `elegirColumnas`).
  for (const rol of ["tipo", "agrupador", "cuenta", "codigo", "concepto"] as const) {
    if (SINONIMOS[rol].some((re) => re.test(t))) return rol;
  }
  return null;
}

const esNumerico = (v: CeldaCruda): boolean => typeof v === "number" || /^\s*\d+([.,]\d+)?\s*$/.test(texto(v));
const proporcion = (hoja: GridHoja, fila0: number, col0: number, pred: (v: CeldaCruda) => boolean, max = 200): number => {
  let n = 0;
  let ok = 0;
  for (let r = fila0; r < hoja.filas.length && n < max; r++) {
    const v = hoja.filas[r]?.[col0];
    if (v == null || texto(v) === "") continue;
    n++;
    if (pred(v)) ok++;
  }
  return n === 0 ? 0 : ok / n;
};

/** ¿La celda parece una cuenta contable del cliente (≥ 6 dígitos sin letras)? */
const pareceCuenta = (v: CeldaCruda): boolean => {
  const t = texto(v);
  if (!t) return false;
  if (typeof v === "number") return Number.isInteger(v) && String(v).length >= MIN_DIGITOS_CUENTA;
  return /^[\d.\- ]+$/.test(t) && digitosCuenta(t).length >= MIN_DIGITOS_CUENTA;
};

const ENCABEZADO_MOVIMIENTO = /empleado|cedula|identificacion|documento|nombre empleado|nombres|apellidos|valor|devengo|deduccion|neto/;

/**
 * Detecta, en una hoja, la fila de encabezado y las columnas del catálogo. Devuelve null si
 * no hay una fila con al menos código (o concepto numérico) y cuenta.
 */
export function detectarCatalogoEnHoja(hoja: GridHoja, maxFilas = 20): DeteccionCatalogo | null {
  let mejor: DeteccionCatalogo | null = null;
  for (let r = 0; r < Math.min(maxFilas, hoja.filas.length); r++) {
    const fila = hoja.filas[r] ?? [];
    const candidatos: { rol: RolCatalogo; col: number }[] = [];
    fila.forEach((h, i) => {
      const rol = rolDeEncabezado(h);
      if (rol) candidatos.push({ rol, col: i });
    });
    if (candidatos.length < 2) continue;
    const columnas = elegirColumnas(hoja, r, candidatos);
    if (!columnas.cuenta || !columnas.codigo) continue;
    const motivos: string[] = [];
    const encabezadoTexto = fila.map(norm).join(" | ");
    const esMovimiento = ENCABEZADO_MOVIMIENTO.test(encabezadoTexto) && /empleado|cedula|identificacion/.test(encabezadoTexto);
    if (esMovimiento) motivos.push("trae columnas de empleado: parece el detalle de la nómina, no el catálogo");
    const lectura = leerCatalogoDesde(hoja, r, columnas);
    if (lectura.filas.length === 0) continue;
    let puntaje = lectura.filas.length;
    if (esMovimiento) puntaje = Math.round(puntaje / 10);
    if (/concepto|equivalen|maestro|homolog|cuentas|catalogo/.test(norm(hoja.nombre))) {
      puntaje += 1000;
      motivos.push("el nombre de la hoja habla de conceptos/equivalencias");
    }
    if (hoja.oculta) puntaje -= 5000;
    const det: DeteccionCatalogo = {
      hoja: hoja.nombre,
      oculta: hoja.oculta === true,
      filaEncabezado: r + 1,
      columnas: Object.fromEntries(Object.entries(columnas).map(([k, v]) => [k, v + 1])) as Partial<Record<RolCatalogo, number>>,
      entradas: lectura.filas.length,
      puntaje,
      motivos,
    };
    if (!mejor || det.puntaje > mejor.puntaje) mejor = det;
    if (mejor === det) break; // la primera fila de encabezado válida manda dentro de la hoja
  }
  return mejor;
}

/** Con los encabezados reconocidos, decide la columna de cada rol mirando el CONTENIDO. */
function elegirColumnas(hoja: GridHoja, filaEnc: number, candidatos: { rol: RolCatalogo; col: number }[]): Partial<Record<RolCatalogo, number>> {
  const datos0 = filaEnc + 1;
  const cols: Partial<Record<RolCatalogo, number>> = {};
  const porRol = (rol: RolCatalogo) => candidatos.filter((c) => c.rol === rol).map((c) => c.col);

  // Cuenta: la columna cuyos valores parecen cuentas (Id. Cuenta PCGA sí; «Cuenta PCGA» = nombre, no).
  const cuentas = porRol("cuenta").map((col) => ({ col, p: proporcion(hoja, datos0, col, pareceCuenta) })).sort((a, b) => b.p - a.p);
  if (cuentas[0] && cuentas[0].p >= 0.5) cols.cuenta = cuentas[0].col;

  // Código: «Código …» explícito; si no, un «Concepto» numérico.
  const codigos = porRol("codigo");
  const explicito = codigos.find((col) => /codigo|cod\b|clave/.test(norm(hoja.filas[filaEnc][col])));
  if (explicito != null) cols.codigo = explicito;
  else {
    const numerico = codigos.find((col) => proporcion(hoja, datos0, col, esNumerico) >= 0.8);
    if (numerico != null) cols.codigo = numerico;
  }

  // Nombre: «Nombre/Descripción» explícito; si no, la primera columna de texto a la derecha del código.
  const nombres = porRol("concepto").filter((col) => col !== cols.codigo);
  const nombreTexto = nombres.find((col) => proporcion(hoja, datos0, col, (v) => !esNumerico(v)) >= 0.6);
  if (nombreTexto != null) cols.concepto = nombreTexto;
  else if (cols.codigo != null) {
    // «Concepto» de texto que quedó como candidato a código (SIESA «Concepto» + «Descripción Concepto»).
    const conceptoTexto = codigos.find((col) => col !== cols.codigo && proporcion(hoja, datos0, col, (v) => !esNumerico(v)) >= 0.6);
    if (conceptoTexto != null) cols.concepto = conceptoTexto;
    else {
      for (let col = cols.codigo + 1; col < (hoja.filas[filaEnc]?.length ?? 0); col++) {
        if (col === cols.cuenta) continue;
        if (candidatos.some((c) => c.col === col && c.rol !== "concepto")) continue;
        if (proporcion(hoja, datos0, col, (v) => !esNumerico(v)) >= 0.8 && proporcion(hoja, datos0, col, (v) => texto(v) !== "") > 0) {
          cols.concepto = col;
          break;
        }
      }
    }
  }

  // Tipo: tal cual.
  const tipo = porRol("tipo")[0];
  if (tipo != null) cols.tipo = tipo;

  // Agrupador: entre las candidatas, la de texto corto con pocos valores distintos (AREA, Id. Grupo)
  // antes que un centro numérico disperso (Centro de Costo 100101).
  const agrupadores = porRol("agrupador").map((col) => {
    const vistos = new Set<string>();
    let n = 0;
    for (let r = datos0; r < hoja.filas.length && n < 300; r++) {
      const v = texto(hoja.filas[r]?.[col]);
      if (!v) continue;
      n++;
      vistos.add(v.toUpperCase());
    }
    return { col, distintos: vistos.size, n, textual: proporcion(hoja, datos0, col, (v) => !esNumerico(v)) };
  }).filter((a) => a.n > 0);
  const preferido = agrupadores.filter((a) => a.distintos <= 40).sort((a, b) => b.textual - a.textual || a.distintos - b.distintos)[0] ?? agrupadores[0];
  if (preferido) cols.agrupador = preferido.col;

  return cols;
}

const PIE = /^(procesado en|elaborado por|aprobado por|total(es)?\b|fin del (informe|reporte)|ruta$)/;

function leerCatalogoDesde(hoja: GridHoja, filaEnc: number, cols: Partial<Record<RolCatalogo, number>>): LecturaCatalogo {
  const filas: ConceptoCatalogoEntrada[] = [];
  const avisos: string[] = [];
  const indice = new Map<string, ConceptoCatalogoEntrada>();
  let descartadas = 0;
  let sinCuenta = 0;
  let ultimoAgrupador = "";
  // NOMINAI deja el centro solo en la primera fila de cada bloque (columna dispersa): se
  // arrastra. Una columna casi siempre llena (INCODOL, con un vacío puntual) NO se arrastra:
  // ese vacío significa «sin grupo», no «el de arriba».
  const arrastrarAgrupador = cols.agrupador != null && proporcion(hoja, filaEnc + 1, cols.agrupador, () => true) > 0 && (() => {
    let llenas = 0;
    let total = 0;
    for (let r = filaEnc + 1; r < hoja.filas.length && total < 300; r++) {
      const fila = hoja.filas[r] ?? [];
      if (!fila.some((v) => texto(v) !== "")) continue;
      total++;
      if (texto(fila[cols.agrupador!]) !== "") llenas++;
    }
    return total > 0 && llenas / total < 0.6;
  })();
  for (let r = filaEnc + 1; r < hoja.filas.length; r++) {
    const fila = hoja.filas[r] ?? [];
    const celda = (rol: RolCatalogo) => (cols[rol] == null ? "" : texto(fila[cols[rol]!]));
    const primera = norm(fila.find((v) => texto(v) !== "") ?? "");
    if (PIE.test(primera)) continue;
    const codigo = codigoConceptoCanonico(celda("codigo"));
    const cuentaRaw = celda("cuenta");
    const concepto = celda("concepto").replace(/\s+/g, " ").trim();
    const agrupadorCrudo = celda("agrupador");
    if (agrupadorCrudo) ultimoAgrupador = agrupadorCrudo;
    const agrupador = cols.agrupador != null ? (agrupadorCrudo || (arrastrarAgrupador ? ultimoAgrupador : "")) : "";
    if (!codigo && !cuentaRaw && !concepto) continue;
    // Una fila de encabezado repetida (hojas gemelas pegadas) no es un concepto.
    if (rolDeEncabezado(fila[cols.codigo!]) && rolDeEncabezado(fila[cols.cuenta!])) continue;
    if (!codigo) { descartadas++; continue; }
    const cuenta = digitosCuenta(cuentaRaw);
    if (cuenta.length < MIN_DIGITOS_CUENTA) {
      sinCuenta++;
      continue;
    }
    const clave = `${codigo}|${agrupador.toUpperCase()}`;
    const previa = indice.get(clave);
    if (previa) {
      if (!previa.cuentas.includes(cuenta)) previa.cuentas.push(cuenta);
      if (!previa.concepto && concepto) previa.concepto = concepto;
      continue;
    }
    const entrada: ConceptoCatalogoEntrada = {
      fila: (hoja.filasFisicas?.[r] ?? r + 1),
      codigo,
      concepto: concepto || `Concepto ${codigo}`,
      grupo: null,
      agrupador,
      cuentas: [cuenta],
      tipo: celda("tipo") || null,
    };
    indice.set(clave, entrada);
    filas.push(entrada);
  }
  if (sinCuenta > 0) avisos.push(`${sinCuenta} fila(s) sin cuenta contable legible (vacía, comodín o de menos de ${MIN_DIGITOS_CUENTA} dígitos) no se cargan.`);
  if (descartadas > 0) avisos.push(`${descartadas} fila(s) sin código de concepto se descartaron.`);
  return { filas, avisos, descartadas: descartadas + sinCuenta };
}

/** Detecta el catálogo en todas las hojas y las ordena de mejor a peor candidata. */
export function detectarCatalogoConceptos(hojas: readonly GridHoja[]): DeteccionCatalogo[] {
  return hojas
    .map((h) => detectarCatalogoEnHoja(h))
    .filter((d): d is DeteccionCatalogo => d != null)
    .sort((a, b) => b.puntaje - a.puntaje || a.hoja.localeCompare(b.hoja));
}

/**
 * Lee el catálogo de la hoja indicada (o de la mejor candidata). `hojaNombre` permite que el
 * usuario escoja otra hoja en el modal.
 */
export function leerCatalogoConceptosErp(hojas: readonly GridHoja[], hojaNombre?: string | null): (LecturaCatalogo & { deteccion: DeteccionCatalogo; candidatas: DeteccionCatalogo[] }) | null {
  const candidatas = detectarCatalogoConceptos(hojas);
  const deteccion = hojaNombre ? candidatas.find((c) => c.hoja === hojaNombre) ?? null : candidatas[0] ?? null;
  if (!deteccion) return null;
  const hoja = hojas.find((h) => h.nombre === deteccion.hoja)!;
  const cols = Object.fromEntries(Object.entries(deteccion.columnas).map(([k, v]) => [k, (v as number) - 1])) as Partial<Record<RolCatalogo, number>>;
  const lectura = leerCatalogoDesde(hoja, deteccion.filaEncabezado - 1, cols);
  return { ...lectura, deteccion, candidatas };
}
