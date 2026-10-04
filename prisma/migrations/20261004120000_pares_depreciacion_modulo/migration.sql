-- Aditiva: las parejas activo → depreciación de la cédula de Activos fijos (1516 ↔ 159205) dejan de
-- estar fijas en el código (`RELACION_DEPRECIACION_AFI`) y se administran en /config/prevalidador/afi.
-- El código anterior no lee ni la tabla ni la columna nuevas: sigue con las de fábrica.

-- ===== Copia de las parejas en el cierre en firme =====
-- Mientras el cierre esté en firme, la cédula se arma con esta copia, así que cambiar las parejas no
-- reordena un período ya cerrado. Null = cierre anterior: se lee con las de fábrica del descriptor.
ALTER TABLE "conciliacion_modulo_cierre" ADD COLUMN "pares_depreciacion" JSONB;

-- ===== Parejas por módulo =====
CREATE TABLE "pares_depreciacion_modulo" (
    "id" SERIAL NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "subgrupo" TEXT NOT NULL,
    "cuenta" TEXT NOT NULL,
    "actualizado_por" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pares_depreciacion_modulo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pares_depreciacion_modulo_subgrupo_chk" CHECK ("subgrupo" ~ '^[0-9]{4}$'),
    CONSTRAINT "pares_depreciacion_modulo_cuenta_chk" CHECK ("cuenta" ~ '^[0-9]{6}$')
);

-- Un activo tiene UNA cuenta de depreciación; varias activos pueden compartirla.
CREATE UNIQUE INDEX "pares_depreciacion_modulo_modulo_codigo_subgrupo_key" ON "pares_depreciacion_modulo"("modulo_codigo", "subgrupo");

-- Siembra: exactamente las seis parejas de fábrica de Activos fijos (`RELACION_DEPRECIACION_AFI`).
-- `actualizado_en` va explícito porque la columna es `@updatedAt` de Prisma, sin default en la BD.
INSERT INTO "pares_depreciacion_modulo" ("modulo_codigo", "subgrupo", "cuenta", "actualizado_por", "actualizado_en")
VALUES
  ('AFI', '1516', '159205', 'Sistema · parejas de fábrica', CURRENT_TIMESTAMP),
  ('AFI', '1520', '159210', 'Sistema · parejas de fábrica', CURRENT_TIMESTAMP),
  ('AFI', '1524', '159215', 'Sistema · parejas de fábrica', CURRENT_TIMESTAMP),
  ('AFI', '1528', '159220', 'Sistema · parejas de fábrica', CURRENT_TIMESTAMP),
  ('AFI', '1540', '159235', 'Sistema · parejas de fábrica', CURRENT_TIMESTAMP),
  ('AFI', '1584', '159280', 'Sistema · parejas de fábrica', CURRENT_TIMESTAMP);
