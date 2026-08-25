-- Registro de reportes ejecutivos ENVIADOS al cliente.
-- Sirve para no repetir avances ya comunicados: la siguiente generación
-- preselecciona solo las versiones de Novedades que no están en ningún envío.
CREATE TABLE IF NOT EXISTS "envios_reporte_ejecutivo" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "periodo_desde" TIMESTAMPTZ(3) NOT NULL,
    "periodo_hasta" TIMESTAMPTZ(3) NOT NULL,
    "ids_version" INTEGER[],
    "total_novedades" INTEGER NOT NULL DEFAULT 0,
    "total_acciones" INTEGER NOT NULL DEFAULT 0,
    "canal" TEXT NOT NULL DEFAULT 'correo',
    "nota" TEXT,
    "enviado_por" TEXT NOT NULL,
    "enviado_por_id" INTEGER,
    "enviado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "envios_reporte_ejecutivo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "envios_reporte_ejecutivo_enviado_en_idx"
    ON "envios_reporte_ejecutivo"("enviado_en");
