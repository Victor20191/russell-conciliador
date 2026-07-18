-- Conserva en los perfiles de carga el código PUC que viene dividido en varias
-- columnas (grupo, cuenta, subcuenta, auxiliar y subauxiliar).
ALTER TABLE "perfiles_carga_balance"
ADD COLUMN "col_codigo_fragmentos" JSONB NOT NULL DEFAULT '[]'::JSONB;
