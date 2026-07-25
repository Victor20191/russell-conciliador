<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Convención de base de datos (OBLIGATORIO)

Toda la base de datos de esta plataforma debe estar en **español**:

- **Tablas:** todas las tablas de la base de datos deben crearse y nombrarse en español.
- **Columnas:** todas las columnas (campos) de las tablas deben estar en español.
- **Estilo:** usar `snake_case` en español para los nombres físicos en PostgreSQL (p. ej. `nombre_cliente`, `creado_en`).

Implementación con Prisma:

- En `prisma/schema.prisma` los **nombres físicos** de tablas y columnas se definen en español mediante los atributos `@@map("tabla_en_espanol")` (a nivel de modelo) y `@map("columna_en_espanol")` (a nivel de campo).
- Los identificadores del modelo Prisma (usados en el código TypeScript) pueden permanecer en inglés, pero el objeto real en la base de datos SIEMPRE debe quedar en español.
- Al crear cualquier modelo o campo nuevo, agregar de inmediato su `@@map`/`@map` en español. Ninguna tabla o columna nueva debe llegar a la base de datos con el nombre en inglés.

# Agente permanente del proyecto

Para trabajos que impliquen revisar el código, implementar cambios y decidir si
la plataforma merece una nueva versión, usar el subagente de Claude Code:

`russell-lfm-evolucion`

Su definición vive en `.claude/agents/russell-lfm-evolucion.md`. También se puede
pedir explícitamente: «Usa `russell-lfm-evolucion` para revisar e implementar
este cambio». El agente debe conservar estas reglas, aunque la solicitud venga
de otro agente o de otra herramienta.

## Política de versionamiento de Russell LFM

La versión actual y la fuente de respaldo técnica viven en `package.json`. La
versión que ve el usuario prioriza la última versión `publicada` en
`versiones_plataforma`; una versión creada como borrador no se considera
publicada. El flujo existente para preparar una release es:

```bash
npm run version:release -- --bump patch|minor|major --title "..." --db
```

No se debe subir versión por cada commit. El agente debe clasificar el cambio
después de implementarlo y validarlo:

- `patch`: corrección funcional, seguridad, regresión o rendimiento que no
  agrega una capacidad nueva ni rompe contratos.
- `minor`: capacidad funcional nueva y terminada para usuarios, un flujo
  importante nuevo, o una mejora funcional amplia y compatible que cambie de
  manera relevante la operación de la plataforma.
- `major`: cambio incompatible de contrato, datos, permisos, integración o
  flujo; migración que requiera intervención especial; o retiro/renombrado de
  una capacidad pública.
- Sin release: estilos, textos, documentación, pruebas, refactors internos,
  limpieza, ajustes menores de UX y correcciones que no cambien de forma
  relevante el comportamiento desplegado.

Una release solo se prepara cuando el cambio está implementado, las pruebas
relevantes pasan y el agente puede describir el impacto funcional. La creación
del borrador en BD (`--db`) no publica nada: la publicación final en
`/novedades` corresponde a un administrador después del despliegue. No hacer
commit, tag ni push salvo solicitud explícita del usuario.
