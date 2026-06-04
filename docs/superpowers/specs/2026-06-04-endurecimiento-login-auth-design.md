# Endurecimiento del login y la autenticación — Diseño

- **Fecha:** 2026-06-04
- **Proyecto:** Russell Bedford · Conciliador/Diagnóstico LFM (`russell-lfm`)
- **Nivel objetivo:** Piloto / próximo a producción — cerrar brechas **críticas** y **altas**; las **medias** quedan como mejora posterior.
- **Despliegue objetivo:** Servidor propio / VPS (proceso Node persistente `next start` detrás de Nginx).

## 1. Contexto y diagnóstico

La aplicación maneja información contable y tributaria de clientes (en Colombia, sujeta a Habeas Data / Ley 1581). El login actual **es funcional** y tiene una base sólida, pero carece de controles esperados para este tipo de datos.

### Estado actual (funciona)

- Server Action `login` (`src/app/actions/auth.ts`): validación zod → `bcrypt.compare` → sesión → `redirect("/dashboard")`. `logout` implementado.
- Hashing con `bcrypt` (cost 10).
- Sesión: JWT firmado (`jose`, HS256) en cookie `httpOnly`, `secure` en producción, `sameSite: lax`, expiración 7 días (`src/lib/session.ts`).
- Protección de rutas: `src/proxy.ts` (middleware de Next 16) verifica la firma del JWT de forma optimista y redirige; la verificación segura contra DB está en el DAL (`src/lib/dal.ts`: `verifySession` / `getCurrentUser`).
- Todas las Server Actions de negocio llaman `verifySession()` de forma consistente.
- Buenas prácticas presentes: chequeo de `user.active` al loguear, mensajes de error genéricos, `.env` fuera de git, `SESSION_SECRET` de 43 chars.

### Brechas a cerrar en este alcance (críticas + altas)

1. **(Crítica)** Sin rate limiting ni bloqueo por intentos → fuerza bruta sin límite.
2. **(Crítica)** Credenciales demo expuestas en la página de login y email precargado.
3. **(Crítica)** Sin control de acceso por rol (RBAC): el campo `role` existe pero ninguna acción ni ruta lo verifica.
4. **(Alta)** Sesión no revocable: JWT de 7 días sin posibilidad de invalidar; `active` solo se valida al iniciar sesión.
5. **(Alta)** Sin gestión de credenciales: ni política de contraseñas, ni reseteo/rotación, ni alta/baja de usuarios.
6. **(Alta)** IP de auditoría falsa: `logAudit` escribe siempre `ip: "interno"`.

### Fuera de alcance (mejoras medias, post-piloto)

Headers de seguridad (CSP/HSTS/X-Frame-Options), MFA/2FA, *idle timeout* / expiración deslizante, sesiones respaldadas en DB (Opción B), reset self-service por correo. La enumeración por *timing* se mitiga de paso en este alcance (ver §6) por ser casi gratis.

## 2. Decisiones de arquitectura

### Decisión 1 — Estrategia de sesión: JWT stateless mejorado (Opción A)

Se mantiene el JWT en cookie y se le agrega:

- Re-chequeo en cada request (en el DAL) de que el usuario **siga existiendo y `active`**.
- Campo `sessionVersion` en `User`, embebido en el JWT. Si no coincide con el de la DB → sesión inválida. Se incrementa para **revocar todas las sesiones** del usuario (cambio de contraseña, desactivación, reseteo).

**Trade-off aceptado:** no revoca un token robado individual sin invalidar todas las sesiones de ese usuario. Suficiente para piloto.

**Camino de upgrade documentado (no se implementa ahora):** Opción B — sesiones opacas respaldadas en una tabla `Session` de Postgres, que permite revocación por dispositivo y listado de sesiones activas.

### Decisión 2 — Modelo RBAC: 4 roles jerárquicos

Roles estrictamente jerárquicos → implementación por comparación de rango.

`ROLE_RANK = { Consulta: 1, Auditor: 2, "Líder": 3, Administrador: 4 }`

| Capacidad | Consulta | Auditor | Líder | Administrador |
|---|:---:|:---:|:---:|:---:|
| **Ver** (dashboard, conciliaciones, balances, DIAN, requerimientos, calendario) | ✅ | ✅ | ✅ | ✅ |
| **Operar** (crear/editar conciliaciones, balances, mapeos, requerimientos, eventos, datos DIAN) | — | ✅ | ✅ | ✅ |
| **Gestionar** (borrar clientes/registros, configuración: clientes, módulos, config DIAN) | — | — | ✅ | ✅ |
| **Auditoría** (ver la bitácora `/auditoria`) | — | — | ✅ | ✅ |
| **Administración** (crear/editar/desactivar usuarios, resetear contraseñas) | — | — | — | ✅ |

## 3. Cambios en el modelo de datos (`prisma/schema.prisma`)

### `User` — campos nuevos

| Campo | Tipo | Propósito |
|---|---|---|
| `sessionVersion` | `Int @default(0)` | Revocación de sesiones (se incrementa para invalidar todas). |
| `mustChangePassword` | `Boolean @default(false)` | Forzar cambio tras reseteo administrativo. |
| `lastLoginAt` | `DateTime?` | Trazabilidad del último acceso. |

Los valores de `role` se normalizan al conjunto `Administrador | Líder | Auditor | Consulta` (validados por zod en código; `role` sigue siendo `String` en el schema). El seed se migra: `admin@russellbedford.co` → `Administrador`, `juliana@russellbedford.co` → `Auditor`.

### Modelo nuevo `LoginAttempt` (rate limiting + forense)

```prisma
model LoginAttempt {
  id        String   @id @default(cuid())
  email     String
  ip        String
  success   Boolean
  createdAt DateTime @default(now())

  @@index([email, createdAt])
  @@index([ip, createdAt])
}
```

### `AuditEntry`

Ya tiene el campo `ip`; solo se cambia el código para poblarlo con la IP real.

> Requiere migración de Prisma (`prisma migrate dev`) y `prisma generate`.

## 4. Sesión y revocación

- `src/lib/session.ts`: `SessionPayload` incluye `sessionVersion: number`. `createSession(userId, role, sessionVersion)` lo embebe en el JWT.
- `src/lib/dal.ts` → `verifySession`:
  1. Decodifica la cookie.
  2. Carga el usuario de la DB (`id, active, role, sessionVersion, mustChangePassword`).
  3. Invalida (redirige a `/login`) si: `!session.userId`, `!user`, `!user.active`, o `user.sessionVersion !== session.sessionVersion`.
  4. Devuelve `{ isAuth, userId, role }` con el **rol fresco de la DB** (no el del token) → un cambio de rol surte efecto sin re-login.
- Se mantiene `cache()` de React para una sola consulta por request.
- Expiración: 7 días absolutos (sin cambios). El re-chequeo de `active` + versión cierra la brecha de revocación.
- Cambio forzado: si `user.mustChangePassword`, el DAL redirige a `/cambiar-contrasena` (excepto en esa misma ruta y en las Server Actions de logout/cambio).

## 5. Control de acceso por rol — `src/lib/rbac.ts`

API:

- `ROLE_RANK`: mapa rol → rango (ver §2).
- `requireRole(min: Role)`: llama `verifySession`, compara rango; en **rutas** lanza error (página 403 / redirect), en **Server Actions** devuelve un fallo `{ ok:false, message:"No autorizado." }`.
- `can(role, min)`: helper booleano para mostrar/ocultar UI.

### Aplicación por Server Action (rango mínimo)

| Acción / archivo | Mín. rol |
|---|---|
| `reconciliation`, `balance`, `mapping`, `dian` (captura de datos), `requerimientos`, `presentaciones`, `repositorios`, `calendario`, `notifications` | **Auditor** |
| `clients` (`createClient`/`updateClient`/`deleteClient`), `module-fields`, config DIAN | **Líder** |
| Gestión de usuarios (nuevo `actions/users.ts`) | **Administrador** |

### Aplicación por ruta (guard en página o layout anidado)

| Ruta | Mín. rol |
|---|---|
| `/auditoria` | **Líder** |
| `/config/*` (clientes, módulos, DIAN) | **Líder** |
| `/config/usuarios` (nueva) | **Administrador** |

La UI (sidebar/topbar) usa `can()` para ocultar enlaces y botones según el rol, pero **la verificación de autoridad siempre ocurre en el servidor** (la UI es solo cosmética).

## 6. Rate limiting / bloqueo y comparación en tiempo constante (`login`)

En `src/app/actions/auth.ts` → `login`:

1. Obtener IP del request (ver §7).
2. Contar `LoginAttempt` con `success=false` para ese `email` en los últimos **15 min**. Segunda barrera: mismo conteo por `ip`.
3. Si cualquiera ≥ **5** → rechazar con mensaje genérico: *"Demasiados intentos. Intenta de nuevo en unos minutos."* (sin revelar cuál condición se disparó).
4. Validar credenciales. **Comparación en tiempo constante:** si el correo no existe, ejecutar igualmente un `bcrypt.compare` *dummy* contra un hash fijo para igualar tiempos y no permitir enumeración por *timing*.
5. Registrar el intento (`success` true/false) en `LoginAttempt`.
6. En éxito: actualizar `lastLoginAt`, crear sesión, y si `mustChangePassword` redirigir a `/cambiar-contrasena`; si no, a `/dashboard`.

Umbrales (`5 intentos` / `15 min`) se definen como constantes nombradas en un solo lugar para ajuste fácil.

## 7. IP real en la bitácora — `src/lib/request.ts`

- `getClientIp(): Promise<string>` lee `headers()` (Next 16) → primer valor de `x-forwarded-for` (confiando en Nginx), *fallback* `x-real-ip`, y `"desconocida"` si no hay.
- `src/lib/audit.ts` → `logAudit` obtiene la IP por sí mismo llamando `getClientIp()` (no se cambia ningún *call site* existente).

## 8. Gestión de credenciales

### Política de contraseñas

`PasswordSchema` en `src/lib/definitions.ts`: mínimo **10 caracteres**, al menos una letra y un número. Se aplica al **crear / cambiar / resetear** contraseña. El `LoginSchema` **no** cambia (el login sigue aceptando cualquier entrada para no revelar la política).

### Pantalla de administración de usuarios — `/config/usuarios` (solo Administrador)

Nueva ruta + `src/app/actions/users.ts`:

- **Listar** usuarios (nombre, email, rol, `active`, último acceso).
- **Crear**: email, nombre, rol, iniciales, contraseña temporal (valida `PasswordSchema`), `mustChangePassword=true`.
- **Editar**: nombre, rol, `active`.
- **Resetear contraseña**: fija contraseña temporal + `mustChangePassword=true` + incrementa `sessionVersion`.
- **Desactivar**: `active=false` + incrementa `sessionVersion` (mata sus sesiones de inmediato).

Toda acción registra en la bitácora vía `logAudit`.

### Cambio de contraseña — `/cambiar-contrasena`

- Acción `changePassword`: valida contraseña actual (`bcrypt.compare`) + nueva (`PasswordSchema`), guarda el hash, limpia `mustChangePassword`, incrementa `sessionVersion` y **reedita la cookie de sesión actual** con la nueva versión (para no expulsar al propio usuario).

## 9. Quitar credenciales demo

- `src/app/login/page.tsx`: eliminar el recuadro "Credenciales de demostración".
- `src/app/login/login-form.tsx`: quitar el `defaultValue="admin@russellbedford.co"` del input de email.

## 10. Pruebas (Vitest)

Unitarias con Prisma mockeado:

- `session`: encrypt → decrypt round-trip; `decrypt` devuelve null con firma inválida; detección de *mismatch* de `sessionVersion`.
- `rbac`: `requireRole` permite/deniega según rango; `can()` correcto en los 4 roles.
- `auth/login`: credenciales válidas; inválidas; usuario inactivo; bloqueo por rate-limit (≥5 fallos); `mustChangePassword` redirige; el `bcrypt.compare` dummy se ejecuta cuando el correo no existe.
- `definitions`: `PasswordSchema` acepta/rechaza casos límite.

## 11. Mapa de archivos afectados

**Nuevos**
- `src/lib/rbac.ts`
- `src/lib/request.ts`
- `src/app/actions/users.ts`
- `src/app/(app)/config/usuarios/page.tsx` (+ componente cliente)
- `src/app/(app)/cambiar-contrasena/page.tsx` (+ acción `changePassword`, en `actions/auth.ts` o nuevo)
- Pruebas Vitest correspondientes.

**Modificados**
- `prisma/schema.prisma` (+ migración) y `prisma/seed.ts` (roles nuevos, sin credenciales en UI).
- `src/lib/definitions.ts` (`SessionPayload.sessionVersion`, `PasswordSchema`, tipo `Role`).
- `src/lib/session.ts` (`sessionVersion` en payload/createSession).
- `src/lib/dal.ts` (`verifySession` con re-chequeo + redirección por `mustChangePassword`).
- `src/lib/audit.ts` (IP real).
- `src/app/actions/auth.ts` (rate limit, tiempo constante, `lastLoginAt`, redirección por cambio forzado).
- Server Actions de negocio: insertar `requireRole(min)` según la tabla de §5.
- `src/app/login/page.tsx` y `src/app/login/login-form.tsx` (quitar demo).
- `src/app/(app)/auditoria/page.tsx` y `src/app/(app)/config/*` (guard de ruta).
- `src/components/sidebar.tsx` / `topbar.tsx` (ocultar enlaces con `can()`).

## 12. Criterios de aceptación

- Un usuario `Consulta` no puede ejecutar ninguna Server Action de operar/gestionar/administrar (verificado en servidor, no solo UI).
- Un usuario `Auditor` no puede borrar clientes ni entrar a `/config/*` ni `/auditoria`.
- 5 intentos fallidos en 15 min bloquean nuevos intentos con mensaje genérico.
- Desactivar un usuario o resetear su contraseña invalida sus sesiones activas en el siguiente request.
- La bitácora registra la IP real del cliente (no `"interno"`).
- La página de login no muestra credenciales ni precarga el email.
- `npm run test` y `npm run build` pasan en verde.
