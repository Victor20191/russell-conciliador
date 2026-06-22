-- ERP y Sector pasan de TEXTO LIBRE en `clientes` a CATÁLOGOS MAESTROS
-- (`erps`, `sectores`) referenciados por id. Migración sin pérdida de datos:
-- crea los catálogos, los siembra con los valores existentes, backfillea las
-- FK, verifica y luego elimina las columnas de texto.

-- CreateTable
CREATE TABLE "erps" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sectores" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sectores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "erps_codigo_key" ON "erps"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "sectores_codigo_key" ON "sectores"("codigo");

-- Sembrar catálogos a partir de los valores de texto existentes en `clientes`
-- (preserva los clientes ya cargados; los datos reales entran luego por el
-- importador, que normaliza variantes con su mapa de alias).
INSERT INTO "erps" ("codigo", "nombre")
SELECT DISTINCT upper(trim("erp")), trim("erp")
FROM "clientes"
WHERE "erp" IS NOT NULL AND trim("erp") <> ''
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "sectores" ("codigo", "nombre")
SELECT DISTINCT upper(trim("sector")), trim("sector")
FROM "clientes"
WHERE "sector" IS NOT NULL AND trim("sector") <> ''
ON CONFLICT ("codigo") DO NOTHING;

-- AlterTable: FK nullable para el backfill (ERP se hará NOT NULL al final).
ALTER TABLE "clientes" ADD COLUMN "erp_id" INTEGER;
ALTER TABLE "clientes" ADD COLUMN "sector_id" INTEGER;

-- Backfill de las FK por coincidencia de texto normalizado.
UPDATE "clientes" c SET "erp_id" = e."id"
FROM "erps" e
WHERE c."erp" IS NOT NULL AND upper(trim(c."erp")) = e."codigo";

UPDATE "clientes" c SET "sector_id" = s."id"
FROM "sectores" s
WHERE c."sector" IS NOT NULL AND trim(c."sector") <> '' AND upper(trim(c."sector")) = s."codigo";

-- Control: ningún cliente puede quedar sin ERP (obligatorio). Si esto falla,
-- revisa los valores de `clientes.erp` antes de continuar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "clientes" WHERE "erp_id" IS NULL) THEN
    RAISE EXCEPTION 'Hay clientes sin ERP mapeado: revisa la columna clientes.erp.';
  END IF;
END $$;

-- Enforce: ERP obligatorio, eliminar columnas de texto, índices y FKs.
ALTER TABLE "clientes" ALTER COLUMN "erp_id" SET NOT NULL;
ALTER TABLE "clientes" DROP COLUMN "erp";
ALTER TABLE "clientes" DROP COLUMN "sector";

-- CreateIndex
CREATE INDEX "clientes_erp_id_idx" ON "clientes"("erp_id");

-- CreateIndex
CREATE INDEX "clientes_sector_id_idx" ON "clientes"("sector_id");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_erp_id_fkey" FOREIGN KEY ("erp_id") REFERENCES "erps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "sectores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
