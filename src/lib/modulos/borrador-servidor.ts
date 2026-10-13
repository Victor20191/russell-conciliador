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
//  4. los escalares de las columnas que vigilan negativos, descuadres y alertas de costo (Inventarios);
//  5. un agregado que dice qué columnas trae el archivo (para ocultar las vacías).
//
// Va por el DRIVER `pg` y no por Prisma: el motor de Prisma serializa cada fila con su `Decimal`
// y su JSON, y la misma consulta pasa de ~1 s a ~30 s.
import "server-only";
import { poolLectura as pool } from "./pool-lectura";
import type { DescriptorModulo } from "./descriptores";
import { alertasCostoDeFila, esDescuadreProducto, type ItemAlertaCosto } from "./validaciones";
import { controlesFormatoCartera } from "./cartera/controles-formato";
import type { FormatoArchivoCartera } from "./cartera/tipo-formato";
import type { NivelCartera } from "./cartera/saldos-tercero";
import type { ColumnaDetalle } from "./cartera/columnas-cartera";
import { claveColumna, claveGrupo, GRUPO_SIN_CLASIFICAR, resumirBorrador, type FilaBorrador, type FilaSlim, type ResumenBorrador } from "./borrador-resumen";
import {
  agrupaPorOtraDimension,
  expresionSqlClaveNomina,
  SQL_LATERAL_CUENTA_NOMINA,
  type AgruparPorNomina,
} from "./nomina/agrupar-por";
import { nombresCuentasCliente } from "./cargue-servidor";

type FilaCruda = {
  fila_num: number;
  clasificador: string | null;
  valor: string | number;
  datos?: Record<string, string | number | null> | null;
  tipo_fila: string;
  omitida: boolean | null;
  motivo_tipo_fila: string | null;
  grupo?: string | null;
};

const aFila = (f: FilaCruda): FilaBorrador => ({
  filaNum: f.fila_num,
  clasificador: f.clasificador,
  valor: Number(f.valor),
  datos: f.datos ?? {},
  tipoFila: f.tipo_fila,
  omitida: f.omitida,
  motivo: f.motivo_tipo_fila,
  ...(f.grupo !== undefined ? { grupo: f.grupo } : {}),
});

const CAMPOS = "fila_num, clasificador, valor, tipo_fila, omitida, motivo_tipo_fila";

/**
 * Cómo se agrupan las filas del borrador en SQL. Por código (o fuera de Nómina) el grupo es el
 * clasificador, como siempre; por nombre o por cuenta del cliente («Agrupar por») es la MISMA
 * expresión del Consolidado (`expresionSqlClaveNomina`), que viaja en la columna `grupo` de la fila.
 */
function sqlGrupo(agruparPor: AgruparPorNomina | null | undefined): { desde: string; expresion: string; columna: string } {
  if (!agrupaPorOtraDimension(agruparPor)) {
    return { desde: "modulo_importacion_staging", expresion: "NULLIF(btrim(clasificador), '')", columna: "" };
  }
  const expresion = expresionSqlClaveNomina(agruparPor);
  return { desde: `modulo_importacion_staging ${SQL_LATERAL_CUENTA_NOMINA}`, expresion, columna: `, ${expresion} AS grupo` };
}

/** Condición SQL de las filas de UN grupo ($2 = su clave; «(sin clasificar)» = sin dato). */
function condicionGrupo(clave: string, agruparPor: AgruparPorNomina | null | undefined) {
  const { desde, expresion } = sqlGrupo(agruparPor);
  const sinClasificar = claveGrupo(clave) === GRUPO_SIN_CLASIFICAR;
  return {
    desde,
    condicion: sinClasificar ? `${expresion} IS NULL` : `${expresion} = $2`,
    parametros: sinClasificar ? [] : [clave.trim()],
  };
}

/**
 * Filas del lote CON sus datos, en el orden del archivo (para exportar o para Cartera). Con
 * `roles`, `datos` trae SOLO esas claves (vacío = ninguna): la página del borrador solo necesita
 * la llave del ítem y las columnas numéricas, y el JSON entero de un cargue de nómina pesa 50 MB
 * (95.937 filas): leerlo completo tardaba 20-30 s y agotaba el pool de lectura al recargar. Con
 * `agruparPor` por nombre o por cuenta (Nómina), cada fila trae además su `grupo`.
 */
export async function filasDelLote(
  loteId: string,
  opciones: { roles?: readonly string[]; agruparPor?: AgruparPorNomina | null } = {},
): Promise<FilaBorrador[]> {
  const roles = opciones.roles ? [...new Set(opciones.roles)] : null;
  const { desde, columna } = sqlGrupo(opciones.agruparPor);
  const { rows } = roles == null
    ? await pool().query<FilaCruda>(
        `SELECT ${CAMPOS}, datos${columna} FROM ${desde} WHERE lote_id = $1 ORDER BY fila_num ASC`,
        [loteId],
      )
    : roles.length === 0
      ? await pool().query<FilaCruda>(
          `SELECT ${CAMPOS}, '{}'::jsonb AS datos${columna} FROM ${desde} WHERE lote_id = $1 ORDER BY fila_num ASC`,
          [loteId],
        )
      : await pool().query<FilaCruda>(
          `SELECT ${CAMPOS},
                  (SELECT COALESCE(jsonb_object_agg(k, datos -> k), '{}'::jsonb) FROM unnest($2::text[]) AS k WHERE datos ? k) AS datos${columna}
             FROM ${desde} WHERE lote_id = $1 ORDER BY fila_num ASC`,
          [loteId, roles],
        );
  return rows.map(aFila);
}

/** Filas de UN grupo del borrador, con sus datos: lo que la tabla pide al abrirlo. */
export async function filasDelGrupo(
  loteId: string,
  clave: string,
  opciones: { limite?: number; desde?: number; agruparPor?: AgruparPorNomina | null } = {},
): Promise<FilaBorrador[]> {
  const { desde, condicion, parametros } = condicionGrupo(clave, opciones.agruparPor);
  const { columna } = sqlGrupo(opciones.agruparPor);
  const limite = opciones.limite != null ? ` LIMIT ${Number(opciones.limite)} OFFSET ${Number(opciones.desde ?? 0)}` : "";
  const { rows } = await pool().query<FilaCruda>(
    `SELECT ${CAMPOS}, datos${columna} FROM ${desde}
      WHERE lote_id = $1 AND ${condicion} ORDER BY fila_num ASC${limite}`,
    [loteId, ...parametros],
  );
  return rows.map(aFila);
}

/** Cuántas filas tiene un grupo (para saber si falta por traer sin leerlas). */
export async function conteoDelGrupo(loteId: string, clave: string, agruparPor?: AgruparPorNomina | null): Promise<number> {
  const { desde, condicion, parametros } = condicionGrupo(clave, agruparPor);
  const { rows } = await pool().query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ${desde} WHERE lote_id = $1 AND ${condicion}`,
    [loteId, ...parametros],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Por qué dimensiones se puede agrupar el borrador de Nómina: las que tienen dato en alguna fila
 * que se cargaría (código, nombre del concepto, cuenta del cliente válida). Mismo criterio que
 * `agruparPorDisponibles` del cargue, sobre el staging.
 */
export async function agruparPorDisponiblesLote(loteId: string): Promise<Record<AgruparPorNomina, boolean>> {
  const { rows } = await pool().query<{ codigo: boolean | null; concepto: boolean | null; cuenta: boolean | null }>(
    `SELECT bool_or(NULLIF(btrim(datos->>'codigo'), '') IS NOT NULL) AS codigo,
            bool_or(${expresionSqlClaveNomina("concepto")} IS NOT NULL) AS concepto,
            bool_or(${expresionSqlClaveNomina("cuenta")} IS NOT NULL) AS cuenta
       FROM modulo_importacion_staging ${SQL_LATERAL_CUENTA_NOMINA}
      WHERE lote_id = $1 AND tipo_fila = 'movimiento' AND omitida IS DISTINCT FROM true`,
    [loteId],
  );
  const fila = rows[0];
  return { codigo: fila?.codigo === true, concepto: fila?.concepto === true, cuenta: fila?.cuenta === true };
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

/**
 * Nombre legible de cada grupo cuando el clasificador es un CÓDIGO: Nómina clasifica por el código
 * del concepto («9995») y su nombre («NETO NÓMINA») vive en el rol de respaldo. Gana el nombre que
 * más se repite en el grupo —un mismo código puede venir escrito de dos formas— y la cuenta la
 * hace la base: traer la columna `datos` de 125.000 filas para esto costaría medio minuto.
 */
async function descripcionPorGrupo(
  loteId: string,
  rol: string,
  agruparPor?: AgruparPorNomina | null,
  clienteId?: number | null,
): Promise<Map<string, string>> {
  // «Agrupar por» (Nómina): por nombre, lo que acompaña al grupo es el código del concepto; por
  // cuenta, el nombre del concepto más repetido (y encima, el nombre de la cuenta del cliente).
  const rolTexto = agruparPor === "concepto" ? "codigo" : rol;
  const { desde, expresion } = sqlGrupo(agruparPor);
  const { rows } = await pool().query<{ clasificador: string | null; texto: string; n: string }>(
    `SELECT ${expresion} AS clasificador, btrim(datos->>$2) AS texto, count(*)::text AS n
       FROM ${desde}
      WHERE lote_id = $1 AND NULLIF(btrim(datos->>$2), '') IS NOT NULL
      GROUP BY 1, 2`,
    [loteId, rolTexto],
  );
  const mejor = new Map<string, { texto: string; n: number }>();
  for (const f of rows) {
    const clave = f.clasificador?.trim() || GRUPO_SIN_CLASIFICAR;
    const n = Number(f.n);
    // Un grupo cuyo nombre es el mismo clasificador no aporta nada: no se guarda.
    if (f.texto === clave) continue;
    const previo = mejor.get(clave);
    if (!previo || n > previo.n) mejor.set(clave, { texto: f.texto, n });
  }
  const salida = new Map([...mejor].map(([clave, v]) => [clave, agruparPor === "concepto" ? `cód. ${v.texto}` : v.texto]));
  if (agruparPor === "cuenta" && clienteId != null) {
    const nombres = await nombresCuentasCliente(clienteId, [...new Set(rows.map((r) => r.clasificador ?? "").filter(Boolean))]);
    for (const [cuenta, nombre] of nombres) salida.set(cuenta, nombre);
  }
  return salida;
}

type AlertaCostoBorrador = Pick<ItemAlertaCosto, "tipo" | "filaNum" | "total">;

/**
 * Negativos, descuadres de cantidad × unitario y alertas de costo, mirando SOLO las columnas que
 * los definen. `alertasCosto` es null cuando el módulo no las calcula.
 */
async function novedadesDeColumnas(
  loteId: string,
  descriptor: DescriptorModulo,
  columnas: readonly ColumnaDetalle[],
): Promise<{ negativos: ResumenBorrador["negativos"]; descuadres: ResumenBorrador["descuadres"]; alertasCosto: AlertaCostoBorrador[] | null }> {
  const productos = Object.entries(descriptor.derivar ?? {})
    .filter(([, regla]) => "producto" in regla)
    .map(([resultado, regla]) => ({ resultado, producto: (regla as { producto: [string, string] }).producto }));
  const costo = descriptor.alertasCosto ?? null;
  const roles = [...new Set([
    ...(descriptor.noNegativos ?? []),
    ...productos.flatMap((p) => [p.resultado, ...p.producto]),
    ...(costo ? [costo.cantidad, costo.unitario, costo.total] : []),
  ])];
  if (roles.length === 0) return { negativos: [], descuadres: [], alertasCosto: costo ? [] : null };

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
  const alertasCosto: AlertaCostoBorrador[] = [];
  const finito = (v: number | null) => (v != null && Number.isFinite(v) ? v : null);
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
    if (costo) {
      const total = finito(num(f[costo.total]));
      const tipos = alertasCostoDeFila({ cantidad: finito(num(f[costo.cantidad])), unitario: finito(num(f[costo.unitario])), total });
      for (const tipo of tipos) alertasCosto.push({ tipo, filaNum: f.fila_num, total });
    }
  }
  return { negativos, descuadres, alertasCosto: costo ? alertasCosto : null };
}

/**
 * El resumen que la pantalla del borrador recibe en lugar de las filas. Con `filas` (las que la
 * página ya leyó con `filasDelLote`) no se vuelven a traer: la consulta tarda 0,2 s en la base,
 * pero mover 95.937 filas hasta la aplicación son ~12 s por viaje.
 */
export async function cargarResumenBorrador(input: {
  loteId: string;
  descriptor: DescriptorModulo;
  columnas: readonly ColumnaDetalle[];
  nivelCartera: NivelCartera;
  formatoCartera: FormatoArchivoCartera | null;
  filas?: readonly FilaSlim[];
  /**
   * Nómina: por qué se agrupan las filas («Agrupar por» del lote). Con `filas`, estas ya traen su
   * `grupo` (las leyó `filasDelLote` con la misma agrupación).
   */
  agruparPor?: AgruparPorNomina | null;
  /** Para nombrar los grupos por la cuenta del cliente cuando se agrupa por cuenta. */
  clienteId?: number | null;
}): Promise<ResumenBorrador> {
  const { loteId, descriptor, columnas, formatoCartera } = input;
  const columnasNumericas = columnas.filter((c) => !c.familia && (c.tipo === "numero" || c.tipo === "moneda")).map((c) => c.nombre);
  const grupoSql = sqlGrupo(input.agruparPor);

  const [slim, enCero, declarado, conDatos, novedades, descripciones] = await Promise.all([
    input.filas
      ? Promise.resolve(null)
      : pool().query<FilaCruda>(`SELECT ${CAMPOS}${grupoSql.columna} FROM ${grupoSql.desde} WHERE lote_id = $1 ORDER BY fila_num ASC`, [loteId]),
    imputablesEnCero(loteId, columnasNumericas),
    declaradoPorCuenta(loteId, descriptor.valor),
    columnasConDatos(loteId, columnas),
    novedadesDeColumnas(loteId, descriptor, columnas),
    // El nombre del grupo solo hace falta donde el clasificador es un código y el nombre va aparte.
    descriptor.clasificadorAlterno
      ? descripcionPorGrupo(loteId, descriptor.clasificadorAlterno, input.agruparPor, input.clienteId)
      : Promise.resolve(new Map<string, string>()),
  ]);
  const filas: FilaSlim[] = input.filas
    ? input.filas.map((f) => ({
        filaNum: f.filaNum, clasificador: f.clasificador, valor: f.valor, tipoFila: f.tipoFila, omitida: f.omitida, motivo: f.motivo,
        ...(f.grupo !== undefined ? { grupo: f.grupo } : {}),
      }))
    : (slim?.rows ?? []).map((f) => ({
        filaNum: f.fila_num,
        clasificador: f.clasificador,
        valor: Number(f.valor),
        tipoFila: f.tipo_fila,
        omitida: f.omitida,
        motivo: f.motivo_tipo_fila,
        ...(f.grupo !== undefined ? { grupo: f.grupo } : {}),
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
    descripcionPorGrupo: descripciones,
    columnasConDatos: conDatos,
    negativos: novedades.negativos,
    descuadres: novedades.descuadres,
    alertasCosto: novedades.alertasCosto,
    controlesFormato,
  });
}
