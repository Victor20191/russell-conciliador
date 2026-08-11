-- Los cargues realizados antes del versionado podían anexarse al encabezado
-- oficial sin dejar una fecha de recarga en ese encabezado. La auditoría sí
-- conservó el instante de la operación con la acción "AGREGÓ A <módulo>".
--
-- Para registros de auditoría antiguos sin cliente_id se resuelve el cliente
-- por nombre SOLO cuando la coincidencia en clientes es única. Después se exige
-- coincidencia exacta de cliente, módulo y período con el único oficial vigente.
-- La actualización es idempotente y no reconstruye versiones, archivos ni filas.
WITH auditorias_anexo AS (
  SELECT
    COALESCE(auditoria."cliente_id", cliente_unico."id") AS "cliente_id",
    CASE auditoria."accion"
      WHEN 'AGREGÓ A Inventarios' THEN 'INV'
      WHEN 'AGREGÓ A Activos Fijos' THEN 'AFI'
      WHEN 'AGREGÓ A Cartera' THEN 'CAR'
      WHEN 'AGREGÓ A Cuentas por Pagar' THEN 'CXP'
      WHEN 'AGREGÓ A Ingresos' THEN 'ING'
      WHEN 'AGREGÓ A Nómina' THEN 'NOM'
    END AS "modulo_codigo",
    split_part(auditoria."detalle", ' · ', 1) AS "periodo",
    auditoria."creado_en"
  FROM "registros_auditoria" AS auditoria
  LEFT JOIN LATERAL (
    SELECT MIN(cliente."id") AS "id"
    FROM "clientes" AS cliente
    WHERE cliente."nombre" = auditoria."entidad"
    HAVING COUNT(*) = 1
  ) AS cliente_unico ON true
  WHERE auditoria."accion" IN (
    'AGREGÓ A Inventarios',
    'AGREGÓ A Activos Fijos',
    'AGREGÓ A Cartera',
    'AGREGÓ A Cuentas por Pagar',
    'AGREGÓ A Ingresos',
    'AGREGÓ A Nómina'
  )
    AND auditoria."detalle" ~ '^[0-9]{4}-(0[1-9]|1[0-2]) · '
), recargas_inequivocas AS (
  SELECT
    encabezado."id",
    MAX(auditoria."creado_en") AS "ultima_carga"
  FROM "modulo_dato_encabezado" AS encabezado
  INNER JOIN auditorias_anexo AS auditoria
    ON auditoria."cliente_id" = encabezado."cliente_id"
   AND auditoria."modulo_codigo" = encabezado."modulo_codigo"
   AND auditoria."periodo" = encabezado."periodo"
  WHERE encabezado."es_oficial" = true
    AND auditoria."creado_en" > encabezado."ultima_carga"
  GROUP BY encabezado."id"
)
UPDATE "modulo_dato_encabezado" AS encabezado
SET "ultima_carga" = recarga."ultima_carga"
FROM recargas_inequivocas AS recarga
WHERE encabezado."id" = recarga."id"
  AND recarga."ultima_carga" > encabezado."ultima_carga";
