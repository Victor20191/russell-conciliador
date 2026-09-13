-- Aditiva: la homologación de conceptos de NÓMINA gana su grupo de cuenta contable (RF-NOM-08),
-- la subcuenta PUC del cliente, el agrupador (centro de costo / clase del archivo), la cuenta
-- del cliente de la que salió y su origen. Los módulos a 4 dígitos no cambian: sus filas quedan
-- con agrupador '' y cuenta_6 ''.

-- ===== Homologación concepto → cuenta =====
ALTER TABLE "consolidacion_modulo_cliente" ADD COLUMN IF NOT EXISTS "grupo" TEXT;
ALTER TABLE "consolidacion_modulo_cliente" ADD COLUMN IF NOT EXISTS "subcuenta_puc" TEXT;
ALTER TABLE "consolidacion_modulo_cliente" ADD COLUMN IF NOT EXISTS "agrupador" TEXT NOT NULL DEFAULT '';
ALTER TABLE "consolidacion_modulo_cliente" ADD COLUMN IF NOT EXISTS "cuenta_cliente" TEXT NOT NULL DEFAULT '';
ALTER TABLE "consolidacion_modulo_cliente" ADD COLUMN IF NOT EXISTS "origen" TEXT NOT NULL DEFAULT 'manual';

-- `cuenta_6` deja de admitir NULL para poder entrar en la llave única ('' = módulo a 4 dígitos).
UPDATE "consolidacion_modulo_cliente" SET "cuenta_6" = '' WHERE "cuenta_6" IS NULL;
ALTER TABLE "consolidacion_modulo_cliente" ALTER COLUMN "cuenta_6" SET DEFAULT '';
ALTER TABLE "consolidacion_modulo_cliente" ALTER COLUMN "cuenta_6" SET NOT NULL;

-- Una fila por (concepto, agrupador, cuenta Russell, cuenta del cliente): un concepto puede cruzar
-- contra 510506 y 520506 (misma cuenta_4), con centro de costo contra una cuenta distinta por
-- centro, y dos cuentas del cliente (51050601 y 51050603) pueden homologar a la misma Russell.
DROP INDEX IF EXISTS "consolidacion_modulo_cliente_clasif_cuenta_key";
CREATE UNIQUE INDEX "consolidacion_modulo_cliente_clasif_agrupador_cuenta_key"
    ON "consolidacion_modulo_cliente"("cliente_id", "modulo_codigo", "clasificador", "agrupador", "cuenta_4", "cuenta_6", "cuenta_cliente");

-- ===== Clase contable por agrupador (centro de costo / grupo del archivo) =====
-- «GYA → 51, MOD → 72, MOI → 73» (Buk), «CP → 72, GV → 52, GA → 51» (SIESA Zarzal): la clase de
-- gasto la decide el agrupador y el concepto pone la subcuenta. Memoria del cliente.
CREATE TABLE IF NOT EXISTS "clase_agrupador_modulo" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "agrupador" TEXT NOT NULL,
    "clase" TEXT NOT NULL,
    "actualizado_por" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clase_agrupador_modulo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "clase_agrupador_modulo_unico"
    ON "clase_agrupador_modulo"("cliente_id", "modulo_codigo", "agrupador");
