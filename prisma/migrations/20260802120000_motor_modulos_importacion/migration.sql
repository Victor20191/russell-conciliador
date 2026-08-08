-- Motor genérico de importación de módulos (Inventarios, Cartera, CxP, Ingresos,
-- Activos Fijos, Nómina): lote/staging + encabezado/detalle oficiales + perfiles/
-- ajustes/correcciones por (cliente, módulo) + consolidación clasificador→cuenta 4 díg.

-- CreateTable
CREATE TABLE "modulo_importacion_lote" (
    "id" SERIAL NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "lote_id" TEXT NOT NULL,
    "cliente_id" INTEGER,
    "archivo_nombre" TEXT NOT NULL,
    "archivo_tam" TEXT,
    "periodo_inicial" DATE,
    "periodo_final" DATE,
    "filas_leidas" INTEGER NOT NULL DEFAULT 0,
    "filas_excluidas" INTEGER NOT NULL DEFAULT 0,
    "huella" TEXT,
    "origen_extraccion" TEXT,
    "spec_json" JSONB,
    "correcciones_aplicadas" INTEGER NOT NULL DEFAULT 0,
    "cargado_por" TEXT,
    "cargado_por_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "modulo_importacion_lote_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "modulo_importacion_staging" (
    "id" SERIAL NOT NULL,
    "lote_id" TEXT NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "cliente_id" INTEGER,
    "hoja" TEXT,
    "fila_num" INTEGER NOT NULL,
    "clasificador" TEXT,
    "valor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "tipo_fila" TEXT NOT NULL DEFAULT 'movimiento',
    "tipo_fila_forzado" TEXT,
    "omitida" BOOLEAN,
    "padre_manual" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "modulo_importacion_staging_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "modulo_dato_encabezado" (
    "id" SERIAL NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "lote_id" TEXT,
    "cliente_id" INTEGER NOT NULL,
    "nombre_cliente" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "es_oficial" BOOLEAN NOT NULL DEFAULT true,
    "esta_congelado" BOOLEAN NOT NULL DEFAULT false,
    "congelado_por" TEXT,
    "congelado_en" TIMESTAMPTZ(3),
    "filas" INTEGER NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cargado_por" TEXT,
    "cargado_por_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "modulo_dato_encabezado_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "modulo_dato_detalle" (
    "id" SERIAL NOT NULL,
    "encabezado_id" INTEGER NOT NULL,
    "fila_num" INTEGER NOT NULL,
    "clasificador" TEXT,
    "valor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "datos" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "modulo_dato_detalle_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "perfiles_carga_modulo" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "huella" TEXT NOT NULL,
    "spec_json" JSONB NOT NULL,
    "origen" TEXT NOT NULL,
    "veces_usado" INTEGER NOT NULL DEFAULT 0,
    "ultimo_uso_en" TIMESTAMPTZ(3),
    "archivo_ejemplo" TEXT,
    "creado_por" TEXT,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "perfiles_carga_modulo_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ajustes_carga_modulo" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "hoja_preferida" TEXT,
    "observaciones" TEXT,
    "actualizado_por" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ajustes_carga_modulo_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "correcciones_carga_modulo" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT,
    "tipo_fila_forzado" TEXT,
    "omitida" BOOLEAN,
    "veces_aplicada" INTEGER NOT NULL DEFAULT 0,
    "ultimo_uso_en" TIMESTAMPTZ(3),
    "actualizado_por" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "correcciones_carga_modulo_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "consolidacion_modulo_cliente" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "clasificador" TEXT NOT NULL,
    "cuenta_4" TEXT NOT NULL,
    "actualizado_por" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "consolidacion_modulo_cliente_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "modulo_importacion_lote_lote_id_key" ON "modulo_importacion_lote"("lote_id");
-- CreateIndex
CREATE INDEX "modulo_importacion_lote_modulo_codigo_cliente_id_idx" ON "modulo_importacion_lote"("modulo_codigo", "cliente_id");
-- CreateIndex
CREATE INDEX "modulo_importacion_staging_lote_id_idx" ON "modulo_importacion_staging"("lote_id");
-- CreateIndex
CREATE INDEX "modulo_importacion_staging_modulo_codigo_cliente_id_idx" ON "modulo_importacion_staging"("modulo_codigo", "cliente_id");
-- CreateIndex
CREATE UNIQUE INDEX "modulo_dato_encabezado_lote_id_key" ON "modulo_dato_encabezado"("lote_id");
-- CreateIndex
CREATE INDEX "modulo_dato_encabezado_modulo_codigo_cliente_id_idx" ON "modulo_dato_encabezado"("modulo_codigo", "cliente_id");
-- CreateIndex
CREATE UNIQUE INDEX "modulo_dato_encabezado_cliente_id_modulo_codigo_periodo_ver_key" ON "modulo_dato_encabezado"("cliente_id", "modulo_codigo", "periodo", "version");
-- CreateIndex
CREATE INDEX "modulo_dato_detalle_encabezado_id_idx" ON "modulo_dato_detalle"("encabezado_id");
-- CreateIndex
CREATE INDEX "modulo_dato_detalle_clasificador_idx" ON "modulo_dato_detalle"("clasificador");
-- CreateIndex
CREATE INDEX "perfiles_carga_modulo_huella_idx" ON "perfiles_carga_modulo"("huella");
-- CreateIndex
CREATE UNIQUE INDEX "perfiles_carga_modulo_cliente_id_modulo_codigo_huella_key" ON "perfiles_carga_modulo"("cliente_id", "modulo_codigo", "huella");
-- CreateIndex
CREATE UNIQUE INDEX "ajustes_carga_modulo_cliente_id_modulo_codigo_key" ON "ajustes_carga_modulo"("cliente_id", "modulo_codigo");
-- CreateIndex
CREATE UNIQUE INDEX "correcciones_carga_modulo_cliente_id_modulo_codigo_clave_key" ON "correcciones_carga_modulo"("cliente_id", "modulo_codigo", "clave");
-- CreateIndex
CREATE INDEX "consolidacion_modulo_cliente_modulo_codigo_cliente_id_idx" ON "consolidacion_modulo_cliente"("modulo_codigo", "cliente_id");
-- CreateIndex
CREATE UNIQUE INDEX "consolidacion_modulo_cliente_cliente_id_modulo_codigo_clasi_key" ON "consolidacion_modulo_cliente"("cliente_id", "modulo_codigo", "clasificador");
-- AddForeignKey
ALTER TABLE "modulo_dato_detalle" ADD CONSTRAINT "modulo_dato_detalle_encabezado_id_fkey" FOREIGN KEY ("encabezado_id") REFERENCES "modulo_dato_encabezado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
