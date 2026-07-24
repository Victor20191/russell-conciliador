-- Umbrales de las alertas del balance, parametrizables desde /config/parametros.
-- Son GLOBALES de plataforma: una fila por umbral conocido, identificada por
-- `clave`. `predeterminado` conserva el valor de fábrica para poder restaurarlo.
CREATE TABLE "umbrales_alertas" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "predeterminado" DECIMAL(18,2) NOT NULL,
    "actualizado_por" TEXT,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "umbrales_alertas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "umbrales_alertas_clave_key" ON "umbrales_alertas"("clave");

-- Siembra los valores de fábrica vigentes hasta hoy, para que la pantalla
-- muestre los montos reales desde el primer despliegue (sin depender del seed).
INSERT INTO "umbrales_alertas" ("clave", "valor", "predeterminado")
VALUES ('descuadre', 2000, 2000),
       ('naturaleza', 50000, 50000)
ON CONFLICT ("clave") DO NOTHING;
