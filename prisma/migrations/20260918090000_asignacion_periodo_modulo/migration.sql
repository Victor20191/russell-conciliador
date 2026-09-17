-- Asignación del período en el Consolidado de los módulos: un clasificador asignado a una cuenta
-- Russell fuera de la cédula vale solo para (cliente, módulo, período). Aditiva: la memoria del
-- cliente (consolidacion_modulo_cliente), la cédula y el prevalidador no cambian.
CREATE TABLE "asignacion_periodo_modulo" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "clasificador" TEXT NOT NULL,
    "agrupador" TEXT NOT NULL DEFAULT '',
    "cuenta_4" TEXT NOT NULL,
    "cuenta_6" TEXT NOT NULL DEFAULT '',
    "creado_por" TEXT,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asignacion_periodo_modulo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asignacion_periodo_modulo_unica" ON "asignacion_periodo_modulo"("cliente_id", "modulo_codigo", "periodo", "clasificador", "agrupador", "cuenta_4", "cuenta_6");
CREATE INDEX "asignacion_periodo_modulo_periodo_idx" ON "asignacion_periodo_modulo"("cliente_id", "modulo_codigo", "periodo");
