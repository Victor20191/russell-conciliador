-- CreateTable
CREATE TABLE "balance_prueba_encabezado" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "nombre_cliente" TEXT NOT NULL,
    "nit" TEXT,
    "periodo" TEXT NOT NULL,
    "periodo_inicio" DATE NOT NULL,
    "periodo_fin" DATE NOT NULL,
    "centro_operativo" TEXT,
    "version" TEXT NOT NULL,
    "es_oficial" BOOLEAN NOT NULL DEFAULT false,
    "esta_congelado" BOOLEAN NOT NULL DEFAULT false,
    "estado" TEXT NOT NULL DEFAULT 'Única',
    "completitud" INTEGER NOT NULL DEFAULT 100,
    "archivo" TEXT,
    "tamano_archivo" TEXT,
    "cargado_por" TEXT,
    "rol_carga" TEXT,
    "cuadrado" BOOLEAN NOT NULL DEFAULT true,
    "nota" TEXT,
    "suma_activo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "filas_totales" INTEGER NOT NULL DEFAULT 0,
    "mapeadas" INTEGER NOT NULL DEFAULT 0,
    "sin_mapear" INTEGER NOT NULL DEFAULT 0,
    "criticas" INTEGER NOT NULL DEFAULT 0,
    "cambios" INTEGER NOT NULL DEFAULT 0,
    "estandar" TEXT,
    "convencion_credito" TEXT,
    "filas_leidas" INTEGER,
    "filas_excluidas" INTEGER,
    "filas_descuadre" INTEGER,
    "congelado_por" TEXT,
    "congelado_en" TIMESTAMP(3),
    "ultima_carga" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_prueba_encabezado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_prueba_detalle" (
    "id" SERIAL NOT NULL,
    "encabezado_id" INTEGER NOT NULL,
    "cuenta_2" TEXT NOT NULL,
    "cuenta_4" TEXT NOT NULL,
    "cuenta_6" TEXT NOT NULL,
    "cuenta_8" TEXT NOT NULL,
    "nombre_cuenta" TEXT NOT NULL,
    "cuenta_6_russell" TEXT,
    "porcentaje_coincidencia" DECIMAL(5,2),
    "saldo_inicial" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "debitos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldo_final" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "balance_prueba_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "balance_prueba_encabezado_cliente_id_periodo_idx" ON "balance_prueba_encabezado"("cliente_id", "periodo");

-- CreateIndex
CREATE INDEX "balance_prueba_encabezado_nombre_cliente_idx" ON "balance_prueba_encabezado"("nombre_cliente");

-- CreateIndex
CREATE UNIQUE INDEX "balance_prueba_encabezado_cliente_id_periodo_version_key" ON "balance_prueba_encabezado"("cliente_id", "periodo", "version");

-- CreateIndex
CREATE INDEX "balance_prueba_detalle_encabezado_id_idx" ON "balance_prueba_detalle"("encabezado_id");

-- CreateIndex
CREATE INDEX "balance_prueba_detalle_cuenta_6_idx" ON "balance_prueba_detalle"("cuenta_6");

-- CreateIndex
CREATE INDEX "balance_prueba_detalle_cuenta_6_russell_idx" ON "balance_prueba_detalle"("cuenta_6_russell");

-- AddForeignKey
ALTER TABLE "balance_prueba_detalle" ADD CONSTRAINT "balance_prueba_detalle_encabezado_id_fkey" FOREIGN KEY ("encabezado_id") REFERENCES "balance_prueba_encabezado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
