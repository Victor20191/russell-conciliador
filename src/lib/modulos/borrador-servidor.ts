// Lectura del STAGING de un borrador de módulo — server-only.
//
// Regla de la casa: al navegador NO viajan las filas del archivo, y al servidor tampoco si se
// puede evitar. La columna `datos` es la pesada —73 de los 74 MB del módulo de nómina de
// INCODOL (125.043 filas)— y traerla entera contra la base remota tarda entre 25 y 45 s, así que
// el resumen se arma con consultas acotadas:
//
//  1. todas las filas SIN `datos` (1,1 s, 15 MB): agrupar, sumar y controlar los subtotales;
//  2. las filas con `valor` 0 CON `datos` (aquí 1.471): son las únicas donde el criterio de
//     «fila en cero» necesita mirar las columnas numéricas;
//  3. los renglones de cuenta (`seccion_cuenta`), para el total que declara cada cuenta;
//  4. los escalares de las columnas que vigilan negativos y descuadres (Inventarios);
//  5. un agregado que dice qué columnas trae el archivo (para ocultar las vacías).
//
// Va por el DRIVER `pg` y no por Prisma: el motor de Prisma serializa cada fila con su `Decimal`
// y su JSON, y la misma consulta pasa de ~1 s a ~30 s.
import "server-only";
import { poolLectura as pool } from "./pool-lectura";
import type { DescriptorModulo } from "./descriptores";
import { esDescuadreProducto } from "./validaciones";
import { controlesFormatoCartera } from "./cartera/controles-formato";
import type { FormatoArchivoCartera } from "./cartera/tipo-formato";
import type { NivelCartera } from "./cartera/saldos-tercero";
import type { ColumnaDetalle } from "./cartera/columnas-cartera";
import { claveColumna, claveGrupo, resumirBorrador, type FilaBorrador, type FilaSlim, type ResumenBorrador } from "./borrador-resumen";

type FilaCruda = {
  fila_num: number;
  clasificador: string | null;
  valor: string | number;
  datos?: Record<string, string | number | null> | null;
  tipo_fila: string;
  omitida: boolean | null;
  motivo_tipo_fila: string | null;
};

const aFila = (f: FilaCruda): FilaBorrador => ({
  filaNum: f.fila_num,
  clasificador: f.clasificador,
  valor: Number(f.valor),
  datos: f.datos ?? {},
  tipoFila: f.tipo_fila,
  omitida: f.omitida,
  motivo: f.motivo_tipo_fila,
});

const CAMPOS = "fila_num, clasificador, valor, tipo_fila, omitida, motivo_tipo_fila";

/** Filas del lote CON sus datos, en el orden del archivo (para exportar o para Cartera). */
export async function filasDelLote(loteId: string): Promise<FilaBorrador[]> {
  const { rows } = await pool().query<FilaCruda>(
    `SELECT ${CAMPOS}, datos FROM modulo_importacion_staging WHERE lote_id = $1 ORDER BY fila_num ASC`,
    [loteId],
  );
  return rows.map(aFila);
}

/** Filas de UN grupo del borrador, con sus datos: lo que la tabla pide al abrirlo. */
export async function filasDelGrupo(
  loteId: string,
  clasificador: string,
  opciones: { limite?: number; desde?: number } = {},
): Promise<FilaBorrador[]> {
  const sinClasificar = claveGrupo(clasificador) === claveGrupo(null);
  const condicion = sinClasificar ? "COALESCE(btrim(clasificador), '') = ''" : "btrim(clasificador) = $2";
  const parametros: unknown[] = sinClasificar ? [loteId] : [loteId, clasificador.trim()];
  const limite = opciones.limite != null ? ` LIMIT ${Number(opciones.limite)} OFFSET ${Number(opciones.desde ?? 0)}` : "";
  const { rows } = await pool().query<FilaCruda>(
    `SELECT ${CAMPOS}, datos FROM modulo_importacion_staging
      WHERE lote_id = $1 AND ${condicion} ORDER BY fila_num ASC${limite}`,
    parametros,
  );
  return rows.map(aFila);
}

/** Cuántas filas tiene un grupo (para saber si falta por traer sin leerlas). */
export async function conteoDelGrupo(loteId: string, clasificador: string): Promise<number> {
  const sinClasificar = claveGrupo(clasificador) === claveGrupo(null);
  const condicion = sinClasificar ? "COALESCE(btrim(clasificador), '') = ''" : "btrim(clasificador) = $2";
  const parametros: unknown[] = sinClasificar ? [loteId] : [loteId, clasificador.trim()];
  const { rows } = await pool().query<{ n: string }>(
    `SELECT count(*)::text AS n FROM modulo_importacion_staging WHERE lote_id = $1 AND ${condicion}`,
    parametros,
  );
  return Number(rows[0]?.n ?? 0);
}

/** Qué columnas trae el archivo: un `bool_or` por columna, resuelto en la base. */
async function columnasConDatos(loteId: string, columnas: readonly ColumnaDetalle[]): Promise<Set<string>> {
  const claves = columnas.map(claveColumna);
  if (claves.length === 0) return new Set();
  const parametros: unknown[] = [loteId];
  const expresiones = columnas.map((columna, i) => {
    if (columna.familia) {
      parametros.push(columna.familia.clave, columna.familia.etiqueta);
      const clave = `$${parametros.length - 1}`;
      const rango = `$${parametros.length}`;
      // Un rango en cero cuenta como vacío (la columna no aporta nada al saldo).
      return `bool_or(NULLIF(btrim(datos->${clave}->>${rango}), '') IS NOT NULL AND btrim(datos->${clave}->>${rango}) !~ '^-?0+(\\.0+)?$') AS c${i}`;
    }
    parametros.push(columna.nombre);
    return `bool_or(NULLIF(btrim(datos->>$${parametros.length}), '') IS NOT NULL) AS c${i}`;
  });
  const { rows } = await pool().query<Record<string, boolean | null>>(
    `SELECT ${expresiones.join(", ")} FROM modulo_importacion_staging WHERE lote_id = $1`,
    parametros,
  );
  const fila = rows[0] ?? {};
  return new Set(claves.filter((_, i) => fila[`c${i}`] === true));
}

/** Filas con `valor` 0 que aun así imputan: alguna de sus columnas numéricas no está en cero. */
async function imputablesEnCero(loteId: string, columnasNumericas: readonly string[]): Promise<Set<number>> {
  if (columnasNumericas.length === 0) return new Set();
  const { rows } = await pool().query<{ fila_num: number; datos: Record<string, unknown> | null }>(
    `SELECT fila_num, datos FROM modulo_importacion_staging
      WHERE lote_id = $1 AND valor = 0 AND tipo_fila = 'movimiento' AND omitida IS DISTINCT FROM true`,
    [loteId],
  );
  const salida = new Set<number>();
  for (const f of rows) {
    const datos = f.datos ?? {};
    const aporta = columnasNumericas.some((col) => {
      const bruto = datos[col];
      if (bruto == null || bruto === "") return false;
      const n = typeof bruto === "number" ? bruto : Number(String(bruto).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) && n !== 0;
    });
    if (aporta) salida.add(f.fila_num);
  }
  return salida;
}

/** Total que el archivo imprime en el renglón de cada cuenta (SIESA y similares). */
async function declaradoPorCuenta(loteId: string, valorRol: string): Promise<Map<string, number>> {
  const { rows } = await pool().query<{ clasificador: string | null; bruto: string | null }>(
    `SELECT clasificador, datos->>$2 AS bruto FROM modulo_importacion_staging
      WHERE lote_id = $1 AND tipo_fila = 'agrupadora' AND motivo_tipo_fila = 'seccion_cuenta'`,
    [loteId, valorRol],
  );
  const salida = new Map<string, number>();
  for (const f of rows) {
    const cuenta = f.clasificador?.trim();
    if (!cuenta || f.bruto == null) continue;
    const n = Number(String(f.bruto).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) salida.set(cuenta, n);
  }
  return salida;
}

/** Negativos y descuadres de cantidad × unitario, mirando SOLO las columnas que los definen. */
async function novedadesDeColumnas(
  loteId: string,
  descriptor: DescriptorModulo,
  columnas: readonly ColumnaDetalle[],
): Promise<{ negativos: ResumenBorrador["negativos"]; descuadres: ResumenBorrador["descuadres"] }> {
  const productos = Object.entries(descriptor.derivar ?? {})
    .filter(([, regla]) => "producto" in regla)
    .map(([resultado, regla]) => ({ resultado, producto: (regla as { producto: [string, string] }).producto }));
  const roles = [...new Set([...(descriptor.noNegativos ?? []), ...productos.flatMap((p) => [p.resultado, ...p.producto])])];
  if (roles.length === 0) return { negativos: [], descuadres: [] };

  const parametros: unknown[] = [loteId];
  const columnasSql = roles.map((rol) => {
    parametros.push(rol);
    return `datos->>$${parametros.length} AS "${rol}"`;
  });
  const { rows } = await pool().query<Record<string, string | null> & { fila_num: number; valor: string }>(
    `SELECT fila_num, valor, ${columnasSql.join(", ")} FROM modulo_importacion_staging
      WHERE lote_id = $1 AND tipo_fila = 'movimiento' AND omitida IS DISTINCT FROM true`,
    parametros,
  );
  const etiqueta = (rol: string) => columnas.find((c) => c.nombre === rol)?.etiqueta ?? rol;
  const num = (v: string | null | undefined) => (v == null || v === "" ? null : Number(v));
  const negativos: ResumenBorrador["negativos"] = [];
  const descuadres: ResumenBorrador["descuadres"] = [];
  for (const f of rows) {
    for (const rol of descriptor.noNegativos ?? []) {
      const v = num(f[rol]);
      if (v != null && Number.isFinite(v) && v < 0) negativos.push({ filaNum: f.fila_num, etiqueta: etiqueta(rol), valor: v });
    }
    for (const p of productos) {
      const tot = num(f[p.resultado]);
      const a = num(f[p.producto[0]]);
      const b = num(f[p.producto[1]]);
      if (tot == null || a == null || b == null) continue;
      if ([tot, a, b].every(Number.isFinite) && a !== 0 && b !== 0 && esDescuadreProducto(tot, a, b)) {
        descuadres.push({ filaNum: f.fila_num, etiqueta: etiqueta(p.resultado), declarado: tot, esperado: Math.round(a * b * 100) / 100 });
      }
    }
  }
  return { negativos, descuadres };
}

/** El resumen que la pantalla del borrador recibe en lugar de las filas. */
export async function cargarResumenBorrador(input: {
  loteId: string;
  descriptor: DescriptorModulo;
  columnas: readonly ColumnaDetalle[];
  nivelCartera: NivelCartera;
  formatoCartera: FormatoArchivoCartera | null;
}): Promise<ResumenBorrador> {
  const { loteId, descriptor, columnas, formatoCartera } = input;
  const columnasNumericas = columnas.filter((c) => !c.familia && (c.tipo === "numero" || c.tipo === "moneda")).map((c) => c.nombre);

  const [slim, enCero, declarado, conDatos, novedades] = await Promise.all([
    pool().query<FilaCruda>(`SELECT ${CAMPOS} FROM modulo_importacion_staging WHERE lote_id = $1 ORDER BY fila_num ASC`, [loteId]),
    imputablesEnCero(loteId, columnasNumericas),
    declaradoPorCuenta(loteId, descriptor.valor),
    columnasConDatos(loteId, columnas),
    novedadesDeColumnas(loteId, descriptor, columnas),
  ]);
  const filas: FilaSlim[] = slim.rows.map((f) => ({
    filaNum: f.fila_num,
    clasificador: f.clasificador,
    valor: Number(f.valor),
    tipoFila: f.tipo_fila,
    omitida: f.omitida,
    motivo: f.motivo_tipo_fila,
  }));

  // Cartera y CxP: sus controles (documentos contra el total del cliente, edades contra el
  // total) sí necesitan `datos`, y son archivos de miles de filas, no de cientos de miles.
  let controlesFormato = null;
  if (formatoCartera) {
    const completas = await filasDelLote(loteId);
    const esImputableFila = (f: FilaBorrador) =>
      f.tipoFila === "movimiento" && f.omitida !== true && (f.valor !== 0 || enCero.has(f.filaNum));
    controlesFormato = controlesFormatoCartera({
      filas: completas.map((f) => ({ filaNum: f.filaNum, valor: f.valor, datos: f.datos, imputable: esImputableFila(f) })),
      nivelImputable: input.nivelCartera,
      formatos: [formatoCartera],
      tipoDeducido: formatoCartera.tipo,
    });
  }

  return resumirBorrador({
    filas,
    descriptor,
    columnas,
    imputablesEnCero: enCero,
    declaradoPorCuenta: declarado,
    columnasConDatos: conDatos,
    negativos: novedades.negativos,
    descuadres: novedades.descuadres,
    controlesFormato,
  });
}
