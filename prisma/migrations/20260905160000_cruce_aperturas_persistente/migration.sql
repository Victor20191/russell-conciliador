-- Aditiva: no cambia saldos, aperturas, borradores ni oficialidad.
CREATE TABLE "balance_cruce_aperturas" (
    "id" SERIAL NOT NULL,
    "balance_cuenta_id" INTEGER NOT NULL,
    "balance_tercero_id" INTEGER NOT NULL,
    "inconsistente" BOOLEAN NOT NULL DEFAULT false,
    "resultado" JSONB NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "balance_cruce_aperturas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "balance_cruce_aperturas_archivos_distintos" CHECK ("balance_cuenta_id" <> "balance_tercero_id")
);

CREATE UNIQUE INDEX "balance_cruce_aperturas_balance_cuenta_id_balance_tercero_id_key"
    ON "balance_cruce_aperturas"("balance_cuenta_id", "balance_tercero_id");
CREATE INDEX "balance_cruce_aperturas_balance_tercero_id_idx"
    ON "balance_cruce_aperturas"("balance_tercero_id");

ALTER TABLE "balance_cruce_aperturas" ADD CONSTRAINT "balance_cruce_aperturas_balance_cuenta_id_fkey"
    FOREIGN KEY ("balance_cuenta_id") REFERENCES "balance_prueba_encabezado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "balance_cruce_aperturas" ADD CONSTRAINT "balance_cruce_aperturas_balance_tercero_id_fkey"
    FOREIGN KEY ("balance_tercero_id") REFERENCES "balance_prueba_encabezado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
