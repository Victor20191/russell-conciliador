-- Aditiva: los subgrupos Russell de 4 dígitos que concilia cada módulo con cédula a ese nivel
-- (Inventarios, Activos fijos) dejan de salir de la regla del prevalidador y se administran en
-- /config/prevalidador/{inv,afi}. El prevalidador queda solo para validar el balance; esta lista
-- decide qué entra al cruce contable. El código anterior no lee ni la tabla ni la columna nuevas.

-- ===== Copia de los subgrupos en el cierre en firme =====
-- Mientras el cierre esté en firme, el cruce se calcula con esta copia. Null = cierre anterior:
-- se lee con los subgrupos que quedaron en firme en ese cierre (`cuentas_russell`).
ALTER TABLE "conciliacion_modulo_cierre" ADD COLUMN "subgrupos_conciliacion" JSONB;

-- ===== Subgrupos que concilia cada módulo =====
CREATE TABLE "subgrupos_conciliacion_modulo" (
    "id" SERIAL NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "subgrupo" TEXT NOT NULL,
    "actualizado_por" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subgrupos_conciliacion_modulo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subgrupos_conciliacion_modulo_subgrupo_chk" CHECK ("subgrupo" ~ '^[0-9]{4}$')
);

CREATE UNIQUE INDEX "subgrupos_conciliacion_modulo_modulo_codigo_subgrupo_key" ON "subgrupos_conciliacion_modulo"("modulo_codigo", "subgrupo");

-- Siembra: exactamente lo que cada módulo concilia hoy (`prefijosCuentaModulo` +
-- `filtrarSubgruposPorModulo`): los subgrupos del plan bajo sus reglas ACTIVAS del prevalidador o,
-- si no tiene ninguna, bajo las de fábrica. Es una copia de una sola vez: desde aquí la lista y el
-- prevalidador son independientes. La 1592 de Activos fijos no se siembra: es fija en código
-- (`cedula.subgruposAbiertos`). `actualizado_en` va explícito: la columna es `@updatedAt` de Prisma
-- y no tiene DEFAULT en la BD.
WITH "reglas" AS (
    SELECT m."codigo" AS "modulo", regexp_replace(p."cuenta_russell", '[^0-9]', '', 'g') AS "prefijo"
    FROM "prevalidador_cuentas" p
    JOIN "modulos" m ON m."id" = p."modulo_id"
    WHERE p."activa" AND m."codigo" IN ('INV', 'AFI')
),
"fabrica" ("modulo", "prefijo") AS (
    -- Idénticos a `PREVALIDADOR_CATALOGO_FABRICA`.
    VALUES ('INV', '14'), ('AFI', '15')
),
"prefijos" AS (
    SELECT r."modulo", r."prefijo" FROM "reglas" r WHERE length(r."prefijo") IN (2, 4)
    UNION
    SELECT f."modulo", f."prefijo" FROM "fabrica" f
    WHERE NOT EXISTS (SELECT 1 FROM "reglas" r WHERE r."modulo" = f."modulo" AND length(r."prefijo") IN (2, 4))
),
"abiertos" ("modulo", "subgrupo") AS (
    -- Idénticos a `cedula.subgruposAbiertos` del descriptor.
    VALUES ('AFI', '1592')
)
INSERT INTO "subgrupos_conciliacion_modulo" ("modulo_codigo", "subgrupo", "actualizado_en")
SELECT DISTINCT p."modulo", s."codigo", CURRENT_TIMESTAMP
FROM "prefijos" p
JOIN "subgrupos_estandar" s ON s."codigo" LIKE p."prefijo" || '%'
WHERE s."codigo" ~ '^[0-9]{4}$'
  AND NOT EXISTS (SELECT 1 FROM "abiertos" a WHERE a."modulo" = p."modulo" AND a."subgrupo" = s."codigo")
ON CONFLICT ("modulo_codigo", "subgrupo") DO NOTHING;
