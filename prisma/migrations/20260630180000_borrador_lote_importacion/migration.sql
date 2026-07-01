-- CreateTable
CREATE TABLE "balance_importacion_lote" (
    "id" SERIAL NOT NULL,
    "lote_id" TEXT NOT NULL,
    "cliente_id" INTEGER,
    "archivo_nombre" TEXT NOT NULL,
    "archivo_tam" TEXT,
    "nit_detectado" TEXT,
    "periodo_inicial" TEXT,
    "periodo_final" TEXT,
    "estandar" TEXT,
    "convencion_credito" TEXT,
    "cuentas_movimiento" INTEGER NOT NULL DEFAULT 0,
    "filas_leidas" INTEGER NOT NULL DEFAULT 0,
    "filas_excluidas" INTEGER NOT NULL DEFAULT 0,
    "partida_doble_diff" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ecuacion_diff" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cuadrado" BOOLEAN NOT NULL DEFAULT false,
    "cargado_por" TEXT,
    "cargado_por_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_importacion_lote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "balance_importacion_lote_lote_id_key" ON "balance_importacion_lote"("lote_id");

-- CreateIndex
CREATE INDEX "balance_importacion_lote_cargado_por_id_idx" ON "balance_importacion_lote"("cargado_por_id");
