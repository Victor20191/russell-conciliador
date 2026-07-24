// ============================================================
// Release de versión de la plataforma (package.json + checklist).
//
// Uso:
//   npm run version:release -- --bump minor
//   npm run version:release -- --bump patch
//   npm run version:release -- --bump major
//   npm run version:release -- 1.6.0
//   npm run version:release -- 1.6.0 --title "Carga de balance v2"
//   npm run version:release -- --bump minor --db   # también crea borrador en BD
//   npm run version:release -- --dry-run --bump minor
//
// Qué hace:
//   1. Calcula la nueva versión (explícita o bump desde package.json).
//   2. Escribe package.json (salvo --dry-run).
//   3. Opcional (--db): crea PlatformVersion en borrador si no existe.
//   4. Imprime checklist para /novedades y git tag.
//
// NO publica la versión en /novedades: eso lo hace un admin desde la UI.
// ============================================================

import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bumpSemVer, parseSemVer, type BumpSemVer } from "../src/lib/version-app";

const ROOT = process.cwd();
const PKG_PATH = join(ROOT, "package.json");

type Args = {
  version: string | null;
  bump: BumpSemVer | null;
  title: string | null;
  dryRun: boolean;
  db: boolean;
};

function usage(): never {
  console.error(`
Uso:
  npm run version:release -- --bump minor|major|patch [--title "..."] [--db] [--dry-run]
  npm run version:release -- 1.6.0 [--title "..."] [--db] [--dry-run]
`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    version: null,
    bump: null,
    title: null,
    dryRun: false,
    db: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--db") out.db = true;
    else if (a === "--bump") {
      const v = argv[++i] as BumpSemVer | undefined;
      if (!v || !["major", "minor", "patch"].includes(v)) usage();
      out.bump = v;
    } else if (a === "--title") {
      out.title = argv[++i] ?? null;
      if (!out.title) usage();
    } else if (a === "--help" || a === "-h") usage();
    else if (a.startsWith("-")) {
      console.error(`Flag desconocida: ${a}`);
      usage();
    } else if (!out.version) {
      out.version = a;
    } else {
      usage();
    }
  }
  if (!out.version && !out.bump) usage();
  if (out.version && out.bump) {
    console.error("Usa versión explícita O --bump, no ambos.");
    usage();
  }
  return out;
}

function leerPackage(): { raw: string; json: Record<string, unknown>; version: string } {
  const raw = readFileSync(PKG_PATH, "utf8");
  const json = JSON.parse(raw) as Record<string, unknown>;
  const version = typeof json.version === "string" ? json.version : "0.0.0";
  return { raw, json, version };
}

function escribirPackage(json: Record<string, unknown>): void {
  // Preserva formato de 2 espacios típico de npm.
  writeFileSync(PKG_PATH, `${JSON.stringify(json, null, 2)}\n`, "utf8");
}

async function crearBorradorBd(opts: {
  number: string;
  title: string;
}): Promise<"creada" | "ya_existe" | "error"> {
  if (!process.env.DATABASE_URL) {
    console.warn("⚠️  DATABASE_URL no definida: se omite --db.");
    return "error";
  }
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const dup = await prisma.platformVersion.findUnique({
      where: { number: opts.number },
      select: { id: true, status: true },
    });
    if (dup) {
      console.log(
        `ℹ️  Ya existe versiones_plataforma «${opts.number}» (id=${dup.id}, estado=${dup.status}). No se recrea.`,
      );
      return "ya_existe";
    }
    const maxOrder = await prisma.platformVersion.aggregate({ _max: { order: true } });
    const order = (maxOrder._max.order ?? 0) + 10;
    await prisma.platformVersion.create({
      data: {
        number: opts.number,
        title: opts.title,
        summary: null,
        status: "borrador",
        releasedAt: null,
        order,
      },
    });
    console.log(`✅ Borrador creado en BD: ${opts.number} · ${opts.title} (orden ${order}).`);
    return "creada";
  } catch (e) {
    console.error("❌ No se pudo crear el borrador en BD:", e);
    return "error";
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pkg = leerPackage();
  const actual = pkg.version;

  let nueva: string;
  if (args.version) {
    if (!parseSemVer(args.version)) {
      console.error(`Versión inválida «${args.version}»: se espera SemVer (p. ej. 1.5.0).`);
      process.exit(1);
    }
    nueva = args.version.replace(/^v/i, "");
  } else {
    nueva = bumpSemVer(actual, args.bump!);
  }

  const title =
    args.title?.trim() ||
    `Release ${nueva}`;

  console.log("");
  console.log("📦 Release de versión Russell LFM");
  console.log("─────────────────────────────────");
  console.log(`  package.json actual : ${actual}`);
  console.log(`  nueva versión       : ${nueva}`);
  console.log(`  título (novedades)  : ${title}`);
  console.log(`  dry-run             : ${args.dryRun ? "sí" : "no"}`);
  console.log(`  crear borrador BD   : ${args.db ? "sí" : "no"}`);
  console.log("");

  if (actual === nueva) {
    console.warn("⚠️  La versión nueva es igual a la actual. Nada que escribir en package.json.");
  } else if (args.dryRun) {
    console.log(`🔎 [dry-run] Se escribiría package.json → version: "${nueva}"`);
  } else {
    pkg.json.version = nueva;
    escribirPackage(pkg.json);
    console.log(`✅ package.json actualizado a ${nueva}`);
  }

  if (args.db) {
    if (args.dryRun) {
      console.log(`🔎 [dry-run] Se crearía borrador PlatformVersion ${nueva} · ${title}`);
    } else {
      await crearBorradorBd({ number: nueva, title });
    }
  }

  console.log(`
Checklist de release
────────────────────
1. Documenta los cambios importantes en /novedades:
   · Abre o crea la versión ${nueva} (estado borrador).
   · Agrega cada cambio (nueva / mejora / corrección / seguridad).
   · Completa «cómo operar», ejemplo y ruta interna cuando aplique.
2. Publica la versión en /novedades cuando el deploy salga a producción
   (estado «publicada» → sella la fecha y actualiza el badge del menú).
3. (Opcional) Tag de git:
   git tag -a v${nueva} -m "Release ${nueva}: ${title}"
   git push origin v${nueva}
4. (Opcional) Volcar commits del día como borradores:
   npm run novedades:commits

Notas
─────
· La UI muestra la última versión PUBLICADA de la BD; package.json es el
  respaldo de build y la referencia técnica del paquete.
· Los borradores dev-AAAA-MM-DD de npm run novedades:commits NO sustituyen
  un release SemVer: revísalos, consolídalos en ${nueva} y publícala.
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
