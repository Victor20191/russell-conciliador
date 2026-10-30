// ============================================================
// «Formatos propios» del cliente (21/Oct/2026; antes «patrones manuales»): completa los TÍTULOS
// de los perfiles anteriores de `perfiles_carga_modulo`, para que dejen de reconocerse solo por su huella exacta (que incluye el
// nombre de la hoja) y pasen a reconocerse por % de coincidencia, como los que se guardan al
// confirmar un cargue desde esta fecha.
//
// El perfil anterior no guardó los rótulos del encabezado (solo su huella), así que se reconstruyen
// con el original conservado del cliente: la hoja y la fila del perfil, aceptadas solo si la huella
// de ese encabezado coincide con la del perfil. Los originales se conservan desde el 23/Sep/2026:
// los perfiles más viejos quedan como «patrón anterior» y ganan sus títulos la próxima vez que se
// confirme un cargue con ellos.
//
// Cada perfil completado cambia a la llave nueva (`fm1:` + títulos). Si dos perfiles del mismo
// cliente y módulo resultan con los mismos títulos (p. ej. las hojas «99» y «01»), se completa el
// usado más recientemente y el otro se informa como duplicado, sin tocarlo.
//
// Ejecutar (antes, `npx prisma migrate deploy`; .env apunta a PRODUCCIÓN):
//   npm run db:formatos-manuales:encabezado                    # simulación: informe, no escribe
//   npm run db:formatos-manuales:encabezado -- --aplicar       # escribe y deja un snapshot
//   npm run db:formatos-manuales:encabezado -- --revertir scripts/.snapshots/formatos-manuales-<ts>.json --aplicar
// ============================================================

import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { ingerir, type GridHoja } from "../src/lib/balance/extraccion/ingesta";
import { calcularHuella } from "../src/lib/balance/extraccion/huella";
import { descriptorModulo } from "../src/lib/modulos/descriptores";
import { SpecModuloSchema } from "../src/lib/modulos/extraccion/esquema";
import { huellasDeEncabezado } from "../src/lib/modulos/huella-modulo";
import { normalizarSpecModulo } from "../src/lib/modulos/perfil-modulo";
import { encabezadoParaGuardar } from "../src/lib/modulos/patrones/rotulos";
import { esHuellaFormatoManual, huellaFormatoManual } from "../src/lib/modulos/formatos-manuales";

const APLICAR = process.argv.includes("--aplicar");
const indiceRevertir = process.argv.indexOf("--revertir");
const REVERTIR = indiceRevertir >= 0 ? process.argv[indiceRevertir + 1] ?? null : null;
const MAX_ORIGINALES_POR_PERFIL = 25;

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
  // Los originales pueden pesar decenas de MB: se recuerdan pocos.
  if (hojasPorClave.size > 30) hojasPorClave.clear();
  hojasPorClave.set(clave, hojas);
  return hojas;
}

type Cambio = { id: number; huellaAnterior: string; huellaNueva: string; encabezado: string[] };

async function revertir(ruta: string) {
  const snapshot = JSON.parse(readFileSync(ruta, "utf8")) as { cambios: Cambio[] };
  console.log(`Revertir ${snapshot.cambios.length} perfiles desde ${ruta}${APLICAR ? "" : " (simulación: agrega --aplicar)"}`);
  if (!APLICAR) return;
  let revertidos = 0;
  for (const cambio of snapshot.cambios) {
    // Solo si sigue como lo dejó el script: un guardado posterior manda.
    const r = await prisma.perfilCargaModulo.updateMany({
      where: { id: cambio.id, huella: cambio.huellaNueva },
      data: { huella: cambio.huellaAnterior, encabezadoJson: Prisma.DbNull },
    });
    revertidos += r.count;
  }
  console.log(`REVERTIDO: ${revertidos} de ${snapshot.cambios.length}.`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está definida.");
  console.log(`Base de datos: ${new URL(process.env.DATABASE_URL).hostname}`);
  if (REVERTIR) return revertir(REVERTIR);
  console.log(APLICAR ? "MODO APLICAR: se completan los títulos." : "SIMULACIÓN: no se escribe nada.");

  const perfiles = await prisma.perfilCargaModulo.findMany({
    orderBy: [{ clienteId: "asc" }, { moduloCodigo: "asc" }, { id: "asc" }],
    select: { id: true, clienteId: true, moduloCodigo: true, huella: true, specJson: true, encabezadoJson: true, archivoEjemplo: true, ultimoUsoEn: true, creadoEn: true },
  });
  const clientes = await prisma.client.findMany({ where: { id: { in: [...new Set(perfiles.map((p) => p.clienteId))] } }, select: { id: true, name: true } });
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.name]));

  // Llaves ya tomadas por cliente+módulo (las de los perfiles que ya tienen títulos).
  const tomadas = new Map<string, number>();
  for (const p of perfiles) if (esHuellaFormatoManual(p.huella)) tomadas.set(`${p.clienteId}|${p.moduloCodigo}|${p.huella}`, p.id);

  const anteriores = perfiles
    .filter((p) => p.encabezadoJson == null)
    // El usado más recientemente primero: si dos dan los mismos títulos, ese se queda con la llave.
    .sort((a, b) => (b.ultimoUsoEn ?? b.creadoEn).getTime() - (a.ultimoUsoEn ?? a.creadoEn).getTime());

  const informe = { completados: [] as string[], sinOriginal: [] as string[], duplicados: [] as string[], invalidos: [] as string[] };
  const cambios: Cambio[] = [];

  for (const perfil of anteriores) {
    const etiqueta = `perfil #${perfil.id} · ${nombreCliente.get(perfil.clienteId) ?? `cliente ${perfil.clienteId}`} · ${perfil.moduloCodigo}`;
    const descriptor = descriptorModulo(perfil.moduloCodigo);
    const parsed = SpecModuloSchema.safeParse(perfil.specJson);
    if (!descriptor || !parsed.success) { informe.invalidos.push(`${etiqueta}: módulo o mapeo ilegible`); continue; }
    const spec = normalizarSpecModulo(descriptor, parsed.data);

    const originales = await prisma.archivoOriginalModulo.findMany({
      where: { clienteId: perfil.clienteId, moduloCodigo: perfil.moduloCodigo, disponible: true, claveObjeto: { not: null } },
      orderBy: { creadoEn: "desc" },
      take: MAX_ORIGINALES_POR_PERFIL,
      select: { nombreArchivo: true, claveObjeto: true },
    });
    originales.sort((a, b) => Number(b.nombreArchivo === perfil.archivoEjemplo) - Number(a.nombreArchivo === perfil.archivoEjemplo));
    let encabezado: string[] | null = null;
    for (const original of originales) {
      const hojas = await hojasDelOriginal(original.claveObjeto!, original.nombreArchivo);
      const hoja = hojas?.find((h) => h.nombre === spec.hoja);
      const fila = hoja?.filas[spec.filaEncabezado - 1];
      if (!hoja || !fila) continue;
      const huellas = new Set([calcularHuella(hoja.nombre, [...fila]), ...huellasDeEncabezado(descriptor, hoja.nombre, fila)]);
      if (huellas.has(perfil.huella)) { encabezado = encabezadoParaGuardar(fila); break; }
    }
    if (!encabezado) { informe.sinOriginal.push(`${etiqueta} (${perfil.archivoEjemplo ?? "sin nombre de archivo"})`); continue; }

    const huellaNueva = huellaFormatoManual(descriptor, encabezado);
    if (!huellaNueva) { informe.invalidos.push(`${etiqueta}: el encabezado tiene menos de dos títulos`); continue; }
    const llave = `${perfil.clienteId}|${perfil.moduloCodigo}|${huellaNueva}`;
    const duenio = tomadas.get(llave);
    if (duenio != null) { informe.duplicados.push(`${etiqueta}: mismos títulos que el perfil #${duenio} (se deja sin tocar; se puede borrar)`); continue; }
    tomadas.set(llave, perfil.id);
    cambios.push({ id: perfil.id, huellaAnterior: perfil.huella, huellaNueva, encabezado });
    informe.completados.push(`${etiqueta}: ${encabezado.filter(Boolean).length} títulos (hoja «${spec.hoja}»)`);
  }

  const imprimir = (titulo: string, lista: string[]) => {
    console.log(`\n${titulo}: ${lista.length}`);
    for (const linea of lista) console.log(`  · ${linea}`);
  };
  console.log(`\nPerfiles anteriores (sin títulos): ${anteriores.length} de ${perfiles.length}`);
  imprimir("Se completan sus títulos", informe.completados);
  imprimir("Sin original para reconstruir el encabezado (siguen como patrón anterior)", informe.sinOriginal);
  imprimir("Duplicados de otro perfil del mismo cliente", informe.duplicados);
  imprimir("Inválidos", informe.invalidos);

  if (!APLICAR || cambios.length === 0) {
    if (!APLICAR) console.log("\nSIMULACIÓN: repite con --aplicar para completar los títulos.");
    return;
  }

  mkdirSync("scripts/.snapshots", { recursive: true });
  const ruta = `scripts/.snapshots/formatos-manuales-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(ruta, JSON.stringify({ creadoEn: new Date().toISOString(), cambios }, null, 2));
  let aplicados = 0;
  for (const cambio of cambios) {
    // Solo si sigue sin títulos y con la misma huella: un guardado posterior manda.
    const r = await prisma.perfilCargaModulo.updateMany({
      where: { id: cambio.id, huella: cambio.huellaAnterior, encabezadoJson: { equals: Prisma.DbNull } },
      data: { huella: cambio.huellaNueva, encabezadoJson: cambio.encabezado },
    });
    aplicados += r.count;
  }
  await prisma.auditEntry.create({
    data: {
      user: "Sistema",
      action: "COMPLETÓ TÍTULOS DE PATRONES MANUALES",
      entity: "perfiles_carga_modulo",
      detail: `${aplicados} perfiles con títulos · ${informe.sinOriginal.length} sin original · ${informe.duplicados.length} duplicados · snapshot ${ruta}`,
    },
  });
  console.log(`\nAPLICADO: ${aplicados} de ${cambios.length} perfiles. Snapshot: ${ruta}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
