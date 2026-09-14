-- Nómina F4: rango del cargue y reparto del cruce (RF-NOM-12 / D4 / D7). Aditiva.

-- Mes inicial del rango del cargue («2025-01» en un acumulado enero–diciembre). Null = un
-- solo mes (`periodo`), el comportamiento de todos los demás módulos.
ALTER TABLE "modulo_dato_encabezado" ADD COLUMN IF NOT EXISTS "periodo_desde" TEXT;

-- Porción de un concepto homologado a VARIAS cuentas Russell que va a cada una, definida por
-- el auditor (sugerida proporcional al movimiento del balance). Vive por (cliente, módulo,
-- período, concepto ∥ agrupador, cuenta), no por cargue: sobrevive a las versiones.
CREATE TABLE IF NOT EXISTS "reparto_cruce_modulo" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "clasificador" TEXT NOT NULL,
    "cuenta_russell" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "definido_por" TEXT,
    "definido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reparto_cruce_modulo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "reparto_cruce_modulo_unico"
    ON "reparto_cruce_modulo"("cliente_id", "modulo_codigo", "periodo", "clasificador", "cuenta_russell");
CREATE INDEX IF NOT EXISTS "reparto_cruce_modulo_periodo_idx"
    ON "reparto_cruce_modulo"("cliente_id", "modulo_codigo", "periodo");
