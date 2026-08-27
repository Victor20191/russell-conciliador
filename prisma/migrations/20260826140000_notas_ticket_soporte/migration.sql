-- Notas de seguimiento de un ticket de soporte: hilo append-only que sigue
-- abierto después de cerrar el ticket (la respuesta oficial queda congelada).
CREATE TABLE "notas_ticket_soporte" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "autor_id" INTEGER,
    "autor_nombre" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notas_ticket_soporte_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notas_ticket_soporte_ticket_id_creado_en_idx" ON "notas_ticket_soporte"("ticket_id", "creado_en");

ALTER TABLE "notas_ticket_soporte" ADD CONSTRAINT "notas_ticket_soporte_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets_soporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
