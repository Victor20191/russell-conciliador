-- Constancia ESTRUCTURADA de las reubicaciones entre clases contables aprobadas en
-- el borrador. Antes solo sobrevivía como texto dentro de `comentario_aprobacion`,
-- así que el balance oficial no podía reconstruir la misma ficha que vio el revisor
-- (cuenta, clases origen/destino, saldo, destino, justificación, revisor y fecha).
-- El staging del lote —única fuente de esos datos— se purga al confirmar el cargue.
ALTER TABLE "balance_prueba_encabezado"
    ADD COLUMN "reubicaciones_aprobadas" JSONB;
