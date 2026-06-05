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
