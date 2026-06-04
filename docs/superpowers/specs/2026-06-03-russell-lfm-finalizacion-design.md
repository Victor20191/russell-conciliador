# Spec maestro — Finalización de `russell-lfm` al 100% según el prototipo

**Fecha:** 2026-06-03
**Estado:** Aprobado el enfoque; pendiente revisión del spec por el usuario
**Autor:** Brainstorming asistido (Claude Code)

---

## 1. Contexto y objetivo

El repositorio contiene dos artefactos:

1. **Prototipo original ("código principal")** — archivos `.jsx`/`.html` en la raíz del repo (~6.600 líneas de pantallas + datos demo). Es React client-side con datos quemados. Cubre **todos** los módulos del producto a profundidad (Conciliador/Diagnóstico LFM de Russell Bedford).
2. **App de producción `russell-lfm`** — Next.js 16.2.7 (App Router) + Prisma 7 + PostgreSQL, con autenticación JWT, layout, sidebar, topbar y datos vía `prisma/seed.ts`. Es la **migración en curso** del prototipo.

**Objetivo:** dejar cada opción y ruta de `russell-lfm` **completamente finalizada y validada** según el prototipo, con **persistencia real** (DB-backed), sin detenerse hasta el 100%.

### Decisiones de arquitectura (acordadas con el usuario)

1. **Fidelidad: DB-backed.** Cada módulo se implementa como en las páginas reales actuales: React Server Components que leen de Prisma, con `seed.ts` ampliado a partir de los datos demo del prototipo.
2. **Alcance: auditoría total + completar todo.** Se auditan las 18 rutas y se completan tanto las 6 stubs como las brechas de las parciales.
3. **Persistencia: real con Server Actions.** Las acciones (crear/editar cliente, ejecutar conciliación, guardar mapeos, marcar hallazgos, comentar, etc.) escriben en la BD vía Server Actions y revalidan. Las partes de **IA** (confianza de mapeo, memorando, sugerencias) se **simulan con heurísticas/datos demo** (no hay backend LLM en esta fase).

### Restricciones técnicas

- **Next.js 16 tiene breaking changes** respecto al conocimiento previo. `AGENTS.md`/`CLAUDE.md` del proyecto obligan a leer `node_modules/next/dist/docs/` antes de escribir componentes client, Server Actions, params/searchParams, etc. **Esto es obligatorio en cada fase de implementación.**
- **Almacenamiento de archivos:** requerimientos y DIAN necesitan subir archivos. En esta fase se usa almacenamiento **local en disco** (carpeta `uploads/` fuera de `public` o `public/uploads`) con metadatos en BD; no se integra storage en la nube.
- **IA simulada:** todo "modelo claude-haiku", "confianza %", "sugerencias IA" y "memorando IA" se genera con funciones deterministas/heurísticas sembradas, devolviendo la misma forma de datos que consumiría un LLM real (para poder cablearlo después).

---

## 2. Resultado de la auditoría (validación ruta por ruta)

Las 18 rutas resuelven correctamente (sin enlaces rotos en `nav.ts`). La profundidad funcional vs. el prototipo:

| Ruta | Estado real | Brechas clave |
|------|-------------|---------------|
| `/login`, shell `(app)/layout` | ✅ real | Completos. Auth (JWT, bcrypt, middleware `proxy.ts`) supera al prototipo. Falta `ReqSubnav` y "marcar todo leído"/Ayuda en topbar. |
| `/dashboard` | parcial | KPIs del prototipo (del mes, asignadas a ti, dif. neta acumulada, cobertura %), panel "Asignadas a ti", feed "Actividad del equipo", tabla con ERP/auditor/fecha clickeable, CTA "Nueva conciliación". |
| `/balance` | parcial | Tabs (Clientes / Audit log / Plan estándar), columnas #versiones / versión oficial / última carga / mapeadas, barra completitud bicolor, flujo "Cargar balance". |
| `/balance/[id]` | parcial | Tabs (Detalle / Validaciones / Versiones), breakdown expandible, columnas período anterior + validación de saldo, fila "99 Sin clasificar", acción "Congelar como oficial", **ruta `/balance/[id]/diff` inexistente**. |
| `/balance/mapeo` | **objeto equivocado** | Hoy renderiza el plan estándar global; el prototipo es **mapeo cuenta-cliente → cuenta-Russell** (selects editables, persistencia, KPIs, filtros por nivel, resumen por módulo, sugerencias IA). El plan estándar global se mueve a un tab de `/balance`. |
| `/balance/estado-resultado` | **stub** | KPIs (4), tabla comparativa 2025/2024/Var%/Presupuesto con subtotales en negrita, selector de período, export. |
| `/razonabilidad` | **stub** | Módulo completo: **5 sub-pantallas** (índice/histórico, setup + ejecución IA con progreso, resultados + hallazgos + filtros, multi-período, detalle de hallazgo con asignación/análisis, memo IA). |
| `/conciliacion/nueva` | **stub** | **Asistente de 5 pantallas** (alcance + bifurcación parametrizado/no, carga muestra, mapeo campos IA, mapeo cuentas, confirmación) + pantalla de cargue con progreso por fases. |
| `/conciliacion/en-proceso` | parcial | Columna "última actividad" (tiempo relativo), estados de proceso granulares, filas clickeables al detalle del cruce. |
| `/conciliacion/resultados` | parcial | **Falta el detalle del cruce** (`/conciliacion/resultados/[id]`): 4 KPIs, tabla por cuenta con materialidad, panel lateral (Comentarios/Detalle/Acciones), export, "Enviar a revisor". |
| `/dian` | parcial | **Detalle del cruce** (secciones, renglones, KPIs, panel de renglón, comentarios, modal `MappingEditor`), vista Períodos tabular, Consolidado anual (matriz), carga de formato, cabecera por cliente. |
| `/config/dian` | **stub** | Mapeos renglón → cuentas con signos +/−, plantilla estándar vs override por cliente, importar plantilla. Comparte modelo y modal con `/dian`. |
| `/requerimientos` | **stub** | **3 sub-módulos**: (A) plantillas + historial + asistente de generación (carta PDF con variables, envío email); (B) presentaciones (bandeja + wizard 4 pasos + visor de slides + export PDF); (C) repositorios (cargas del cliente, vencimientos, familias, timeline). |
| `/calendario` | **stub** | Calendario con 3 vistas (mes/semana/día), navegación de mes, filtros por tipo y cliente, 4 KPIs, eventos DIAN/ICA/req, paneles "próximos vencimientos" y "asignación por cliente", export iCal. |
| `/auditoria` | parcial | Toolbar de filtros (buscador, usuario, acción, rango de fechas), columna "IP origen", "Exportar CSV". |
| `/config/clientes` | parcial | CRUD de cliente, matriz módulo×cliente tri-valor (OK/Pendiente/N/A) editable, filtros (ERP, sector, buscador), navegación a detalle. |
| `/config/modulos` | parcial | **Campos estándar por módulo** (modelo `ModuleField` inexistente), layout master-detail, CRUD de campos, tablas de equivalencias (PUC/centros/bodegas). |

---

## 3. Principios técnicos transversales

Aplican a **todas** las fases:

- **RSC + Prisma:** las páginas son Server Components `async` que consultan Prisma directamente (patrón ya establecido en `/balance`, `/dashboard`). La interactividad vive en componentes `"use client"` aislados.
- **Server Actions:** toda mutación es una Server Action (`"use server"`) que valida entrada con **zod**, escribe en Prisma, llama a `logAudit(...)` cuando corresponda, y ejecuta `revalidatePath(...)`. Se agrupan por dominio en `src/app/actions/<dominio>.ts`.
- **Cliente activo (contexto):** DIAN, requerimientos, calendario y razonabilidad operan **por cliente**. Se introduce un selector de cliente activo persistido (cookie `activeClientId` + helper `getActiveClient()` en `lib/dal.ts`), con fallback al primer cliente. Las páginas leen el cliente activo de ahí.
- **Auditoría transversal:** helper reutilizable `logAudit({ user, action, entity, detail, ip })` que escribe `AuditEntry`. Todas las acciones de negocio relevantes lo invocan.
- **Formato:** reutilizar `lib/format.ts` (`fmt`, `fmtNum`, `fmtCompact`, `pct`, `confidenceClass`, `statusChip`). Añadir helpers de fecha/tiempo relativo (`fmtDate`, `timeAgo`) en este mismo archivo.
- **Componentes UI:** extender `src/components/ui.tsx` con los primitivos compartidos (Fase 0). `StatCard` se amplía para aceptar `delta`/`deltaTone` (KPIs con tendencia).
- **IA simulada:** funciones en `lib/ai-sim.ts` (`suggestFieldMapping`, `suggestAccountMapping`, `generateRazMemo`, `confidenceFor`) deterministas, que devuelven la forma de datos final.
- **Validación de entorno:** validar presencia de `SESSION_SECRET` y `DATABASE_URL` al arrancar (mejora menor de robustez detectada en auditoría).

---

## 4. Modelo de datos consolidado (nuevos modelos Prisma)

Se agregan por fase para mantener migraciones pequeñas y reversibles. Resumen consolidado (los detalles de campos se afinan en el spec de cada fase):

**Fase 1 · Configuración**
- `ModuleField` — campos estándar por módulo (`moduleId, key, label, type, required, validation, hint, order`).
- `EquivalenceTable` — catálogos PUC/centros/bodegas (`moduleId?, name, version, entryCount`). (opcional, puede ser fase posterior)
- `ClientContact` — contactos por cliente (`clientId, name, role, email, primary`).
- Extender `ClientModule.status` para soportar tri-valor (ausencia de fila = "N/A").

**Fase 2 · Balance**
- `BalanceVersion` — metadatos de versión (`balanceId, version, date, uploadedBy, role, file, size, rows, sumActivo, balanced, changes, note`).
- `BalanceDiff` (o JSON en `BalanceVersion`) — `summary{added,removed,changed,totalAffected}` + `rows[]`.
- `BalanceAuditEntry` — bitácora por cliente del módulo balance.
- `ClientAccount` — PUC del cliente (`clientId, code, level, name, russellCode?`).
- `IncomeStatementLine` (o JSON `incomeStatement` en `Balance`) — líneas del estado de resultado.
- Extender `StandardAccount` (`+module`), `Balance` (`+mappedAccounts, unmappedAccounts, lastUpload`; `saldoOk` en breakdown JSON).

**Fase 3 · Conciliación**
- `FieldMapping` — columna archivo → campo estándar (`srcColumn, sample, inferredKey, override, confidence, aiRationale, status`).
- `AccountMapping` — cuenta cliente → cuenta estándar (`srcCode, srcDesc, stdCode?, confidence, status, note`).
- `ClientModuleMapping` (o extender `ClientModule`) — parametrización guardada (`version, refFile, configuredBy, configuredAt`).
- `ReconciliationRow` — partidas del cruce (`reconciliationId, cuenta, desc, cont, mod, diff, items, status`).
- `ReconciliationComment` — comentarios por fila (`rowId, authorId, text, mentions, createdAt`).
- Extender `Reconciliation` (`+cutoff, runAt, runBy, assignedToId, dueDate, materiality, lastActivityAt`).

**Fase 4 · Razonabilidad**
- `RazAnalysis`, `RazFinding`, `RazMemo`, `RazMultiPeriodAccount` (detalle de campos en el spec de la fase).
- Ampliar usuarios sembrados (`RAZ.team`, 5 personas) para asignación de hallazgos.

**Fase 5 · DIAN**
- `DianSection`, `DianLine`, `DianLineValue`, `DianMapping`, `DianComment`.
- Extender `DianPeriod` (`+clientId, saldoDeclarado, saldoContable, diff, objective, conclusion`).

**Fase 6 · Requerimientos**
- `ReqTemplate`, `ReqTemplateVersion`, `ReqTemplateHeader`, `ReqFamily`, `ReqItem`, `ReqSubmission`, `ReqRepository`, `ReqRepoFamily`, `ReqRepoItem`, `ReqRepoActivity`, `ReqPresentation`.

**Fase 7 · Calendario + Auditoría**
- `CalendarEvent` (`date, type, title, subtitle, clientId?, color, source`) + `color` en `Client`.
- Extender `AuditEntry` (`+ip`).

**Total estimado:** ~25 modelos nuevos + extensiones a 6 existentes.

---

## 5. Descomposición en fases

Cada fase es un ciclo independiente **spec → plan → implementación → validación**. Orden por dependencias: **0 → 1 → 2 → 3 → 4 → 5 → 6 → 7**.

### Fase 0 · Fundaciones (detallada)

**Objetivo:** construir los primitivos compartidos que todas las fases reutilizan, sin los cuales se duplicaría código.

**Componentes nuevos** (`src/components/`):
- `Stepper` — indicador de pasos del asistente (Archivo · Campos · Cuentas · Confirmar), prop `current`.
- `Dropzone`/`FileUpload` (client) — zona de carga con estado (idle/leído), ficha de archivo (nombre, filas, columnas, tamaño), botón quitar. Sube vía Server Action a almacenamiento local.
- `Modal` (client) — diálogo accesible reutilizable (cierre por overlay/Esc).
- `SidePanel` (client) — panel lateral derecho con tabs (usado en conciliación/DIAN).
- `Tabs` (client) — control de pestañas reutilizable con contadores.
- `FilterChips` (client) — chips de filtro con contadores (Todas/Auto/Revisar/Sin mapeo, etc.).
- `ConfidenceBar` — barra de confianza con % y color (`confidenceClass`).
- `ListEditor` (client) — lista editable (agregar/renombrar/eliminar/reordenar) para familias/ítems/positivos.
- `CommentThread` (client) — hilo de comentarios con avatar de iniciales + textarea + "Asignar @".
- `EmptyState` — estado vacío estándar.

**Helpers/infra:**
- `lib/audit.ts` → `logAudit(...)`.
- `lib/storage.ts` → guardar/leer archivos subidos (local) con metadatos.
- `lib/ai-sim.ts` → simuladores de IA deterministas (esqueleto).
- `lib/format.ts` → añadir `fmtDate`, `timeAgo`.
- `lib/dal.ts` → añadir `getActiveClient()` / `setActiveClient()` (cookie).
- Ampliar `StatCard` con `delta`/`deltaTone`.

**Iconos:** añadir `copy` y `edit` a `icons.tsx`.

**Topbar/Sidebar:**
- Topbar: acción "Marcar todo leído" (Server Action `markAllNotificationsRead`) + botón "Ayuda".
- Sidebar: auto-expandir el grupo activo al navegar (`useEffect` sobre `usePathname`).

**Server Actions nuevas:** `markAllNotificationsRead`, `uploadFile` (genérica de storage), `setActiveClient`.

**Criterios de aceptación Fase 0:**
- `next build` y `tsc --noEmit` pasan sin errores.
- Cada componente nuevo se monta en una página de prueba o storybook mínimo sin romper.
- "Marcar todo leído" pone `unread=false` y revalida; el badge desaparece.
- El selector de cliente activo persiste entre navegaciones.

---

### Fase 1 · Configuración (detallada)

**Rutas:** `/config/modulos`, `/config/clientes`.

**`/config/modulos`** — layout master-detail:
- Lista lateral de módulos (seleccionable) + panel de detalle.
- Panel: "{Módulo} · campos estándar" con versión, botones "Exportar plantilla" y "Agregar campo".
- Tabla de campos (`ModuleField`): Clave, Etiqueta, Tipo, Requerido, Validación, Descripción, acciones.
- Card "Tablas de equivalencias estándar" (PUC/centros/bodegas) con "Importar".
- Acciones: `createModuleField`, `updateModuleField`, `deleteModuleField`, `reorderModuleFields`.

**`/config/clientes`** — CRUD + matriz:
- Toolbar: buscador (cliente/NIT), select ERP, select sector, botón "Nuevo cliente".
- Tabla matriz cliente × 6 módulos, celda tri-valor: OK (configurado) / Pendiente / N/A (sin asignar). Chevron por fila → detalle.
- Modal "Nuevo/Editar cliente" (id, name, nit, erp, sector) + gestión de contactos (`ClientContact`).
- Celdas interactivas: asignar/quitar/cambiar estado de módulo (upsert/delete `ClientModule`).
- Acciones: `createClient`, `updateClient`, `deleteClient`, `setClientModuleStatus`, `addClientContact`, etc.

**Modelos nuevos:** `ModuleField`, `ClientContact` (+ `EquivalenceTable` opcional). Migración + seed (portar `DATA.standardFields`: 10 campos de Inventarios + mínimos para los otros 5 módulos; contactos de los clientes).

**Criterios de aceptación Fase 1:**
- Crear/editar/eliminar cliente persiste y revalida; aparece en la tabla y en `/dashboard`.
- Asignar un módulo a un cliente cambia el estado y se refleja en la matriz y en "Parametrización pendiente".
- Agregar un campo estándar a un módulo persiste y se ve en el detalle.
- `next build` + `tsc` limpios; todas las rutas de la fase renderizan contra la BD.

---

### Fase 2 · Balance (resumen)

**Rutas:** `/balance`, `/balance/[id]`, `/balance/[id]/diff` (nueva), `/balance/mapeo` (rehacer), `/balance/estado-resultado`.
**Modelos:** `BalanceVersion`, `BalanceDiff`, `BalanceAuditEntry`, `ClientAccount`, `IncomeStatementLine`; extensiones a `StandardAccount`, `Balance`.
**Componentes:** tabs de balance, breakdown expandible, tabla de mapeo con selects, vista diff (3 modos), tabla ER con subtotales.
**Acciones:** `uploadBalance`, `freezeBalance`, `updateAccountMapping`, `applyMappingChanges`, `suggestMappingsAI` (sim), `generateIncomeStatement`, exports.
**Seed:** `BAL.versions`, `BAL.diff`, `BAL.auditLog`, `MAPPING_TREE` (~70 cuentas), `RUSSELL_OPTIONS` (17), `MODULE_STATUS` (9), líneas del ER.
**Aceptación:** congelar versión cambia estado; editar un mapeo persiste; el diff v2→v3 se muestra; el ER cuadra con el balance oficial.

### Fase 3 · Conciliación (resumen)

**Rutas:** `/conciliacion/nueva` (asistente), `/conciliacion/resultados`, `/conciliacion/resultados/[id]` (nueva), `/conciliacion/en-proceso`, KPIs de `/dashboard`.
**Modelos:** `FieldMapping`, `AccountMapping`, `ClientModuleMapping`, `ReconciliationRow`, `ReconciliationComment`; extensiones a `Reconciliation`.
**Componentes:** asistente multi-paso (Stepper), dropzone, tablas de mapeo con confianza, máquina de progreso por fases, panel lateral de cuenta con tabs, hilo de comentarios.
**Acciones:** `startReconciliation`, `uploadSampleFile`, `inferFieldMapping` (sim), `saveFieldMapping`, `inferAccountMapping`/`saveAccountMapping`, `saveParametrization`, `uploadAndCross`, `addReconciliationComment`, `markRowReconciled/Exception`, `assignRowToAuditor`, `sendToReviewer`, exports.
**Seed:** `DATA.standardFields`, `DATA.fileColumns`, `DATA.accountMappings`, `DATA.crossing` (REC-2026-0431 + filas), `DATA.comments`.
**Aceptación:** completar el asistente crea una parametrización y marca el módulo configurado; ejecutar el cargue crea `Reconciliation` + filas; comentar y marcar partidas persiste; dashboard muestra KPIs reales.

### Fase 4 · Razonabilidad (resumen)

**Rutas:** `/razonabilidad` (índice), setup, resultados, multi-período, detalle de hallazgo, memo. (sub-rutas a definir en su spec)
**Modelos:** `RazAnalysis`, `RazFinding`, `RazMemo`, `RazMultiPeriodAccount` + ampliar usuarios.
**Componentes:** form de setup con progreso simulado, tabs de resultados + filtros, tabla multi-período con toggles, detalle de hallazgo con asignación/análisis, visor de memo.
**Acciones:** `runRazAnalysis`, `assignFinding`, `saveConsultantAnalysis`, `submitFindingForClosure`, `closeFinding`, `generateRazMemo` (sim), exports.
**Seed:** `RAZ.current/findings/comparisons/thresholds/team/memo/history`, `RAZ_MULTI`.
**Aceptación:** ejecutar análisis crea hallazgos; asignar/analizar/cerrar un hallazgo persiste; el memo se genera y exporta.

### Fase 5 · DIAN (resumen)

**Rutas:** `/dian` (índice + detalle de cruce + anual + upload), `/config/dian` (mapeos).
**Modelos:** `DianSection`, `DianLine`, `DianLineValue`, `DianMapping`, `DianComment`; extensiones a `DianPeriod`.
**Componentes:** tabs Períodos/Anual, índice de secciones, tabla de renglones, panel de renglón, modal `MappingEditor` (compartido con config/dian), matriz consolidada, dropzone.
**Acciones:** `uploadDianForm`, `runDianCross`, `saveDianMapping`, `addDianComment`, `requestAiAnalysis` (sim), exports.
**Seed:** `ivaSections`/`reteSections`, valores Bimestre 5, `ivaMapping`, `ivaComments`, conclusiones.
**Aceptación:** ver detalle de un período muestra renglones con diferencias; editar mapeo persiste como nueva versión; comentar persiste.

### Fase 6 · Requerimientos (resumen)

**Sub-módulos / rutas:** `/requerimientos` (plantillas + historial), `/requerimientos/plantillas/[id]`, generación, `/requerimientos/presentaciones` (+ wizard + visor), `/requerimientos/repositorios/[id]`. Registrar sub-nav en `nav.ts` + `ReqSubnav` en shell.
**Modelos:** `ReqTemplate`, `ReqTemplateVersion`, `ReqTemplateHeader`, `ReqFamily`, `ReqItem`, `ReqSubmission`, `ReqRepository`, `ReqRepoFamily`, `ReqRepoItem`, `ReqRepoActivity`, `ReqPresentation` (+ `ClientContact` de Fase 1).
**Componentes:** editor de plantilla (3 secciones), asistente de generación con preview de carta, wizard de presentación (4 pasos), visor de slides (nav teclado/dots/auto-escala/print-PDF), repositorios con familias expandibles + dropzone + timeline. Portar `styles-pres.css`.
**Acciones:** CRUD de plantillas/familias/ítems/versiones, `generateRequirement`, `uploadRepoDocument`, `sendRepoReminder`, CRUD de presentaciones + export.
**Seed:** `REQ.templates` + detalle `TPL-CIERRE`, `REQ.history`, `REQ_REPOS`, `REQ_PRES_SEED`.
**Aceptación:** crear plantilla y generar requerimiento abre repositorio; subir documento actualiza progreso; crear y visualizar presentación funciona y exporta PDF.
**Nota:** fase grande; puede subdividirse en 6a (plantillas+generación), 6b (repositorios), 6c (presentaciones) en su propio spec.

### Fase 7 · Calendario + Auditoría (resumen)

**Rutas:** `/calendario`, `/auditoria`.
**Modelos:** `CalendarEvent` (+ `color` en `Client`); extender `AuditEntry` (`+ip`).
**Componentes:** calendario client (mes/semana/día), navegación, filtros, modal nuevo evento; toolbar de filtros de auditoría.
**Acciones:** CRUD de eventos, `exportICal`, `getCalendarEvents` (agrega manuales + derivados de DIAN/Req), `exportAuditCsv`.
**Seed:** `CAL_DATA.events` (o derivar de DIAN/Req), `CAL_DATA.clients` con color; entradas extra de auditoría + `ip`.
**Aceptación:** las 3 vistas renderizan; eventos derivados de DIAN/Req aparecen; filtros de auditoría y export CSV funcionan.

---

## 6. Estrategia de validación / Definición de "hecho"

**Global (toda la app, al cierre y por fase):**
1. `npm run build` (next build) pasa sin errores.
2. `tsc --noEmit` y `npm run lint` limpios.
3. `npx prisma migrate status` = up to date; `npm run db:seed` corre idempotente sin error.

**Por ruta (checklist de validación que cumple "valida la ruta, valida la funcionalidad"):**
- La ruta renderiza sin error contra la BD sembrada (smoke render).
- Paridad funcional con la pantalla del prototipo: cada feature listada en la auditoría está presente.
- Las acciones de escritura persisten realmente (verificado consultando la BD) y revalidan la UI.
- No quedan `ModulePlaceholder` en rutas que el prototipo implementa.

**Método de smoke render:** levantar `next dev`, navegar autenticado a cada ruta y verificar HTTP 200 + ausencia de error de runtime/Prisma. Alternativamente, validación por request a cada ruta.

---

## 7. Riesgos y mitigaciones

- **Next.js 16 breaking changes** → leer `node_modules/next/dist/docs/` antes de codificar cada fase (obligatorio).
- **Tamaño del proyecto** → mitigado por el fasado vertical y los criterios de aceptación por fase; Fase 6 puede subdividirse.
- **IA sin backend** → simuladores deterministas con la forma de datos final, cableables a un LLM después.
- **Storage de archivos** → local en esta fase; abstraído en `lib/storage.ts` para sustituir por nube luego.
- **Migraciones** → una migración pequeña por fase, reversible; nunca un cambio de esquema masivo de una vez.
- **Cliente activo** → introducir el contexto en Fase 0/1 para no reescribir páginas después.

---

## 8. Convenciones

- Acciones por dominio en `src/app/actions/<dominio>.ts` con `"use server"`.
- Componentes client con sufijo claro y `"use client"` arriba; mantener Server Components por defecto.
- Modelos Prisma en español del dominio, nombres en inglés (estilo schema actual).
- Seed idempotente (borra y recrea por entidad, como hoy).
- Cada fase: rama o commits propios; validar antes de pasar a la siguiente.

---

## 9. Próximos pasos

1. Revisión de este spec por el usuario.
2. `writing-plans` para generar el plan de implementación de la **Fase 0 + Fase 1**.
3. Implementar, validar (criterios de aceptación), y avanzar fase por fase hasta el 100%.
