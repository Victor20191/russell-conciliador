-- Módulo de NOVEDADES / control de versiones (admin-only): changelog de la
-- plataforma agrupado por versión. `versiones_plataforma` es el encabezado
-- (timeline de avance: borrador → publicada); `cambios_version` el detalle (una
-- fila por cambio, con guía de operación y deep-link a la ruta real). Solo
-- Administrador y Superadministrador (gates novedades:ver / novedades:administrar).
--
-- FK DURA cambios_version -> versiones_plataforma con ON DELETE CASCADE (borrar
-- una versión borra sus cambios). `creado_por_id` es FK LÓGICA a usuarios (solo
-- Int, sin restricción): el changelog se conserva aunque el autor se elimine.

-- CreateTable
CREATE TABLE "versiones_plataforma" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "resumen" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "publicado_en" TIMESTAMP(3),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versiones_plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cambios_version" (
    "id" SERIAL NOT NULL,
    "version_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "modulo" TEXT,
    "ruta" TEXT,
    "como_operar" TEXT,
    "ejemplo" TEXT,
    "estado_funcionalidad" TEXT NOT NULL DEFAULT 'disponible',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cambios_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "versiones_plataforma_numero_key" ON "versiones_plataforma"("numero");

-- CreateIndex
CREATE INDEX "versiones_plataforma_estado_idx" ON "versiones_plataforma"("estado");

-- CreateIndex
CREATE INDEX "cambios_version_version_id_idx" ON "cambios_version"("version_id");

-- AddForeignKey
ALTER TABLE "cambios_version" ADD CONSTRAINT "cambios_version_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "versiones_plataforma"("id") ON DELETE CASCADE ON UPDATE CASCADE;
