# Russell Conciliador

Plataforma de conciliación y diagnóstico contable y tributario en producción,
con Next.js 16, React 19, TypeScript, Prisma 7 y PostgreSQL.

## Estructura de la base de datos

- `prisma/schema.prisma`: modelo usado por el código de esta aplicación.
- `prisma/migrations/`: historial de migraciones versionadas; se conserva íntegro.
- `prisma/estructura-actual/estructura.sql`: exportación de la estructura consultada
  directamente en PostgreSQL, incluidas tablas, columnas, índices, secuencias,
  restricciones, funciones y triggers. Es DDL portable, sin propietarios ni
  permisos/GRANT de PostgreSQL; no contiene filas de negocio.
- `prisma/estructura-actual/estructura.json`: inventario de tablas y columnas,
  versión del servidor, fecha de consulta y SHA-256 del SQL.
- `prisma/estructura-actual/diferencias-con-modelo.sql`: diferencias detectadas
  entre el modelo local y el servidor al preparar la instantánea; es una referencia
  de revisión, no una migración para ejecutar automáticamente.

Para actualizar la exportación desde la conexión configurada en `DATABASE_URL`:

```bash
npm run db:exportar:estructura
# Directorio alternativo:
npm run db:exportar:estructura -- --salida /ruta/del/paquete/estructura
```

El comando consulta catálogos del servidor, ejecuta `pg_dump --schema-only` y
regenera la comparación de solo lectura con el modelo local (`prisma migrate diff`).
Requiere las herramientas cliente de PostgreSQL (`pg_dump` en PATH o
`PG_DUMP_PATH` con su ruta). Para leer el SQL con `psql`, usa un cliente de la
misma versión o posterior a la de `pg_dump` indicada en `estructura.json`.
No cambia tablas ni registros y no exporta
contraseñas de conexión. La estructura SQL no incluye usuarios de la aplicación,
clientes, balances ni la configuración guardada como filas en tablas.

La instantánea del 7 de octubre de 2026 corresponde a PostgreSQL 16.14 y 99 tablas
(incluida `_prisma_migrations`). Aunque las 145 migraciones locales figuran
aplicadas, el servidor contiene columnas adicionales y la tabla
`pares_depreciacion_modulo` que no están en el modelo local. La diferencia queda
registrada junto al SQL; preparar un paquete debe usar la instantánea real y
reconciliar esta diferencia con la revisión del código que se despliegue.

## Operación en producción

Requisitos: Node.js compatible con Next.js 16 (mínimo 20.9), PostgreSQL y las
variables privadas de la instalación. `.env` es local y no se versiona.

Variables esenciales:

- `DATABASE_URL`: conexión a la base correspondiente a la instalación.
- `SESSION_SECRET`: secreto propio de esa instalación.
- `ANTHROPIC_API_KEY`: extracción de balances con IA.
- Variables S3/R2 del almacenamiento de fotos y de evidencias de tickets, cuando
  se habiliten esas funciones; consultar sus nombres en `CLAUDE.md` y en el código.
- `NEXT_DEPLOYMENT_ID`: mismo identificador al construir y arrancar la aplicación.

Para actualizar una instalación existente, con un respaldo previo y la revisión
correcta del código:

```bash
npm ci
npm run db:status
npm run db:deploy
export NEXT_DEPLOYMENT_ID=$(git rev-parse --short HEAD)
npm run build
npm start
```

El gestor de procesos del servidor debe conservar el entorno usado durante el
build. `db:deploy` aplica las migraciones pendientes y no propone reiniciar la base.
La exportación SQL conserva la estructura lógica, pero no reconstruye propietarios
ni permisos de usuarios PostgreSQL. No debe restaurarse
encima de una base existente ni combinarse con `migrate deploy` en una base nueva
sin definir antes su línea base de migraciones.

## Catálogos operativos

El proyecto no incluye cargas de usuarios, clientes, balances o resultados ficticios,
ni cuentas con contraseña compartida. En una base nueva, la configuración y los
usuarios se provisionan para la instalación real.

`npm run db:inicializar:rbac` agrega los roles, permisos y concesiones mínimas del
catálogo del código. No crea usuarios, jerarquías ni responsables; no es una copia
de los permisos configurados en producción. Conserva filas y ediciones existentes,
pero agrega concesiones predeterminadas faltantes, por lo que se reserva para la
inicialización de una base nueva.

Se conservan las utilidades operativas de PUC, subgrupos, prompts y permisos.
`db:sync:rbac` muestra diferencias por defecto; con `-- --aplicar` también revoca
concesiones que no estén en el catálogo. Los catálogos y las novedades se cargan
solo cuando corresponde a una operación autorizada, no como parte del despliegue.

## Comandos

| Comando | Uso |
|---------|-----|
| `npm run db:status` | Revisar migraciones aplicadas y pendientes |
| `npm run db:deploy` / `npm run db:migrate` | Aplicar migraciones versionadas |
| `npm run db:exportar:estructura` | Exportar únicamente la estructura real de PostgreSQL |
| `npm run db:inicializar:rbac` | Inicializar catálogo mínimo de permisos en una base nueva |
| `npm run db:sync:rbac` | Comparar matriz de permisos, sin cambios por defecto |
| `npm run build` | Construir la aplicación para producción |
| `npm start` | Servir la compilación |
| `npm run test` | Ejecutar pruebas automatizadas aisladas |
| `npm run lint` | Revisar el código con ESLint |
| `npx tsc --noEmit` | Comprobar tipos |

`npm run dev` y `npm run db:migrate:dev` quedan como herramientas de desarrollo;
no forman parte del procedimiento de producción ni generan datos ficticios.
