-- Identidad ESTABLE de cuentas_cliente para el balance: llave por (cliente_id,
-- codigo) + columna `nit` legible. Conserva (nombre_cliente, codigo) para la
-- conciliación. A prueba de cambios de nombre del cliente.

-- AlterTable: NIT del cliente (identificador legible de negocio).
ALTER TABLE "cuentas_cliente" ADD COLUMN     "nit" TEXT;

-- Backfill del NIT desde clientes (vía la FK cliente_id ya poblada).
UPDATE "cuentas_cliente" cc SET "nit" = c."nit"
FROM "clientes" c
WHERE cc."cliente_id" = c."id" AND cc."nit" IS NULL;

-- Backfill de cliente_id por nombre para filas legado sin FK (solo cuando el
-- nombre identifica a UN único cliente). No afecta filas que ya lo tienen.
UPDATE "cuentas_cliente" cc SET "cliente_id" = c."id"
FROM "clientes" c
WHERE cc."cliente_id" IS NULL
  AND cc."nombre_cliente" = c."nombre"
  AND (SELECT COUNT(*) FROM "clientes" c2 WHERE c2."nombre" = cc."nombre_cliente") = 1;

-- DropIndex: el índice simple lo sustituye el único compuesto de abajo.
DROP INDEX "cuentas_cliente_cliente_id_idx";

-- CreateIndex: llave estable del balance.
CREATE UNIQUE INDEX "cuentas_cliente_cliente_id_codigo_key" ON "cuentas_cliente"("cliente_id", "codigo");
