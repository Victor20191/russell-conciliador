-- Validación (OK) de alertas de naturaleza/saldo contrario, ligada a un comentario.
CREATE TABLE "validacion_alerta" (
    "id" SERIAL NOT NULL,
    "balance_id" INTEGER NOT NULL,
    "ancla" TEXT NOT NULL,
    "tipo_alerta" TEXT NOT NULL,
    "comentario_id" INTEGER NOT NULL,
    "validado_por" TEXT,
    "validado_por_id" INTEGER,
    "validado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "validacion_alerta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "validacion_alerta_balance_id_ancla_key" ON "validacion_alerta"("balance_id", "ancla");
CREATE INDEX "validacion_alerta_balance_id_idx" ON "validacion_alerta"("balance_id");
ALTER TABLE "validacion_alerta" ADD CONSTRAINT "validacion_alerta_comentario_id_fkey" FOREIGN KEY ("comentario_id") REFERENCES "comentarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
