-- Nuevo estado del pipeline de la mesa de ayuda: "en_evaluacion", para las
-- novedades que no son una falla sino una MEJORA de la plataforma en estudio.
-- La columna ya es TEXT; lo que hay que abrir son los dos CHECK que enumeran
-- los estados validos (el del pipeline y el que exige solucion al resolver).

ALTER TABLE "tickets_soporte"
  DROP CONSTRAINT IF EXISTS "tickets_soporte_estado_check";

ALTER TABLE "tickets_soporte"
  DROP CONSTRAINT IF EXISTS "tickets_soporte_resolucion_check";

ALTER TABLE "tickets_soporte"
  ADD CONSTRAINT "tickets_soporte_estado_check"
  CHECK ("estado" IN ('abierto', 'en_evaluacion', 'en_proceso', 'resuelto', 'cerrado'));

ALTER TABLE "tickets_soporte"
  ADD CONSTRAINT "tickets_soporte_resolucion_check"
  CHECK (
    ("estado" IN ('abierto', 'en_evaluacion', 'en_proceso', 'cerrado'))
    OR
    ("estado" = 'resuelto' AND "solucion" IS NOT NULL AND "resuelto_en" IS NOT NULL)
  );
