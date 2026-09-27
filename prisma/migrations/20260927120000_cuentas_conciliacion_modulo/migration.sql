-- Aditiva: las cuentas Russell de 6 dígitos que concilia cada módulo con cédula a ese nivel
-- (Ingresos, Cartera, Cuentas por pagar, Nómina) dejan de estar fijas en `descriptores.ts` y
-- se administran en /config/prevalidador. La siembra reproduce exactamente las listas que el
-- código usaba hasta hoy, así que ningún cruce cambia al desplegar.

-- ===== Copia de las cuentas en el cierre en firme =====
-- Mientras el cierre esté en firme, el cruce se calcula con esta copia. Null = cierre anterior:
-- se lee con los valores de fábrica del descriptor, que son los que regían al cerrar.
ALTER TABLE "conciliacion_modulo_cierre" ADD COLUMN "cuentas_conciliacion" JSONB;

-- ===== Cuentas que concilia cada módulo =====
CREATE TABLE "cuentas_conciliacion_modulo" (
    "id" SERIAL NOT NULL,
    "modulo_codigo" TEXT NOT NULL,
    "cuenta" TEXT NOT NULL,
    "origen" TEXT,
    "actualizado_por" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cuentas_conciliacion_modulo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cuentas_conciliacion_modulo_cuenta_chk" CHECK ("cuenta" ~ '^[0-9]{6}$'),
    CONSTRAINT "cuentas_conciliacion_modulo_origen_chk" CHECK ("origen" IS NULL OR "origen" IN ('nacional', 'exterior'))
);

CREATE UNIQUE INDEX "cuentas_conciliacion_modulo_modulo_codigo_cuenta_key" ON "cuentas_conciliacion_modulo"("modulo_codigo", "cuenta");

-- Valores de fábrica (idénticos a `cuentasConciliacionDeFabrica`). `actualizado_en` va explícito:
-- la columna es `@updatedAt` de Prisma y no tiene DEFAULT en la BD.
INSERT INTO "cuentas_conciliacion_modulo" ("modulo_codigo", "cuenta", "origen", "actualizado_en")
SELECT f."modulo", f."cuenta", f."origen", CURRENT_TIMESTAMP
FROM (VALUES
    -- Ingresos: las siete de la 41 y los arrendamientos no operacionales.
    ('ING', '410505', NULL), ('ING', '410510', NULL), ('ING', '410515', NULL), ('ING', '410520', NULL),
    ('ING', '410525', NULL), ('ING', '410530', NULL), ('ING', '417505', NULL), ('ING', '422005', NULL),
    -- Cartera: nacional, exterior y anticipos recibidos.
    ('CAR', '130505', 'nacional'), ('CAR', '130510', 'exterior'), ('CAR', '280505', NULL),
    -- Cuentas por pagar (RF-CXP-06 depurado contra el PUC Russell).
    ('CXP', '220505', 'nacional'), ('CXP', '221005', 'exterior'),
    ('CXP', '233505', NULL), ('CXP', '233510', NULL), ('CXP', '233520', NULL), ('CXP', '233525', NULL),
    ('CXP', '233530', NULL), ('CXP', '233540', NULL), ('CXP', '233555', NULL), ('CXP', '233595', NULL),
    ('CXP', '133005', NULL), ('CXP', '133010', NULL), ('CXP', '133095', NULL),
    -- Nómina: gasto y costo de personal (RF-NOM-05) y los pasivos laborales por saldo final.
    ('NOM', '510506', NULL), ('NOM', '510530', NULL), ('NOM', '510536', NULL), ('NOM', '510539', NULL),
    ('NOM', '510568', NULL), ('NOM', '510569', NULL), ('NOM', '510570', NULL), ('NOM', '510595', NULL),
    ('NOM', '520506', NULL), ('NOM', '520530', NULL), ('NOM', '520536', NULL), ('NOM', '520539', NULL),
    ('NOM', '520568', NULL), ('NOM', '520569', NULL), ('NOM', '520570', NULL), ('NOM', '520595', NULL),
    ('NOM', '720505', NULL), ('NOM', '720510', NULL), ('NOM', '720515', NULL), ('NOM', '720520', NULL),
    ('NOM', '720525', NULL), ('NOM', '720530', NULL), ('NOM', '720535', NULL), ('NOM', '720540', NULL),
    ('NOM', '730505', NULL),
    ('NOM', '251010', NULL), ('NOM', '251505', NULL), ('NOM', '252005', NULL), ('NOM', '252505', NULL)
) AS f("modulo", "cuenta", "origen")
ON CONFLICT ("modulo_codigo", "cuenta") DO NOTHING;
