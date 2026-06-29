-- Unifica la memoria de mapeo del balance dentro de `cuentas_cliente`.
-- (1) nuevas columnas en cuentas_cliente; (2) migra los datos de
-- mapeo_balance_cliente; (3) elimina la tabla antigua.

-- AlterTable: cuentas_cliente sostiene ahora también el mapeo del balance.
ALTER TABLE "cuentas_cliente" ADD COLUMN     "actualizado_en" TIMESTAMP(3),
ADD COLUMN     "actualizado_por" TEXT,
ADD COLUMN     "cliente_id" INTEGER,
ADD COLUMN     "cuenta_6_russell" TEXT,
ADD COLUMN     "origen_mapeo" TEXT,
ADD COLUMN     "porcentaje_coincidencia" DECIMAL(5,2);

-- Migración de datos: pasa la memoria existente (mapeo_balance_cliente) a
-- cuentas_cliente como filas de nivel 6 (una por cuenta_6 del cliente). Si ya
-- existe la fila (mismo nombre_cliente + codigo), se completa su mapeo estándar.
INSERT INTO "cuentas_cliente" ("nombre_cliente","cliente_id","codigo","nivel","nombre","orden","cuenta_6_russell","porcentaje_coincidencia","origen_mapeo","actualizado_por","actualizado_en")
SELECT c."nombre", m."cliente_id", m."cuenta_6", 6, m."cuenta_6", 0, m."cuenta_6_russell", m."porcentaje_coincidencia", m."origen", m."actualizado_por", m."actualizado_en"
FROM "mapeo_balance_cliente" m
JOIN "clientes" c ON c."id" = m."cliente_id"
ON CONFLICT ("nombre_cliente","codigo") DO UPDATE SET
  "cliente_id" = EXCLUDED."cliente_id",
  "cuenta_6_russell" = EXCLUDED."cuenta_6_russell",
  "porcentaje_coincidencia" = EXCLUDED."porcentaje_coincidencia",
  "origen_mapeo" = EXCLUDED."origen_mapeo",
  "actualizado_por" = EXCLUDED."actualizado_por",
  "actualizado_en" = EXCLUDED."actualizado_en";

-- DropTable: la memoria vive ahora en cuentas_cliente.
DROP TABLE "mapeo_balance_cliente";

-- CreateIndex
CREATE INDEX "cuentas_cliente_cliente_id_idx" ON "cuentas_cliente"("cliente_id");
