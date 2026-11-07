-- Balance contra el que se concilia un período (7/Nov/2026): cuando varios balances cerrados y
-- vigentes terminan en la fecha de corte, el usuario escoge uno (módulos y Retención, `RET`).
-- Aditiva: sin filas, el cruce preselecciona el de modificación más reciente.
CREATE TABLE "eleccion_balance_cruce" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "balance_encabezado_id" INTEGER NOT NULL,
    "elegido_por" TEXT,
    "elegido_por_id" INTEGER,
    "elegido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eleccion_balance_cruce_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "eleccion_balance_cruce_unico"
    ON "eleccion_balance_cruce"("cliente_id", "modulo_codigo", "periodo");
CREATE INDEX "eleccion_balance_cruce_balance_encabezado_id_idx"
    ON "eleccion_balance_cruce"("balance_encabezado_id");

ALTER TABLE "eleccion_balance_cruce" ADD CONSTRAINT "eleccion_balance_cruce_balance_encabezado_id_fkey"
    FOREIGN KEY ("balance_encabezado_id") REFERENCES "balance_prueba_encabezado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
