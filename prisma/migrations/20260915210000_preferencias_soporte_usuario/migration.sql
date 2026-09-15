-- Preferencias personales de Ayuda: no cambia tickets ni crea preferencias
-- para otros usuarios. La ausencia de fila conserva los valores iniciales.
CREATE TABLE "preferencias_soporte_usuario" (
    "usuario_id" INTEGER NOT NULL,
    "estados_ocultos" TEXT[] NOT NULL DEFAULT ARRAY['resuelto', 'cerrado']::TEXT[],
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "preferencias_soporte_usuario_pkey" PRIMARY KEY ("usuario_id"),
    CONSTRAINT "preferencias_soporte_usuario_estados_validos_check" CHECK (
        "estados_ocultos" <@ ARRAY['abierto', 'en_evaluacion', 'en_proceso', 'resuelto', 'cerrado']::TEXT[]
        AND array_position("estados_ocultos", NULL) IS NULL
    ),
    CONSTRAINT "preferencias_soporte_usuario_usuario_fkey"
        FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
