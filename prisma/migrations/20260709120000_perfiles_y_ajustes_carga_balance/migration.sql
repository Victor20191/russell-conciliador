-- Perfiles de carga de balance por cliente (memoria de la ESTRUCTURA del archivo,
-- llaveada por huella del layout) + preferencias por defecto de carga por cliente
-- + trazabilidad de la extracción en el lote de importación (para guardar el
-- perfil al confirmar). Todo aditivo, sin backfill.

-- AlterTable: trazabilidad de la extracción en el lote (borrador).
ALTER TABLE "balance_importacion_lote" ADD COLUMN "huella" TEXT;
ALTER TABLE "balance_importacion_lote" ADD COLUMN "origen_extraccion" TEXT;
ALTER TABLE "balance_importacion_lote" ADD COLUMN "spec_json" JSONB;

-- CreateTable: perfiles de carga (MappingSpec aplanado por cliente + huella).
CREATE TABLE "perfiles_carga_balance" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "huella" TEXT NOT NULL,
    "hoja" TEXT NOT NULL,
    "fila_encabezado" INTEGER NOT NULL,
    "primera_fila_datos" INTEGER NOT NULL,
    "col_codigo" INTEGER NOT NULL,
    "col_nombre" INTEGER NOT NULL,
    "col_saldo_inicial" INTEGER NOT NULL,
    "col_debitos" INTEGER NOT NULL,
    "col_creditos" INTEGER NOT NULL,
    "col_saldo_final" INTEGER NOT NULL,
    "col_saldo_final_debito" INTEGER NOT NULL,
    "col_saldo_final_credito" INTEGER NOT NULL,
    "col_tercero" INTEGER NOT NULL,
    "signo_credito" TEXT NOT NULL,
    "regla_detalle_tipo" TEXT NOT NULL,
    "regla_detalle_columna" INTEGER,
    "regla_detalle_valor" TEXT,
    "agregar_por_tercero" BOOLEAN NOT NULL DEFAULT false,
    "origen" TEXT NOT NULL,
    "veces_usado" INTEGER NOT NULL DEFAULT 0,
    "ultimo_uso_en" TIMESTAMP(3),
    "archivo_ejemplo" TEXT,
    "creado_por" TEXT,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfiles_carga_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable: preferencias por defecto de carga por cliente (una fila por cliente).
CREATE TABLE "ajustes_carga_balance" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "hoja_preferida" TEXT,
    "convencion_credito" TEXT,
    "estandar" TEXT,
    "agregar_por_tercero" BOOLEAN,
    "actualizado_por" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ajustes_carga_balance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "perfiles_carga_balance_huella_idx" ON "perfiles_carga_balance"("huella");

-- CreateIndex
CREATE UNIQUE INDEX "perfiles_carga_balance_cliente_id_huella_key" ON "perfiles_carga_balance"("cliente_id", "huella");

-- CreateIndex
CREATE UNIQUE INDEX "ajustes_carga_balance_cliente_id_key" ON "ajustes_carga_balance"("cliente_id");
