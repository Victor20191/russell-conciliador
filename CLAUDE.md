# CLAUDE.md

Guía para Claude Code en este repositorio.

@AGENTS.md

> Las dos reglas de `AGENTS.md` son OBLIGATORIAS y mandan sobre todo lo demás:
> 1. Next.js 16 tiene cambios de ruptura: consulta `node_modules/next/dist/docs/` antes de escribir código de framework.
> 2. La base de datos física va SIEMPRE en español vía `@@map`/`@map` (snake_case). Los identificadores Prisma quedan en inglés.

## Comandos

```bash
npm run dev                         # desarrollo (Next 16 con --webpack, http://localhost:3000)
npm run build                       # build de producción (prebuild ejecuta `prisma generate`)
npm run lint                        # ESLint — NO typechequea
npx tsc --noEmit                    # verificación de tipos (el gate real)
npm run test                        # Vitest (una pasada); test:watch en modo watch
npx vitest run ruta/archivo.test.ts # un archivo
npx vitest run -t "nombre"          # por nombre
npm run db:migrate                  # prisma migrate deploy
npm run db:status                   # estado de migraciones (solo lectura)
```

- **`.env` apunta a la BD de PRODUCCIÓN.** Antes de correr cualquier script de escritura, verifica destino y efecto. `db:migrate:dev` solo en bases de desarrollo (puede proponer reset). Los scripts de mantenimiento (`db:*`) simulan por defecto y escriben con `--aplicar`; no se ejecutan como pasos automáticos de despliegue.
- Pruebas junto al código (`*.test.ts`, entorno `node`). Tras editar `schema.prisma`, `prisma generate`.
- Golden tests del borrador de balance (`src/lib/balance/golden.test.ts`): cualquier cambio en la lógica del borrador debe mantenerlos verdes.
- Versionado: `npm run version:release -- --bump patch|minor|major --title "..." --db` (solo crea borrador; política en `AGENTS.md`). No commit/tag/push sin pedirlo.

## Arquitectura (resumen)

Next.js 16 (App Router, React 19, Tailwind v4) + Server Actions + Prisma 7/PostgreSQL. Sin `next-auth`. Alias `@/*` → `src/*`.

- **Auth en dos capas**: `src/proxy.ts` (reemplaza a `middleware.ts`; solo valida el JWT, sin BD) y `src/lib/dal.ts` (`verifySession`/`getCurrentUser`: autoridad real, consulta BD y revoca por `sessionVersion`).
- **RBAC**: la MATRIZ rol×permiso es la autoridad, no la jerarquía. Permisos `"<modulo>:<accion>"`; fuente única en `src/lib/rbac/catalogo.ts`. Gates en `src/lib/rbac.ts`: `requirePermiso` (páginas/acciones `void`) y `authorizePermiso` (acciones con `ActionState`). Sobre datos de un cliente, pasar `{ clientId }` (exige además alcance; `null` deniega). Código nuevo autoriza por permiso, nunca por rango (`roles.ts`/`can()` es legado). Tras cambiar permisos: `npm run db:sync:rbac` (simulación) y subir el tag de caché de `getMatriz()`.
- **Publicación de módulos** (`src/lib/rbac/publicacion.ts`): controla qué se muestra; no concede permisos.
- **Balance**: encabezado + detalle normalizados (`balance_prueba_encabezado`/`_detalle`); los agregados se recalculan al leer (`src/lib/balance/calcular.ts`). Extracción con IA en `src/lib/balance/extraccion/` (Anthropic en producción).
- **Módulos** (INV, CAR, CXP, ING, AFI, NOM): un solo motor parametrizado por descriptor en `src/lib/modulos/descriptores.ts`; lógica pura en `src/lib/modulos/*`, BD solo en `src/app/actions/modulos-datos.ts`. El cruce contable compara contra el saldo final de un balance cerrado.
- **Conciliación en firme**: al cerrar, el período queda de solo lectura; las protecciones viven en `src/lib/conciliacion/verificar-bloqueo.ts`.
- **Ayuda en pantalla** (`src/lib/ayuda/fichas/`, reglas en `reglas.ts`).
- Más detalle: `README.md`, `docs/` (p. ej. `carga-balance.md`, `balances-por-corte.md`, `marca-corporativa.md`) y `pendientes.md`. Para cambios funcionales, usar el agente `russell-conciliador-evolucion`.

## Convenciones

- **Server Actions** (`src/app/actions/*.ts`, referencia `users.ts`): `"use server"` → autorizar → validar con Zod (`safeParse`, esquemas en `src/lib/definitions.ts`) → `try/catch`. En el catch: `ActionState` devuelve `{ ok:false, message: mensajeErrorBD(ctx, e) }`; acciones `void` llaman `registrarError(ctx, e)` y relanzan. Tras mutar: `logAudit(...)` y `revalidatePath(...)`. No capturar `redirect()` en catches genéricos ni convertir errores de autorización en éxito.
- **Lógica pura y testeable** en `src/lib/**` (sin BD); lo que toca BD va en archivos `*-servidor.ts`/`server-only` o en la Server Action.
- **Prisma**: importar desde `src/generated/prisma` (no `@prisma/client`). IDs autoincrementales; códigos de negocio como columnas `@unique`. FK suaves hacia `User`/`Client` (solo el `Int`, sin `@relation`): limpiar dependencias a mano al borrar.
- **Zona horaria**: la sesión de BD debe ser UTC; nunca fijar `-c timezone` en el cliente. La hora de Colombia se aplica al presentar (`src/lib/fecha-hora.ts`).
- **Route handlers** que mutan o disparan trabajo costoso: validar con `esMismoOrigen` (`src/lib/http/origen.ts`).
- **Modales** (`src/components/modal.tsx`): se cierran solo con la X; sin Escape/backdrop. Nunca un botón «Cerrar» en el footer.
- **UI**: toasts con `notifySuccess/Error/Info` (`src/lib/client-notifications.ts`); no usar `confirm()`, `alert()` ni `prompt()`.
- **Marca Russell Bedford** (`docs/marca-corporativa.md`): solo la paleta oficial (`src/lib/marca/paleta.ts`, clases de Tailwind de la marca) y Lato/Arial; símbolos fuera de Lato/Arial van como ícono SVG (`Icon`/`IconoEnTexto`). Excel con `escribirLibroMarca`. `marca.test.ts` lo vigila.
- **Fichas de ayuda**: si un cambio altera una acción, quién la hace o sus condiciones, actualizar la ficha (y su regla) en el mismo cambio, describiendo el sistema como funciona hoy (sin fechas ni historia), e informarlo en el resumen.
- **Excel**: generadores puros en `src/lib/export/`; la route handler reverifica permiso y alcance.
- **Textos y comentarios** en español.
