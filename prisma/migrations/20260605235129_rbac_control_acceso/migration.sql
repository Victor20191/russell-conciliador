-- CreateTable
CREATE TABLE "roles" (
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "rango" INTEGER NOT NULL DEFAULT 0,
    "es_operativo" BOOLEAN NOT NULL DEFAULT false,
    "es_sistema" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "permisos" (
    "codigo" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "roles_permisos" (
    "id" TEXT NOT NULL,
    "rol_codigo" TEXT NOT NULL,
    "permiso_codigo" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "lider_usuario_id" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrantes_equipo" (
    "id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "rol_codigo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrantes_equipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asignaciones_cliente" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "equipo_id" TEXT,
    "usuario_id" TEXT,
    "alcance_lectura" BOOLEAN NOT NULL DEFAULT true,
    "alcance_escritura" BOOLEAN NOT NULL DEFAULT false,
    "asignado_por_id" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asignaciones_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roles_rango_idx" ON "roles"("rango");

-- CreateIndex
CREATE INDEX "permisos_modulo_idx" ON "permisos"("modulo");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_modulo_accion_key" ON "permisos"("modulo", "accion");

-- CreateIndex
CREATE INDEX "roles_permisos_permiso_codigo_idx" ON "roles_permisos"("permiso_codigo");

-- CreateIndex
CREATE UNIQUE INDEX "roles_permisos_rol_codigo_permiso_codigo_key" ON "roles_permisos"("rol_codigo", "permiso_codigo");

-- CreateIndex
CREATE INDEX "equipos_lider_usuario_id_idx" ON "equipos"("lider_usuario_id");

-- CreateIndex
CREATE INDEX "integrantes_equipo_usuario_id_idx" ON "integrantes_equipo"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "integrantes_equipo_equipo_id_usuario_id_key" ON "integrantes_equipo"("equipo_id", "usuario_id");

-- CreateIndex
CREATE INDEX "asignaciones_cliente_cliente_id_idx" ON "asignaciones_cliente"("cliente_id");

-- CreateIndex
CREATE INDEX "asignaciones_cliente_equipo_id_idx" ON "asignaciones_cliente"("equipo_id");

-- CreateIndex
CREATE INDEX "asignaciones_cliente_usuario_id_activo_idx" ON "asignaciones_cliente"("usuario_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "asignaciones_cliente_cliente_id_equipo_id_usuario_id_key" ON "asignaciones_cliente"("cliente_id", "equipo_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "roles_permisos" ADD CONSTRAINT "roles_permisos_rol_codigo_fkey" FOREIGN KEY ("rol_codigo") REFERENCES "roles"("codigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles_permisos" ADD CONSTRAINT "roles_permisos_permiso_codigo_fkey" FOREIGN KEY ("permiso_codigo") REFERENCES "permisos"("codigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrantes_equipo" ADD CONSTRAINT "integrantes_equipo_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrantes_equipo" ADD CONSTRAINT "integrantes_equipo_rol_codigo_fkey" FOREIGN KEY ("rol_codigo") REFERENCES "roles"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_cliente" ADD CONSTRAINT "asignaciones_cliente_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
