// Lectura del DETALLE de un cargue — server-only.
//
// Misma regla que en el borrador (`borrador-servidor.ts`): el detalle de un cargue grande no se
// lee entero ni se manda al navegador. El de nómina de INCODOL son 124.957 filas = 70 MB, nueve
// segundos por el driver y medio minuto por Prisma, y encima viajaban al cliente.
//
// Aquí viven las consultas acotadas que reemplazan esa lectura:
//  - el consolidado de Nómina como un GROUP BY (concepto, centro) con la moda de los roles que
//    mira la homologación: 81 renglones en menos de un segundo;
//  - las novedades por fila de Nómina (netos descuadrados, cédulas con varios nombres, meses),
//    que son tres consultas que devuelven poco;
//  - páginas del detalle para la pestaña «Detalle».
import "server-only";
import { poolLectura } from "./pool-lectura";
import type { DescriptorModulo } from "./descriptores";
import type { GrupoNominaAgregado } from "./nomina/consolidado-nomina";
import { claveConsolidado } from "./nomina/clave-consolidado";
import { filtrarFilasDetalleModulo } from "./filtros-detalle-modulo";
import { valorColumnaDetalle } from "./celda-detalle-modulo";
import type { ColumnaDetalle } from "./cartera/columnas-cartera";

/** Fila del detalle tal como la pinta la pestaña «Detalle». */
export type FilaDetalleCargue = {
  filaNum: number;
  clasificador: string | null;
  valor: number;
  datos: Record<string, string | number | null>;
};

/** Una página del detalle, con cuántas filas hay en total (para saber si falta por traer). */
export type PaginaDetalleCargue = { filas: FilaDetalleCargue[]; total: number };

const CAMPOS = "fila_num, clasificador, valor, datos";

type FilaCruda = {
  fila_num: number;
  clasificador: string | null;
  valor: string | number;
  datos: Record<string, string | number | null> | null;
};

const aFila = (f: FilaCruda): FilaDetalleCargue => ({
  filaNum: f.fila_num,
  clasificador: f.clasificador,
  valor: Number(f.valor),
  datos: f.datos ?? {},
});

/**
 * El consolidado de Nómina sin leer el detalle: un renglón por (concepto, centro) con sus cifras
 * y el valor más repetido de los roles que la homologación necesita. `mode()` de PostgreSQL es
 * exactamente la `moda` que hacía el código con las filas en memoria.
 */
export async function gruposNominaDelCargue(encabezadoId: number): Promise<GrupoNominaAgregado[]> {
  const { rows } = await poolLectura().query<{
    clasificador: string | null;
    agrupador: string | null;
    filas: string;
    total: string;
    concepto: string | null;
    cuenta: string | null;
    cuenta_admin: string | null;
    cuenta_ventas: string | null;
    cuenta_mod: string | null;
    cuenta_moi: string | null;
  }>(
    `SELECT clasificador,
            COALESCE(btrim(datos->>'agrupador'), '') AS agrupador,
            count(*)::text AS filas,
            sum(valor)::text AS total,
            mode() WITHIN GROUP (ORDER BY NULLIF(btrim(datos->>'concepto'), '')) AS concepto,
            mode() WITHIN GROUP (ORDER BY NULLIF(btrim(datos->>'cuenta'), '')) AS cuenta,
            mode() WITHIN GROUP (ORDER BY NULLIF(btrim(datos->>'cuentaAdmin'), '')) AS cuenta_admin,
            mode() WITHIN GROUP (ORDER BY NULLIF(btrim(datos->>'cuentaVentas'), '')) AS cuenta_ventas,
            mode() WITHIN GROUP (ORDER BY NULLIF(btrim(datos->>'cuentaMOD'), '')) AS cuenta_mod,
            mode() WITHIN GROUP (ORDER BY NULLIF(btrim(datos->>'cuentaMOI'), '')) AS cuenta_moi
       FROM modulo_dato_detalle
      WHERE encabezado_id = $1 AND imputable
      GROUP BY 1, 2`,
    [encabezadoId],
  );
  return rows.map((r) => {
    const codigo = r.clasificador?.trim() || "(sin clasificar)";
    const agrupador = r.agrupador?.trim() ?? "";
    return {
      clasificador: claveConsolidado(codigo, agrupador),
      codigo,
      agrupador,
      filas: Number(r.filas),
      total: Math.round(Number(r.total) * 100) / 100,
      concepto: r.concepto,
      cuenta: r.cuenta,
      cuentaAdmin: r.cuenta_admin,
      cuentaVentas: r.cuenta_ventas,
      cuentaMOD: r.cuenta_mod,
      cuentaMOI: r.cuenta_moi,
    };
  });
}

/** Lo que las Novedades de Nómina miran FILA a fila; cada consulta devuelve poco. */
export type NovedadesFilaNomina = {
  netos: { filaNum: number; cedula: string | null; devengo: number; deduccion: number; neto: number; esperado: number }[];
  cedulas: { cedula: string; nombres: string[]; filas: number }[];
  meses: string[];
};

/** Tope de filas con el neto descuadrado que se enumeran (el panel las lista, no las cuenta). */
const MAX_NETOS = 200;

export async function novedadesFilaNominaDelCargue(encabezadoId: number, tolerancia = 1): Promise<NovedadesFilaNomina> {
  const numero = (campo: string) => `NULLIF(regexp_replace(COALESCE(datos->>'${campo}', ''), '[^0-9.-]', '', 'g'), '')::numeric`;
  const [netos, cedulas, meses] = await Promise.all([
    poolLectura().query<{ fila_num: number; cedula: string | null; devengo: string; deduccion: string; neto: string }>(
      `SELECT fila_num, datos->>'cedula' AS cedula,
              ${numero("devengo")} AS devengo, ${numero("deduccion")} AS deduccion, ${numero("neto")} AS neto
         FROM modulo_dato_detalle
        WHERE encabezado_id = $1
          AND ${numero("devengo")} IS NOT NULL AND ${numero("deduccion")} IS NOT NULL AND ${numero("neto")} IS NOT NULL
          AND (${numero("devengo")} <> 0 OR ${numero("deduccion")} <> 0)
          AND abs((${numero("devengo")} - abs(${numero("deduccion")})) - ${numero("neto")}) > $2
        ORDER BY fila_num
        LIMIT ${MAX_NETOS}`,
      [encabezadoId, tolerancia],
    ),
    poolLectura().query<{ cedula: string; nombres: string[]; filas: string }>(
      `SELECT cedula, array_agg(DISTINCT nombre ORDER BY nombre) AS nombres, sum(n)::text AS filas
         FROM (
           SELECT regexp_replace(COALESCE(datos->>'cedula', ''), '\\D', '', 'g') AS cedula,
                  upper(btrim(regexp_replace(COALESCE(datos->>'empleado', ''), '\\s+', ' ', 'g'))) AS nombre,
                  count(*) AS n
             FROM modulo_dato_detalle
            WHERE encabezado_id = $1
            GROUP BY 1, 2
         ) q
        WHERE cedula <> '' AND nombre <> ''
        GROUP BY cedula
       HAVING count(*) > 1
        ORDER BY sum(n) DESC`,
      [encabezadoId],
    ),
    poolLectura().query<{ mes: string }>(
      `SELECT DISTINCT datos->>'periodoDesde' AS mes FROM modulo_dato_detalle
        WHERE encabezado_id = $1 AND datos->>'periodoDesde' ~ '^\\d{4}-\\d{2}$' ORDER BY 1`,
      [encabezadoId],
    ),
  ]);
  return {
    netos: netos.rows.map((r) => {
      const devengo = Number(r.devengo);
      const deduccion = Number(r.deduccion);
      const neto = Number(r.neto);
      return { filaNum: r.fila_num, cedula: r.cedula, devengo, deduccion, neto, esperado: devengo - Math.abs(deduccion) };
    }),
    cedulas: cedulas.rows.map((r) => ({ cedula: r.cedula, nombres: r.nombres, filas: Number(r.filas) })),
    meses: meses.rows.map((r) => r.mes),
  };
}

/** Cuántas filas tiene el detalle del cargue. */
export async function conteoDetalleCargue(encabezadoId: number): Promise<number> {
  const { rows } = await poolLectura().query<{ n: string }>(
    "SELECT count(*)::text AS n FROM modulo_dato_detalle WHERE encabezado_id = $1",
    [encabezadoId],
  );
  return Number(rows[0]?.n ?? 0);
}

/** Qué columnas trae el cargue: un `bool_or` por columna, resuelto en la base. */
export async function columnasConDatosCargue(encabezadoId: number, columnas: readonly ColumnaDetalle[]): Promise<Set<string>> {
  if (columnas.length === 0) return new Set();
  const parametros: unknown[] = [encabezadoId];
  const expresiones = columnas.map((columna, i) => {
    if (columna.familia) {
      parametros.push(columna.familia.clave, columna.familia.etiqueta);
      const clave = `$${parametros.length - 1}`;
      const rango = `$${parametros.length}`;
      return `bool_or(NULLIF(btrim(datos->${clave}->>${rango}), '') IS NOT NULL AND btrim(datos->${clave}->>${rango}) !~ '^-?0+(\\.0+)?$') AS c${i}`;
    }
    parametros.push(columna.nombre);
    return `bool_or(NULLIF(btrim(datos->>$${parametros.length}), '') IS NOT NULL) AS c${i}`;
  });
  const { rows } = await poolLectura().query<Record<string, boolean | null>>(
    `SELECT ${expresiones.join(", ")} FROM modulo_dato_detalle WHERE encabezado_id = $1`,
    parametros,
  );
  const fila = rows[0] ?? {};
  const clave = (c: ColumnaDetalle) => (c.familia ? `${c.familia.clave}.${c.familia.etiqueta}` : c.nombre);
  return new Set(columnas.map(clave).filter((_, i) => fila[`c${i}`] === true));
}

/**
 * Una página del detalle. Sin filtros la pide la base (LIMIT/OFFSET); con filtros hay que
 * recorrer el cargue y se filtra con la MISMA función pura que usaba el navegador.
 */
export async function paginaDetalleCargue(input: {
  encabezadoId: number;
  descriptor: DescriptorModulo;
  columnas: readonly ColumnaDetalle[];
  desde?: number;
  limite: number;
  filtros?: Record<string, string> | null;
}): Promise<PaginaDetalleCargue> {
  const { encabezadoId, descriptor, columnas, limite } = input;
  const desde = Number.isInteger(input.desde) && input.desde! > 0 ? input.desde! : 0;
  if (!input.filtros) {
    const [pagina, total] = await Promise.all([
      poolLectura().query<FilaCruda>(
        `SELECT ${CAMPOS} FROM modulo_dato_detalle WHERE encabezado_id = $1 ORDER BY fila_num ASC LIMIT ${Number(limite)} OFFSET ${Number(desde)}`,
        [encabezadoId],
      ),
      conteoDetalleCargue(encabezadoId),
    ]);
    return { filas: pagina.rows.map(aFila), total };
  }
  const { rows } = await poolLectura().query<FilaCruda>(
    `SELECT ${CAMPOS} FROM modulo_dato_detalle WHERE encabezado_id = $1 ORDER BY fila_num ASC`,
    [encabezadoId],
  );
  const filtradas = filtrarFilasDetalleModulo(rows.map(aFila), [...columnas], input.filtros, (fila, columna) =>
    columna.nombre === descriptor.clasificador ? fila.clasificador : valorColumnaDetalle(fila, columna));
  return { filas: filtradas.slice(desde, desde + limite), total: filtradas.length };
}
