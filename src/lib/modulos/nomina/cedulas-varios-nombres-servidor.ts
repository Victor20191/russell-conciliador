import "server-only";

// Nómina · cédulas con más de un nombre de empleado. Desde el 9/Nov/2026 ya no bloquean aprobar el
// borrador: se resaltan en el borrador y en Novedades, y para cerrar la conciliación la alerta
// «Cédula con varios nombres» exige un comentario (`comentarios-alertas.ts`). En el borrador se mira
// TODO el archivo —también las filas omitidas o reclasificadas—; en el cargue, su detalle (lo mismo
// que muestran Novedades y el cierre). La base agrupa por el nombre en mayúsculas (un archivo de
// nómina son cientos de miles de filas) y el filtro fino (tildes, puntuación, orden de palabras) se
// hace aquí.
import { poolLectura } from "../pool-lectura";
import { filtrarCedulasConVariosNombres, type CedulaConVariosNombres } from "./validaciones-nomina";

async function cedulasConVariosNombres(origen: "modulo_importacion_staging" | "modulo_dato_detalle", filtro: "lote_id" | "encabezado_id", id: string | number): Promise<CedulaConVariosNombres[]> {
  const { rows } = await poolLectura().query<{ cedula: string; nombres: string[]; filas: string }>(
    `SELECT cedula, array_agg(DISTINCT nombre ORDER BY nombre) AS nombres, sum(n)::text AS filas
       FROM (
         SELECT regexp_replace(COALESCE(datos->>'cedula', ''), '\\D', '', 'g') AS cedula,
                upper(btrim(regexp_replace(COALESCE(datos->>'empleado', ''), '\\s+', ' ', 'g'))) AS nombre,
                count(*) AS n
           FROM ${origen}
          WHERE ${filtro} = $1
          GROUP BY 1, 2
       ) q
      WHERE cedula <> '' AND nombre <> ''
      GROUP BY cedula
     HAVING count(*) > 1
      ORDER BY sum(n) DESC`,
    [id],
  );
  return filtrarCedulasConVariosNombres(rows.map((r) => ({ cedula: r.cedula, nombres: r.nombres, filas: Number(r.filas) })));
}

/** Las del borrador: todas las filas del archivo en staging. */
export function cedulasConVariosNombresDelLote(loteId: string): Promise<CedulaConVariosNombres[]> {
  return cedulasConVariosNombres("modulo_importacion_staging", "lote_id", loteId);
}

/** Las del cargue: su detalle, como lo ven Novedades y el cierre. */
export function cedulasConVariosNombresDelCargue(encabezadoId: number): Promise<CedulaConVariosNombres[]> {
  return cedulasConVariosNombres("modulo_dato_detalle", "encabezado_id", encabezadoId);
}
