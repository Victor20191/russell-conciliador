-- ¿El envío automático cuenta el día del envío? (26/Nov/2026, pedido del usuario). Con `true`
-- el período llega hasta el mismo día del envío —con lo registrado hasta la hora en que sale—
-- en vez de hasta el día anterior. Solo AGREGA una columna en `false`: nada cambia hasta que
-- alguien la marque en la pantalla, y el código anterior la ignora (puede aplicarse antes de
-- desplegar).
ALTER TABLE "notificacion_programada" ADD COLUMN "incluir_dia_envio" BOOLEAN NOT NULL DEFAULT false;
