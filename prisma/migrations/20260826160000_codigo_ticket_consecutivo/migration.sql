-- El código visible del ticket pasa de `TKT-<fecha>-<hash>` a un consecutivo
-- corto `TKT-<n>`. El código NUNCA fue el secreto del enlace público: el acceso
-- sigue protegido por `token_acceso_hash`, así que un número adivinable no abre
-- nada. La secuencia la consume la Server Action con `nextval` (atómico).
CREATE SEQUENCE "secuencia_codigo_ticket_soporte";

-- Renumera lo existente por antigüedad: 1..N sin huecos.
WITH numerados AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "creado_en", "id") AS consecutivo
    FROM "tickets_soporte"
)
UPDATE "tickets_soporte" AS t
SET "codigo" = 'TKT-' || numerados."consecutivo"
FROM numerados
WHERE t."id" = numerados."id";

-- La secuencia continúa después del último ticket renumerado (si no hay
-- tickets, `is_called = false` hace que el primer `nextval` devuelva 1).
SELECT setval(
    'secuencia_codigo_ticket_soporte',
    GREATEST((SELECT COUNT(*) FROM "tickets_soporte"), 1),
    (SELECT COUNT(*) FROM "tickets_soporte") > 0
);
