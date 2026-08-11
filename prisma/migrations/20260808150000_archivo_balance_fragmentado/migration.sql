-- Los archivos grandes se reciben en partes inferiores al límite de payload de
-- la Function. Son temporales: al reconstruir el archivo se elimina el encabezado
-- y el ON DELETE CASCADE consume todos sus fragmentos.
CREATE TABLE "balance_archivo_temporal" (
    "lote_id" TEXT NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "nombre_archivo" TEXT NOT NULL,
    "tipo_contenido" TEXT NOT NULL,
    "tamano_bytes" INTEGER NOT NULL,
    "tamano_parte" INTEGER NOT NULL,
    "total_partes" INTEGER NOT NULL,
    "completado" BOOLEAN NOT NULL DEFAULT false,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "balance_archivo_temporal_pkey" PRIMARY KEY ("lote_id")
);

CREATE TABLE "balance_archivo_temporal_parte" (
    "id" BIGSERIAL NOT NULL,
    "lote_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tamano_bytes" INTEGER NOT NULL,
    "contenido" BYTEA NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_archivo_temporal_parte_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "balance_archivo_temporal_usuario_id_idx"
    ON "balance_archivo_temporal"("usuario_id");

CREATE INDEX "balance_archivo_temporal_expira_en_idx"
    ON "balance_archivo_temporal"("expira_en");

CREATE UNIQUE INDEX "balance_archivo_temporal_parte_lote_id_numero_key"
    ON "balance_archivo_temporal_parte"("lote_id", "numero");

CREATE INDEX "balance_archivo_temporal_parte_lote_id_idx"
    ON "balance_archivo_temporal_parte"("lote_id");

ALTER TABLE "balance_archivo_temporal_parte"
    ADD CONSTRAINT "balance_archivo_temporal_parte_lote_id_fkey"
    FOREIGN KEY ("lote_id") REFERENCES "balance_archivo_temporal"("lote_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
