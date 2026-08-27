-- El hilo de un ticket deja de ser «notas internas de Xentria» y pasa a ser la
-- conversación entre quien reportó y Xentria: se renombra la tabla y cada fila
-- guarda de qué lado vino. La tabla se creó vacía horas antes (migración
-- 20260826140000), así que el DEFAULT solo existe para poder marcarla NOT NULL
-- y se retira enseguida: el lado siempre lo decide la Server Action.
ALTER TABLE "notas_ticket_soporte" RENAME TO "mensajes_ticket_soporte";
ALTER TABLE "mensajes_ticket_soporte" RENAME CONSTRAINT "notas_ticket_soporte_pkey" TO "mensajes_ticket_soporte_pkey";
ALTER TABLE "mensajes_ticket_soporte" RENAME CONSTRAINT "notas_ticket_soporte_ticket_id_fkey" TO "mensajes_ticket_soporte_ticket_id_fkey";
ALTER INDEX "notas_ticket_soporte_ticket_id_creado_en_idx" RENAME TO "mensajes_ticket_soporte_ticket_id_creado_en_idx";
ALTER SEQUENCE "notas_ticket_soporte_id_seq" RENAME TO "mensajes_ticket_soporte_id_seq";

ALTER TABLE "mensajes_ticket_soporte" ADD COLUMN "autor_lado" TEXT NOT NULL DEFAULT 'xentria';
ALTER TABLE "mensajes_ticket_soporte" ALTER COLUMN "autor_lado" DROP DEFAULT;

-- Cambios de estado del ticket: el dato estructurado que el historial necesita
-- para contar lo que pasó (la auditoría guarda lo mismo en texto libre, pero no
-- es consultable por ticket).
CREATE TABLE "eventos_ticket_soporte" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "autor_id" INTEGER,
    "autor_nombre" TEXT NOT NULL,
    "estado_anterior" TEXT,
    "estado_nuevo" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_ticket_soporte_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "eventos_ticket_soporte_ticket_id_creado_en_idx" ON "eventos_ticket_soporte"("ticket_id", "creado_en");

ALTER TABLE "eventos_ticket_soporte" ADD CONSTRAINT "eventos_ticket_soporte_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets_soporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
