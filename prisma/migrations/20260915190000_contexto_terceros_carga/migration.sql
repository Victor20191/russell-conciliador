-- Panel «Reconocer terceros» en la carga de balance por tercero. Aditiva; los
-- valores por defecto conservan el comportamiento actual de los perfiles y
-- preferencias ya guardados (auto = heurística actual; sin prefijo = sin cambio).

-- Perfil de carga guardado por cliente: prefijo de letras pegado al documento
-- del tercero (p. ej. "C" en C0709802) y cómo vienen los subtotales por cuenta.
ALTER TABLE "perfiles_carga_balance" ADD COLUMN IF NOT EXISTS "prefijo_documento_tercero" TEXT;
ALTER TABLE "perfiles_carga_balance" ADD COLUMN IF NOT EXISTS "subtotales_tercero" TEXT NOT NULL DEFAULT 'auto';

-- Preferencias del cliente: indicaciones libres para la IA sobre terceros,
-- distintas de las notas generales de carga (`observaciones`).
ALTER TABLE "ajustes_carga_balance" ADD COLUMN IF NOT EXISTS "indicaciones_ia_tercero" TEXT;
