-- CreateTable
CREATE TABLE "public"."conexiones_integracion" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "entorno" TEXT NOT NULL DEFAULT 'PRODUCCION',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "configuracion" JSONB,
    "credenciales" JSONB,
    "ultima_prueba_en" TIMESTAMPTZ(3),
    "ultima_prueba_ok" BOOLEAN,
    "ultima_prueba_mensaje" TEXT,
    "ultima_prueba_ms" INTEGER,
    "ultimo_uso_en" TIMESTAMPTZ(3),
    "ultima_ejecucion_estado" TEXT,
    "ultima_ejecucion_mensaje" TEXT,
    "creado_por" TEXT,
    "actualizado_por" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conexiones_integracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ejecuciones_conexion" (
    "id" SERIAL NOT NULL,
    "conexion_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "mensaje" TEXT,
    "duracion_ms" INTEGER,
    "ejecutado_por" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ejecuciones_conexion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conexiones_integracion_codigo_key" ON "public"."conexiones_integracion"("codigo");

-- CreateIndex
CREATE INDEX "conexiones_integracion_categoria_idx" ON "public"."conexiones_integracion"("categoria", "activa");

-- CreateIndex
CREATE INDEX "ejecuciones_conexion_conexion_idx" ON "public"."ejecuciones_conexion"("conexion_id", "creado_en");

-- AddForeignKey
ALTER TABLE "public"."ejecuciones_conexion" ADD CONSTRAINT "ejecuciones_conexion_conexion_id_fkey" FOREIGN KEY ("conexion_id") REFERENCES "public"."conexiones_integracion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
