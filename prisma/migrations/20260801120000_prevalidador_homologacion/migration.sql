-- ============================================================
-- PREVALIDADOR de homologación.
--
-- `prevalidador_cuentas`         : catálogo GLOBAL módulo → cuenta Russell.
-- `prevalidador_cuentas_cliente` : cuenta del CLIENTE por fila del catálogo,
--                                  cuando el cliente no usa el mismo prefijo.
--
-- El informe compara, para cada fila, el saldo agregado por prefijo de
-- `cuenta_6_russell` (lado Russell) contra el agregado por prefijo de `cuenta_8`
-- (lado cliente) sobre las MISMAS filas de `balance_prueba_detalle`. Si la
-- homologación fue correcta los dos lados coinciden; si una cuenta del cliente
-- terminó asignada a una cuenta estándar de otro grupo, la diferencia aparece.
--
-- `base_calculo` decide si el agregado usa `saldo_final` (clases 1-3, cuentas de
-- balance) o `debitos - creditos` (clases 4-7, cuentas de resultado: así el saldo
-- inicial acumulado no contamina la comparación del período). Es parametrizable
-- por fila para poder corregir el criterio sin desplegar.
-- ============================================================

CREATE TABLE "prevalidador_cuentas" (
    "id" SERIAL NOT NULL,
    "modulo_id" INTEGER NOT NULL,
    "cuenta_russell" TEXT NOT NULL,
    "etiqueta" TEXT,
    "base_calculo" TEXT NOT NULL DEFAULT 'saldo',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "actualizado_por" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prevalidador_cuentas_pkey" PRIMARY KEY ("id")
);

-- Único por MÓDULO, no global: impide repetir el prefijo dentro de un módulo pero
-- deja abierto que el mismo prefijo alimente dos módulos distintos.
CREATE UNIQUE INDEX "prevalidador_cuentas_modulo_id_cuenta_russell_key"
    ON "prevalidador_cuentas"("modulo_id", "cuenta_russell");

CREATE INDEX "prevalidador_cuentas_activa_orden_idx"
    ON "prevalidador_cuentas"("activa", "orden");

ALTER TABLE "prevalidador_cuentas"
    ADD CONSTRAINT "prevalidador_cuentas_modulo_id_fkey"
    FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "prevalidador_cuentas_cliente" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "catalogo_id" INTEGER NOT NULL,
    "cuenta_cliente" TEXT NOT NULL,
    "actualizado_por" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prevalidador_cuentas_cliente_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prevalidador_cuentas_cliente_cliente_id_catalogo_id_key"
    ON "prevalidador_cuentas_cliente"("cliente_id", "catalogo_id");

CREATE INDEX "prevalidador_cuentas_cliente_cliente_id_idx"
    ON "prevalidador_cuentas_cliente"("cliente_id");

ALTER TABLE "prevalidador_cuentas_cliente"
    ADD CONSTRAINT "prevalidador_cuentas_cliente_catalogo_id_fkey"
    FOREIGN KEY ("catalogo_id") REFERENCES "prevalidador_cuentas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- Siembra de las 11 filas de fábrica que definió Russell por correo (grupos de 2
-- dígitos y cuentas de 4). Son las mismas que `PREVALIDADOR_CATALOGO_FABRICA` en
-- src/lib/balance/prevalidador/catalogo.ts.
--
-- El JOIN por `modulos.codigo` es idempotente y NO crea módulos: si algún código
-- faltara en el entorno, esa fila simplemente no se siembra (ver la verificación
-- al final de esta migración).
-- ------------------------------------------------------------
INSERT INTO "prevalidador_cuentas"
    ("modulo_id", "cuenta_russell", "etiqueta", "base_calculo", "orden")
SELECT m."id", f."cuenta_russell", f."etiqueta", f."base_calculo", f."orden"
FROM (VALUES
    ('ING', '41',   'Ingresos operacionales',              'movimiento', 10),
    ('CAR', '13',   'Deudores / clientes',                 'saldo',      10),
    ('CAR', '2805', 'Anticipos y avances recibidos',       'saldo',      20),
    ('INV', '14',   'Inventarios',                         'saldo',      10),
    ('AFI', '15',   'Propiedad, planta y equipo',          'saldo',      10),
    ('CXP', '22',   'Proveedores',                         'saldo',      10),
    ('CXP', '1330', 'Anticipos y avances entregados',      'saldo',      20),
    ('CXP', '2335', 'Costos y gastos por pagar',           'saldo',      30),
    ('NOM', '5105', 'Gastos de personal · administración', 'movimiento', 10),
    ('NOM', '5205', 'Gastos de personal · ventas',         'movimiento', 20),
    ('NOM', '7205', 'Mano de obra · producción',           'movimiento', 30)
) AS f("modulo", "cuenta_russell", "etiqueta", "base_calculo", "orden")
JOIN "modulos" AS m ON m."codigo" = f."modulo"
ON CONFLICT ("modulo_id", "cuenta_russell") DO NOTHING;

-- Verificación manual tras aplicar (debe devolver 11):
--   SELECT count(*) FROM "prevalidador_cuentas";
-- Si devuelve menos, faltan códigos de módulo en `modulos`:
--   SELECT codigo FROM (VALUES ('ING'),('CAR'),('INV'),('AFI'),('CXP'),('NOM'))
--     AS x(codigo)
--   WHERE codigo NOT IN (SELECT codigo FROM "modulos");
