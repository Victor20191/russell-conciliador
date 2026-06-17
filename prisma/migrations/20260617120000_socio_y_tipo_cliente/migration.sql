-- AlterTable: clasificación A|B|C (obligatoria; backfill 'C' para clientes existentes)
-- y socio responsable (informativo, FK lógica a usuarios.id, sin restricción física).
ALTER TABLE "clientes" ADD COLUMN "tipo_cliente" TEXT NOT NULL DEFAULT 'C';
ALTER TABLE "clientes" ADD COLUMN "socio_id" INTEGER;

-- CreateIndex
CREATE INDEX "clientes_socio_id_idx" ON "clientes"("socio_id");
