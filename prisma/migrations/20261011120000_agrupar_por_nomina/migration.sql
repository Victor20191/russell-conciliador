-- «AGRUPAR POR» del Consolidado de Nómina (11/Oct/2026).
--
-- La dimensión por la que se agrupan los conceptos de un cargue —código del concepto, nombre del
-- concepto o cuenta contable del cliente— queda guardada en el cargue y rige la asignación de
-- cuentas, la memoria del cliente, la asignación del período y el cruce contable. La memoria y la
-- asignación del período llevan su dimensión en la llave única: lo asignado agrupando por código no
-- se mezcla con lo asignado agrupando por nombre. Aditiva: todo lo existente agrupaba por código
-- (null en el encabezado = código).

ALTER TABLE "modulo_dato_encabezado"
    ADD COLUMN "agrupar_por" TEXT;

ALTER TABLE "modulo_dato_encabezado"
    ADD CONSTRAINT "modulo_dato_encabezado_agrupar_por_check"
    CHECK ("agrupar_por" IS NULL OR "agrupar_por" IN ('codigo', 'concepto', 'cuenta'));

ALTER TABLE "consolidacion_modulo_cliente"
    ADD COLUMN "agrupar_por" TEXT NOT NULL DEFAULT 'codigo';

ALTER TABLE "consolidacion_modulo_cliente"
    ADD CONSTRAINT "consolidacion_modulo_cliente_agrupar_por_check"
    CHECK ("agrupar_por" IN ('codigo', 'concepto', 'cuenta'));

DROP INDEX IF EXISTS "consolidacion_modulo_cliente_clasif_agrupador_cuenta_key";
CREATE UNIQUE INDEX "consolidacion_modulo_cliente_clasif_agrupador_cuenta_key"
    ON "consolidacion_modulo_cliente"("cliente_id", "modulo_codigo", "agrupar_por", "clasificador", "agrupador", "cuenta_4", "cuenta_6", "cuenta_cliente");

ALTER TABLE "asignacion_periodo_modulo"
    ADD COLUMN "agrupar_por" TEXT NOT NULL DEFAULT 'codigo';

ALTER TABLE "asignacion_periodo_modulo"
    ADD CONSTRAINT "asignacion_periodo_modulo_agrupar_por_check"
    CHECK ("agrupar_por" IN ('codigo', 'concepto', 'cuenta'));

DROP INDEX IF EXISTS "asignacion_periodo_modulo_unica";
CREATE UNIQUE INDEX "asignacion_periodo_modulo_unica"
    ON "asignacion_periodo_modulo"("cliente_id", "modulo_codigo", "periodo", "agrupar_por", "clasificador", "agrupador", "cuenta_4", "cuenta_6");
