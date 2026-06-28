-- CONSUMO DE IA (tokens y costos de escaneos con Claude) + TASAS DE CAMBIO (TRM).
--
-- `consumo_ia`: UNA fila por LLAMADA a la API de Claude durante el escaneo de
-- documentos (extracción tabular/PDF y mapeo por lotes). Diseño genérico
-- (`tipo_operacion`) para cualquier IA futura. `cliente_id`/`usuario_id` son FK
-- LÓGICAS (solo Int, sin restricción ni cascada), como el resto de registros.
-- `costo_usd`/`trm`/`costo_cop` son SNAPSHOT: se congelan al registrar.
--
-- `tasas_cambio`: histórico de la TRM oficial (Superfinanciera, datos.gov.co),
-- fallback durable de `getTRM()`.

-- CreateTable
CREATE TABLE "consumo_ia" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER,
    "usuario_id" INTEGER,
    "usuario_nombre" TEXT,
    "modulo" TEXT NOT NULL DEFAULT 'balance',
    "tipo_operacion" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "archivo_nombre" TEXT,
    "nit_detectado" TEXT,
    "lote_indice" INTEGER,
    "cuentas_lote" INTEGER,
    "tokens_entrada" INTEGER NOT NULL DEFAULT 0,
    "tokens_salida" INTEGER NOT NULL DEFAULT 0,
    "tokens_cache_creacion" INTEGER NOT NULL DEFAULT 0,
    "tokens_cache_lectura" INTEGER NOT NULL DEFAULT 0,
    "costo_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "trm" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "costo_cop" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "exitoso" BOOLEAN NOT NULL DEFAULT true,
    "mensaje_error" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumo_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasas_cambio" (
    "id" SERIAL NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'USD',
    "valor" DECIMAL(12,4) NOT NULL,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,
    "fuente" TEXT NOT NULL DEFAULT 'superfinanciera',
    "obtenida_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasas_cambio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consumo_ia_creado_en_idx" ON "consumo_ia"("creado_en");

-- CreateIndex
CREATE INDEX "consumo_ia_cliente_id_creado_en_idx" ON "consumo_ia"("cliente_id", "creado_en");

-- CreateIndex
CREATE INDEX "consumo_ia_tipo_operacion_creado_en_idx" ON "consumo_ia"("tipo_operacion", "creado_en");

-- CreateIndex
CREATE INDEX "tasas_cambio_moneda_vigencia_desde_idx" ON "tasas_cambio"("moneda", "vigencia_desde");

-- CreateIndex
CREATE UNIQUE INDEX "tasas_cambio_moneda_vigencia_desde_key" ON "tasas_cambio"("moneda", "vigencia_desde");
