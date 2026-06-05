# Russell Bedford · Conciliador / Diagnóstico

Plataforma de conciliación y diagnóstico contable y tributario, migrada del prototipo
original (React sobre Babel en el navegador) a una aplicación **Next.js 16** completa con
backend real, autenticación y persistencia en **PostgreSQL** vía **Prisma**.

## Stack

| Capa | Tecnología |
|------|------------|
| Framework | **Next.js 16.2.7** (App Router · Turbopack · React 19.2) |
| Estilos | **Tailwind CSS v4** (tokens institucionales en `@theme`) |
| ORM / BD | **Prisma 7.8** + **PostgreSQL** (driver adapter `@prisma/adapter-pg`) |
| Autenticación | Patrón nativo de Next 16: **credenciales (email/contraseña)** con **bcrypt** + **sesión JWT** firmada con **Jose**, cookies `httpOnly`, DAL y protección por `proxy.ts` |
| Validación | **Zod 4** |
| Lenguaje | **TypeScript 5** |

### Nota sobre autenticación

Se eligió el **patrón de autenticación nativo documentado por Next.js 16** en lugar de
`next-auth`/Auth.js v5 porque este último sigue en beta/RC y arrastra fricciones con Next 16
(el renombrado `middleware.ts` → `proxy.ts` y el adapter de Prisma en el runtime edge).
El resultado funcional es idéntico al solicitado: **login con credenciales propias +
sesión JWT**. Migrar a `next-auth` más adelante es directo (los modelos `User` ya existen).

## Requisitos

- Node.js ≥ 20.9 (probado con 22.16)
- PostgreSQL ≥ 14 corriendo en `localhost:5432`

## Puesta en marcha

```bash
# 1. Instalar dependencias (genera el cliente Prisma automáticamente)
npm install

# 2. Configurar variables de entorno
cp .env.example .env
#   - DATABASE_URL: cadena de conexión a PostgreSQL
#   - SESSION_SECRET: genera uno con  openssl rand -base64 32

# 3. Crear la base de datos (si no existe)
createdb russell_lfm

# 4. Aplicar el esquema y los datos de ejemplo
npm run db:migrate     # aplica las migraciones
npm run db:seed        # carga datos demo (clientes, balances, DIAN, etc.)

# 5. Arrancar en desarrollo
npm run dev            # http://localhost:3000
```

## Credenciales de demostración

| Correo | Rol | Contraseña |
|--------|-----|------------|
| `admin@russellbedford.co` | Auditor Senior | `Russell2026*` |
| `juliana@russellbedford.co` | Auditor Junior | `Russell2026*` |

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo (Turbopack) |
| `npm run build` | Build de producción |
| `npm start` | Servir el build de producción |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Crear/aplicar migraciones Prisma |
| `npm run db:seed` | Cargar datos de ejemplo |
| `npm run db:studio` | Prisma Studio (explorador de BD) |

## Rutas del menú

```
/login                         Inicio de sesión (público)
/dashboard                     Inicio — resumen (datos de Prisma)
/balance                       Balance de comprobación — repositorio (Prisma)
/balance/[id]                  Detalle de balance: sumas, validaciones, desglose (Prisma)
/balance/mapeo                 Mapeo plan estándar — PUC de la firma (Prisma)
/balance/estado-resultado      Estado de Resultado
/razonabilidad                 Análisis de razonabilidad
/conciliacion/nueva            Asistente de nueva conciliación
/conciliacion/en-proceso       Conciliaciones con diferencias/revisión (Prisma)
/conciliacion/resultados       Histórico de cruces (Prisma)
/dian                          Impuestos · DIAN — formatos y períodos (Prisma)
/requerimientos                Requerimientos de información
/calendario                    Calendario tributario y de cierres
/auditoria                     Registro de auditoría (Prisma)
/config/modulos                Módulos y campos (Prisma)
/config/clientes               Clientes y parametrización (Prisma)
/config/dian                   Mapeos DIAN
```

Las rutas marcadas **(Prisma)** ya leen de la base de datos. El resto están enrutadas y
con UI base, listas para migración progresiva del detalle desde el prototipo original.

## Estructura

```
prisma/
  schema.prisma          Modelos (User, Client, Module, Reconciliation, Balance, DianForm…)
  seed.ts                Datos de ejemplo (portados de los mocks *.jsx del prototipo)
src/
  proxy.ts               Protección de rutas (sustituye a middleware en Next 16)
  generated/prisma/      Cliente Prisma generado
  lib/
    prisma.ts            Singleton de PrismaClient con driver adapter
    session.ts           JWT (Jose) + cookies httpOnly
    dal.ts               verifySession / getCurrentUser (capa de acceso a datos)
    definitions.ts       Esquemas Zod y tipos
    nav.ts, format.ts    Navegación y helpers de formato
  components/            Sidebar, Topbar, Icon/BrandMark, UI compartida
  app/
    layout.tsx           Layout raíz (fuentes IBM Plex / Newsreader)
    login/               Página de login + Server Action
    actions/auth.ts      Server Actions: login / logout
    (app)/               Grupo de rutas protegidas (layout con Sidebar + Topbar)
```
