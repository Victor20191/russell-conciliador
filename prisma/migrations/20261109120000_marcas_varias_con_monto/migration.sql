-- Varias marcas por renglón, cada una con su monto (9/Nov/2026, decisión del usuario).
--
-- Un renglón del cruce (cuenta de la cédula, tercero del cruce por tercero o cuenta del control de
-- deducciones) puede llevar varias marcas, y cada una dice cuánto de la diferencia explica. El
-- renglón queda explicado cuando la suma de los montos cubre su diferencia (dentro de la tolerancia).
--
-- `monto` es NULL en las marcas anteriores: explican toda la diferencia que congelaron
-- (`diferencia`), como hasta hoy. Por eso no hay que rellenar nada y lo ya conciliado no cambia.
-- Las llaves únicas por renglón se retiran; el número sigue siendo único en el período.
ALTER TABLE "marca_cruce_modulo" ADD COLUMN "monto" DECIMAL(18,2);

DROP INDEX IF EXISTS "marca_cruce_modulo_unica";
DROP INDEX IF EXISTS "marca_cruce_modulo_tercero_unica";

CREATE INDEX IF NOT EXISTS "marca_cruce_modulo_renglon_idx"
  ON "marca_cruce_modulo" ("cliente_id", "modulo_codigo", "periodo", "dimension", "cuenta_4", "clave");
