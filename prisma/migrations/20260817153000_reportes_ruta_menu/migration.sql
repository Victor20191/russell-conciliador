-- Ubicación de la novedad: ruta del menú y luego el ítem de esa ruta.
ALTER TABLE "tickets_soporte"
  ADD COLUMN IF NOT EXISTS "ruta_clave" TEXT,
  ADD COLUMN IF NOT EXISTS "ruta_etiqueta" TEXT,
  ADD COLUMN IF NOT EXISTS "menu_clave" TEXT,
  ADD COLUMN IF NOT EXISTS "menu_etiqueta" TEXT;

CREATE INDEX IF NOT EXISTS "tickets_soporte_ruta_clave_menu_clave_idx"
  ON "tickets_soporte"("ruta_clave", "menu_clave");
