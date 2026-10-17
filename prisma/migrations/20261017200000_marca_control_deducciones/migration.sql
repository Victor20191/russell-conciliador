-- MARCAS DEL CONTROL DE DEDUCCIONES de Nómina (17/Oct/2026).
--
-- El control de deducciones (libranzas, retenciones, embargos… contra el saldo final de la cuenta
-- del cliente) pasa a exigir marca para cerrar. La marca es la misma de siempre, con dimensión
-- «control» y la cuenta del cliente en `clave`. Aditiva: solo amplía la regla de la tabla; las marcas
-- de cuenta y de tercero no cambian.

ALTER TABLE "marca_cruce_modulo" DROP CONSTRAINT "marca_cruce_modulo_dimension_check";

ALTER TABLE "marca_cruce_modulo" ADD CONSTRAINT "marca_cruce_modulo_dimension_check" CHECK (
  ("dimension" = 'cuenta4' AND "cuenta_4" IS NOT NULL AND "clave" IS NULL)
  OR ("dimension" IN ('tercero', 'control') AND "clave" IS NOT NULL AND "cuenta_4" IS NULL)
);
