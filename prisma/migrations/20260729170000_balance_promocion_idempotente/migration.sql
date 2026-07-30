-- Vincula de forma única cada balance promovido con el lote de borrador que lo
-- originó. Es nullable para conservar los balances históricos, que no guardaban
-- esa trazabilidad; todas las promociones nuevas lo escriben obligatoriamente.
ALTER TABLE "balance_prueba_encabezado"
ADD COLUMN "lote_id" TEXT;

CREATE UNIQUE INDEX "balance_prueba_encabezado_lote_id_key"
ON "balance_prueba_encabezado"("lote_id");
