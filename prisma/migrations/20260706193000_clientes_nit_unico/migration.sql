-- Un cliente se identifica por su NIT: no puede existir repetido.
-- Se protege el valor exacto y tambien su forma normalizada a digitos para
-- evitar duplicados por diferencias de formato (puntos, espacios o guiones).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT "nit"
      FROM "clientes"
      GROUP BY "nit"
      HAVING COUNT(*) > 1
    ) duplicados
  ) THEN
    RAISE EXCEPTION 'No se puede crear clientes_nit_key: existen NIT duplicados en clientes.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT regexp_replace("nit", '[^0-9]', '', 'g') AS "nit_normalizado"
      FROM "clientes"
      GROUP BY regexp_replace("nit", '[^0-9]', '', 'g')
      HAVING COUNT(*) > 1
    ) duplicados
  ) THEN
    RAISE EXCEPTION 'No se puede crear clientes_nit_normalizado_key: existen NIT normalizados duplicados en clientes.';
  END IF;
END $$;

CREATE UNIQUE INDEX "clientes_nit_key" ON "clientes"("nit");
CREATE UNIQUE INDEX "clientes_nit_normalizado_key" ON "clientes"((regexp_replace("nit", '[^0-9]', '', 'g')));
