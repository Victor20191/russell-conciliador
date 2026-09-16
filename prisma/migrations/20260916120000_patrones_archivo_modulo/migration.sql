-- Patrones de archivo por aplicativo (ERP) y módulo, y ficha del cliente con cuatro campos de
-- aplicativo que admiten varios ERP cada uno (Contabilidad, Nómina, Inventarios, Activos fijos).
-- Cartera, Cuentas por pagar e Ingresos dejan de tener aplicativo propio: usan el de Contabilidad.

-- 1) Versiones de patrón ------------------------------------------------------------------------
CREATE TABLE "versiones_patron_archivo_modulo" (
    "id" SERIAL NOT NULL,
    "erp_id" INTEGER NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "hoja" TEXT NOT NULL,
    "fila_encabezado" INTEGER NOT NULL,
    "primera_fila_datos" INTEGER NOT NULL,
    "encabezado_json" JSONB NOT NULL,
    "especificacion_json" JSONB NOT NULL,
    "muestra_clave_objeto" TEXT,
    "muestra_nombre_archivo" TEXT,
    "muestra_tamano_bytes" INTEGER,
    "muestra_sha256" TEXT,
    "cliente_origen_id" INTEGER,
    "cliente_origen_nombre" TEXT,
    "nota" TEXT,
    "veces_usado" INTEGER NOT NULL DEFAULT 0,
    "ultimo_uso_en" TIMESTAMPTZ(3),
    "creado_por" TEXT,
    "creado_por_id" INTEGER,
    "aprobado_por" TEXT,
    "aprobado_por_id" INTEGER,
    "aprobado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "versiones_patron_archivo_modulo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "versiones_patron_estado_check" CHECK ("estado" IN ('pendiente', 'aprobada', 'inactiva')),
    CONSTRAINT "versiones_patron_version_check" CHECK ("version" >= 1),
    -- Una versión aprobada siempre tiene su muestra.
    CONSTRAINT "versiones_patron_aprobada_muestra_check" CHECK ("estado" <> 'aprobada' OR "muestra_clave_objeto" IS NOT NULL)
);

CREATE UNIQUE INDEX "versiones_patron_erp_modulo_version_key"
  ON "versiones_patron_archivo_modulo"("erp_id", "modulo_codigo", "version");
CREATE UNIQUE INDEX "versiones_patron_muestra_clave_key"
  ON "versiones_patron_archivo_modulo"("muestra_clave_objeto");
CREATE INDEX "versiones_patron_erp_modulo_estado_idx"
  ON "versiones_patron_archivo_modulo"("erp_id", "modulo_codigo", "estado");
CREATE INDEX "versiones_patron_cliente_origen_idx"
  ON "versiones_patron_archivo_modulo"("cliente_origen_id");

ALTER TABLE "versiones_patron_archivo_modulo"
  ADD CONSTRAINT "versiones_patron_archivo_modulo_erp_id_fkey"
  FOREIGN KEY ("erp_id") REFERENCES "erps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Trazabilidad del cargue: con qué versión y con qué coincidencia se leyó (FK suave).
ALTER TABLE "modulo_importacion_lote"
  ADD COLUMN "patron_version_id" INTEGER,
  ADD COLUMN "patron_coincidencia" INTEGER;
ALTER TABLE "modulo_dato_encabezado"
  ADD COLUMN "patron_version_id" INTEGER,
  ADD COLUMN "patron_coincidencia" INTEGER;

-- 2) Varias filas por (cliente, proceso) ---------------------------------------------------------
DROP INDEX "erps_cliente_proceso_cliente_proceso_key";
ALTER TABLE "erps_cliente_proceso" DROP CONSTRAINT "erps_cliente_proceso_estado_erp_check";
ALTER TABLE "erps_cliente_proceso" DROP CONSTRAINT "erps_cliente_proceso_estado_check";

-- 3) Catálogos: Activos fijos como campo base y el aplicativo «Archivo manual» ------------------
INSERT INTO "procesos_erp" ("codigo", "nombre", "orden")
VALUES ('AFI', 'Activos fijos', 40)
ON CONFLICT ("codigo") DO NOTHING;
UPDATE "procesos_erp" SET "activo" = true, "orden" = 40 WHERE "codigo" = 'AFI';

INSERT INTO "erps" ("codigo", "nombre", "activo", "orden")
VALUES ('MANUAL', 'Archivo manual', true, 999)
ON CONFLICT ("codigo") DO NOTHING;

-- 4) Lo asignado a Cartera, CxP e Ingresos pasa a la lista de Contabilidad del cliente -----------
INSERT INTO "erps_cliente_proceso" ("cliente_id", "proceso_id", "erp_id", "estado", "origen", "actualizado_en")
SELECT DISTINCT a."cliente_id", cont."id", a."erp_id", 'confirmado', 'migracion', CURRENT_TIMESTAMP
FROM "erps_cliente_proceso" a
JOIN "procesos_erp" p ON p."id" = a."proceso_id" AND p."codigo" IN ('CAR', 'CXP', 'ING')
CROSS JOIN "procesos_erp" cont
WHERE cont."codigo" = 'CONT'
  AND a."erp_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "erps_cliente_proceso" b
    WHERE b."cliente_id" = a."cliente_id" AND b."proceso_id" = cont."id" AND b."erp_id" = a."erp_id"
  );

-- 5) Fuera las asignaciones por módulo y las filas «pendiente» sin ERP ----------------------------
DELETE FROM "erps_cliente_proceso"
WHERE "proceso_id" IN (SELECT "id" FROM "procesos_erp" WHERE "codigo" IN ('CAR', 'CXP', 'ING'));
DELETE FROM "erps_cliente_proceso" WHERE "erp_id" IS NULL;

-- 6) Los procesos por módulo quedan inactivos (se conservan por integridad histórica) ------------
UPDATE "procesos_erp" SET "activo" = false WHERE "codigo" IN ('CAR', 'CXP', 'ING');

-- 7) Nueva llave y restricciones -----------------------------------------------------------------
ALTER TABLE "erps_cliente_proceso" ALTER COLUMN "erp_id" SET NOT NULL;
ALTER TABLE "erps_cliente_proceso" ALTER COLUMN "estado" SET DEFAULT 'confirmado';
ALTER TABLE "erps_cliente_proceso"
  ADD CONSTRAINT "erps_cliente_proceso_estado_check" CHECK ("estado" IN ('confirmado', 'heredado'));

CREATE UNIQUE INDEX "erps_cliente_proceso_cliente_proceso_erp_key"
  ON "erps_cliente_proceso"("cliente_id", "proceso_id", "erp_id");
CREATE INDEX "erps_cliente_proceso_cliente_proceso_idx"
  ON "erps_cliente_proceso"("cliente_id", "proceso_id");
