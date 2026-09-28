-- UNIÓN DEL LADO CONTABLE en el cruce por tercero.
--
-- Hasta ahora solo se emparejaba una clave del AUXILIAR con una del balance. El caso inverso
-- también ocurre: la contabilidad parte en dos NIT lo que el auxiliar trae bajo uno (BANCOLOMBIA:
-- 890903938 y 860059294 en el balance, todo en 890903938 en el auxiliar de CxP). Se guarda en la
-- misma tabla con `tipo = 'union_contable'`: `clave_modulo` lleva la clave de la CONTABILIDAD que se
-- suma (el origen, única por alcance: un NIT del balance se suma a un solo renglón) y
-- `clave_balance` el renglón destino. Aditiva: solo amplía los valores permitidos de `tipo`.

ALTER TABLE "emparejamiento_tercero_modulo"
    DROP CONSTRAINT "emparejamiento_tercero_modulo_tipo_check";

ALTER TABLE "emparejamiento_tercero_modulo"
    ADD CONSTRAINT "emparejamiento_tercero_modulo_tipo_check"
    CHECK ("tipo" IN ('union', 'separacion', 'union_contable'));
