-- Un cliente puede operar con sistemas distintos para Contabilidad, Nómina,
-- Inventarios y los demás módulos. La asignación se normaliza para que agregar
-- un proceso futuro no exija otra columna en `clientes`.
CREATE TABLE "procesos_erp" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procesos_erp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "procesos_erp_codigo_key" ON "procesos_erp"("codigo");

CREATE TABLE "erps_cliente_proceso" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "proceso_id" INTEGER NOT NULL,
    "erp_id" INTEGER,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "origen" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "erps_cliente_proceso_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "erps_cliente_proceso_estado_check"
      CHECK ("estado" IN ('confirmado', 'heredado', 'pendiente')),
    CONSTRAINT "erps_cliente_proceso_estado_erp_check"
      CHECK (
        ("estado" = 'pendiente' AND "erp_id" IS NULL)
        OR ("estado" IN ('confirmado', 'heredado') AND "erp_id" IS NOT NULL)
      )
);

CREATE UNIQUE INDEX "erps_cliente_proceso_cliente_proceso_key"
  ON "erps_cliente_proceso"("cliente_id", "proceso_id");
CREATE INDEX "erps_cliente_proceso_proceso_erp_idx"
  ON "erps_cliente_proceso"("proceso_id", "erp_id");
CREATE INDEX "erps_cliente_proceso_erp_idx"
  ON "erps_cliente_proceso"("erp_id");

ALTER TABLE "erps_cliente_proceso"
  ADD CONSTRAINT "erps_cliente_proceso_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erps_cliente_proceso"
  ADD CONSTRAINT "erps_cliente_proceso_proceso_id_fkey"
  FOREIGN KEY ("proceso_id") REFERENCES "procesos_erp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "erps_cliente_proceso"
  ADD CONSTRAINT "erps_cliente_proceso_erp_id_fkey"
  FOREIGN KEY ("erp_id") REFERENCES "erps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "procesos_erp" ("codigo", "nombre", "orden") VALUES
  ('CONT', 'Contabilidad', 10),
  ('NOM', 'Nómina', 20),
  ('INV', 'Inventarios', 30),
  ('ING', 'Ingresos', 40),
  ('CAR', 'Cartera', 50),
  ('CXP', 'Cuentas por pagar', 60),
  ('AFI', 'Activos fijos', 70);

-- Compatibilidad: el ERP único existente se interpreta como ERP contable. Los
-- clientes sin ERP también reciben una fila CONT explícita en estado pendiente;
-- así "sin configurar" nunca se confunde con "no existe una asignación".
INSERT INTO "erps_cliente_proceso" (
  "cliente_id", "proceso_id", "erp_id", "estado", "origen", "actualizado_en"
)
SELECT
  cliente."id",
  proceso."id",
  cliente."erp_id",
  CASE WHEN cliente."erp_id" IS NULL THEN 'pendiente' ELSE 'heredado' END,
  'migracion',
  CURRENT_TIMESTAMP
FROM "clientes" AS cliente
CROSS JOIN "procesos_erp" AS proceso
WHERE proceso."codigo" = 'CONT';
