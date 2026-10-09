-- Patrones propuestos desde la carga (5/Oct/2026). Aditiva.
--
-- 1) El estado «validada_cliente» (versión aprendida de un cargue confirmado, que sirve solo a su
--    cliente hasta que un administrador la apruebe) nunca entró al CHECK del estado: el `create`
--    de la asistencia de Inventarios lo violaba y deshacía la confirmación del cargue.
ALTER TABLE "versiones_patron_archivo_modulo" DROP CONSTRAINT IF EXISTS "versiones_patron_estado_check";
ALTER TABLE "versiones_patron_archivo_modulo"
  ADD CONSTRAINT "versiones_patron_estado_check"
  CHECK ("estado" IN ('pendiente', 'aprobada', 'inactiva', 'validada_cliente'));

-- 2) De dónde salió la muestra: subida por un administrador (null en las existentes) o recorte
--    anónimo del original del cliente, generado y verificado por la plataforma.
ALTER TABLE "versiones_patron_archivo_modulo" ADD COLUMN "muestra_origen" TEXT;
ALTER TABLE "versiones_patron_archivo_modulo"
  ADD CONSTRAINT "versiones_patron_muestra_origen_check"
  CHECK ("muestra_origen" IS NULL OR "muestra_origen" IN ('subida', 'recorte_original'));
