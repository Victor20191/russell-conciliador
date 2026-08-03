-- Novedades de la carga de módulos: observaciones libres + checklist de verificación.
-- Las alertas automáticas (existencias/costos negativos) NO se persisten: se recalculan
-- al leer desde el detalle, igual que las alertas del balance.
ALTER TABLE "modulo_dato_encabezado" ADD COLUMN "observaciones" TEXT;
ALTER TABLE "modulo_dato_encabezado" ADD COLUMN "verificaciones" JSONB;
