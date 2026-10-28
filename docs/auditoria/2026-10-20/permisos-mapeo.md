# Revisión complementaria: matriz de permisos y propietario de cuentas

Fecha: 2026-10-20. Verificación local de código y pruebas con dependencias simuladas; no se consultó ni modificó una base real, no se ejecutaron scripts de operación, no se hizo commit/push/despliegue.

## Hallazgos reproducidos y correcciones

1. **Escalación desde la matriz de permisos.** `guardarNiveles` permitía a cualquier actor con `roles:configurar` editar el rol Superadministrador y conceder paquetes acumulativos que incluían permisos reservados. Ahora `src/lib/rbac/politica-matriz.ts` define la restricción compartida por la Server Action y su página: solo un Superadministrador puede editar ese rol o gestionar los permisos catalogados exclusivamente para él. Un actor distinto conserva la gestión de permisos ordinarios dentro de módulos mixtos. La página oculta la columna protegida y calcula los niveles únicamente sobre permisos que el actor puede gestionar; el servidor vuelve a validar sin confiar en la UI.
2. **Conservación de concesiones existentes.** Un administrador no concede ni revoca `auditoria:ia`, `auditoria:reporte_ejecutivo`, `publicacion_modulos:ver`, `publicacion_modulos:configurar`, `prompts:administrar` o `soporte:eliminar`, incluso al bajar un módulo a Ninguno. Las concesiones reservadas previas (también las inactivas) quedan intactas. Un Superadministrador puede revisarlas y retirarlas explícitamente. No hubo saneamiento automático de datos.
3. **Cliente resuelto por nombre ignorando la FK.** `clienteDeCuentaCliente` en `src/lib/rbac/contexto.ts` ahora prioriza `clienteId`; un nombre histórico reutilizado por otro cliente no cambia la autorización de una cuenta con FK. Si no hay FK se conserva el fallback legado solo con coincidencia única (consulta limitada a dos resultados). Identificador inválido, cuenta inexistente, nombre inexistente o ambiguo devuelven null.
4. **Identidad nula con actor global.** Las cinco mutaciones existentes de `src/app/actions/mapeo-cliente.ts` (editar, confirmar, eliminar, alinear y declarar excepción) rechazan explícitamente la identidad nula antes de autorizar el alcance y de escribir. Así tampoco un Administrador global elude la comprobación por la tolerancia del gate a clientId nulo.

## Cobertura y validación

Ejecutado: `npx vitest run src/app/actions/permisos.test.ts src/lib/rbac/contexto-cuenta-cliente.test.ts src/app/actions/mapeo-cliente.test.ts`.

Resultado: **3 archivos, 43 pruebas aprobadas** (15 matriz, 9 identidad de cuenta, 19 acciones de mapeo). Casos relevantes: denegación antes de consulta/escritura; lote que incluye rol protegido; módulos exclusivamente reservados; módulos mixtos con permisos ordinarios; conservación de reservados existentes/inactivos; Superadministrador gestionando su rol y retirando concesiones reservadas de otro, incluso cuando el módulo ya no tiene permisos activos; salvaguarda contra perder el último portador de `roles:configurar`; FK frente a nombre reutilizado; fallback único/ambiguo/inexistente; cinco acciones verificando cartera antes de mutar y rechazando identidad nula aunque el actor sea global. El fixture comprueba que cubre todos los permisos reservados actuales del catálogo.

ESLint de los ocho archivos nuevos/modificados de este complemento: **0 errores y 0 avisos**. `git diff --check`: sin errores. Suite completa, chequeo de tipos y build integrados corresponden a la validación final del agente coordinador.

## Restauración de matriz y límites

- Búsqueda de escritores `rolePermission.create/update/upsert/delete`: el único escritor de aplicación es `guardarNiveles`. No se encontró un reset/restauración alternativo desde una ruta o Server Action que eluda las restricciones.
- Existen scripts CLI operativos (`prisma/inicializar-rbac.ts`, `prisma/sync-matriz.ts`, `prisma/seed-admin-negocio.ts`, `prisma/seed-comentar.ts`). Se conservaron. Requieren ejecución del operador con credenciales de base; no están invocados desde rutas. En particular, `db:sync:rbac -- --aplicar` reconcilia explícitamente la matriz con el catálogo y puede revocar permisos; no es una acción de la interfaz. No se ejecutó.
- Las concesiones reservadas ya existentes deben ser inventariadas y revisadas por un Superadministrador antes de retirarlas; estas pruebas no afirman cuál es el estado de producción.
- Una cuenta legado con FK nula y un nombre actualmente único sigue siendo compatible. Sin historial de identidad no es posible demostrar que ese nombre no se reutilizó; la corrección garantiza prioridad de la FK y rechazo de ambigüedad actual, no reconstruye identidades históricas. Las cuentas legado pendientes requieren conciliación de identidad antes de completar su FK.
- No se cambió el catálogo funcional ni el contrato de los niveles ordinarios, no hubo migración ni datos nuevos.

Clasificación sugerida: corrección de seguridad **patch**, sujeta al criterio global y validación de la auditoría. No se preparó una release ni borrador en BD.
