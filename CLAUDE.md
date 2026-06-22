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
```

Las pruebas viven junto al código como `*.test.ts` (config en `vitest.config.ts`, entorno `node`, `SESSION_SECRET` inyectado). El cliente Prisma se regenera en `postinstall` y `prebuild`; tras editar `schema.prisma` corre `prisma generate` (o `db:migrate`).

Variables de entorno (`.env`, ver `.env.example`): `DATABASE_URL`, `SESSION_SECRET` (`openssl rand -base64 32`), y opcionales `COOKIE_SECURE`, `DB_POOL_MAX`, `DB_CONNECT_TIMEOUT_MS`, `DB_IDLE_TIMEOUT_MS`.

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
- **ERP del cliente opcional, pero bloqueante para operar**: `Client.erpId` (catálogo `Erp`) es opcional al crear/importar (los clientes sin ERP se etiquetan «Sin ERP» en `/config/clientes`), pero las acciones que INICIAN una operación lo exigen: `executeReconciliation` (`reconciliation.ts`) y `cargarBalance` (`balance.ts`) bloquean con alerta si el cliente no tiene ERP. El `Sector` (catálogo `Sector`) es opcional sin enforcement.
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

### Otras convenciones

- **Modales**: se cierran SOLO con la X — prohibido Escape/backdrop. Control centralizado en `src/components/modal.tsx`.
- `docs/superpowers/` contiene los specs/plans por fase del proyecto (contexto histórico, no normativo).
