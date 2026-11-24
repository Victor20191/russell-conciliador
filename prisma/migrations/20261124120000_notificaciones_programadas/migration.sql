-- Notificaciones programadas por correo (hoy: el reporte para gerencia, cada semana).
-- Tres tablas genéricas: la programación (una por tipo), sus destinatarios y el historial
-- de envíos. Los instantes van en TIMESTAMPTZ; «lo que ya toca» lo calcula la aplicación.
-- Solo CREA tablas nuevas: no toca ni lee ninguna tabla existente.

-- CreateTable
CREATE TABLE "notificacion_programada" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "frecuencia" TEXT NOT NULL DEFAULT 'semanal',
    "dia_semana" INTEGER NOT NULL DEFAULT 1,
    "hora" TEXT NOT NULL DEFAULT '07:00',
    "proxima_ejecucion_en" TIMESTAMPTZ(3),
    "creado_por" TEXT NOT NULL,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_por" TEXT NOT NULL,
    "actualizado_por_id" INTEGER,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notificacion_programada_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notificacion_programada_frecuencia_valida" CHECK ("frecuencia" IN ('semanal')),
    CONSTRAINT "notificacion_programada_dia_semana_valido" CHECK ("dia_semana" BETWEEN 1 AND 7),
    CONSTRAINT "notificacion_programada_hora_valida" CHECK ("hora" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

-- CreateTable
CREATE TABLE "notificacion_destinatario" (
    "id" SERIAL NOT NULL,
    "programacion_id" INTEGER NOT NULL,
    "correo" TEXT NOT NULL,
    "nombre" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_por" TEXT NOT NULL,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_destinatario_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notificacion_destinatario_correo_en_minusculas" CHECK ("correo" = lower("correo"))
);

-- CreateTable
CREATE TABLE "notificacion_ejecucion" (
    "id" SERIAL NOT NULL,
    "programacion_id" INTEGER NOT NULL,
    "programada_para" TIMESTAMPTZ(3) NOT NULL,
    "origen" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "aceptados" INTEGER NOT NULL DEFAULT 0,
    "fallidos" INTEGER NOT NULL DEFAULT 0,
    "mensaje" TEXT,
    "periodo_desde" TIMESTAMPTZ(3),
    "periodo_hasta" TIMESTAMPTZ(3),
    "ejecutado_por" TEXT,
    "iniciada_en" TIMESTAMPTZ(3) NOT NULL,
    "terminada_en" TIMESTAMPTZ(3),
    "duracion_ms" INTEGER,

    CONSTRAINT "notificacion_ejecucion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notificacion_ejecucion_origen_valido" CHECK ("origen" IN ('programada', 'manual', 'prueba')),
    CONSTRAINT "notificacion_ejecucion_estado_valido" CHECK ("estado" IN ('en_curso', 'ok', 'parcial', 'error', 'omitida')),
    CONSTRAINT "notificacion_ejecucion_conteos_no_negativos" CHECK ("aceptados" >= 0 AND "fallidos" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "notificacion_programada_tipo_key" ON "notificacion_programada"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "notificacion_destinatario_programacion_id_correo_key" ON "notificacion_destinatario"("programacion_id", "correo");

-- CreateIndex
CREATE INDEX "notificacion_ejecucion_historial_idx" ON "notificacion_ejecucion"("programacion_id", "iniciada_en");

-- CreateIndex
-- Un disparo programado (programacion_id, programada_para) solo puede reclamarse una vez:
-- así dos llamadas cruzadas del cron nunca envían el mismo reporte dos veces.
CREATE UNIQUE INDEX "notificacion_ejecucion_programacion_id_programada_para_key" ON "notificacion_ejecucion"("programacion_id", "programada_para");

-- AddForeignKey
ALTER TABLE "notificacion_destinatario" ADD CONSTRAINT "notificacion_destinatario_programacion_id_fkey" FOREIGN KEY ("programacion_id") REFERENCES "notificacion_programada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion_ejecucion" ADD CONSTRAINT "notificacion_ejecucion_programacion_id_fkey" FOREIGN KEY ("programacion_id") REFERENCES "notificacion_programada"("id") ON DELETE CASCADE ON UPDATE CASCADE;
