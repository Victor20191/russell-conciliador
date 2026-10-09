import "dotenv/config";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function localizarPgDump(): Promise<string> {
  const candidatos = process.env.PG_DUMP_PATH
    ? [process.env.PG_DUMP_PATH]
    : [
        ...(process.env.PATH ?? "").split(delimiter).map((ruta) => join(ruta, "pg_dump")),
        "/usr/local/opt/libpq/bin/pg_dump",
        "/opt/homebrew/opt/libpq/bin/pg_dump",
      ];
  for (const candidato of candidatos) {
    try {
      await access(candidato, constants.X_OK);
      return candidato;
    } catch {
      // Probar la siguiente instalación local.
    }
  }
  throw new Error("No se encontró pg_dump. Instala las herramientas de PostgreSQL o define PG_DUMP_PATH.");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 0 && (args.length !== 2 || args[0] !== "--salida")) {
    throw new Error("Uso: npm run db:exportar:estructura -- [--salida <directorio>]");
  }
  const url = new URL(process.env.DATABASE_URL ?? "");
  const directorio = resolve(args[1] ?? "prisma/estructura-actual");
  const archivo = join(directorio, "estructura.sql");
  const temporal = `${archivo}.${process.pid}.tmp`;
  const archivoDiferencias = join(directorio, "diferencias-con-modelo.sql");
  const diferenciasTemporal = `${archivoDiferencias}.${process.pid}.tmp`;
  const pgDump = await localizarPgDump();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString(), connectionTimeoutMillis: 15000 }),
  });
  try {
    // Solo catálogos del servidor: no consulta filas de negocio.
    const estructura = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const servidor = await tx.$queryRaw<Array<{ base: string; version: string; admite_timeout_transaccion: boolean }>>`
        SELECT current_database() AS base, current_setting('server_version') AS version,
          current_setting('transaction_timeout', true) IS NOT NULL AS admite_timeout_transaccion
      `;
      const tablas = await tx.$queryRaw<Array<{ esquema: string; tabla: string; tipo: string }>>`
        SELECT table_schema AS esquema, table_name AS tabla, table_type AS tipo
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name
      `;
      const columnas = await tx.$queryRaw<Array<{
        esquema: string; tabla: string; columna: string; tipo: string;
        permite_nulos: string; valor_predeterminado: string | null;
      }>>`
        SELECT table_schema AS esquema, table_name AS tabla, column_name AS columna,
          data_type AS tipo, is_nullable AS permite_nulos, column_default AS valor_predeterminado
        FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name, ordinal_position
      `;
      return { servidor: servidor[0], tablas, columnas };
    });
    await mkdir(directorio, { recursive: true });
    const entorno = {
      ...process.env,
      PGHOST: url.hostname.replace(/^\[|\]$/g, ""),
      PGPORT: url.port || "5432",
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGCONNECT_TIMEOUT: "15",
      PGOPTIONS: `${process.env.PGOPTIONS ?? ""} -c default_transaction_read_only=on`.trim(),
      ...(url.searchParams.has("sslmode") ? { PGSSLMODE: url.searchParams.get("sslmode")! } : {}),
    };
    await new Promise<void>((resuelto, rechazado) => {
      // La contraseña nunca aparece en argumentos, archivos de salida ni logs.
      const proceso = spawn(pgDump, [
        "--schema-only", "--no-owner", "--no-privileges", "--no-password", "--file", temporal,
      ], { env: entorno, stdio: ["ignore", "ignore", "pipe"] });
      let errores = "";
      proceso.stderr.setEncoding("utf8");
      proceso.stderr.on("data", (texto: string) => { errores += texto; });
      proceso.once("error", rechazado);
      proceso.once("close", (codigo) => {
        if (codigo === 0) resuelto();
        else {
          const sinUrl = errores.replaceAll(url.toString(), "[DATABASE_URL]");
          const detalle = url.password ? sinUrl.replaceAll(decodeURIComponent(url.password), "[oculto]") : sinUrl;
          rechazado(new Error(`pg_dump falló (${codigo}): ${detalle}`));
        }
      });
    });
    await new Promise<void>((resuelto, rechazado) => {
      // El diff también es de solo lectura; nunca se pasa a db execute.
      const proceso = spawn(process.execPath, [
        resolve("node_modules/prisma/build/index.js"), "migrate", "diff",
        "--from-schema", "prisma/schema.prisma", "--to-config-datasource",
        "--script", "--output", diferenciasTemporal,
      ], { stdio: ["ignore", "ignore", "pipe"] });
      let errores = "";
      proceso.stderr.setEncoding("utf8");
      proceso.stderr.on("data", (texto: string) => { errores += texto; });
      proceso.once("error", rechazado);
      proceso.once("close", (codigo) => {
        if (codigo === 0) resuelto();
        else rechazado(new Error(`No fue posible comparar el modelo con el servidor (${codigo}): ${errores.replaceAll(url.toString(), "[DATABASE_URL]")}`));
      });
    });
    const diferencias = "-- REFERENCIA DE REVISION: NO EJECUTAR COMO MIGRACION.\n"
      + `-- Diferencias modelo local -> servidor consultado en ${new Date().toISOString()}.\n`
      + "-- La estructura completa consultada está en estructura.sql.\n\n"
      + await readFile(diferenciasTemporal, "utf8");
    await writeFile(diferenciasTemporal, diferencias);
    let sql = await readFile(temporal, "utf8");
    const ajustesCompatibilidad: string[] = [];
    // Clientes pg_dump recientes incluyen este SET incluso al exportar un
    // servidor que no lo admite. Se omite solo esa opción, sin alterar DDL.
    if (!estructura.servidor.admite_timeout_transaccion && sql.includes("SET transaction_timeout = 0;\n")) {
      sql = sql.replace("SET transaction_timeout = 0;\n", "");
      ajustesCompatibilidad.push("Omitido SET transaction_timeout: el servidor de origen no admite esa opción.");
      await writeFile(temporal, sql);
    }
    if (!sql.includes("CREATE TABLE")) throw new Error("La exportación no contiene tablas.");
    await rename(temporal, archivo);
    await rename(diferenciasTemporal, archivoDiferencias);
    await writeFile(join(directorio, "estructura.json"), JSON.stringify({
      generado_en: new Date().toISOString(),
      solo_estructura: true,
      origen: "DATABASE_URL del entorno; consulta directa de PostgreSQL",
      version_pg_dump: sql.match(/-- Dumped by pg_dump version ([^\n]+)/)?.[1] ?? "desconocida",
      ajustes_de_compatibilidad: ajustesCompatibilidad,
      ...estructura,
      sha256_sql: createHash("sha256").update(sql).digest("hex"),
      sha256_diferencias: createHash("sha256").update(diferencias).digest("hex"),
    }, null, 2) + "\n");
    console.log(`Estructura exportada: ${estructura.tablas.filter((t) => t.tipo === "BASE TABLE").length} tablas · ${archivo}`);
  } finally {
    await rm(temporal, { force: true });
    await rm(diferenciasTemporal, { force: true });
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : "Error desconocido";
  console.error(mensaje.replaceAll(process.env.DATABASE_URL ?? "[sin conexión]", "[DATABASE_URL]"));
  process.exitCode = 1;
});
