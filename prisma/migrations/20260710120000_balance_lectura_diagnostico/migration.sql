-- Huella diagnóstica de la lectura de balances (medición; NO afecta la lectura).
-- Una fila por evento de importación, con ref suave a lote/cliente para que SOBREVIVA
-- a la purga del lote/staging al confirmar o descartar.
CREATE TABLE "balance_lectura_diagnostico" (
    "id" SERIAL NOT NULL,
    "lote_id" TEXT NOT NULL,
    "cliente_id" INTEGER,
    "archivo_nombre" TEXT NOT NULL,
    "modo" TEXT,
    "formato" TEXT,
    "filas" INTEGER NOT NULL DEFAULT 0,
    "movimientos" INTEGER NOT NULL DEFAULT 0,
    "cuadrado_inicial" BOOLEAN NOT NULL DEFAULT false,
    "resultado" TEXT NOT NULL DEFAULT 'borrador',
    "cuadrado_final" BOOLEAN,
    "manual_omitidas" INTEGER NOT NULL DEFAULT 0,
    "manual_reparentadas" INTEGER NOT NULL DEFAULT 0,
    "manual_desacopladas" INTEGER NOT NULL DEFAULT 0,
    "heuristicas" JSONB NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "balance_lectura_diagnostico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "balance_lectura_diagnostico_lote_id_idx" ON "balance_lectura_diagnostico"("lote_id");
