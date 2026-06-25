# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> Las dos reglas de `AGENTS.md` son OBLIGATORIAS y mandan sobre todo lo demás:
> 1. Esta versión de Next.js (16) tiene cambios de ruptura: consulta `node_modules/next/dist/docs/` antes de escribir código de framework.
> 2. La base de datos física va SIEMPRE en español vía `@@map`/`@map` (snake_case). Los identificadores Prisma quedan en inglés.

## Comandos

```bash
npm run dev            # desarrollo (Next 16 con --webpack, http://localhost:3000)
npm run build          # build de producción (prebuild ejecuta `prisma generate`)
npm run lint           # ESLint (eslint-config-next)
npm run test           # Vitest (una pasada)
npm run test:watch     # Vitest en modo watch

# Una sola prueba / archivo
npx vitest run src/lib/roles.test.ts          # un archivo
npx vitest run -t "nombre del test"           # por nombre

# Base de datos (Prisma 7 + PostgreSQL)
npm run db:migrate          # crea/aplica migraciones (prisma migrate dev)
npm run db:seed             # datos demo (clientes, balances, DIAN…)
npm run db:seed:rbac        # siembra roles, permisos y la matriz rol×permiso
npm run db:sync:rbac        # reconcilia la matriz BD ↔ catálogo SIN tocar jerarquía/asignaciones (dry-run; --aplicar para ejecutar)
npm run db:studio           # explorador de BD
npm run db:backfill:roles   # conversión de roles legado (dry-run)
npm run db:load:puc         # carga el PUC maestro Russell (prisma/data/puc-maestro-russell.json)
npm run db:seed:comentar    # siembra el permiso/datos de comentarios
npm run db:seed:admin-negocio   # siembra el usuario administrador de negocio
npm run db:completar:jerarquia  # completa aristas faltantes de la jerarquía
```

Las pruebas viven junto al código como `*.test.ts` (config en `vitest.config.ts`, entorno `node`, `SESSION_SECRET` inyectado). El cliente Prisma se regenera en `postinstall` y `prebuild`; tras editar `schema.prisma` corre `prisma generate` (o `db:migrate`).

Variables de entorno (`.env`, ver `.env.example`): `DATABASE_URL`, `SESSION_SECRET` (`openssl rand -base64 32`), y opcionales `COOKIE_SECURE`, `DB_POOL_MAX`, `DB_CONNECT_TIMEOUT_MS`, `DB_IDLE_TIMEOUT_MS`. Para la extracción de balances con IA: `ANTHROPIC_API_KEY` (sin ella la app sigue funcionando; la extracción asistida queda deshabilitada) y `ANTHROPIC_MODEL` (opcional, por defecto `claude-opus-4-8`). Para las **fotos de perfil** (almacenamiento de objetos S3/MinIO/R2): `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` y opcionales `S3_ENDPOINT`/`S3_FORCE_PATH_STYLE` (MinIO/R2). Sin ellas la app sigue funcionando y los usuarios ven sus iniciales (la subida de fotos queda deshabilitada).

## Arquitectura

App Next.js 16 (App Router, React 19, Tailwind v4) con backend propio: Server Actions + Prisma/PostgreSQL. No usa `next-auth`. Alias de import: `@/*` → `src/*`.

### Autenticación (dos capas)

- `src/proxy.ts` — reemplaza a `middleware.ts` en Next 16. Verificación **optimista**: solo valida la firma del JWT de la cookie `session` para redirigir entre `/login` y rutas protegidas. NO consulta la BD.
- `src/lib/dal.ts` — verificación **segura** (la autoridad real). `verifySession()` decodifica el JWT, consulta `User` en BD y **revoca** la sesión si el usuario no existe, está inactivo, o `sessionVersion` no coincide (bumpeando `sessionVersion` se invalidan todas las sesiones de un usuario). `getCurrentUser()` es la variante que no lanza. Ambas memoizadas con `React.cache()`.
- `src/lib/session.ts` / `src/lib/jwt.ts` — cookie `httpOnly` firmada con Jose (HS256), 7 días.
- `src/lib/login-throttle.ts` — bloqueo por intentos fallidos (`User.failedLoginAttempts`/`blockedUntil`, tabla `LoginAttempt`).

### Autorización RBAC — la MATRIZ es la autoridad, no la jerarquía

El modelo NO es jerárquico por rango. La verdad operativa vive en la matriz rol×permiso. Detalle clave: Socio/Gerente/Senior tienen rango alto pero son de **consulta**; el **Staff** es el único rol operativo (el único que escribe/ejecuta). `src/lib/roles.ts`/`can()` (rangos) es legado en transición — **el código nuevo autoriza por permiso**.

- **Permisos canónicos** con formato `"<modulo>:<accion>"` (p. ej. `conciliaciones:ejecutar`, `usuarios:crear`).
- `src/lib/rbac/catalogo.ts` — **fuente única de verdad** de roles, permisos y matriz. La comparten el seed (`prisma/seed-rbac.ts`) y las pruebas. Si cambias permisos, edita aquí y corre `npm run db:sync:rbac -- --aplicar` (reconcilia solo la matriz; `db:seed:rbac` es destructivo: borra y re-crea la jerarquía y los responsables demo).
- `src/lib/rbac.ts` — los gates que usan las páginas y acciones:
  - `requirePermiso(permiso, opts?)` → redirige a `/dashboard` si no cumple (páginas/layouts y acciones `void`).
  - `authorizePermiso(permiso, opts?)` → devuelve `AuthzResult` sin lanzar (acciones que retornan `ActionState`).
- **Doble verificación por dato**: para acciones sobre un cliente se pasa `{ clientId }` y se exige, además del permiso de rol, **alcance** sobre ese cliente: `writeScope` para crear/editar/eliminar/ejecutar, `readScope` para leer. `clientId: null` → deniega (fail-closed). La lógica pura está en `src/lib/rbac/permisos.ts` y `src/lib/rbac/jerarquia.ts` (testeables en memoria); el contexto de runtime que lee BD, en `src/lib/rbac/contexto.ts`.
- **Asignación directa por cliente** (sin equipos): cada cliente tiene UNO O VARIOS **staff** y EXACTAMENTE un **senior** y un **gerente** en `ClientAssignment` (`asignaciones_cliente`, `@@unique([clientId, role, userId])`): **staff** ejecuta (write), **senior** revisa (read) y **gerente** valida (read). La regla «un solo senior/gerente» se garantiza en la Server Action (`validarResponsables`), no en BD. Se eligen al crear/editar/importar el cliente (`createClient`/`updateClient`/`importarClientes` los exigen; el form y el importador admiten staff múltiple — en el Excel se separan con `;`). El **Socio NO se asigna**: deriva lectura por jerarquía sobre los clientes de sus gerentes (`derivarAsignacionesSocio`).
- **ERP del cliente opcional, pero bloqueante para operar**: `Client.erpId` (catálogo `Erp`) es opcional al crear/importar (los clientes sin ERP se etiquetan «Sin ERP» en `/config/clientes`), pero las acciones que INICIAN una operación lo exigen: `executeReconciliation` (`reconciliation.ts`) y `confirmarCargaBalance` (`balance.ts`) bloquean con alerta si el cliente no tiene ERP. El `Sector` (catálogo `Sector`) es opcional sin enforcement.
- **Jerarquía organizacional** (`UserHierarchy` / `jerarquia_usuarios`): aristas muchos-a-muchos entre roles adyacentes (Socio→Gerente→Senior→Staff), gestionadas desde la ficha del usuario (`superiorIds`). El formulario de cliente filtra en cascada (gerente → sus seniors → sus staff) y la server action revalida la consistencia. Cambiar el rol o borrar un usuario que es responsable activo de clientes está bloqueado hasta reasignarlos.
- `getMatriz()` se cachea en el Data Cache de Next (`unstable_cache`, tag `RBAC_CACHE_TAG`); al editar permisos hay que invalidar con `revalidateTag`. Si la BD falla, cae al catálogo conocido (no abre acceso).
- **Vigencia temporal**: las asignaciones de responsables tienen `validFrom`/`validUntil` (hoy sin UI). Expiran solas: `getAsignacionesUsuario()` filtra por fecha al leer (sin jobs).

### Publicación de módulos (capa separada del RBAC)

`src/lib/rbac/publicacion.ts` + `modulos-plataforma.ts` controlan si un módulo se **muestra** a no-superadministradores (`PlatformModule`). NO concede permisos: la autorización final sigue siendo la matriz. El menú lateral (`src/app/(app)/layout.tsx` + `src/lib/nav.ts`) se filtra por permiso del rol Y por publicación del módulo.

### Patrón de Server Action (seguir siempre)

En `src/app/actions/*.ts`. El orden es: `"use server"` → autorizar (`authorizePermiso`/`requirePermiso`, con `clientId` si toca dato de cliente) → validar con Zod (`safeParse`, esquemas en `src/lib/definitions.ts`) → `try/catch`. En el `catch`: acciones `ActionState` devuelven `{ ok:false, message: mensajeErrorBD(ctx, e) }`; acciones `void` llaman `registrarError(ctx, e)` y `throw` (lo captura el error boundary). Tras mutar: `logAudit(...)` (`src/lib/audit.ts`, nunca tumba la operación si falla) y `revalidatePath(...)`. Errores en `src/lib/errores.ts` traducen códigos Prisma a español. Ver `src/app/actions/users.ts` como referencia.

### Prisma / datos

- Cliente generado en `src/generated/prisma` (importar desde ahí, no de `@prisma/client`). Singleton en `src/lib/prisma.ts` con driver adapter `@prisma/adapter-pg` y pool configurable.
- **IDs numéricos autoincrementales** en todos los modelos; los códigos de negocio (`C-1042`, `IVA`…) son columnas `@unique`.
- **FK suaves** hacia `User` y `Client`: solo el `Int` mapeado, SIN `@relation` (no hay cascada física → al borrar un usuario hay que limpiar jerarquía y asignaciones a mano, ver `deleteUser`). Las demás relaciones sí son FK duras con `onDelete`.
- Comentarios polimórficos (`Comment`): anclados por `(entityType, entityId)` donde `entityType` reutiliza los códigos de módulo del RBAC.

### Balance de prueba: modelo normalizado (encabezado + detalle)

- **Almacenamiento**: el balance de comprobación vive en dos tablas relacionales — `balance_prueba_encabezado` (un cargue por `(clienteId, periodo, version)`, con versionado `esOficial`/`estaCongelado` y el resumen del cargue) y `balance_prueba_detalle` (una fila por cuenta, con la cuenta desagregada por nivel PUC `cuenta_2/4/6/8`, el mapeo `cuenta_6_russell`, y los montos `saldo_inicial/debitos/creditos/saldo_final` como `Decimal(18,2)` firmados: débito +, crédito −). FK suave `clienteId → clientes` (Int, sin `@relation`); FK dura encabezado→detalle con `onDelete: Cascade`.
- **El modelo `Balance` legado (JSON `desglose`/`sumas`/…) está DEPRECADO** y vacío; la tabla `balances` se conserva pero ya no se lee ni escribe.
- `src/lib/balance/calcular.ts` — cálculo **puro** (sin BD, sin Excel): de las cuentas crudas + el plan estándar (cuentas de 6 dígitos) produce `sums`, `breakdown` (por grupo PUC), `validations` y contadores. **Los agregados NO se persisten**: se RECALCULAN al leer con `reconstruirBalance(filas, estandar)` desde el detalle. Helpers clave: `descomponerCuenta` (código→2/4/6/8), `aFilasDetalle` (desglose→filas para insertar), `construirEstadoResultado` (P&L derivado, sustituye al antiguo `incomeStatement`). Determinista y testeable (`calcular.test.ts`); la carga/versionado vive en `confirmarCargaBalance`→`persistirCargue` (`src/app/actions/balance.ts`). Las pantallas `/balance` reconstruyen los view-models en sus loaders RSC.
- `src/lib/balance/asociacion.ts` — el vínculo balance↔plan estándar es la columna `cuenta_6_russell` del detalle (= código de la cuenta estándar). Saber si una cuenta estándar tiene balances asociados es una consulta Prisma directa sobre `balance_prueba_detalle` (antes requería SQL crudo `jsonb_array_elements` sobre el JSON). La comprobación es **global** (todos los clientes): editar/borrar una cuenta estándar afecta a toda la plataforma.

### Extracción de balances con IA (Claude)

Primera integración de IA de la plataforma. Pipeline en `src/lib/balance/extraccion/`, orquestado por `extraer.ts`:

1. **Ingesta** (`ingesta.ts`): el archivo subido (xlsx/xls/xlsb/csv/json/pdf) se clasifica en modo `tabular` (grillas por hoja) o `documento` (PDF base64 / texto). Solo el código toca todas las filas; al modelo se le manda una **vista previa compacta** con índices 1-based.
2. **Llamada a Claude** (`@anthropic-ai/sdk`, salida estructurada con `zodOutputFormat` y esquemas Zod en `esquema.ts`):
   - Tabular → modo **ESTRUCTURA**: el modelo devuelve un *mapping spec* (qué columna es código/nombre/saldo…), no transcribe filas.
   - Documento → modo **EXTRACCIÓN DIRECTA**: el modelo devuelve las filas de detalle ya normalizadas.
3. **Transformación/validación determinista** (`transformar.ts`): aplica el spec o valida la extracción directa y alimenta a `calcularBalance`.

- `src/lib/anthropic.ts` — singleton perezoso; **no** exige la API key hasta usarse (`getAnthropic()` lanza un error claro si falta; `iaDisponible()` decide UI/fallback). Modelo en `MODELO_EXTRACCION`.
- El **prompt de sistema** es Markdown editable (`prompt-extraccion.md`, fuente única, se memoiza); hay un fallback embebido si no se puede leer del disco.

### Importación masiva por Excel

Parsers **puros** en `src/lib/import/` (devuelven `{ filas, errores }`); la resolución contra BD (existencia/unicidad de personas, módulos, formatos DIAN) y la validación de jerarquía viven SIEMPRE en la Server Action correspondiente, no en el parser.

- `xlsx.ts` — helpers compartidos (`cargarWorkbook`, `celdaTexto`, `normalizar`) sobre `exceljs`.
- `clientes.ts` → acción `import-clientes.ts`: hoja «Clientes», staff múltiple separado por `;`, columnas de módulos/DIAN marcadas «Sí/X/1». Un bloque de módulos/DIAN **en blanco** (sin ningún valor) se interpreta como «activar todos»; un «No» explícito no. Plantilla: `Plantilla_Importacion_Clientes.xlsx`.
- `maestros.ts` → acción `import-maestros.ts`: 4 hojas (Socio/Gerente/Senior/Staff); el rol lo define la hoja y el superior esperado sale de la jerarquía. Plantilla: `Plantilla_Maestros_Personas.xlsx`.
- `balance.ts` — parser de la plantilla de balance de comprobación (hoja «Balance»); el cálculo vive en `calcular.ts`.
- `erp-sector-alias.ts` — normaliza alias de ERP/sector al importar.

### Errores, notificaciones y toasts (UI)

- **Error boundaries**: `src/app/error.tsx`, `src/app/global-error.tsx` y `src/app/(app)/error.tsx` capturan los `throw` de las acciones `void`; la UI común está en `src/components/pantalla-error.tsx`. Los `catch` traducen códigos Prisma a español vía `src/lib/errores.ts` (`mensajeErrorBD`/`registrarError`).
- **Toasts**: `src/lib/client-notifications.ts` emite eventos (`notifySuccess/Error/Info`) que escucha el `ActionToaster` montado en el layout (app), por lo que **persiste entre navegaciones**. `flash-toast.tsx` dispara un toast UNA vez al montar — para confirmar operaciones que terminaron con un redirect del servidor (la confirmación se emite en la página destino). `action-form.tsx` envuelve formularios de Server Action con manejo de éxito/error.
- **Notificaciones persistidas**: `src/lib/notifications.ts` (`createProcessNotification`) registra avisos de proceso en BD que muestra el Topbar (p. ej. enviar una conciliación a revisión).
- **Paginación**: control reutilizable en `src/components/pagination-controls.tsx`.

### Otras convenciones

- **Modales**: se cierran SOLO con la X — prohibido Escape/backdrop. Control centralizado en `src/components/modal.tsx`.
- `docs/superpowers/` contiene los specs/plans por fase del proyecto (contexto histórico, no normativo).
