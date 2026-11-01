-- «Restar terceros con saldo inicial» en la revisión de Retención en la fuente (aditiva).
ALTER TABLE "revision_retencion" ADD COLUMN "restar_saldo_inicial" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "revision_retencion" ADD COLUMN "saldo_inicial_restado_por" TEXT;
ALTER TABLE "revision_retencion" ADD COLUMN "saldo_inicial_restado_en" TIMESTAMPTZ(3);
