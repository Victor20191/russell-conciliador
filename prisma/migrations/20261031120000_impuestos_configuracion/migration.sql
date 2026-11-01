-- Impuestos · Retención en la fuente, Fase 1: configuración (31/Oct/2026). Aditiva.
--
-- · formularios_dian_cliente.periodicidad: periodicidad del cliente por formulario (null = la del
--   formulario). La ficha del cliente la pide para Retención en la fuente e IVA.
-- · mapeo_renglon_dian: concepto del 350 → renglones → cuenta Russell («Mapeos DIAN», global),
--   sembrada con la pestaña «F350-Mapeo Russell» del levantamiento (MAPEO_F350_FABRICA).
-- · cuenta_russell_dian: cuentas Russell que NO restan el tercero DIAN (sin fila = sí lo restan);
--   se siembra 236575 (autorretenciones).
-- · tercero_dian: NIT de la DIAN como tercero: 800197268 (el que traen los balances) y 800197384
--   (el del levantamiento).
-- · vencimiento_dian: calendario tributario (se importa desde la pantalla; no se siembra).
--
-- Ningún código anterior lee estas tablas: aplicar la migración antes del despliegue no cambia nada.

-- AlterTable
ALTER TABLE "formularios_dian_cliente" ADD COLUMN     "periodicidad" TEXT;

-- CreateTable
CREATE TABLE "mapeo_renglon_dian" (
    "id" SERIAL NOT NULL,
    "formulario" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "seccion" TEXT NOT NULL,
    "renglon_pj" INTEGER,
    "renglon_pn" INTEGER,
    "cuenta_russell" TEXT,
    "signo" TEXT NOT NULL DEFAULT '+',
    "en_cruce" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "actualizado_por" TEXT,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mapeo_renglon_dian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuenta_russell_dian" (
    "id" SERIAL NOT NULL,
    "cuenta_russell" TEXT NOT NULL,
    "restar_tercero_dian" BOOLEAN NOT NULL DEFAULT true,
    "actualizado_por" TEXT,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuenta_russell_dian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tercero_dian" (
    "id" SERIAL NOT NULL,
    "nit" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "creado_por" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tercero_dian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vencimiento_dian" (
    "id" SERIAL NOT NULL,
    "anio" INTEGER NOT NULL,
    "formulario" TEXT NOT NULL,
    "periodo" INTEGER NOT NULL,
    "ultimo_digito" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "actualizado_por" TEXT,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vencimiento_dian_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mapeo_renglon_dian_formulario_concepto_key" ON "mapeo_renglon_dian"("formulario", "concepto");

-- CreateIndex
CREATE UNIQUE INDEX "cuenta_russell_dian_cuenta_russell_key" ON "cuenta_russell_dian"("cuenta_russell");

-- CreateIndex
CREATE UNIQUE INDEX "tercero_dian_nit_key" ON "tercero_dian"("nit");

-- CreateIndex
CREATE INDEX "vencimiento_dian_anio_formulario_idx" ON "vencimiento_dian"("anio", "formulario");

-- CreateIndex
CREATE UNIQUE INDEX "vencimiento_dian_anio_formulario_periodo_ultimo_digito_key" ON "vencimiento_dian"("anio", "formulario", "periodo", "ultimo_digito");

-- Semillas (src/lib/impuestos/mapeo-dian.ts; impuestos-semillas.test.ts comprueba que coincidan).

INSERT INTO "mapeo_renglon_dian" ("formulario", "concepto", "etiqueta", "seccion", "renglon_pj", "renglon_pn", "cuenta_russell", "signo", "en_cruce", "orden", "actualizado_en") VALUES
  ('350', 'rentas_trabajo', 'Rentas de trabajo', 'Retenciones a título de renta', NULL, 93, '236505', '+', true, 10, CURRENT_TIMESTAMP),
  ('350', 'rentas_pensiones', 'Rentas de pensiones', 'Retenciones a título de renta', NULL, 94, '236505', '+', true, 20, CURRENT_TIMESTAMP),
  ('350', 'honorarios', 'Honorarios', 'Retenciones a título de renta', 42, 95, '236515', '+', true, 30, CURRENT_TIMESTAMP),
  ('350', 'comisiones', 'Comisiones', 'Retenciones a título de renta', 43, 96, '236520', '+', true, 40, CURRENT_TIMESTAMP),
  ('350', 'servicios', 'Servicios', 'Retenciones a título de renta', 44, 97, '236525', '+', true, 50, CURRENT_TIMESTAMP),
  ('350', 'rendimientos', 'Rendimientos financieros e intereses', 'Retenciones a título de renta', 45, 98, '236535', '+', true, 60, CURRENT_TIMESTAMP),
  ('350', 'arrendamientos', 'Arrendamientos (muebles e inmuebles)', 'Retenciones a título de renta', 46, 99, '236530', '+', true, 70, CURRENT_TIMESTAMP),
  ('350', 'regalias', 'Regalías y explotación de la propiedad intelectual', 'Retenciones a título de renta', 47, 100, '236570', '+', true, 80, CURRENT_TIMESTAMP),
  ('350', 'dividendos', 'Dividendos y participaciones', 'Retenciones a título de renta', 48, 101, '236510', '+', true, 90, CURRENT_TIMESTAMP),
  ('350', 'compras', 'Compras', 'Retenciones a título de renta', 49, 102, '236540', '+', true, 100, CURRENT_TIMESTAMP),
  ('350', 'tarjetas', 'Transacciones con tarjetas débito y crédito', 'Retenciones a título de renta', 50, 103, '236570', '+', true, 110, CURRENT_TIMESTAMP),
  ('350', 'construccion', 'Contratos de construcción', 'Retenciones a título de renta', 51, 104, '236570', '+', true, 120, CURRENT_TIMESTAMP),
  ('350', 'enajenacion_activos', 'Enajenación de activos fijos de personas naturales ante notarios y autoridades de tránsito', 'Retenciones a título de renta', NULL, 105, '236560', '+', true, 130, CURRENT_TIMESTAMP),
  ('350', 'loterias', 'Loterías, rifas, apuestas y similares', 'Retenciones a título de renta', 52, 106, '236545', '+', true, 140, CURRENT_TIMESTAMP),
  ('350', 'hidrocarburos', 'Hidrocarburos, carbón y demás productos mineros', 'Retenciones a título de renta', 53, 107, '236570', '+', true, 150, CURRENT_TIMESTAMP),
  ('350', 'otros_pagos', 'Otros pagos sujetos a retención', 'Retenciones a título de renta', 54, 108, '236570', '+', true, 160, CURRENT_TIMESTAMP),
  ('350', 'exterior_sin_convenio', 'Pagos o abonos en cuenta al exterior: países sin convenio', 'Pagos al exterior', 57, 111, '236550', '+', true, 170, CURRENT_TIMESTAMP),
  ('350', 'exterior_con_convenio', 'Pagos o abonos en cuenta al exterior: países con convenio vigente', 'Pagos al exterior', 58, 112, '236550', '+', true, 180, CURRENT_TIMESTAMP),
  ('350', 'autorret_exonerados', 'Contribuyentes exonerados de aportes (art. 114-1 E.T.)', 'Autorretenciones', 68, NULL, '236575', '+', true, 190, CURRENT_TIMESTAMP),
  ('350', 'autorret_ventas', 'Ventas', 'Autorretenciones', 69, 121, '236575', '+', true, 200, CURRENT_TIMESTAMP),
  ('350', 'autorret_honorarios', 'Honorarios', 'Autorretenciones', 70, 122, '236575', '+', true, 210, CURRENT_TIMESTAMP),
  ('350', 'autorret_comisiones', 'Comisiones', 'Autorretenciones', 71, 123, '236575', '+', true, 220, CURRENT_TIMESTAMP),
  ('350', 'autorret_servicios', 'Servicios', 'Autorretenciones', 72, 124, '236575', '+', true, 230, CURRENT_TIMESTAMP),
  ('350', 'autorret_rendimientos', 'Rendimientos financieros', 'Autorretenciones', 73, 125, '236575', '+', true, 240, CURRENT_TIMESTAMP),
  ('350', 'autorret_pagos_provisionales', 'Pagos mensuales provisionales de carácter voluntario (hidrocarburos y demás productos mineros)', 'Autorretenciones', 74, 126, '236575', '+', true, 250, CURRENT_TIMESTAMP),
  ('350', 'autorret_exportacion_hidrocarburos', 'Exportación de hidrocarburos, carbón y demás productos mineros', 'Autorretenciones', 75, 127, '236575', '+', true, 260, CURRENT_TIMESTAMP),
  ('350', 'autorret_otros', 'Otros conceptos', 'Autorretenciones', 76, 128, '236575', '+', true, 270, CURRENT_TIMESTAMP),
  ('350', 'menos_renta_exceso', 'Menos retenciones de renta practicadas en exceso o indebidas', 'Retenciones a título de renta', 129, NULL, NULL, '-', true, 280, CURRENT_TIMESTAMP),
  ('350', 'reteiva_responsables', 'ReteIVA a responsables del impuesto sobre las ventas', 'Retenciones a título de IVA', 131, NULL, '236705', '+', true, 290, CURRENT_TIMESTAMP),
  ('350', 'reteiva_no_residentes', 'ReteIVA por servicios a no residentes o no domiciliados', 'Retenciones a título de IVA', 132, NULL, '236705', '+', true, 300, CURRENT_TIMESTAMP),
  ('350', 'menos_reteiva_exceso', 'Menos reteIVA practicadas en exceso o indebidas', 'Retenciones a título de IVA', 133, NULL, '236705', '-', true, 310, CURRENT_TIMESTAMP),
  ('350', 'timbre', 'Retención de timbre nacional', 'Retención de timbre', 135, NULL, '236565', '+', true, 320, CURRENT_TIMESTAMP),
  ('350', 'sanciones', 'Sanciones', 'Totales', 137, NULL, NULL, '+', false, 330, CURRENT_TIMESTAMP);

INSERT INTO "tercero_dian" ("nit", "etiqueta") VALUES
  ('800197268', 'U.A.E. Dirección de Impuestos y Aduanas Nacionales (DIAN)'),
  ('800197384', 'NIT del levantamiento de Russell');

INSERT INTO "cuenta_russell_dian" ("cuenta_russell", "restar_tercero_dian", "actualizado_en") VALUES
  ('236575', false, CURRENT_TIMESTAMP);
