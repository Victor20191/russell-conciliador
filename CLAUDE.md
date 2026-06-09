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
- `src/lib/rbac/catalogo.ts` — **fuente única de verdad** de roles, permisos y matriz. La comparten el seed (`prisma/seed-rbac.ts`) y las pruebas. Si cambias permisos, edita aquí y vuelve a sembrar.
- `src/lib/rbac.ts` — los gates que usan las páginas y acciones:
  - `requirePermiso(permiso, opts?)` → redirige a `/dashboard` si no cumple (páginas/layouts y acciones `void`).
  - `authorizePermiso(permiso, opts?)` → devuelve `AuthzResult` sin lanzar (acciones que retornan `ActionState`).
- **Doble verificación por dato**: para acciones sobre un cliente se pasa `{ clientId }` y se exige, además del permiso de rol, **alcance** sobre ese cliente (cartera): `writeScope` para crear/editar/eliminar/ejecutar, `readScope` para leer. `clientId: null` → deniega (fail-closed). La lógica pura está en `src/lib/rbac/permisos.ts` (testeable en memoria); el contexto de runtime que lee BD, en `src/lib/rbac/contexto.ts`.
- `getMatriz()` se cachea en el Data Cache de Next (`unstable_cache`, tag `RBAC_CACHE_TAG`); al editar permisos hay que invalidar con `revalidateTag`. Si la BD falla, cae al catálogo conocido (no abre acceso).
- **Vigencia temporal**: las membresías de equipo y las carteras tienen `validFrom`/`validUntil`. Expiran solas: `getAsignacionesUsuario()` filtra por fecha al leer (sin jobs).

### Publicación de módulos (capa separada del RBAC)

`src/lib/rbac/publicacion.ts` + `modulos-plataforma.ts` controlan si un módulo se **muestra** a no-superadministradores (`PlatformModule`). NO concede permisos: la autorización final sigue siendo la matriz. El menú lateral (`src/app/(app)/layout.tsx` + `src/lib/nav.ts`) se filtra por permiso del rol Y por publicación del módulo.

### Patrón de Server Action (seguir siempre)

En `src/app/actions/*.ts`. El orden es: `"use server"` → autorizar (`authorizePermiso`/`requirePermiso`, con `clientId` si toca dato de cliente) → validar con Zod (`safeParse`, esquemas en `src/lib/definitions.ts`) → `try/catch`. En el `catch`: acciones `ActionState` devuelven `{ ok:false, message: mensajeErrorBD(ctx, e) }`; acciones `void` llaman `registrarError(ctx, e)` y `throw` (lo captura el error boundary). Tras mutar: `logAudit(...)` (`src/lib/audit.ts`, nunca tumba la operación si falla) y `revalidatePath(...)`. Errores en `src/lib/errores.ts` traducen códigos Prisma a español. Ver `src/app/actions/users.ts` como referencia.

### Prisma / datos

- Cliente generado en `src/generated/prisma` (importar desde ahí, no de `@prisma/client`). Singleton en `src/lib/prisma.ts` con driver adapter `@prisma/adapter-pg` y pool configurable.
- **IDs numéricos autoincrementales** en todos los modelos; los códigos de negocio (`C-1042`, `IVA`…) son columnas `@unique`.
- **FK suaves** hacia `User` y `Client`: solo el `Int` mapeado, SIN `@relation` (no hay cascada física → al borrar un usuario hay que limpiar equipos/cartera a mano, ver `deleteUser`). Las demás relaciones sí son FK duras con `onDelete`.
- Comentarios polimórficos (`Comment`): anclados por `(entityType, entityId)` donde `entityType` reutiliza los códigos de módulo del RBAC.

### Otras convenciones

- **Modales**: se cierran SOLO con la X — prohibido Escape/backdrop. Control centralizado en `src/components/modal.tsx`.
- `docs/superpowers/` contiene los specs/plans por fase del proyecto (contexto histórico, no normativo).
