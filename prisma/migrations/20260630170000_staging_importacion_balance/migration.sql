-- CreateTable
CREATE TABLE "balance_importacion_staging" (
    "id" SERIAL NOT NULL,
    "lote_id" TEXT NOT NULL,
    "cliente_id" INTEGER,
    "hoja" TEXT,
    "fila_num" INTEGER NOT NULL,
    "codigo_crudo" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nivel" INTEGER,
    "tipo_fila" TEXT NOT NULL,
    "saldo_inicial" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "debitos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldo_final" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_importacion_staging_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "balance_importacion_staging_lote_id_idx" ON "balance_importacion_staging"("lote_id");

-- CreateIndex
CREATE INDEX "balance_importacion_staging_cliente_id_idx" ON "balance_importacion_staging"("cliente_id");
