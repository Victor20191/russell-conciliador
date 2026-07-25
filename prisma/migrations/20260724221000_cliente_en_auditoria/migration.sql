BEGIN;

ALTER TABLE "registros_auditoria"
  ADD COLUMN "cliente_id" INTEGER;

CREATE INDEX "registros_auditoria_cliente_id_creado_en_idx"
  ON "registros_auditoria" ("cliente_id", "creado_en");

-- Recupera las entradas históricas cuyo texto identifica al cliente de manera
-- inequívoca. Las entradas ambiguas permanecen sin cliente y solo se consultan
-- en la auditoría global.
UPDATE "registros_auditoria" AS auditoria
SET "cliente_id" = cliente."id"
FROM "clientes" AS cliente
WHERE auditoria."cliente_id" IS NULL
  AND auditoria."entidad" = 'cliente ' || cliente."id"::text;

WITH clientes_unicos AS (
  SELECT MIN("id") AS "id", "nombre"
  FROM "clientes"
  GROUP BY "nombre"
  HAVING COUNT(*) = 1
)
UPDATE "registros_auditoria" AS auditoria
SET "cliente_id" = cliente."id"
FROM clientes_unicos AS cliente
WHERE auditoria."cliente_id" IS NULL
  AND (
    auditoria."entidad" = cliente."nombre"
    OR POSITION(cliente."nombre" || ' · ' IN auditoria."entidad") = 1
  );

COMMIT;
