-- Cuotas atómicas compartidas para solicitudes públicas; no guarda direcciones IP en claro.
CREATE TABLE "limites_solicitud" (
    "clave" TEXT NOT NULL,
    "solicitudes" INTEGER NOT NULL,
    "vence_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "limites_solicitud_pkey" PRIMARY KEY ("clave"),
    CONSTRAINT "limites_solicitud_conteo_positivo" CHECK ("solicitudes" > 0)
);
CREATE INDEX "limites_solicitud_vencimiento_idx" ON "limites_solicitud"("vence_en");
