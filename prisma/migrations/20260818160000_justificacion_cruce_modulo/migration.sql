-- Justificación de las DIFERENCIAS del cruce contable de un módulo (saldo del balance
-- de comprobación vs. valor consolidado de los archivos del módulo), por cuenta Russell
-- de 4 dígitos.
--
-- Se ancla al PERÍODO del cliente y no al cargue, para que sobreviva a las versiones
-- nuevas del mismo período: volver a cargar el archivo no obliga a reescribir las
-- justificaciones. `diferencia` congela el monto justificado, de modo que la pantalla
-- pueda avisar cuando la diferencia actual ya no coincide. Las referencias a cliente,
-- usuario y comentario son FK suaves (solo el entero), como el resto del motor de
-- módulos: borrar el comentario del hilo no borra la justificación.

CREATE TABLE "justificacion_cruce_modulo" (
  "id" SERIAL NOT NULL,
  "cliente_id" INTEGER NOT NULL,
  "modulo_codigo" TEXT NOT NULL,
  "periodo" TEXT NOT NULL,
  "cuenta_4" TEXT NOT NULL,
  "nota" TEXT NOT NULL,
  "diferencia" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "comentario_id" INTEGER,
  "justificado_por" TEXT,
  "justificado_por_id" INTEGER,
  "justificado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "justificacion_cruce_modulo_pkey" PRIMARY KEY ("id")
);

-- Una sola justificación vigente por cliente, módulo, período y cuenta.
CREATE UNIQUE INDEX "justificacion_cruce_modulo_unica"
ON "justificacion_cruce_modulo" ("cliente_id", "modulo_codigo", "periodo", "cuenta_4");

-- Lectura de la pestaña «Cruce contable»: todas las justificaciones del período.
CREATE INDEX "justificacion_cruce_modulo_periodo_idx"
ON "justificacion_cruce_modulo" ("cliente_id", "modulo_codigo", "periodo");
