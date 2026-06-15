-- Asignación directa de responsables por cliente + jerarquía organizacional.
--
-- Reemplaza el modelo de equipos/cartera manual (equipos,
-- integrantes_equipo, asignaciones_cliente por equipo) por:
--   1. jerarquia_usuarios: aristas usuario↔usuario muchos-a-muchos entre
--      roles adyacentes (Socio→Gerente, Gerente→Senior, Senior→Staff).
--   2. asignaciones_cliente reformada: cada cliente tiene EXACTAMENTE un
--      responsable por función (staff ejecuta, senior revisa, gerente
--      valida), asignado al crear/editar el cliente. El Socio deriva
--      lectura por jerarquía (no se asigna).

-- Las asignaciones existentes son datos demo del modelo anterior (por
-- equipo o individuales sin función). Se vacía la tabla: la columna
-- funcion nace NOT NULL con unicidad (cliente_id, funcion), y el seed
-- RBAC re-siembra los responsables demo con el nuevo modelo.
DELETE FROM "asignaciones_cliente";

-- DropForeignKey
ALTER TABLE "asignaciones_cliente" DROP CONSTRAINT "asignaciones_cliente_equipo_id_fkey";

-- DropForeignKey
ALTER TABLE "integrantes_equipo" DROP CONSTRAINT "integrantes_equipo_equipo_id_fkey";

-- DropForeignKey
ALTER TABLE "integrantes_equipo" DROP CONSTRAINT "integrantes_equipo_rol_id_fkey";

-- DropIndex
DROP INDEX "asignaciones_cliente_cliente_id_equipo_id_usuario_id_key";

-- DropIndex
DROP INDEX "asignaciones_cliente_equipo_id_idx";

-- AlterTable
ALTER TABLE "asignaciones_cliente" DROP COLUMN "equipo_id",
ADD COLUMN     "funcion" TEXT NOT NULL,
ALTER COLUMN "usuario_id" SET NOT NULL;

-- DropTable
DROP TABLE "equipos";

-- DropTable
DROP TABLE "integrantes_equipo";

-- CreateTable
CREATE TABLE "jerarquia_usuarios" (
    "id" SERIAL NOT NULL,
    "superior_id" INTEGER NOT NULL,
    "subordinado_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jerarquia_usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jerarquia_usuarios_subordinado_id_idx" ON "jerarquia_usuarios"("subordinado_id");

-- CreateIndex
CREATE UNIQUE INDEX "jerarquia_usuarios_superior_id_subordinado_id_key" ON "jerarquia_usuarios"("superior_id", "subordinado_id");

-- CreateIndex
CREATE UNIQUE INDEX "asignaciones_cliente_cliente_id_funcion_key" ON "asignaciones_cliente"("cliente_id", "funcion");

-- Residuo RBAC del módulo equipos: ya no existe en el catálogo
-- (src/lib/rbac/*). roles_permisos cae por ON DELETE CASCADE.
-- Idempotente: en una BD nueva no borra nada.
DELETE FROM "permisos" WHERE "modulo" = 'equipos';
DELETE FROM "modulos_plataforma" WHERE "clave" = 'equipos';
