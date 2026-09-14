-- Aditiva: marcas de auditoría por tercero, emparejamiento manual de terceros y evidencia
-- del cruce por tercero en el cierre en firme (Fase 4 de Cartera; la reutiliza CxP).
--
-- Compatible con el código ya desplegado: una marca de cuenta se sigue escribiendo igual
-- (dimension por defecto 'cuenta4', cuenta_4 informada y clave nula) y conserva su índice
-- único por cuenta. Las marcas de tercero dejan cuenta_4 en NULL, que no choca con ese índice.

-- ===== Marcas por tercero =====
ALTER TABLE "marca_cruce_modulo" ADD COLUMN "dimension" TEXT NOT NULL DEFAULT 'cuenta4';
ALTER TABLE "marca_cruce_modulo" ADD COLUMN "clave" TEXT;
ALTER TABLE "marca_cruce_modulo" ALTER COLUMN "cuenta_4" DROP NOT NULL;

-- Cada marca explica exactamente una cosa: una cuenta de la cédula o un tercero.
ALTER TABLE "marca_cruce_modulo" ADD CONSTRAINT "marca_cruce_modulo_dimension_check" CHECK (
  ("dimension" = 'cuenta4' AND "cuenta_4" IS NOT NULL AND "clave" IS NULL)
  OR ("dimension" = 'tercero' AND "clave" IS NOT NULL AND "cuenta_4" IS NULL)
);

-- Una marca por tercero en el período (las de cuenta tienen clave NULL y no participan).
CREATE UNIQUE INDEX "marca_cruce_modulo_tercero_unica"
    ON "marca_cruce_modulo"("cliente_id", "modulo_codigo", "periodo", "clave");

-- ===== Cierre en firme: alcance por cuenta de 6 dígitos y evidencia del cruce por tercero =====
ALTER TABLE "conciliacion_modulo_cierre" ADD COLUMN "cuentas_russell_6" JSONB;
ALTER TABLE "conciliacion_modulo_cierre" ADD COLUMN "resumen_cruce_tercero" JSONB;

-- ===== Emparejamiento manual de terceros =====
-- «El tercero X del auxiliar es el Y del balance». Memoria del cliente: con período vacío
-- vale para todos los períodos; N:1 (varias claves del auxiliar pueden ir al mismo tercero).
CREATE TABLE "emparejamiento_tercero_modulo" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "periodo" TEXT NOT NULL DEFAULT '',
    "clave_modulo" TEXT NOT NULL,
    "clave_balance" TEXT NOT NULL,
    "nombre_modulo" TEXT,
    "nombre_balance" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "nota" TEXT,
    "creado_por" TEXT,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "emparejamiento_tercero_modulo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "emparejamiento_tercero_modulo_unico"
    ON "emparejamiento_tercero_modulo"("cliente_id", "modulo_codigo", "periodo", "clave_modulo");
CREATE INDEX "emparejamiento_tercero_modulo_cliente_idx"
    ON "emparejamiento_tercero_modulo"("cliente_id", "modulo_codigo");
