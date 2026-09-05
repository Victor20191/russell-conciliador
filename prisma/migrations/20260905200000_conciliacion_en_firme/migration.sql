-- Aditiva: bloqueo del balance al cerrar la conciliación de un módulo.
CREATE TABLE "conciliacion_modulo_cierre" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "balance_periodo" TEXT NOT NULL,
    "modulo_dato_encabezado_id" INTEGER NOT NULL,
    "balance_encabezado_id" INTEGER NOT NULL,
    "cuentas_russell" JSONB NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'firme',
    "cerrado_por_id" INTEGER,
    "cerrado_por" TEXT NOT NULL,
    "cerrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desbloqueado_por_id" INTEGER,
    "desbloqueado_por" TEXT,
    "desbloqueado_en" TIMESTAMPTZ(3),
    "justificacion_desbloqueo" TEXT,
    CONSTRAINT "conciliacion_modulo_cierre_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conciliacion_modulo_cierre_unico"
    ON "conciliacion_modulo_cierre"("cliente_id", "modulo_codigo", "periodo");
CREATE INDEX "conciliacion_modulo_cierre_balance_idx"
    ON "conciliacion_modulo_cierre"("cliente_id", "balance_periodo", "estado");
CREATE INDEX "conciliacion_modulo_cierre_balance_id_idx"
    ON "conciliacion_modulo_cierre"("balance_encabezado_id");

CREATE TABLE "cuenta_bloqueada_conciliacion" (
    "id" SERIAL NOT NULL,
    "cierre_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "cuenta" TEXT NOT NULL,
    "cuenta_6_russell" TEXT,
    "saldo_inicial" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "debitos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldo_final" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "modulo_codigo" TEXT NOT NULL,
    "modulo_dato_encabezado_id" INTEGER NOT NULL,
    CONSTRAINT "cuenta_bloqueada_conciliacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cuenta_bloqueada_conciliacion_unica"
    ON "cuenta_bloqueada_conciliacion"("cierre_id", "cuenta");
CREATE INDEX "cuenta_bloqueada_conciliacion_idx"
    ON "cuenta_bloqueada_conciliacion"("cliente_id", "periodo", "cuenta");

ALTER TABLE "cuenta_bloqueada_conciliacion" ADD CONSTRAINT "cuenta_bloqueada_conciliacion_cierre_id_fkey"
    FOREIGN KEY ("cierre_id") REFERENCES "conciliacion_modulo_cierre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
