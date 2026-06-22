// ============================================================
// Asociación entre el PLAN ESTÁNDAR y los balances de los clientes.
//
// NO existe FK física: al cargar un balance, cada cuenta del cliente se mapea
// por prefijo de 6 dígitos a una cuenta estándar y ese vínculo queda DENTRO del
// JSON `balances.desglose[*].items[*].std` (= el código de la cuenta estándar).
// Por eso, para saber si una cuenta estándar "tiene balances asociados" hay que
// mirar dentro de ese JSON anidado, algo que los filtros JSON de Prisma no
// alcanzan (arrays dentro de arrays) → se usa SQL crudo con `jsonb_array_elements`.
//
// La comprobación es GLOBAL (todos los clientes, sin filtrar por cartera):
// editar o borrar una cuenta estándar afecta a toda la plataforma. El `CASE
// jsonb_typeof ... ELSE '[]'` protege contra balances con `desglose` nulo o con
// una estructura inesperada.
// ============================================================
import prisma from "@/lib/prisma";

/**
 * ¿Existe al menos un balance (de cualquier cliente) cuyo desglose mapea a la
 * cuenta estándar `code`? Bloquea el cambio de código o el borrado de una
 * cuenta estándar que ya está en uso.
 */
export async function codigoEstandarTieneBalances(code: string): Promise<boolean> {
  const filas = await prisma.$queryRaw<{ existe: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM balances b
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE jsonb_typeof(b.desglose) WHEN 'array' THEN b.desglose ELSE '[]'::jsonb END
      ) AS grupo
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE jsonb_typeof(grupo->'items') WHEN 'array' THEN grupo->'items' ELSE '[]'::jsonb END
      ) AS item
      WHERE item->>'std' = ${code}
    ) AS existe
  `;
  return filas[0]?.existe ?? false;
}

/**
 * Lista de códigos de cuenta estándar que YA tienen balances asociados (en
 * cualquier cliente). La consume la pantalla de mapeo para bloquear en la UI el
 * campo de código (y el borrado) de esas cuentas.
 */
export async function codigosEstandarConBalances(): Promise<string[]> {
  const filas = await prisma.$queryRaw<{ std: string }[]>`
    SELECT DISTINCT item->>'std' AS std
    FROM balances b
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE jsonb_typeof(b.desglose) WHEN 'array' THEN b.desglose ELSE '[]'::jsonb END
    ) AS grupo
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE jsonb_typeof(grupo->'items') WHEN 'array' THEN grupo->'items' ELSE '[]'::jsonb END
    ) AS item
    WHERE item->>'std' IS NOT NULL
  `;
  return filas.map((f) => f.std);
}
