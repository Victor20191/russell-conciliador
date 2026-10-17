import "server-only";

// Nómina · reporte con errores (17/Oct/2026): una cédula con más de un nombre de empleado bloquea
// aprobar el borrador, sin excepción. Se evalúa sobre TODAS las filas del archivo —también las
// omitidas o reclasificadas—, igual que la novedad del cargue: la salida es corregir el archivo y
// volver a cargarlo. La base agrupa por el nombre en mayúsculas (un archivo de nómina son cientos de
// miles de filas) y el filtro fino (tildes, puntuación, orden de palabras) se hace aquí.
import { poolLectura } from "../pool-lectura";
import { filtrarCedulasConVariosNombres, type CedulaConVariosNombres } from "./validaciones-nomina";

export async function cedulasConVariosNombresDelLote(loteId: string): Promise<CedulaConVariosNombres[]> {
  const { rows } = await poolLectura().query<{ cedula: string; nombres: string[]; filas: string }>(
    `SELECT cedula, array_agg(DISTINCT nombre ORDER BY nombre) AS nombres, sum(n)::text AS filas
       FROM (
         SELECT regexp_replace(COALESCE(datos->>'cedula', ''), '\\D', '', 'g') AS cedula,
                upper(btrim(regexp_replace(COALESCE(datos->>'empleado', ''), '\\s+', ' ', 'g'))) AS nombre,
                count(*) AS n
           FROM modulo_importacion_staging
          WHERE lote_id = $1
          GROUP BY 1, 2
       ) q
      WHERE cedula <> '' AND nombre <> ''
      GROUP BY cedula
     HAVING count(*) > 1
      ORDER BY sum(n) DESC`,
    [loteId],
  );
  return filtrarCedulasConVariosNombres(rows.map((r) => ({ cedula: r.cedula, nombres: r.nombres, filas: Number(r.filas) })));
}
