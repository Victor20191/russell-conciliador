// ============================================================
// Manual de usuario en PDF, armado con las fichas de la ayuda en pantalla.
//
// Es el mismo contenido del botón «?»: pantalla por pantalla, qué se puede hacer, quién lo
// puede hacer y con qué condiciones, más el ciclo del cliente. «¿Quién hace qué?» no va (es un
// documento aparte que Russell valida). Las pantallas de los seis módulos se describen una vez,
// con lo propio de cada módulo marcado.
//
// Los roles salen de la matriz y la publicación de módulos de la BASE (solo lectura), igual
// que en la plataforma. Imprime con el Chrome o el Edge instalados (Playwright con `channel`).
//
// Ejecutar:
//   npm run manual:ayuda                       # output/manual/Manual_de_usuario_Russell_Conciliador_v<versión>.pdf
//   npm run manual:ayuda -- --salida <ruta.pdf>
// ============================================================

import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PASOS_CICLO } from "../src/lib/ayuda/ciclo";
import { fichaAyuda, permisosAyuda } from "../src/lib/ayuda/fichas";
import { combinarVariantes, fichaManual, MARCADOR_MODULO, type FichaManual } from "../src/lib/ayuda/manual/combinar";
import { estilosManual } from "../src/lib/ayuda/manual/estilos";
import { documentoManual, unidadesManual, type CapituloManual, type DatosManual } from "../src/lib/ayuda/manual/html";
import { AREAS_QUIEN_HACE_QUE } from "../src/lib/ayuda/quien-hace-que";
import type { FichaId } from "../src/lib/ayuda/resolver";
import { rolesPorPermiso } from "../src/lib/ayuda/roles";
import { cssFuentesLato, glifosDeDocumentoSoloLato, RUTA_LOGO_BLANCO } from "../src/lib/marca/html";
import { MODULOS_IMPORT } from "../src/lib/modulos/descriptores";
import { matrizConLegado, type Matriz } from "../src/lib/rbac/catalogo";
import { MODULOS_PLATAFORMA } from "../src/lib/rbac/modulos-plataforma";

const RAIZ = path.resolve(__dirname, "..");
const VERSION = (JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8")) as { version: string }).version;
const iSalida = process.argv.indexOf("--salida");
const SALIDA = iSalida > 0 ? path.resolve(process.argv[iSalida + 1]!) : path.join(RAIZ, "output", "manual", `Manual_de_usuario_Russell_Conciliador_v${VERSION}.pdf`);

// El navegador imprime sin la plataforma delante: el logotipo y Lato van incrustados.
const datoDeMarca = (archivo: string, tipo: string) => `data:${tipo};base64,${readFileSync(path.join(RAIZ, "public", "marca", archivo)).toString("base64")}`;
const LOGO_BLANCO = datoDeMarca("russell-bedford-blanco.svg", "image/svg+xml");

const MODULOS = Object.values(MODULOS_IMPORT);
const esDeModulo = (id: FichaId) => id.startsWith("modulo.") || id === "parametros.filtros_cuentas";

/** La matriz y la publicación, leídas como lo hace la plataforma (contexto.ts y publicacion.ts). */
async function leerPermisos(prisma: PrismaClient) {
  const filas = await prisma.rolePermission.findMany({ select: { role: { select: { code: true } }, permission: { select: { code: true } } } });
  const matriz: Matriz = {};
  for (const f of filas) (matriz[f.role.code] ??= []).push(f.permission.code);
  const modulos = await prisma.platformModule.findMany({ select: { key: true, enabledForNonAdmins: true } });
  const porClave = new Map(modulos.map((m) => [m.key, m]));
  const publicacion = MODULOS_PLATAFORMA.map((def) => ({
    key: def.key,
    enabledForNonAdmins: porClave.get(def.key)?.enabledForNonAdmins ?? def.enabledForNonAdmins,
    configurableForNonAdmins: def.configurableForNonAdmins,
  }));
  return { matriz: filas.length > 0 ? matriz : matrizConLegado(), publicacion };
}

function fichaDelManual(id: FichaId): FichaManual {
  if (!esDeModulo(id)) return fichaManual(fichaAyuda({ fichaId: id })!);
  const f = combinarVariantes(MODULOS.map((d) => ({ etiqueta: d.label, ficha: fichaAyuda({ fichaId: id, modulo: d.codigo })! })));
  // La lista de cada módulo se titula con su nombre: sin él, el título quedaría vacío.
  return f.titulo === MARCADOR_MODULO ? { ...f, titulo: `Lista de cargues · ${MARCADOR_MODULO}` } : f;
}

function datosDelManual(roles: DatosManual["roles"], fecha: string): DatosManual {
  const fichas = new Map<FichaId, FichaManual>();
  const ficha = (id: FichaId) => {
    if (!fichas.has(id)) fichas.set(id, fichaDelManual(id));
    return fichas.get(id)!;
  };
  const nombresModulos = MODULOS.map((d) => d.label);
  const listaModulos = `${nombresModulos.slice(0, -1).join(", ")} y ${nombresModulos.at(-1)}`;
  const intro: Record<string, string[]> = {
    "Módulos de conciliación": [
      `Los módulos ${listaModulos} tienen las mismas pantallas, así que cada una se describe una vez. Donde dice ${MARCADOR_MODULO} va el nombre del módulo, y lo que solo existe en algunos módulos lleva su etiqueta.`,
    ],
    "Parametrización": [`Filtros de cuentas tiene una página por módulo; se describe una vez, y donde dice ${MARCADOR_MODULO} va el nombre del módulo.`],
  };
  const capitulos: CapituloManual[] = AREAS_QUIEN_HACE_QUE.map((area, i) => ({
    id: `cap-${i + 1}`,
    titulo: area.titulo,
    intro: intro[area.titulo] ?? [],
    pantallas: area.fichas.map((id) => ({ id: id.replace(".", "-"), ficha: ficha(id) })),
  }));
  const ciclo = PASOS_CICLO.map((paso, i) => ({
    numero: i + 1,
    titulo: paso.titulo,
    descripcion: paso.descripcion,
    regla: paso.regla,
    donde: lugares(paso.donde.map((l) => {
      const f = ficha(l.fichaId);
      const pestana = l.pestana ? f.pestanas.find((p) => p.id === l.pestana)?.titulo : null;
      return pestana ? `${f.titulo} › pestaña «${pestana}»` : f.titulo;
    })),
  }));
  return { version: VERSION, fecha, roles, ciclo, capitulos };
}

/** «Detalle del balance (también en Mapeo cuentas cliente)». */
const lugares = ([primero, ...otros]: string[]) => (otros.length > 0 ? `${primero} (también en ${otros.join(", ")})` : primero!);

async function abrirNavegador(): Promise<Browser> {
  for (const channel of ["chrome", "msedge", undefined]) {
    try {
      return await chromium.launch({ headless: true, channel });
    } catch {
      // Se prueba el siguiente.
    }
  }
  throw new Error("No se encontró Chrome, Edge ni el Chromium de Playwright para imprimir el PDF.");
}

// Encabezado y pie van en las cajas de margen del CSS (`@page`), así la portada queda sin ellos.
async function imprimir(page: Page, html: string): Promise<Buffer> {
  await page.setContent(glifosDeDocumentoSoloLato(html).replaceAll(RUTA_LOGO_BLANCO, LOGO_BLANCO), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  return page.pdf({ printBackground: true, preferCSSPageSize: true });
}

const contarPaginas = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const { matriz, publicacion } = await leerPermisos(prisma).finally(() => prisma.$disconnect());
  const roles = rolesPorPermiso(matriz, publicacion, permisosAyuda());
  const fecha = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" }).format(new Date());
  const datos = datosDelManual(roles, fecha);

  const estilos = cssFuentesLato((a) => datoDeMarca(`fuentes/${a}`, "font/woff2")) + estilosManual(VERSION);

  const navegador = await abrirNavegador();
  try {
    const page = await navegador.newPage();
    // Cada unidad empieza en página nueva: se cuentan por separado para numerar el contenido.
    // Van detrás de la portada, porque la primera página del documento no lleva márgenes.
    const [portada, ...resto] = unidadesManual(datos);
    const paginas = new Map<string, number>();
    let siguiente = 1 + contarPaginas(await imprimir(page, documentoManual([portada!], estilos)));
    for (const u of resto) {
      for (const e of u.contenido) paginas.set(e.id, siguiente);
      siguiente += contarPaginas(await imprimir(page, documentoManual([portada!, u], estilos))) - 1;
    }
    const pdf = await imprimir(page, documentoManual(unidadesManual(datos, paginas), estilos));
    const total = contarPaginas(pdf);
    if (total !== siguiente - 1) console.warn(`⚠ El documento tiene ${total} páginas y las unidades sumaban ${siguiente - 1}: revisa los números del contenido.`);
    mkdirSync(path.dirname(SALIDA), { recursive: true });
    writeFileSync(SALIDA, pdf);
    const pantallas = datos.capitulos.reduce((n, c) => n + c.pantallas.length, 0);
    console.log(`✔ ${path.relative(RAIZ, SALIDA)} · ${total} páginas · ${pantallas} pantallas en ${datos.capitulos.length} capítulos · permisos del ${fecha}`);
  } finally {
    await navegador.close();
  }
}

main().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
