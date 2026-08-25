
-- CreateTable
CREATE TABLE "balance_tercero_encabezado" (
    "id" SERIAL NOT NULL,
    "lote_id" TEXT,
    "cliente_id" INTEGER NOT NULL,
    "nombre_cliente" TEXT NOT NULL,
    "nit" TEXT,
    "periodo" TEXT NOT NULL,
    "periodo_inicio" DATE NOT NULL,
    "periodo_fin" DATE NOT NULL,
    "version" TEXT NOT NULL,
    "es_oficial" BOOLEAN NOT NULL DEFAULT false,
    "esta_congelado" BOOLEAN NOT NULL DEFAULT false,
    "archivo" TEXT,
    "tamano_archivo" TEXT,
    "huella" TEXT,
    "origen_extraccion" TEXT,
    "cargado_por" TEXT,
    "filas_totales" INTEGER NOT NULL DEFAULT 0,
    "ultima_carga" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_tercero_encabezado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_tercero_detalle" (
    "id" SERIAL NOT NULL,
    "encabezado_id" INTEGER NOT NULL,
    "cuenta_2" TEXT NOT NULL,
    "cuenta_4" TEXT NOT NULL,
    "cuenta_6" TEXT NOT NULL,
    "cuenta_8" TEXT NOT NULL,
    "nombre_cuenta" TEXT NOT NULL,
    "cuenta_6_russell" TEXT,
    "porcentaje_coincidencia" DECIMAL(5,2),
    "nit_tercero" TEXT,
    "nombre_tercero" TEXT,
    "saldo_inicial" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "debitos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldo_final" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_tercero_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "balance_tercero_encabezado_lote_id_key" ON "balance_tercero_encabezado"("lote_id");

-- CreateIndex
CREATE INDEX "balance_tercero_encabezado_cliente_id_periodo_idx" ON "balance_tercero_encabezado"("cliente_id", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "balance_tercero_encabezado_cliente_id_periodo_version_key" ON "balance_tercero_encabezado"("cliente_id", "periodo", "version");

-- CreateIndex
CREATE INDEX "balance_tercero_detalle_encabezado_id_idx" ON "balance_tercero_detalle"("encabezado_id");

-- CreateIndex
CREATE INDEX "balance_tercero_detalle_cuenta_4_idx" ON "balance_tercero_detalle"("cuenta_4");

-- CreateIndex
CREATE INDEX "balance_tercero_detalle_nit_tercero_idx" ON "balance_tercero_detalle"("nit_tercero");

-- AddForeignKey
ALTER TABLE "balance_tercero_detalle" ADD CONSTRAINT "balance_tercero_detalle_encabezado_id_fkey" FOREIGN KEY ("encabezado_id") REFERENCES "balance_tercero_encabezado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

