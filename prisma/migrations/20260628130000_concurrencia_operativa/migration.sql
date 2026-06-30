-- Índice para filtrar cruces por cliente y fecha en vistas multiusuario.
CREATE INDEX IF NOT EXISTS "conciliaciones_cliente_creado_en_idx"
ON "conciliaciones" ("cliente_id", "creado_en");

-- Si ya existieran duplicados oficiales por concurrencia histórica, conserva
-- como oficial la versión más reciente antes de crear la restricción.
WITH oficiales AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "cliente_id", "periodo"
      ORDER BY "congelado_en" DESC NULLS LAST, "creado_en" DESC, "id" DESC
    ) AS rn
  FROM "balance_prueba_encabezado"
  WHERE "es_oficial" = true
)
UPDATE "balance_prueba_encabezado" AS balance
SET "es_oficial" = false
FROM oficiales
WHERE balance."id" = oficiales."id"
  AND oficiales.rn > 1;

-- Garantía física: una sola versión oficial por cliente y período.
CREATE UNIQUE INDEX IF NOT EXISTS "balance_prueba_oficial_unico_cliente_periodo_idx"
ON "balance_prueba_encabezado" ("cliente_id", "periodo")
WHERE "es_oficial" = true;
