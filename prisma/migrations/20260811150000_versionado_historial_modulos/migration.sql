-- Conserva la metadata del archivo después de consumir el borrador.
ALTER TABLE "modulo_dato_encabezado"
  ADD COLUMN "archivo_nombre" TEXT,
  ADD COLUMN "archivo_tam" TEXT,
  ADD COLUMN "origen_extraccion" TEXT,
  ADD COLUMN "ultima_carga" TIMESTAMPTZ(3);

UPDATE "modulo_dato_encabezado"
SET "ultima_carga" = "creado_en"
WHERE "ultima_carga" IS NULL;

ALTER TABLE "modulo_dato_encabezado"
  ALTER COLUMN "ultima_carga" SET NOT NULL,
  ALTER COLUMN "ultima_carga" SET DEFAULT CURRENT_TIMESTAMP;

-- Corrige duplicados oficiales históricos conservando la versión más reciente.
WITH oficiales AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "cliente_id", "modulo_codigo", "periodo"
      ORDER BY "version" DESC, "ultima_carga" DESC, "id" DESC
    ) AS rn
  FROM "modulo_dato_encabezado"
  WHERE "es_oficial" = true
)
UPDATE "modulo_dato_encabezado" AS dato
SET "es_oficial" = false
FROM oficiales
WHERE dato."id" = oficiales."id"
  AND oficiales.rn > 1;

-- Garantía física: una sola versión vigente por cliente, módulo y período.
CREATE UNIQUE INDEX "modulo_dato_oficial_unico_cliente_modulo_periodo_idx"
ON "modulo_dato_encabezado" ("cliente_id", "modulo_codigo", "periodo")
WHERE "es_oficial" = true;
