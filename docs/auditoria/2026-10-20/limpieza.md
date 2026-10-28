# Russell: auditoría de código sin uso, calidad y eficiencia

Fecha: 2026-10-20. Repositorio: `/Users/vicbook/Documents/Xentria-apps/Russell Diagnostico`.
Este informe documenta el alcance de limpieza del subagente; la auditoría de seguridad de rutas/acciones y las actualizaciones de dependencias son frentes paralelos del agente principal.
No se ejecutaron scripts de negocio, consultas/escrituras de BD, conexiones SMTP/IA, despliegues, commits o push. No se leyeron archivos `.env`.

## Cobertura y método reproducible

1. Inventario inicial de `git ls-files`: 1.254 archivos versionados; 1.026 módulos TS/TSX/JS/MJS/CJS. Se excluyeron declaraciones `.d.ts` y archivos inexistentes.
2. Grafo AST con el TypeScript instalado, resolver de `tsconfig.json` y resolución del alias `@/*`: imports, reexports, `import()` y `require()` literales. No se encontró ningún import/require dinámico no literal en esos módulos.
3. Entradas implícitas de Next reconocidas explícitamente: 56 `page.tsx`, 21 `route.ts`, 4 `loading.tsx`, 2 `error.tsx`, 3 `layout.tsx`, 1 `global-error.tsx` y 1 `proxy.ts`: 88 raíces. Las rutas no se clasifican como basura porque carezcan de imports entrantes.
4. Se separaron 340 archivos de pruebas/fixtures, raíces de scripts/configuración/Prisma y alcance desde rutas. El grafo inicial detectó siete archivos `src` fuera del recorrido de ejecución de Next; se clasifican abajo.
5. Segunda pasada con el checker de TypeScript: referencias por símbolo exportado, consumidores externos y usos internos. Un export sin import externo no se considera automáticamente muerto: puede ser usado internamente, probado aisladamente o llamado por el framework.
6. Dependencias cotejadas contra imports y configuración/scripts; SHA-256 de módulos para duplicados exactos; búsqueda manual de mocks/demo/compatibilidad y revisión de scripts históricos.
7. Lint global de referencia, lint posterior, diagnóstico TypeScript de variables no usadas y comprobaciones de interacción real del selector compartido.

Reproducción portable desde la raíz:

```sh
node docs/auditoria/2026-10-20/inventario-modulos.mjs
npm run lint
```

El [grafo final](grafo-modulos.json) incluye cambios nuevos no ignorados. Los conteos iniciales de este informe describen la comparación previa a la limpieza; los resultados integrados actuales están en [validacion.json](evidencia/validacion.json). Las rutas `/tmp` en las notas de ejecución son registros temporales de esta sesión, no dependencias del producto.

## Limpieza implementada y demostrada

| Archivo/elemento | Evidencia antes de retirarlo | Cambio |
|---|---|---|
| `src/components/stepper.tsx` | Sin imports, referencias JSX, tests ni raíces Next; símbolo `Stepper` solo declarado en su archivo | Eliminado |
| `src/lib/entorno.ts` | Sin imports ni referencias a `getEnvVar`/`ENTORNO_CACHE_TAG`; único consumidor de `prisma.environmentVariable` era este archivo desconectado | Eliminado el archivo; se conserva tabla y migraciones |
| `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` | Archivos de plantilla; cero referencias en código, CSS, documentación o configuración versionada | Eliminados |
| `ModulePlaceholder` de `src/components/ui.tsx` | Sin referencias de símbolo ni JSX; solo declaraba la tarjeta antigua de migración de prototipo | Eliminado; componentes compartidos operativos conservados |
| `SelectBuscable` | Dos efectos hacían `setState` sin sincronizar un sistema externo; uno omitía dependencia de opciones visibles | Estado de selección externa ajustado antes de pintar, índice derivado y acotado; apertura/foco/teclado en sus eventos; conservar selección optimista |
| `borradores-index-client.tsx` y `modulos/[codigo]/listado-compartido.tsx` | `aria-sort` sobre `<button>` no es ARIA válido | Nombre accesible informa columna y orden vigente; mantiene lógica de ordenamiento |
| `balance/borradores/page.tsx` | Desestructuración de dos campos solo para descartarlos generaba avisos | Proyección explícita de campos enviados al cliente; los ISO internos no se serializan |
| `adjuntos-galeria.tsx` | Comentario intermedio impedía que la directiva existente aplicara al `<img>` autenticado | Directiva situada junto al elemento; conserva endpoint autenticado |
| `constructor-lectura.tsx` | Parámetro `p` de `map` nunca utilizado | Parámetro omitido semánticamente como `_` |
| `eslint.config.mjs` | Diagnósticos generados ajenos a aplicación contaminaban lint | Ignora `outputs/**`, `output/**`, `_tmp_*`; mantiene revisión de todo `src`, scripts, Prisma y configuración |

La retirada de archivos ya no importados reduce mantenimiento y superficie instalada/servida; no debe describirse como un gran ahorro de tiempo de ejecución, pues no se incluían en el recorrido de la aplicación.

## Siete archivos inicialmente fuera del grafo de rutas

| Archivo | Consumidores encontrados | Clasificación |
|---|---|---|
| `src/components/stepper.tsx` | Ninguno | Eliminado |
| `src/lib/entorno.ts` | Ninguno | Eliminado; conservar datos históricos |
| `src/lib/access-log-retencion.ts` | `prisma/purgar-accesos.ts` y test | Operación/mantenimiento; conservar |
| `src/lib/import/erps-clientes-workbook.ts` | `scripts/importar-erps-clientes-por-nit.ts` y test | Importador operativo; conservar |
| `src/lib/balance/golden/snapshot.ts` | Tests `golden.test.ts` y `golden/capturar.test.ts` | Infraestructura de regresión; conservar |
| `src/lib/modulos/sugerencias-perfil.ts` | Solo su test | Lógica antigua/candidata a retiro; necesita confirmar sustitución por patrones; no aumenta superficie de rutas |
| `src/lib/openrouter.ts` | Solo `conexiones/clientes-ia.test.ts` | Adaptador disponible pero no consumido por un flujo productivo actual; conservar catálogo/contrato de conexiones por decisión del agente principal |

## Dependencias

- `@playwright/mcp`: no imports, scripts ni configuración versionada que lo consuman. No es necesario para las rutas de negocio. El agente principal gestiona su retiro del manifiesto/lock y las actualizaciones de seguridad; este subagente no modificó esos archivos.
- `playwright`: **sí** se importa desde `src/lib/novedades/pdf.ts` para Chromium/PDF. Conservar.
- `@prisma/client`: ausencia de import literal en código manual no es evidencia de desuso. El cliente generado y runtime Prisma lo requieren. Conservar junto al CLI usado en `postinstall`, `prebuild` y migraciones.
- `@tailwindcss/postcss`: utilizado por clave en `postcss.config.mjs`; `tailwindcss` por CSS/config; herramientas TypeScript, tsx, eslint y vitest por comandos. Conservar.
- `@types/bcryptjs`: duplicación potencial de tipos; `bcryptjs` 3.0.3 declara `types` y exports de tipos propios. Candidato a retirar tras typecheck; no confundir con la dependencia de hash utilizada por autenticación.
- Los restantes paquetes de producción tienen referencias de código concretas en el inventario AST. No se asumió que cero imports fuera suficiente para eliminarlos.

## Exportaciones: candidatos y límites

La pasada de símbolos durante la auditoría encontró 3.530 exports; 676 sin consumidor externo y 347 consumidos solo por pruebas. **Estas cifras no equivalen a código basura.** Los tipos exportados, funciones usadas dentro de su módulo, fixtures y entradas implícitas de Next explican gran parte de esos resultados.

Después de filtrar tipos y usos internos había 33 declaraciones de valores/funciones sin consumidor; una era `ModulePlaceholder`, ya eliminada. La lista se conserva en [exports-candidatos.txt](evidencia/exports-candidatos.txt), con el alcance y estado de esa instantánea.

Candidatos adicionales de bajo acoplamiento, conservados para no mezclar una eliminación de semántica contable con la corrección de seguridad:

- `confidenceClass` (`src/lib/format.ts`), `LOCALE_COLOMBIA` (`fecha-hora.ts`), `ERP_CATALOGO` (`import/erp-sector-alias.ts`).
- `gruposAportePatronal`, `leerDivisa`, `specVacio`, `etiquetaAlertaComentario`, `esModuloSoportado`, `cuentasDelPeriodo`, `titularComparativo`, `categoriaDeProveedor`.
- Funciones servidor sin llamadores actuales: `getOverridesPrevalidadorBalance`, `getUltimaRevisionPrevalidadorBalance`, `getSubgruposConciliacion`, `filasAsignacionPeriodo`, `nombresCuentasRussell`.

Conservar/revisar como contrato o compatibilidad, no retirar automáticamente:

- `requireRole`/`authorizeAction`: capa de autorización legado; el grafo confirma ausencia de callers de `requireRole`, pero cambios de control de acceso merecen su propia revisión.
- `executeReconciliation`: acción de compatibilidad protegida que orienta hacia los seis módulos reales; test explícito. No vuelve a persistir datos ficticios.
- `setClientModuleStatus`, `auditarCargaBalance`, `actualizarDocumentacionArchivoModulo`, `obtenerResumenUsoAdopcion` y varias acciones de mapeo: no tienen caller UI actual detectado; revisar contrato antes de retirar exports de Server Actions.
- OpenCode: `mensajeErrorOpenCode` sigue importado por `app/actions/auditoria-reporte.ts`; funciones de generación solo tienen pruebas. La generación ejecutiva actual es determinista. Separar el formateador de errores podría permitir retirar el cliente legado en un cambio posterior.
- OpenRouter/Gemini y constantes antiguas de reportes: algunos exports son capacidad preparada o compatibilidad del cliente, no funcionalidad integrada a una ruta actual. No prometer que guardar una API key habilita automáticamente un flujo.
- Tests que solo prueban helpers pueden quedar como regresiones de decisiones contables. No eliminarlos solo para reducir conteos.

## Demo, scripts, base de datos y duplicación

- Se revisaron 30 archivos versionados en `scripts/`, 12 utilidades TS de Prisma y 157 migraciones SQL en el inventario durante auditoría. Los scripts operativos no deben eliminarse por no tener import desde Next.
- `scripts/plan-espejo/reglas-anteriores/*` está importado por `scripts/corregir-plan-espejo-nomina.ts` y permite comparar/revertir reglas. Es historia operativa necesaria, no duplicación accidental.
- Los scripts de reparación usan fechas en el nombre y pueden ser necesarios al restaurar o migrar un entorno rezagado. Su ausencia de ejecución diaria no justifica borrarlos.
- No se encontraron módulos fuente idénticos por SHA-256. Esto no prueba ausencia de lógica parecida; balance y módulos tienen transformadores diferentes y no deben fusionarse solo por nombres similares.
- No se tocaron migraciones, snapshots de esquema, semillas operativas ni nombres externos de buckets.
- `prisma/schema.prisma` comenta columnas/capas legado sin uso. El código estático no prueba ausencia de datos, consumidores externos o necesidad de rollback; no proponer `DROP` automático.

Hallazgo operativo separado: `src/app/actions/dian.ts:40-66`, `requestDianAiAnalysis`, es **análisis heurístico simulado**, no una llamada IA. Consume `diff` del formulario, elige texto por umbral y guarda `who: "IA"`, `isAI: true`. Está conectado a `src/app/(app)/dian/[periodId]/dian-detail-client.tsx` (import y `action`), por tanto no es código muerto. Se conserva la operación en esta auditoría y se informa el alcance real; una futura corrección funcional debería renombrarlo como sugerencia por reglas o integrar un análisis verificado, sin inventar capacidad IA.

## Calidad y eficiencia

Lint inicial: **138 errores y 10 avisos**.

- 136 errores / 3 avisos procedían de artefactos `_tmp_*`, `output/`, `outputs/`.
- Código real: 2 errores en efectos de `SelectBuscable`; 7 avisos por ARIA, desestructuración y directiva de imágenes.
- Se corrigió el código real y se delimitó el lint a fuentes/configuración/operación, sin desactivar reglas.

Módulos grandes para una futura separación por responsabilidad (no son basura): `app/actions/balance.ts` ~6.335 líneas, `app/actions/modulos-datos.ts` ~5.066, detalle módulo ~4.760 y detalle de borrador de balance ~4.031. Dividir autorización, parseo, persistencia y presentación facilitaría revisiones; hacerlo masivamente aquí añadiría riesgo sin demostrar un beneficio inmediato. No se introdujo refactor contable general.

## Verificación de los cambios de limpieza

- Lint focalizado de archivos modificados: aprobado.
- `vitest` sobre selector compartido y listado de borradores: **26/26 pruebas aprobadas**.
- Chromium real, con componente actual: selección optimista, cambios del padre y vuelta al valor anterior, conservación de foco, limpiar selección, filtro sin acentos con teclado, reabrir con la opción seleccionada, reducción de opciones y cambio externo mientras la lista está abierta. Todos aprobados; sin errores de navegador.
- `git diff --check`: aprobado en el estado consultado.
- `npm run lint` global posterior: terminó con código 0, sin errores ni avisos; log `/tmp/russell-audit-lint-after.log`. La suite/build integrados deben confirmarse sobre el estado final conjunto del agente principal, pues los cambios de otros frentes ocurren simultáneamente.

Límites: prueba estática del repositorio y ejecución local del componente. No prueba deployment, uso histórico por sistemas externos, estado/datos de PostgreSQL ni comportamiento real bajo carga de clientes. No se describe este frente de limpieza como una certificación de seguridad completa.
