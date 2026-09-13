-- Aditiva: el módulo de Nómina cruza a SEIS dígitos Russell (RF-NOM-05) y concilia también
-- la mano de obra indirecta (730505). Nada de esto altera los módulos que cruzan a 4.

-- ===== Catálogo del prevalidador: la 7305 de Nómina =====
-- Misma siembra idempotente que `20260801120000_prevalidador_homologacion`: si Russell ya
-- la creó desde /config/prevalidador, se respeta la fila existente. `actualizado_en` va
-- explícito: la columna es `@updatedAt` de Prisma y ya no tiene DEFAULT en la BD.
INSERT INTO "prevalidador_cuentas"
    ("modulo_id", "cuenta_russell", "etiqueta", "base_calculo", "orden", "actualizado_en")
SELECT m."id", f."cuenta_russell", f."etiqueta", f."base_calculo", f."orden", CURRENT_TIMESTAMP
FROM (VALUES
    ('NOM', '7305', 'Mano de obra indirecta', 'movimiento', 40)
) AS f("modulo", "cuenta_russell", "etiqueta", "base_calculo", "orden")
JOIN "modulos" AS m ON m."codigo" = f."modulo"
ON CONFLICT ("modulo_id", "cuenta_russell") DO NOTHING;

-- ===== Homologación del módulo a 6 dígitos =====
-- `cuenta_4` sigue siendo el prefijo (los módulos a 4 dígitos no cambian); `cuenta_6` guarda
-- la cuenta completa cuando el módulo cruza a ese nivel.
ALTER TABLE "consolidacion_modulo_cliente" ADD COLUMN IF NOT EXISTS "cuenta_6" TEXT;
