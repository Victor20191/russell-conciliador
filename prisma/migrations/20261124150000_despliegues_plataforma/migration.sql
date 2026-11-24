-- Despliegues de la plataforma (24/Nov/2026, pedido del usuario): «desplegar» es cuando el código
-- de master llega al servidor de producción y la gente lo ve en la URL. Cada fila es una versión de
-- package.json con la que el servidor arrancó por primera vez; al arrancar con una versión nueva,
-- las versiones de Novedades que entraron desde la anterior toman ese día como «Desplegada el» y el
-- reporte para gerencia las cuenta en ese período (publicadas o en borrador). Tabla nueva: no cambia
-- nada de lo existente; arranca vacía y el primer arranque solo anota su versión.
CREATE TABLE "despliegues_plataforma" (
    "id" SERIAL NOT NULL,
    "version" TEXT NOT NULL,
    "arrancado_en" TIMESTAMPTZ(3) NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'servidor',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "despliegues_plataforma_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "despliegues_plataforma_version_key" ON "despliegues_plataforma"("version");
