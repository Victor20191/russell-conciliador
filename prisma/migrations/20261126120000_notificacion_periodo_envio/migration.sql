-- Qué período cubre el envío automático del reporte para gerencia (26/Nov/2026, pedido del
-- usuario: «cada miércoles, del miércoles anterior al martes»).
--   «ultimos_dias»: los N días (dias_periodo, 1 a 30) que terminan el día anterior al envío;
--                   siempre la misma ventana, aunque haya envíos manuales en medio.
--   «continua»:     desde el día siguiente al último reporte enviado (como hasta ahora).
-- Solo AGREGA dos columnas con valor por defecto: la programación existente queda en «continua»
-- con 7 días y nada cambia hasta que alguien elija otro período en la pantalla. El código
-- anterior las ignora, así que puede aplicarse antes de desplegar.
ALTER TABLE "notificacion_programada"
  ADD COLUMN "modo_periodo" TEXT NOT NULL DEFAULT 'continua',
  ADD COLUMN "dias_periodo" INTEGER NOT NULL DEFAULT 7,
  ADD CONSTRAINT "notificacion_programada_modo_periodo_valido" CHECK ("modo_periodo" IN ('ultimos_dias', 'continua')),
  ADD CONSTRAINT "notificacion_programada_dias_periodo_valido" CHECK ("dias_periodo" BETWEEN 1 AND 30);
