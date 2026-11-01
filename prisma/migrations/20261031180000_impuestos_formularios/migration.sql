-- Impuestos · Retención en la fuente, Fase 2: revisiones y formularios cargados (31/Oct/2026). Aditiva.
--
-- · revision_retencion: una revisión por cliente, año y corte (precierre, cierre u otro mes).
-- · formulario_dian_cargado: cada PDF 350 o 490 leído con IA, del cliente y el año (no de la
--   revisión: el precierre y el cierre comparten los de enero a septiembre). Se confirma antes de contar.
-- · renglon_formulario_dian: importes guardados de cada formulario (sin bases ni firmas).
-- · periodo_sin_formulario: meses sin 350, con su causal.
--
-- Ningún código anterior lee estas tablas.

-- CreateTable
CREATE TABLE "revision_retencion" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "nombre_cliente" TEXT NOT NULL,
    "nit_cliente" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes_corte" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "periodicidad" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'en_proceso',
    "creado_por" TEXT,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "revision_retencion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formulario_dian_cargado" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "periodo" INTEGER NOT NULL,
    "formulario" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'por_confirmar',
    "codigo_correccion" INTEGER,
    "numero_anterior" TEXT,
    "concepto" TEXT,
    "numero_pagado" TEXT,
    "cuota" INTEGER,
    "de_cuotas" INTEGER,
    "fecha_limite_pago" DATE,
    "fecha_sello" DATE,
    "autoadhesivo" TEXT,
    "nit_leido" TEXT,
    "dv_leido" TEXT,
    "razon_social" TEXT,
    "anexo_exterior" JSONB,
    "nombre_archivo" TEXT NOT NULL,
    "clave_objeto" TEXT,
    "huella_sha256" TEXT NOT NULL,
    "tamano_bytes" INTEGER NOT NULL,
    "lectura_json" JSONB NOT NULL,
    "modelo_lectura" TEXT NOT NULL,
    "controles_json" JSONB NOT NULL,
    "corregido_a_mano" JSONB,
    "cargado_por" TEXT,
    "cargado_por_id" INTEGER,
    "confirmado_por" TEXT,
    "confirmado_por_id" INTEGER,
    "confirmado_en" TIMESTAMPTZ(3),
    "descartado_por" TEXT,
    "descartado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "formulario_dian_cargado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renglon_formulario_dian" (
    "id" SERIAL NOT NULL,
    "formulario_id" INTEGER NOT NULL,
    "renglon" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "renglon_formulario_dian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodo_sin_formulario" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "periodo" INTEGER NOT NULL,
    "formulario" TEXT NOT NULL,
    "causal" TEXT NOT NULL,
    "registrado_por" TEXT,
    "registrado_por_id" INTEGER,
    "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "periodo_sin_formulario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "revision_retencion_cliente_id_anio_idx" ON "revision_retencion"("cliente_id", "anio");

-- CreateIndex
CREATE UNIQUE INDEX "revision_retencion_cliente_id_anio_mes_corte_key" ON "revision_retencion"("cliente_id", "anio", "mes_corte");

-- CreateIndex
CREATE UNIQUE INDEX "formulario_dian_cargado_numero_key" ON "formulario_dian_cargado"("numero");

-- CreateIndex
CREATE INDEX "formulario_dian_cargado_cliente_id_anio_formulario_estado_idx" ON "formulario_dian_cargado"("cliente_id", "anio", "formulario", "estado");

-- CreateIndex
CREATE INDEX "formulario_dian_cargado_cliente_id_huella_sha256_idx" ON "formulario_dian_cargado"("cliente_id", "huella_sha256");

-- CreateIndex
CREATE UNIQUE INDEX "renglon_formulario_dian_formulario_id_renglon_key" ON "renglon_formulario_dian"("formulario_id", "renglon");

-- CreateIndex
CREATE UNIQUE INDEX "periodo_sin_formulario_cliente_id_anio_periodo_formulario_key" ON "periodo_sin_formulario"("cliente_id", "anio", "periodo", "formulario");

-- AddForeignKey
ALTER TABLE "renglon_formulario_dian" ADD CONSTRAINT "renglon_formulario_dian_formulario_id_fkey" FOREIGN KEY ("formulario_id") REFERENCES "formulario_dian_cargado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

