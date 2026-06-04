# Endurecimiento del login y la autenticación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar las brechas críticas y altas del login (RBAC de 4 roles, rate limiting/lockout, revocación de sesión, IP real en auditoría, gestión de usuarios y forzado de cambio de contraseña) sin romper el flujo actual.

**Architecture:** Se mantiene el JWT stateless en cookie (Opción A) y se le añade `sessionVersion` para revocación; el DAL re-valida `active` y la versión en cada request. La autorización se centraliza en helpers puros (`roles.ts`) + guards de servidor (`rbac.ts`). El rate limiting se respalda en una tabla `LoginAttempt` de Postgres. La criptografía JWT se extrae a `jwt.ts` para poder probarla.

**Tech Stack:** Next.js 16 (App Router, Server Actions, `proxy.ts`), Prisma 7 + Postgres, `jose` (JWT HS256), `bcryptjs`, `zod` v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-endurecimiento-login-auth-design.md`

---

## Estructura de archivos

**Nuevos**
- `src/lib/roles.ts` — `Role`, `ROLE_RANK`, `roleRank`, `can` (puros, sin `server-only`). Testeable.
- `src/lib/jwt.ts` — `encrypt`/`decrypt` (solo `jose`, sin `server-only`). Testeable.
- `src/lib/login-throttle.ts` — constantes y `isLockedOut` (puro). Testeable.
- `src/lib/request.ts` — `getClientIp` (lee cabeceras, `server-only`).
- `src/lib/rbac.ts` — `requireRole` (route guard) y `authorizeAction` (Server Actions), `server-only`.
- `src/app/actions/users.ts` — CRUD de usuarios (solo Administrador).
- `src/app/(app)/config/usuarios/page.tsx` + `usuarios-client.tsx` — gestión de usuarios.
- `src/app/cambiar-contrasena/page.tsx` + `cambiar-contrasena-form.tsx` — cambio forzado (fuera del grupo `(app)`).
- Tests: `src/lib/roles.test.ts`, `src/lib/jwt.test.ts`, `src/lib/login-throttle.test.ts`, adiciones a `src/lib/definitions.test.ts`.

**Modificados**
- `prisma/schema.prisma` (+ migración), `prisma/seed.ts` (roles nuevos).
- `src/lib/definitions.ts` (`SessionPayload.sessionVersion`, `PasswordSchema`, `ChangePasswordSchema`).
- `src/lib/session.ts` (usa `jwt.ts`, `createSession` recibe `sessionVersion`).
- `src/lib/dal.ts` (`verifySession` re-valida `active` + versión; expone `mustChangePassword`).
- `src/lib/audit.ts` (IP real).
- `src/app/actions/auth.ts` (rate limit, tiempo constante, `lastLoginAt`, `changePassword`).
- Server Actions de negocio (insertar guard de rol).
- `src/app/(app)/layout.tsx` (redirección por `mustChangePassword`).
- `src/app/(app)/auditoria/page.tsx`, `src/app/(app)/config/*/page.tsx` (route guard).
- `src/app/login/page.tsx`, `src/app/login/login-form.tsx` (quitar demo).
- `src/lib/nav.ts`, `src/components/sidebar.tsx` (ocultar enlaces con `can()`).
- `vitest.config.ts` (env `SESSION_SECRET` para tests).

---

## Task 1: Modelo de datos y migración

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts:48-53`

- [ ] **Step 1: Añadir campos a `User`**

En `prisma/schema.prisma`, reemplazar el modelo `User` por:

```prisma
model User {
  id                 String    @id @default(cuid())
  email              String    @unique
  password           String // hash bcrypt
  name               String
  role               String    @default("Consulta")
  initials           String
  active             Boolean   @default(true)
  sessionVersion     Int       @default(0)
  mustChangePassword Boolean   @default(false)
  lastLoginAt        DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
}
```

- [ ] **Step 2: Añadir modelo `LoginAttempt`**

Añadir, justo debajo del modelo `User`:

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

- [ ] **Step 3: Migrar y generar**

Run: `npm run db:migrate -- --name auth_hardening`
Expected: crea la migración, aplica los cambios y regenera el cliente Prisma sin errores.

- [ ] **Step 4: Normalizar roles del seed**

En `prisma/seed.ts`, reemplazar el bloque `data: [...]` de usuarios (líneas ~50-51) por:

```ts
    data: [
      { email: "admin@russellbedford.co", password: passwordHash, name: "Manuela Gutiérrez", role: "Administrador", initials: "MG" },
      { email: "juliana@russellbedford.co", password: passwordHash, name: "Juliana Rincón", role: "Auditor", initials: "JR" },
    ],
```

- [ ] **Step 5: Re-sembrar**

Run: `npm run db:seed`
Expected: `🌱 Seeding…` sin errores; los usuarios quedan con roles `Administrador` y `Auditor`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts prisma/migrations
git commit -m "feat(db): sessionVersion/mustChangePassword/lastLoginAt en User + modelo LoginAttempt + roles normalizados"
```

---

## Task 2: Roles y helpers de permisos (puros)

**Files:**
- Create: `src/lib/roles.ts`
- Test: `src/lib/roles.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/roles.test.ts`:

```ts
import { test, expect } from "vitest";
import { can, roleRank, ROLE_RANK } from "./roles";

test("jerarquía Consulta < Auditor < Líder < Administrador", () => {
  expect(ROLE_RANK.Consulta).toBeLessThan(ROLE_RANK.Auditor);
  expect(ROLE_RANK.Auditor).toBeLessThan(ROLE_RANK["Líder"]);
  expect(ROLE_RANK["Líder"]).toBeLessThan(ROLE_RANK.Administrador);
});

test("can() respeta el rango mínimo", () => {
  expect(can("Administrador", "Líder")).toBe(true);
  expect(can("Líder", "Líder")).toBe(true);
  expect(can("Auditor", "Líder")).toBe(false);
  expect(can("Consulta", "Auditor")).toBe(false);
});

test("rol desconocido tiene rango 0 y no pasa ningún gate", () => {
  expect(roleRank("Hacker")).toBe(0);
  expect(can("Hacker", "Consulta")).toBe(false);
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -- roles`
Expected: FAIL — `Failed to resolve import "./roles"`.

- [ ] **Step 3: Implementar `roles.ts`**

Crear `src/lib/roles.ts`:

```ts
export type Role = "Consulta" | "Auditor" | "Líder" | "Administrador";

export const ROLE_RANK: Record<Role, number> = {
  Consulta: 1,
  Auditor: 2,
  "Líder": 3,
  Administrador: 4,
};

export function roleRank(role: string): number {
  return ROLE_RANK[role as Role] ?? 0;
}

// ¿El rol `role` alcanza al menos el rango mínimo `min`?
export function can(role: string, min: Role): boolean {
  return roleRank(role) >= ROLE_RANK[min];
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test -- roles`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/roles.ts src/lib/roles.test.ts
git commit -m "feat(auth): roles jerárquicos y helper can()"
```

---

## Task 3: Extraer la criptografía JWT a `jwt.ts`

**Files:**
- Create: `src/lib/jwt.ts`
- Modify: `src/lib/definitions.ts:23-27`
- Modify: `src/lib/session.ts`
- Modify: `src/lib/dal.ts:5`
- Modify: `vitest.config.ts`
- Test: `src/lib/jwt.test.ts`

- [ ] **Step 1: Añadir `sessionVersion` a `SessionPayload`**

En `src/lib/definitions.ts`, reemplazar el tipo `SessionPayload`:

```ts
export type SessionPayload = {
  userId: string;
  role: string;
  sessionVersion: number;
  expiresAt: string; // ISO
};
```

- [ ] **Step 2: Dar `SESSION_SECRET` a Vitest**

En `vitest.config.ts`, reemplazar el bloque `test`:

```ts
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      SESSION_SECRET: "test-session-secret-test-session-secret",
    },
  },
```

- [ ] **Step 3: Escribir el test que falla**

Crear `src/lib/jwt.test.ts`:

```ts
import { test, expect } from "vitest";
import { encrypt, decrypt } from "./jwt";

test("encrypt → decrypt recupera el payload", async () => {
  const token = await encrypt({
    userId: "u1",
    role: "Auditor",
    sessionVersion: 3,
    expiresAt: "2030-01-01T00:00:00.000Z",
  });
  const payload = await decrypt(token);
  expect(payload?.userId).toBe("u1");
  expect(payload?.role).toBe("Auditor");
  expect(payload?.sessionVersion).toBe(3);
});

test("decrypt devuelve null con token vacío o inválido", async () => {
  expect(await decrypt("")).toBeNull();
  expect(await decrypt("no-es-un-jwt")).toBeNull();
});
```

- [ ] **Step 4: Verificar que falla**

Run: `npm run test -- jwt`
Expected: FAIL — `Failed to resolve import "./jwt"`.

- [ ] **Step 5: Implementar `jwt.ts`**

Crear `src/lib/jwt.ts`:

```ts
import { SignJWT, jwtVerify } from "jose";
import type { SessionPayload } from "@/lib/definitions";

const encodedKey = new TextEncoder().encode(process.env.SESSION_SECRET);

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey);
}

export async function decrypt(
  session: string | undefined = "",
): Promise<SessionPayload | null> {
  if (!session) return null;
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Verificar que pasa**

Run: `npm run test -- jwt`
Expected: PASS (2 tests).

- [ ] **Step 7: Reescribir `session.ts` para usar `jwt.ts` y recibir `sessionVersion`**

Reemplazar todo `src/lib/session.ts` por:

```ts
import "server-only";
import { cookies } from "next/headers";
import { encrypt } from "@/lib/jwt";

const COOKIE = "session";

export async function createSession(
  userId: string,
  role: string,
  sessionVersion: number,
) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const session = await encrypt({
    userId,
    role,
    sessionVersion,
    expiresAt: expiresAt.toISOString(),
  });
  const cookieStore = await cookies();

  cookieStore.set(COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}
```

- [ ] **Step 8: Apuntar el DAL a `jwt.ts`**

En `src/lib/dal.ts`, cambiar la línea 5:

```ts
import { decrypt } from "@/lib/jwt";
```

(antes era `from "@/lib/session"`).

- [ ] **Step 9: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores. (Nota: `createSession` ahora exige 3 argumentos — `auth.ts` se actualiza en la Task 7; si se ejecuta esta task aislada, el error de `auth.ts` es esperado y se resuelve allí.)

- [ ] **Step 10: Commit**

```bash
git add src/lib/jwt.ts src/lib/jwt.test.ts src/lib/session.ts src/lib/dal.ts src/lib/definitions.ts vitest.config.ts
git commit -m "refactor(auth): extraer encrypt/decrypt a jwt.ts + sessionVersion en el payload"
```

---

## Task 4: DAL — re-validar `active` y `sessionVersion`

**Files:**
- Modify: `src/lib/dal.ts`

- [ ] **Step 1: Reescribir `verifySession`**

Reemplazar todo `src/lib/dal.ts` por:

```ts
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decrypt } from "@/lib/jwt";
import prisma from "@/lib/prisma";

export const verifySession = cache(async () => {
  const cookie = (await cookies()).get("session")?.value;
  const session = await decrypt(cookie);

  if (!session?.userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      active: true,
      role: true,
      sessionVersion: true,
      mustChangePassword: true,
    },
  });

  // Revocación: el usuario debe existir, estar activo y la versión de sesión coincidir.
  if (!user || !user.active || user.sessionVersion !== session.sessionVersion) {
    redirect("/login");
  }

  return {
    isAuth: true as const,
    userId: user.id,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
});

export const getCurrentUser = cache(async () => {
  const session = await verifySession();
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, email: true, role: true, initials: true },
    });
    return user;
  } catch {
    return null;
  }
});
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `dal.ts` (el de `auth.ts` por `createSession` sigue pendiente hasta la Task 7).

- [ ] **Step 3: Commit**

```bash
git add src/lib/dal.ts
git commit -m "feat(auth): verifySession re-valida active y sessionVersion contra la DB"
```

---

## Task 5: IP real en la auditoría

**Files:**
- Create: `src/lib/request.ts`
- Modify: `src/lib/audit.ts`

- [ ] **Step 1: Crear `getClientIp`**

Crear `src/lib/request.ts`:

```ts
import "server-only";
import { headers } from "next/headers";

// Detrás de Nginx la IP real llega en x-forwarded-for (primer salto).
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip")?.trim() ?? "desconocida";
}
```

- [ ] **Step 2: Poblar la IP real en `logAudit`**

En `src/lib/audit.ts`, añadir el import y usar la IP. Reemplazar el cuerpo de `logAudit`:

```ts
import "server-only";
import prisma from "@/lib/prisma";
import { MESES } from "@/lib/format";
import { getClientIp } from "@/lib/request";

function stamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${MESES[d.getMonth()]}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export type AuditInput = {
  user: string;
  action: string;
  entity: string;
  detail: string;
};

export async function logAudit({ user, action, entity, detail }: AuditInput): Promise<void> {
  const ip = await getClientIp();
  await prisma.auditEntry.create({
    data: { ts: stamp(), user, action, entity, detail, ip },
  });
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/lib/request.ts src/lib/audit.ts
git commit -m "feat(audit): registrar la IP real del cliente (x-forwarded-for) en la bitácora"
```

---

## Task 6: Throttle de login (helper puro)

**Files:**
- Create: `src/lib/login-throttle.ts`
- Test: `src/lib/login-throttle.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/login-throttle.test.ts`:

```ts
import { test, expect } from "vitest";
import { isLockedOut, LOGIN_MAX_ATTEMPTS } from "./login-throttle";

test("bloquea al alcanzar el máximo de intentos", () => {
  expect(isLockedOut(LOGIN_MAX_ATTEMPTS - 1)).toBe(false);
  expect(isLockedOut(LOGIN_MAX_ATTEMPTS)).toBe(true);
  expect(isLockedOut(LOGIN_MAX_ATTEMPTS + 3)).toBe(true);
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -- login-throttle`
Expected: FAIL — import no resuelto.

- [ ] **Step 3: Implementar**

Crear `src/lib/login-throttle.ts`:

```ts
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutos

export function isLockedOut(recentFailures: number): boolean {
  return recentFailures >= LOGIN_MAX_ATTEMPTS;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test -- login-throttle`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/login-throttle.ts src/lib/login-throttle.test.ts
git commit -m "feat(auth): umbral de rate limiting de login (helper puro)"
```

---

## Task 7: Endurecer `login` + `changePassword`

**Files:**
- Modify: `src/lib/definitions.ts`
- Modify: `src/app/actions/auth.ts`

- [ ] **Step 1: Añadir `PasswordSchema` y `ChangePasswordSchema`**

En `src/lib/definitions.ts`, añadir al final:

```ts
export const PasswordSchema = z
  .string()
  .min(10, { error: "La contraseña debe tener al menos 10 caracteres." })
  .regex(/[A-Za-z]/, { error: "Debe incluir al menos una letra." })
  .regex(/[0-9]/, { error: "Debe incluir al menos un número." });

export const ChangePasswordSchema = z.object({
  current: z.string().min(1, { error: "Ingresa tu contraseña actual." }),
  next: PasswordSchema,
});
```

- [ ] **Step 2: Generar el hash dummy para tiempo constante**

Run: `node -e "console.log(require('bcryptjs').hashSync('dummy-password',10))"`
Expected: imprime un hash que empieza por `$2b$10$` (o `$2a$10$`). Copiarlo para el paso 3.

- [ ] **Step 3: Reescribir `auth.ts`**

Reemplazar todo `src/app/actions/auth.ts` por (pegando el hash del paso 2 en `DUMMY_HASH`):

```ts
"use server";

import * as z from "zod";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import {
  LoginSchema,
  ChangePasswordSchema,
  type LoginState,
  type ActionState,
} from "@/lib/definitions";
import { createSession, deleteSession } from "@/lib/session";
import { verifySession } from "@/lib/dal";
import { getClientIp } from "@/lib/request";
import {
  LOGIN_WINDOW_MS,
  isLockedOut,
} from "@/lib/login-throttle";
import prisma from "@/lib/prisma";

// Hash fijo válido: iguala el tiempo de bcrypt.compare cuando el correo no existe
// (evita enumeración de usuarios por timing). Reemplazar por el del paso 2.
const DUMMY_HASH = "$2b$10$PEGAR_AQUI_EL_HASH_DEL_PASO_2.................";

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const validated = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: z.flattenError(validated.error).fieldErrors };
  }

  const { email, password } = validated.data;
  const ip = await getClientIp();
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);

  const recentFailures = await prisma.loginAttempt.count({
    where: { success: false, createdAt: { gt: since }, OR: [{ email }, { ip }] },
  });
  if (isLockedOut(recentFailures)) {
    return { message: "Demasiados intentos. Intenta de nuevo en unos minutos." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Comparar siempre (contra hash dummy si no hay usuario) para tiempo constante.
  const ok = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);

  if (!user || !user.active || !ok) {
    await prisma.loginAttempt.create({ data: { email, ip, success: false } });
    return { message: "Credenciales inválidas." };
  }

  await prisma.loginAttempt.create({ data: { email, ip, success: true } });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await createSession(user.id, user.role, user.sessionVersion);

  if (user.mustChangePassword) redirect("/cambiar-contrasena");
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

export async function changePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await verifySession();
  const parsed = ChangePasswordSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/login");

  const ok = await bcrypt.compare(parsed.data.current, user.password);
  if (!ok) return { ok: false, message: "La contraseña actual es incorrecta." };

  const newVersion = user.sessionVersion + 1;
  const newHash = await bcrypt.hash(parsed.data.next, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: newHash, mustChangePassword: false, sessionVersion: newVersion },
  });
  // Reeditar la cookie actual con la nueva versión para no expulsar al propio usuario.
  await createSession(user.id, user.role, newVersion);
  redirect("/dashboard");
}
```

- [ ] **Step 4: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Verificación manual del rate limiting**

Run: `npm run dev`, abrir `/login`, intentar 5 veces con contraseña incorrecta.
Expected: a partir del 5º intento aparece *"Demasiados intentos. Intenta de nuevo en unos minutos."* En la DB, `LoginAttempt` tiene filas con la IP real (verificar con `npm run db:studio`).

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/auth.ts src/lib/definitions.ts
git commit -m "feat(auth): rate limiting, comparación en tiempo constante, lastLoginAt y changePassword"
```

---

## Task 8: Guards de rol en Server Actions

**Files:**
- Create: `src/lib/rbac.ts`
- Modify: `src/app/actions/clients.ts`, `module-fields.ts`, `dian.ts`, `reconciliation.ts`, `balance.ts`, `mapping.ts`, `calendario.ts`, `requerimientos.ts`, `presentaciones.ts`, `repositorios.ts`, `notifications.ts`

- [ ] **Step 1: Crear los guards**

Crear `src/lib/rbac.ts`:

```ts
import "server-only";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { can, type Role } from "@/lib/roles";

export type AuthzResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; message: string };

// Para Server Actions que devuelven ActionState: no lanza, devuelve el resultado.
export async function authorizeAction(min: Role): Promise<AuthzResult> {
  const session = await verifySession();
  if (!can(session.role, min)) {
    return { ok: false, message: "No tienes permisos para esta acción." };
  }
  return { ok: true, userId: session.userId, role: session.role };
}

// Para páginas/layouts y Server Actions void: redirige si no cumple.
export async function requireRole(min: Role): Promise<void> {
  const session = await verifySession();
  if (!can(session.role, min)) {
    redirect("/dashboard");
  }
}
```

- [ ] **Step 2: Guard mínimo "Auditor" en las acciones de operar (void)**

En cada uno de estos archivos, **reemplazar la línea `await verifySession();`** (al inicio de cada acción) por `await requireRole("Auditor");`, y añadir el import `import { requireRole } from "@/lib/rbac";` (quitando `verifySession` del import de `@/lib/dal` si ya no se usa, pero conservando `getCurrentUser` donde se importe):

- `src/app/actions/reconciliation.ts` — `addReconciliationComment`, `setRowStatus`, `sendToReviewer`, `executeReconciliation`
- `src/app/actions/balance.ts` — `freezeBalance`
- `src/app/actions/mapping.ts` — `updateAccountMapping`, `suggestMappingsAI`
- `src/app/actions/calendario.ts` — `createCalendarEvent`
- `src/app/actions/requerimientos.ts` — `generateRequirement`
- `src/app/actions/presentaciones.ts` — `createPresentation`
- `src/app/actions/repositorios.ts` — `markRepoItemReceived`, `sendRepoReminder`
- `src/app/actions/notifications.ts` — `markAllNotificationsRead`
- `src/app/actions/dian.ts` — `addDianComment`, `requestDianAiAnalysis`

Ejemplo concreto (`notifications.ts`):

```ts
"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";

export async function markAllNotificationsRead(): Promise<void> {
  await requireRole("Auditor");
  await prisma.notification.updateMany({ data: { read: true } });
  revalidatePath("/");
}
```

- [ ] **Step 3: Guard mínimo "Líder" en las acciones de gestionar**

- `src/app/actions/dian.ts` → `saveDianMapping` (devuelve `ActionState`): tras `"use server"`, al inicio de la función usar `authorizeAction`:

```ts
  const authz = await authorizeAction("Líder");
  if (!authz.ok) return { ok: false, message: authz.message };
```

  Importar: `import { requireRole, authorizeAction } from "@/lib/rbac";`

- `src/app/actions/module-fields.ts` → `createModuleField`, `updateModuleField` (devuelven `ActionState`): usar el mismo patrón `authorizeAction("Líder")` con early-return. `deleteModuleField`, `moveModuleField` (void): usar `await requireRole("Líder");` en lugar de `verifySession()`.

- `src/app/actions/clients.ts`:
  - `createClient`, `updateClient` (ActionState): `authorizeAction("Líder")` con early-return.
  - `deleteClient`, `setClientModuleStatus` (void): `await requireRole("Líder");`

Ejemplo concreto (`clients.ts`, `createClient` y `deleteClient`):

```ts
import { requireRole, authorizeAction } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
// ...
export async function createClient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizeAction("Líder");
  if (!authz.ok) return { ok: false, message: authz.message };
  // ...resto igual...
}

export async function deleteClient(formData: FormData): Promise<void> {
  await requireRole("Líder");
  const id = formData.get("id") as string;
  // ...resto igual...
}
```

- [ ] **Step 4: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores. Revisar que cada archivo importe `requireRole`/`authorizeAction` y conserve `getCurrentUser` donde se use.

- [ ] **Step 5: Verificación manual**

Run: `npm run dev`. Iniciar sesión como `juliana@russellbedford.co` (Auditor) e intentar borrar un cliente desde `/config/clientes`.
Expected: la operación no se realiza (la ruta `/config/*` además quedará bloqueada en la Task 9; aquí basta con que la acción de borrado no afecte datos).

- [ ] **Step 6: Commit**

```bash
git add src/lib/rbac.ts src/app/actions
git commit -m "feat(authz): guards de rol por Server Action (Auditor/Líder)"
```

---

## Task 9: Guards de rol por ruta

**Files:**
- Modify: `src/app/(app)/auditoria/page.tsx:1-6`
- Modify: `src/app/(app)/config/clientes/page.tsx`, `config/modulos/page.tsx`, `config/dian/page.tsx`

- [ ] **Step 1: Proteger `/auditoria` (Líder)**

En `src/app/(app)/auditoria/page.tsx`, añadir el import y la primera línea del componente:

```ts
import { requireRole } from "@/lib/rbac";
// ...imports existentes...

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ q?: string; user?: string; action?: string }> }) {
  await requireRole("Líder");
  const sp = await searchParams;
  // ...resto igual...
```

- [ ] **Step 2: Proteger `/config/*` (Líder)**

En cada una de `config/clientes/page.tsx`, `config/modulos/page.tsx`, `config/dian/page.tsx`: añadir `import { requireRole } from "@/lib/rbac";` y, como **primera línea** dentro del componente `export default async function ...Page() {`, añadir:

```ts
  await requireRole("Líder");
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Verificación manual**

Como Auditor, navegar a `/auditoria` y `/config/clientes`.
Expected: redirige a `/dashboard`. Como Administrador, ambas cargan normalmente.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/auditoria/page.tsx" "src/app/(app)/config"
git commit -m "feat(authz): route guards de rol en /auditoria y /config/*"
```

---

## Task 10: Forzar cambio de contraseña

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Create: `src/app/cambiar-contrasena/page.tsx`
- Create: `src/app/cambiar-contrasena/cambiar-contrasena-form.tsx`

- [ ] **Step 1: Redirigir desde el layout protegido**

En `src/app/(app)/layout.tsx`, reemplazar la obtención del usuario por una que también consulte la sesión y fuerce el cambio:

```tsx
import Sidebar from "@/components/sidebar";
import Topbar from "@/components/topbar";
import { redirect } from "next/navigation";
import { getCurrentUser, verifySession } from "@/lib/dal";
import prisma from "@/lib/prisma";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession();
  if (session.mustChangePassword) redirect("/cambiar-contrasena");

  const user = await getCurrentUser();
  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar notifications={notifications} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear el formulario (cliente)**

Crear `src/app/cambiar-contrasena/cambiar-contrasena-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/actions/auth";

export default function CambiarContrasenaForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="current" className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Contraseña actual
        </label>
        <input id="current" name="current" type="password" autoComplete="current-password"
          className="rounded-md border border-ink-200 bg-white px-3.5 py-2.5 text-[13px] text-ink-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        {state?.errors?.current && <p className="text-xs text-err-700">{state.errors.current[0]}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="next" className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Nueva contraseña
        </label>
        <input id="next" name="next" type="password" autoComplete="new-password"
          className="rounded-md border border-ink-200 bg-white px-3.5 py-2.5 text-[13px] text-ink-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        {state?.errors?.next && <p className="text-xs text-err-700">{state.errors.next[0]}</p>}
      </div>

      {state?.message && (
        <div className="rounded-md border border-err-100 bg-err-100 px-3.5 py-2.5 text-xs font-medium text-err-700">
          {state.message}
        </div>
      )}

      <button type="submit" disabled={pending}
        className="mt-1 rounded-md bg-navy-700 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-navy-600 disabled:opacity-60">
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Crear la página**

Crear `src/app/cambiar-contrasena/page.tsx`:

```tsx
import { verifySession } from "@/lib/dal";
import CambiarContrasenaForm from "./cambiar-contrasena-form";

export default async function CambiarContrasenaPage() {
  await verifySession(); // exige sesión válida; no está bajo (app), así que no hay loop de redirección
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 p-8">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-2xl text-ink-900">Cambia tu contraseña</h1>
        <p className="mt-1.5 mb-7 text-sm text-ink-500">
          Por seguridad, debes establecer una nueva contraseña antes de continuar.
        </p>
        <CambiarContrasenaForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/layout.tsx" src/app/cambiar-contrasena
git commit -m "feat(auth): cambio de contraseña forzado (mustChangePassword)"
```

---

## Task 11: Gestión de usuarios (solo Administrador)

**Files:**
- Modify: `src/lib/definitions.ts`
- Create: `src/app/actions/users.ts`
- Create: `src/app/(app)/config/usuarios/page.tsx`
- Create: `src/app/(app)/config/usuarios/usuarios-client.tsx`

- [ ] **Step 1: Esquemas de usuario**

En `src/lib/definitions.ts`, añadir:

```ts
const RoleEnum = z.enum(["Consulta", "Auditor", "Líder", "Administrador"]);

export const UserCreateSchema = z.object({
  email: z.email({ error: "Correo inválido." }).trim(),
  name: z.string().min(1, { error: "El nombre es obligatorio." }).trim(),
  role: RoleEnum,
  initials: z.string().min(1).max(3, { error: "Máximo 3 caracteres." }).trim(),
  password: PasswordSchema,
});

export const UserUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, { error: "El nombre es obligatorio." }).trim(),
  role: RoleEnum,
  active: z.boolean(),
});

export const UserResetSchema = z.object({
  id: z.string().min(1),
  password: PasswordSchema,
});
```

- [ ] **Step 2: Acciones de usuarios**

Crear `src/app/actions/users.ts`:

```ts
"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { authorizeAction } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import {
  UserCreateSchema,
  UserUpdateSchema,
  UserResetSchema,
  type ActionState,
} from "@/lib/definitions";

const PATH = "/config/usuarios";

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizeAction("Administrador");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = UserCreateSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    initials: formData.get("initials"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  const dup = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (dup) return { ok: false, message: "Ya existe un usuario con ese correo." };

  const password = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      initials: parsed.data.initials.toUpperCase(),
      password,
      mustChangePassword: true,
    },
  });

  const actor = await getCurrentUser();
  await logAudit({ user: actor?.name ?? "Sistema", action: "CREÓ USUARIO", entity: parsed.data.email, detail: parsed.data.role });
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizeAction("Administrador");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = UserUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    role: formData.get("role"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  const before = await prisma.user.findUnique({ where: { id: parsed.data.id }, select: { active: true } });
  // Desactivar mata las sesiones del usuario (incrementa sessionVersion).
  const bump = before?.active && !parsed.data.active ? { sessionVersion: { increment: 1 } } : {};
  await prisma.user.update({
    where: { id: parsed.data.id },
    data: { name: parsed.data.name, role: parsed.data.role, active: parsed.data.active, ...bump },
  });

  const actor = await getCurrentUser();
  await logAudit({ user: actor?.name ?? "Sistema", action: "EDITÓ USUARIO", entity: parsed.data.id, detail: `${parsed.data.role} · ${parsed.data.active ? "activo" : "inactivo"}` });
  revalidatePath(PATH);
  return { ok: true };
}

export async function resetUserPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizeAction("Administrador");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = UserResetSchema.safeParse({ id: formData.get("id"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  const password = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: parsed.data.id },
    data: { password, mustChangePassword: true, sessionVersion: { increment: 1 } },
  });

  const actor = await getCurrentUser();
  await logAudit({ user: actor?.name ?? "Sistema", action: "RESETEÓ CONTRASEÑA", entity: parsed.data.id, detail: "Forzar cambio en próximo ingreso" });
  revalidatePath(PATH);
  return { ok: true };
}
```

- [ ] **Step 3: Página de usuarios (servidor)**

Crear `src/app/(app)/config/usuarios/page.tsx`:

```tsx
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/rbac";
import UsuariosClient, { type UserRow } from "./usuarios-client";

export default async function UsuariosPage() {
  await requireRole("Administrador");
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    initials: u.initials,
    active: u.active,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  }));

  return (
    <div>
      <PageHeader title="Usuarios" subtitle="Crea, edita y desactiva cuentas. Solo administradores." />
      <UsuariosClient rows={rows} />
    </div>
  );
}
```

- [ ] **Step 4: Componente cliente de usuarios**

Crear `src/app/(app)/config/usuarios/usuarios-client.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui";
import { createUser, updateUser, resetUserPassword } from "@/app/actions/users";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  initials: string;
  active: boolean;
  lastLoginAt: string | null;
};

const ROLES = ["Consulta", "Auditor", "Líder", "Administrador"];

export default function UsuariosClient({ rows }: { rows: UserRow[] }) {
  const [createState, createAction, creating] = useActionState(createUser, undefined);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-ink-800">Nuevo usuario</h3>
        <form action={createAction} className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <input name="name" placeholder="Nombre" className="rounded-md border border-ink-200 px-3 py-2 text-[13px]" />
          <input name="email" type="email" placeholder="correo@russellbedford.co" className="rounded-md border border-ink-200 px-3 py-2 text-[13px]" />
          <input name="initials" placeholder="Iniciales" maxLength={3} className="rounded-md border border-ink-200 px-3 py-2 text-[13px]" />
          <select name="role" defaultValue="Consulta" className="rounded-md border border-ink-200 px-3 py-2 text-[13px]">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input name="password" type="password" placeholder="Contraseña temporal" className="rounded-md border border-ink-200 px-3 py-2 text-[13px]" />
          <button type="submit" disabled={creating} className="rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
            {creating ? "Creando…" : "Crear"}
          </button>
        </form>
        {createState?.message && <p className="mt-2 text-xs text-err-700">{createState.message}</p>}
        {createState?.errors && (
          <p className="mt-2 text-xs text-err-700">
            {Object.values(createState.errors).flat().filter(Boolean)[0]}
          </p>
        )}
        {createState?.ok && <p className="mt-2 text-xs text-ok-700">Usuario creado. Deberá cambiar la contraseña al ingresar.</p>}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-ink-800">Usuarios ({rows.length})</h3>
        <div className="flex flex-col divide-y divide-ink-100">
          {rows.map((u) => <UserRowForm key={u.id} u={u} />)}
        </div>
      </Card>
    </div>
  );
}

function UserRowForm({ u }: { u: UserRow }) {
  const [editState, editAction, saving] = useActionState(updateUser, undefined);
  const [resetState, resetAction, resetting] = useActionState(resetUserPassword, undefined);

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-navy-700 text-[11px] font-semibold text-white">{u.initials}</span>
        <div className="min-w-[160px]">
          <div className="text-[13px] font-medium text-ink-800">{u.name}</div>
          <div className="text-[11px] text-ink-500">{u.email}</div>
        </div>
        <form action={editAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={u.id} />
          <input name="name" defaultValue={u.name} className="w-36 rounded-md border border-ink-200 px-2 py-1.5 text-[12px]" />
          <select name="role" defaultValue={u.role} className="rounded-md border border-ink-200 px-2 py-1.5 text-[12px]">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-[12px] text-ink-600">
            <input type="checkbox" name="active" defaultChecked={u.active} /> Activo
          </label>
          <button type="submit" disabled={saving} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-medium text-ink-700 disabled:opacity-60">
            {saving ? "…" : "Guardar"}
          </button>
        </form>
        <form action={resetAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={u.id} />
          <input name="password" type="password" placeholder="Nueva contraseña" className="w-40 rounded-md border border-ink-200 px-2 py-1.5 text-[12px]" />
          <button type="submit" disabled={resetting} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-medium text-ink-700 disabled:opacity-60">
            {resetting ? "…" : "Resetear"}
          </button>
        </form>
      </div>
      {(editState?.message || resetState?.message) && (
        <p className="mt-1 text-[11px] text-err-700">{editState?.message ?? resetState?.message}</p>
      )}
    </div>
  );
}
```

> Si `Card` no expone esa API o falta el tono `ok-700`, ajustar a los componentes/colores existentes en `src/components/ui` y `globals.css` (revisar antes de implementar).

- [ ] **Step 5: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Verificación manual**

Como Administrador, ir a `/config/usuarios`: crear un usuario, cambiarle el rol, desactivarlo y resetear su contraseña. Verificar en `db:studio` que `mustChangePassword` y `sessionVersion` cambian como se espera.

- [ ] **Step 7: Commit**

```bash
git add src/lib/definitions.ts src/app/actions/users.ts "src/app/(app)/config/usuarios"
git commit -m "feat(admin): gestión de usuarios (crear/editar/desactivar/resetear)"
```

---

## Task 12: Navegación condicionada por rol

**Files:**
- Modify: `src/lib/nav.ts`
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Añadir `minRole` a los items de navegación**

En `src/lib/nav.ts`, añadir el import del tipo y el campo `minRole`, y etiquetar las entradas restringidas:

```ts
import type { IconName } from "@/components/icons";
import type { Role } from "@/lib/roles";

export type NavChild = { label: string; href: string; count?: number };
export type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  count?: number;
  minRole?: Role;
  children?: NavChild[];
};
```

En `workNav`, cambiar la entrada de Auditoría a:

```ts
  { label: "Auditoría", href: "/auditoria", icon: "log", minRole: "Líder" },
```

Reemplazar `configNav` por:

```ts
export const configNav: NavItem[] = [
  { label: "Módulos y campos", href: "/config/modulos", icon: "settings", minRole: "Líder" },
  { label: "Clientes", href: "/config/clientes", icon: "users", minRole: "Líder" },
  { label: "Mapeos DIAN", href: "/config/dian", icon: "doc", minRole: "Líder" },
  { label: "Usuarios", href: "/config/usuarios", icon: "users", minRole: "Administrador" },
];
```

- [ ] **Step 2: Filtrar la navegación en el sidebar**

En `src/components/sidebar.tsx`, añadir el import `import { can } from "@/lib/roles";` y, dentro del componente (después de `const pathname = usePathname();`), derivar listas filtradas por rol:

```tsx
  const role = user?.role ?? "";
  const visibleWork = workNav.filter((it) => !it.minRole || can(role, it.minRole));
  const visibleConfig = configNav.filter((it) => !it.minRole || can(role, it.minRole));
```

Luego, sustituir en el JSX `workNav.map(` por `visibleWork.map(` y `configNav.map(` por `visibleConfig.map(`. (El `useState` inicial que recorre `workNav` para auto-expandir grupos puede dejarse igual: opera sobre grupos con `children`, ninguno de los cuales tiene `minRole`.)

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Verificación manual**

Como Auditor, el sidebar no muestra "Auditoría" ni la sección de Configuración. Como Líder, muestra Configuración pero no "Usuarios". Como Administrador, muestra todo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav.ts src/components/sidebar.tsx
git commit -m "feat(ui): ocultar enlaces de navegación según el rol (can)"
```

---

## Task 13: Quitar credenciales demo del login

**Files:**
- Modify: `src/app/login/page.tsx:49-59`
- Modify: `src/app/login/login-form.tsx:20`

- [ ] **Step 1: Quitar el recuadro de credenciales demo**

En `src/app/login/page.tsx`, eliminar por completo el bloque:

```tsx
          <div className="mt-8 rounded-md border border-ink-150 bg-white p-3.5 text-xs text-ink-500">
            <p className="font-semibold text-ink-700">Credenciales de demostración</p>
            <p className="mt-1.5">
              <span className="font-mono text-ink-700">admin@russellbedford.co</span>
              {" · "}
              <span className="font-mono text-ink-700">juliana@russellbedford.co</span>
            </p>
            <p className="mt-0.5">
              Contraseña: <span className="font-mono text-ink-700">Russell2026*</span>
            </p>
          </div>
```

- [ ] **Step 2: Quitar el email precargado**

En `src/app/login/login-form.tsx`, en el `<input id="email" ...>`, eliminar la línea:

```tsx
          defaultValue="admin@russellbedford.co"
```

- [ ] **Step 3: Verificación manual**

Cargar `/login`: el campo de correo está vacío y no se muestran credenciales.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx src/app/login/login-form.tsx
git commit -m "fix(seguridad): quitar credenciales demo y email precargado del login"
```

---

## Task 14: Verificación final

**Files:** (ninguno — verificación)

- [ ] **Step 1: Suite de tests**

Run: `npm run test`
Expected: PASS (incluye `roles`, `jwt`, `login-throttle`, `definitions`, `format`).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: compila sin errores.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 4: Recorrido manual de criterios de aceptación**

- Login bloquea tras 5 fallos en 15 min (mensaje genérico).
- La bitácora `/auditoria` registra IP real (no `"interno"`).
- Auditor no puede entrar a `/config/*` ni `/auditoria` (redirige) ni borrar clientes.
- Consulta no puede operar (acciones devuelven/redirigen sin efecto).
- Desactivar un usuario o resetear su contraseña invalida su sesión en el siguiente request.
- Tras reseteo, el usuario es enviado a `/cambiar-contrasena` y no puede usar la app hasta cambiarla.
- La página de login no muestra credenciales ni precarga el correo.

- [ ] **Step 5: Commit final (si quedaron ajustes)**

```bash
git add -A
git commit -m "chore: verificación final del endurecimiento de login/auth"
```

---

## Notas para el implementador

- **`server-only`**: `jwt.ts`, `roles.ts` y `login-throttle.ts` NO deben importar `server-only` (se prueban en Node). `session.ts`, `dal.ts`, `rbac.ts`, `request.ts`, `audit.ts` sí.
- **No probar con mocks frágiles**: la lógica con DB/cookies (`login`, `verifySession`) se valida manualmente (pasos indicados); los tests automáticos cubren las unidades puras. Es la convención actual del repo (`definitions.test.ts`, `format.test.ts`).
- **Fuera de alcance (post-piloto)**: headers de seguridad (CSP/HSTS), MFA, idle timeout, sesiones en DB (Opción B), reset self-service por correo.
