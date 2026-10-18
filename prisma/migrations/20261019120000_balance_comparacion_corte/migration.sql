-- Balances por fecha de corte (18/Oct/2026): comparación de SALDOS FINALES entre dos balances
-- vigentes del mismo cliente y la misma fecha fin. Aditiva: no cambia saldos, cierres ni
-- `balance_cruce_aperturas`, que deja de usarse y se borra en una migración posterior.
CREATE TABLE "balance_comparacion_corte" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "periodo_fin" DATE NOT NULL,
    "balance_a_id" INTEGER NOT NULL,
    "balance_b_id" INTEGER NOT NULL,
    "inconsistente" BOOLEAN NOT NULL DEFAULT false,
    "cuentas_comparadas" INTEGER NOT NULL DEFAULT 0,
    "resultado" JSONB NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "balance_comparacion_corte_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "balance_comparacion_corte_par_ordenado" CHECK ("balance_a_id" < "balance_b_id")
);

CREATE UNIQUE INDEX "balance_comparacion_corte_balance_a_id_balance_b_id_key"
    ON "balance_comparacion_corte"("balance_a_id", "balance_b_id");
CREATE INDEX "balance_comparacion_corte_cliente_id_periodo_fin_idx"
    ON "balance_comparacion_corte"("cliente_id", "periodo_fin");
CREATE INDEX "balance_comparacion_corte_balance_b_id_idx"
    ON "balance_comparacion_corte"("balance_b_id");

ALTER TABLE "balance_comparacion_corte" ADD CONSTRAINT "balance_comparacion_corte_balance_a_id_fkey"
    FOREIGN KEY ("balance_a_id") REFERENCES "balance_prueba_encabezado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "balance_comparacion_corte" ADD CONSTRAINT "balance_comparacion_corte_balance_b_id_fkey"
    FOREIGN KEY ("balance_b_id") REFERENCES "balance_prueba_encabezado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
