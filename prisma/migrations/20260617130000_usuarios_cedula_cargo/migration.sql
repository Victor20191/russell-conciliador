-- AlterTable: documento de identidad (único) y título de puesto (texto libre)
-- para los maestros de personas (Socio · Gerente · Senior · Staff = usuarios).
ALTER TABLE "usuarios" ADD COLUMN "cedula" TEXT;
ALTER TABLE "usuarios" ADD COLUMN "cargo" TEXT;

-- CreateIndex: la cédula es única; en PostgreSQL los NULL no chocan entre sí,
-- así que los usuarios existentes (sin cédula) conviven hasta que se cargue.
CREATE UNIQUE INDEX "usuarios_cedula_key" ON "usuarios"("cedula");
