-- REFERENCIA DE REVISION: NO EJECUTAR COMO MIGRACION.
-- Diferencias modelo local -> servidor consultado en 2026-10-07T15:43:11.294Z.
-- La estructura completa consultada está en estructura.sql.

-- AlterTable
ALTER TABLE "public"."balance_prueba_encabezado" ADD COLUMN     "descongelado_en" TIMESTAMPTZ(3),
ADD COLUMN     "descongelado_por" TEXT,
ADD COLUMN     "descongelado_por_id" INTEGER,
ADD COLUMN     "justificacion_descongelado" TEXT;

-- AlterTable
ALTER TABLE "public"."versiones_patron_archivo_modulo" ADD COLUMN     "muestra_origen" TEXT;

-- AlterTable
ALTER TABLE "public"."clase_agrupador_modulo" ALTER COLUMN "actualizado_en" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."conciliacion_modulo_cierre" ADD COLUMN     "pares_depreciacion" JSONB;

-- CreateTable
CREATE TABLE "public"."pares_depreciacion_modulo" (
    "id" SERIAL NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "subgrupo" TEXT NOT NULL,
    "cuenta" TEXT NOT NULL,
    "actualizado_por" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pares_depreciacion_modulo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pares_depreciacion_modulo_modulo_codigo_subgrupo_key" ON "public"."pares_depreciacion_modulo"("modulo_codigo" ASC, "subgrupo" ASC);

-- RenameIndex
ALTER INDEX "public"."balance_cruce_aperturas_balance_cuenta_id_balance_tercero_i_key" RENAME TO "balance_cruce_aperturas_balance_cuenta_id_balance_tercero_id_ke";
