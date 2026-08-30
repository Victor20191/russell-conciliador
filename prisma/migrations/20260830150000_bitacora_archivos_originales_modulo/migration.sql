-- Bitácora durable de los archivos fuente del motor genérico de módulos.
-- El binario se conserva sin modificar en almacenamiento de objetos; PostgreSQL
-- guarda la huella SHA-256, su ubicación y la documentación funcional. No hay FK
-- a lote/encabezado/cliente por diseño: eliminar datos procesados no debe borrar
-- el original ni la trazabilidad histórica.
CREATE TABLE "archivos_originales_modulo" (
    "id" SERIAL NOT NULL,
    "lote_id" TEXT,
    "encabezado_id" INTEGER,
    "cliente_id" INTEGER NOT NULL,
    "nombre_cliente" TEXT NOT NULL,
    "nit_cliente" TEXT,
    "modulo_codigo" TEXT NOT NULL,
    "periodo" TEXT,
    "nombre_archivo" TEXT NOT NULL,
    "tipo_contenido" TEXT,
    "tamano_bytes" INTEGER,
    "huella_sha256" TEXT,
    "clave_objeto" TEXT,
    "ubicacion_carpeta" TEXT NOT NULL,
    "software_origen" TEXT,
    "ubicacion_origen" TEXT,
    "reflejo_contable_esperado" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'recibido',
    "disponible" BOOLEAN NOT NULL DEFAULT false,
    "es_anexo" BOOLEAN NOT NULL DEFAULT false,
    "cargado_por" TEXT,
    "cargado_por_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "archivos_originales_modulo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "archivos_originales_modulo_estado_check"
      CHECK ("estado" IN ('recibido', 'no_procesable', 'borrador', 'cargado', 'descartado', 'cargue_eliminado')),
    CONSTRAINT "archivos_originales_modulo_huella_check"
      CHECK ("huella_sha256" IS NULL OR "huella_sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "archivos_originales_modulo_disponible_check"
      CHECK (
        NOT "disponible"
        OR (
          "clave_objeto" IS NOT NULL
          AND "huella_sha256" IS NOT NULL
          AND "tamano_bytes" IS NOT NULL
          AND "tamano_bytes" > 0
        )
      )
);

CREATE UNIQUE INDEX "archivos_originales_modulo_lote_id_key"
  ON "archivos_originales_modulo"("lote_id");
CREATE UNIQUE INDEX "archivos_originales_modulo_clave_objeto_key"
  ON "archivos_originales_modulo"("clave_objeto");
CREATE INDEX "archivos_originales_modulo_modulo_cliente_idx"
  ON "archivos_originales_modulo"("modulo_codigo", "cliente_id");
CREATE INDEX "archivos_originales_modulo_estado_idx"
  ON "archivos_originales_modulo"("modulo_codigo", "estado", "disponible");
CREATE INDEX "archivos_originales_modulo_modulo_fecha_id_idx"
  ON "archivos_originales_modulo"("modulo_codigo", "creado_en", "id");
CREATE INDEX "archivos_originales_modulo_encabezado_idx"
  ON "archivos_originales_modulo"("encabezado_id");
CREATE INDEX "archivos_originales_modulo_huella_idx"
  ON "archivos_originales_modulo"("huella_sha256");

-- Los cargues históricos solo tenían metadatos: se registran para que la
-- bitácora sea completa, pero se marcan como no disponibles para descarga.
INSERT INTO "archivos_originales_modulo" (
  "lote_id",
  "encabezado_id",
  "cliente_id",
  "nombre_cliente",
  "nit_cliente",
  "modulo_codigo",
  "periodo",
  "nombre_archivo",
  "ubicacion_carpeta",
  "estado",
  "disponible",
  "es_anexo",
  "cargado_por",
  "cargado_por_id",
  "creado_en",
  "actualizado_en"
)
SELECT
  encabezado."lote_id",
  encabezado."id",
  encabezado."cliente_id",
  encabezado."nombre_cliente",
  cliente."nit",
  encabezado."modulo_codigo",
  encabezado."periodo",
  encabezado."archivo_nombre",
  'Software/' || CASE encabezado."modulo_codigo"
    WHEN 'INV' THEN 'Inventarios'
    WHEN 'CAR' THEN 'Cartera'
    WHEN 'CXP' THEN 'Cuentas-por-Pagar'
    WHEN 'ING' THEN 'Ingresos-Facturacion'
    WHEN 'AFI' THEN 'Activos-Fijos'
    WHEN 'NOM' THEN 'Nomina'
    ELSE encabezado."modulo_codigo"
  END || '/cliente-' || encabezado."cliente_id"::TEXT || '/Historico',
  'cargado',
  false,
  false,
  encabezado."cargado_por",
  encabezado."cargado_por_id",
  encabezado."ultima_carga",
  encabezado."ultima_carga"
FROM "modulo_dato_encabezado" AS encabezado
LEFT JOIN "clientes" AS cliente ON cliente."id" = encabezado."cliente_id"
WHERE encabezado."archivo_nombre" IS NOT NULL;

-- También se registra cualquier borrador que ya existiera durante el despliegue.
-- Sus bytes no estaban disponibles en el modelo anterior, por eso queda claramente
-- marcado como no descargable; aun así puede promoverse sin romper el flujo.
INSERT INTO "archivos_originales_modulo" (
  "lote_id",
  "cliente_id",
  "nombre_cliente",
  "nit_cliente",
  "modulo_codigo",
  "periodo",
  "nombre_archivo",
  "ubicacion_carpeta",
  "estado",
  "disponible",
  "es_anexo",
  "cargado_por",
  "cargado_por_id",
  "creado_en",
  "actualizado_en"
)
SELECT
  lote."lote_id",
  lote."cliente_id",
  COALESCE(cliente."nombre", 'Cliente ' || lote."cliente_id"::TEXT),
  cliente."nit",
  lote."modulo_codigo",
  to_char(COALESCE(lote."periodo_final", lote."periodo_inicial"), 'YYYY-MM'),
  lote."archivo_nombre",
  'Software/' || CASE lote."modulo_codigo"
    WHEN 'INV' THEN 'Inventarios'
    WHEN 'CAR' THEN 'Cartera'
    WHEN 'CXP' THEN 'Cuentas-por-Pagar'
    WHEN 'ING' THEN 'Ingresos-Facturacion'
    WHEN 'AFI' THEN 'Activos-Fijos'
    WHEN 'NOM' THEN 'Nomina'
    ELSE lote."modulo_codigo"
  END || '/cliente-' || lote."cliente_id"::TEXT || '/Historico',
  'borrador',
  false,
  lote."anexo_encabezado_id" IS NOT NULL,
  lote."cargado_por",
  lote."cargado_por_id",
  lote."creado_en",
  lote."actualizado_en"
FROM "modulo_importacion_lote" AS lote
LEFT JOIN "clientes" AS cliente ON cliente."id" = lote."cliente_id"
WHERE lote."cliente_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "archivos_originales_modulo" AS existente
    WHERE existente."lote_id" = lote."lote_id"
  );
