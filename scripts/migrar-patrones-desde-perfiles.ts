// ============================================================
// Migración de la memoria por cliente de los módulos a PATRONES DE ARCHIVO por aplicativo.
//
// Cada perfil de `perfiles_carga_modulo` de un cliente con UN aplicativo (distinto de «Archivo
// manual») en el campo del módulo se convierte en una versión PENDIENTE del patrón de ese
// aplicativo y módulo, con `cliente_origen_id` = ese cliente: sirve para sus próximas cargas y
// un administrador la aprueba cuando le suba la muestra. Los perfiles NO se borran: siguen siendo
// la memoria del camino «Archivo manual».
//
// El perfil no guarda los rótulos del encabezado (solo su huella), así que se reconstruyen con el
// original conservado del cliente: hoja y fila del perfil, aceptados solo si su huella coincide.
//
// Sin original en el almacén, `--carpeta <ruta>` (repetible) busca en disco un archivo con el mismo
// nombre que el perfil recuerda (`archivo_ejemplo`, sin los sufijos « (1)» de las copias) y lo acepta
// con la misma regla: la huella de su encabezado debe coincidir con la del perfil.
//
// Ejecutar (antes, `npx prisma migrate deploy`; .env apunta a PRODUCCIÓN):
//   npm run db:migrar:patrones                 # dry-run: informe, no escribe
//   npm run db:migrar:patrones -- --aplicar    # crea las versiones pendientes
//   npm run db:migrar:patrones -- --carpeta "C:/ruta/de/archivos" [--aplicar]
// ============================================================

import "dotenv/config";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { ingerir, type GridHoja } from "../src/lib/balance/extraccion/ingesta";
import { calcularHuella } from "../src/lib/balance/extraccion/huella";
import { ERP_MANUAL_CODE, procesoErpDeModulo } from "../src/lib/erp-procesos";
import { descriptorModulo } from "../src/lib/modulos/descriptores";
import { SpecModuloSchema, type SpecModulo } from "../src/lib/modulos/extraccion/esquema";
import { huellasDeEncabezado } from "../src/lib/modulos/huella-modulo";
import { mismoSpecModuloNormalizado, normalizarSpecModulo, validarSpecModulo } from "../src/lib/modulos/perfil-modulo";
import { clavesEncabezado, encabezadoParaGuardar } from "../src/lib/modulos/patrones/rotulos";
import { siguienteVersionPatron } from "../src/lib/modulos/patrones/version";

const APLICAR = process.argv.includes("--aplicar");
const MAX_ORIGINALES_POR_PERFIL = 25;
const MAX_BYTES_LOCAL = 30 * 1024 * 1024;
const CARPETAS = process.argv.flatMap((valor, i, todos) => (valor === "--carpeta" && todos[i + 1] ? [todos[i + 1]] : []));

/** Nombre comparable: sin tildes ni mayúsculas y sin los sufijos « (1)» que agregan las copias. */
function nombreComparable(nombre: string): string {
  const base = path.basename(nombre).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const extension = path.extname(base);
  return base.slice(0, base.length - extension.length).replace(/(\s*\(\d+\))+$/g, "").trim() + extension;
}

/** Archivos de hoja de cálculo de las carpetas locales, por nombre comparable. */
function indiceLocal(): Map<string, string[]> {
  const indice = new Map<string, string[]>();
  const recorrer = (carpeta: string) => {
    let entradas: string[] = [];
    try { entradas = readdirSync(carpeta); } catch { return; }
    for (const nombre of entradas) {
      const ruta = path.join(carpeta, nombre);
      let info;
      try { info = statSync(ruta); } catch { continue; }
      if (info.isDirectory()) { if (nombre !== "node_modules") recorrer(ruta); continue; }
      if (nombre.startsWith("~$") || !/\.(xlsx|xlsm|xls|xlsb|csv)$/i.test(nombre) || info.size > MAX_BYTES_LOCAL) continue;
      const clave = nombreComparable(nombre);
      indice.set(clave, [...(indice.get(clave) ?? []), ruta]);
    }
  };
  for (const carpeta of CARPETAS) recorrer(carpeta);
  return indice;
}

const hojasPorRuta = new Map<string, GridHoja[] | null>();
async function hojasDelArchivoLocal(ruta: string): Promise<GridHoja[] | null> {
  if (hojasPorRuta.has(ruta)) return hojasPorRuta.get(ruta)!;
  let hojas: GridHoja[] | null = null;
  try {
    const buf = readFileSync(ruta);
    const ingesta = await ingerir(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, path.basename(ruta));
    hojas = ingesta.modo === "tabular" ? ingesta.hojas : null;
  } catch {
    hojas = null;
  }
  if (hojasPorRuta.size > 30) hojasPorRuta.clear();
  hojasPorRuta.set(ruta, hojas);
  return hojas;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const BUCKET = process.env.S3_BUCKET ?? "";
const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
});

const hojasPorClave = new Map<string, GridHoja[] | null>();
async function hojasDelOriginal(clave: string, nombre: string): Promise<GridHoja[] | null> {
  if (hojasPorClave.has(clave)) return hojasPorClave.get(clave)!;
  let hojas: GridHoja[] | null = null;
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: clave }));
    const bytes = res.Body ? await res.Body.transformToByteArray() : null;
    if (bytes) {
      const ingesta = await ingerir(bytes.slice().buffer as ArrayBuffer, nombre);
      hojas = ingesta.modo === "tabular" ? ingesta.hojas : null;
    }
  } catch {
    hojas = null;
  }
  // Solo se recuerda el último cliente: los originales pueden pesar decenas de MB.
  if (hojasPorClave.size > 30) hojasPorClave.clear();
  hojasPorClave.set(clave, hojas);
  return hojas;
}

type Nueva = {
  erpId: number;
  erpNombre: string;
  moduloCodigo: string;
  clienteId: number;
  clienteNombre: string;
  perfilId: number;
  hoja: string;
  spec: SpecModulo;
  encabezado: string[];
};

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está definida.");
  console.log(`Base de datos: ${new URL(process.env.DATABASE_URL).hostname}`);
  console.log(APLICAR ? "MODO APLICAR: se crearán versiones pendientes." : "DRY-RUN: no se escribe nada.");

  const [perfiles, versiones] = await Promise.all([
    prisma.perfilCargaModulo.findMany({ orderBy: [{ clienteId: "asc" }, { moduloCodigo: "asc" }, { id: "asc" }] }),
    prisma.versionPatronArchivoModulo.findMany({ select: { erpId: true, moduloCodigo: true, version: true, encabezadoJson: true, specJson: true } }),
  ]);
  const clientes = await prisma.client.findMany({
    where: { id: { in: [...new Set(perfiles.map((p) => p.clienteId))] } },
    select: {
      id: true,
      name: true,
      erpsPorProceso: { select: { process: { select: { code: true } }, erp: { select: { id: true, code: true, name: true } } } },
    },
  });
  const clientePorId = new Map(clientes.map((c) => [c.id, c]));

  const locales = CARPETAS.length > 0 ? indiceLocal() : new Map<string, string[]>();
  if (CARPETAS.length > 0) console.log(`Carpetas locales: ${CARPETAS.join(" · ")} (${[...locales.values()].reduce((n, l) => n + l.length, 0)} archivos)`);
  const informe = { creadas: [] as string[], sinErp: [] as string[], ambiguos: [] as string[], sinOriginal: [] as string[], duplicadas: [] as string[], invalidos: [] as string[] };
  const nuevas: Nueva[] = [];

  for (const perfil of perfiles) {
    const cliente = clientePorId.get(perfil.clienteId);
    const etiqueta = `perfil #${perfil.id} · ${cliente?.name ?? `cliente ${perfil.clienteId}`} · ${perfil.moduloCodigo}`;
    const descriptor = descriptorModulo(perfil.moduloCodigo);
    const proceso = procesoErpDeModulo(perfil.moduloCodigo);
    if (!cliente || !descriptor || !proceso) { informe.invalidos.push(`${etiqueta}: cliente o módulo inexistente`); continue; }

    const erps = cliente.erpsPorProceso
      .filter((a) => a.process.code === proceso && a.erp.code !== ERP_MANUAL_CODE)
      .map((a) => a.erp);
    if (erps.length === 0) { informe.sinErp.push(etiqueta); continue; }
    if (erps.length > 1) { informe.ambiguos.push(`${etiqueta}: ${erps.map((e) => e.name).join(", ")}`); continue; }
    const erp = erps[0];

    const parsed = SpecModuloSchema.safeParse(perfil.specJson);
    if (!parsed.success) { informe.invalidos.push(`${etiqueta}: mapeo ilegible`); continue; }
    const spec = normalizarSpecModulo(descriptor, parsed.data);
    const errorSpec = validarSpecModulo(descriptor, spec);
    if (errorSpec) { informe.invalidos.push(`${etiqueta}: ${errorSpec}`); continue; }

    const originales = await prisma.archivoOriginalModulo.findMany({
      where: { clienteId: perfil.clienteId, moduloCodigo: perfil.moduloCodigo, disponible: true, claveObjeto: { not: null } },
      orderBy: { creadoEn: "desc" },
      take: MAX_ORIGINALES_POR_PERFIL,
      select: { nombreArchivo: true, claveObjeto: true },
    });
    originales.sort((a, b) => Number(b.nombreArchivo === perfil.archivoEjemplo) - Number(a.nombreArchivo === perfil.archivoEjemplo));
    const encabezadoSiCoincide = (hojas: GridHoja[] | null): string[] | null => {
      const hoja = hojas?.find((h) => h.nombre === spec.hoja);
      const fila = hoja?.filas[spec.filaEncabezado - 1];
      if (!hoja || !fila) return null;
      const huellas = new Set([calcularHuella(hoja.nombre, [...fila]), ...huellasDeEncabezado(descriptor, hoja.nombre, fila)]);
      return huellas.has(perfil.huella) ? encabezadoParaGuardar(fila) : null;
    };
    let encabezado: string[] | null = null;
    let fuente = "";
    for (const original of originales) {
      encabezado = encabezadoSiCoincide(await hojasDelOriginal(original.claveObjeto!, original.nombreArchivo));
      if (encabezado) break;
    }
    if (!encabezado && perfil.archivoEjemplo) {
      for (const ruta of locales.get(nombreComparable(perfil.archivoEjemplo)) ?? []) {
        encabezado = encabezadoSiCoincide(await hojasDelArchivoLocal(ruta));
        if (encabezado) { fuente = `, encabezado tomado de ${ruta}`; break; }
      }
    }
    if (!encabezado) { informe.sinOriginal.push(`${etiqueta} (${perfil.archivoEjemplo ?? "sin nombre de archivo"})`); continue; }

    const claves = JSON.stringify(clavesEncabezado(descriptor, encabezado));
    const repetida = [...versiones.map((v) => ({ ...v, encabezado: v.encabezadoJson as unknown[], spec: v.specJson })), ...nuevas.map((n) => ({ erpId: n.erpId, moduloCodigo: n.moduloCodigo, version: 0, encabezado: n.encabezado, spec: n.spec }))]
      .find((v) => {
        if (v.erpId !== erp.id || v.moduloCodigo !== perfil.moduloCodigo || !Array.isArray(v.encabezado)) return false;
        const specV = SpecModuloSchema.safeParse(v.spec);
        return specV.success
          && JSON.stringify(clavesEncabezado(descriptor, v.encabezado)) === claves
          && mismoSpecModuloNormalizado(descriptor, specV.data, spec);
      });
    if (repetida) { informe.duplicadas.push(`${etiqueta}: igual a una versión de ${erp.name}`); continue; }

    nuevas.push({ erpId: erp.id, erpNombre: erp.name, moduloCodigo: perfil.moduloCodigo, clienteId: cliente.id, clienteNombre: cliente.name, perfilId: perfil.id, hoja: spec.hoja, spec, encabezado });
    informe.creadas.push(`${etiqueta} → ${erp.name} (hoja «${spec.hoja}», ${encabezado.filter(Boolean).length} rótulos${fuente})`);
  }

  const imprimir = (titulo: string, lista: string[]) => {
    console.log(`\n${titulo}: ${lista.length}`);
    for (const linea of lista) console.log(`  · ${linea}`);
  };
  imprimir("Versiones pendientes por crear", informe.creadas);
  imprimir("Sin aplicativo en la ficha (quedan como memoria de «Archivo manual»)", informe.sinErp);
  imprimir("Con varios aplicativos en el campo (elegir a mano)", informe.ambiguos);
  imprimir("Sin original para reconstruir el encabezado (crear el patrón a mano)", informe.sinOriginal);
  imprimir("Iguales a una versión existente", informe.duplicadas);
  imprimir("Perfiles inválidos", informe.invalidos);

  if (!APLICAR || nuevas.length === 0) {
    if (!APLICAR) console.log("\nDRY-RUN: repite con --aplicar para crear las versiones.");
    return;
  }

  for (const nueva of nuevas) {
    await prisma.$transaction(async (tx) => {
      const existentes = await tx.versionPatronArchivoModulo.findMany({
        where: { erpId: nueva.erpId, moduloCodigo: nueva.moduloCodigo },
        select: { version: true },
      });
      await tx.versionPatronArchivoModulo.create({
        data: {
          erpId: nueva.erpId,
          moduloCodigo: nueva.moduloCodigo,
          version: siguienteVersionPatron(existentes.map((v) => v.version)),
          estado: "pendiente",
          hoja: nueva.hoja,
          filaEncabezado: nueva.spec.filaEncabezado,
          primeraFilaDatos: nueva.spec.primeraFilaDatos,
          encabezadoJson: nueva.encabezado,
          specJson: nueva.spec as Prisma.InputJsonValue,
          clienteOrigenId: nueva.clienteId,
          clienteOrigenNombre: nueva.clienteNombre,
          nota: `Migrado del perfil del cliente ${nueva.clienteNombre} (perfil #${nueva.perfilId}). Sube la muestra para aprobarlo.`,
          creadoPor: "migración",
        },
      });
    });
  }
  await prisma.auditEntry.create({
    data: {
      user: "Sistema",
      action: "MIGRÓ PERFILES A PATRONES DE ARCHIVO",
      entity: "versiones_patron_archivo_modulo",
      detail: `${nuevas.length} versiones pendientes · ${informe.sinErp.length} sin aplicativo · ${informe.ambiguos.length} ambiguos · ${informe.sinOriginal.length} sin original`,
    },
  });
  console.log(`\nAPLICADO: ${nuevas.length} versiones pendientes creadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
