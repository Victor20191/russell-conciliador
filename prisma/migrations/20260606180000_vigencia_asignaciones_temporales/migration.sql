-- Vigencia temporal de asignaciones (membresía de equipo y cartera de cliente).
-- Permite asignar a un usuario a otro equipo / cartera de forma TEMPORAL:
-- la fila autoriza solo dentro de [vigente_desde, vigente_hasta]. La
-- expiración se evalúa por fecha al leer (getAsignacionesUsuario), sin job.

-- AlterTable: integrantes_equipo
ALTER TABLE "integrantes_equipo"
    ADD COLUMN "vigente_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "vigente_hasta" TIMESTAMP(3),
    ADD COLUMN "motivo" TEXT,
    ADD COLUMN "asignado_por_id" INTEGER;

-- Backfill: las membresías existentes quedan vigentes desde su creación
-- y permanentes (vigente_hasta NULL).
UPDATE "integrantes_equipo" SET "vigente_desde" = "creado_en";

-- AlterTable: asignaciones_cliente
ALTER TABLE "asignaciones_cliente"
    ADD COLUMN "vigente_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "vigente_hasta" TIMESTAMP(3),
    ADD COLUMN "motivo" TEXT;

UPDATE "asignaciones_cliente" SET "vigente_desde" = "creado_en";

-- Índices: incluir la vigencia para las consultas de getAsignacionesUsuario.
DROP INDEX "integrantes_equipo_usuario_id_idx";
CREATE INDEX "integrantes_equipo_usuario_id_activo_vigente_hasta_idx" ON "integrantes_equipo"("usuario_id", "activo", "vigente_hasta");

DROP INDEX "asignaciones_cliente_usuario_id_activo_idx";
CREATE INDEX "asignaciones_cliente_usuario_id_activo_vigente_hasta_idx" ON "asignaciones_cliente"("usuario_id", "activo", "vigente_hasta");
