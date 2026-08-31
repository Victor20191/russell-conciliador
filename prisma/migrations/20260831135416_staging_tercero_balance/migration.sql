-- CreateTable
CREATE TABLE "balance_importacion_staging_tercero" (
    "id" SERIAL NOT NULL,
    "lote_id" TEXT NOT NULL,
    "fila_num" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "codigo_crudo" TEXT,
    "nombre_cuenta" TEXT,
    "nit_tercero" TEXT,
    "nombre_tercero" TEXT,
    "saldo_inicial" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "debitos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldo_final" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_importacion_staging_tercero_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "balance_importacion_staging_tercero_lote_id_idx" ON "balance_importacion_staging_tercero"("lote_id");

