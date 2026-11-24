// Carga la fecha real de despliegue («Desplegada el») de las versiones de Novedades
// a partir del historial del servidor de producción (24/Nov/2026).
//
// Desde este cambio, el servidor anota solo el día al arrancar con una versión nueva
// (`src/instrumentation.ts`), pero el primer arranque no le pone fecha al pasado. Las
// versiones ya desplegadas se fechan con este script, a partir de la salida de este
// comando en la carpeta de la app EN EL SERVIDOR (cada `git pull` con su fecha y la
// versión de package.json de ese momento):
//
//   git reflog --date=iso --format='%gd|%h' HEAD | while IFS='|' read -r cuando sha; do echo "$cuando $sha $(git show "$sha":package.json | grep -m1 '"version"')"; done
//
// También acepta líneas escritas a mano: `2026-10-19 3.0.0`.
//
// Cada versión toma el día (en Colombia) en que el servidor tuvo por primera vez esa
// versión o una mayor. Además anota esas versiones en `despliegues_plataforma`, para
// que el registro automático sepa desde dónde seguir. Lee y escribe con el cliente de
// la app (ver la memoria del desfase de 5 h). Simula por defecto:
//
//   npx tsx scripts/novedades-fechas-despliegue.ts historial.txt                  # muestra qué cambiaría
//   npx tsx scripts/novedades-fechas-despliegue.ts historial.txt --aplicar        # escribe las que no tienen fecha
//   npx tsx scripts/novedades-fechas-despliegue.ts historial.txt --aplicar --sobrescribir  # también corrige las distintas
import "dotenv/config";
import { readFileSync } from "node:fs";
import prisma from "../src/lib/prisma";
import { fechaDespliegueTexto } from "../src/lib/novedades/despliegue";
import {
  compararVersiones,
  fechasDesdeHistorial,
  leerHistorialServidor,
  primerArranquePorVersion,
} from "../src/lib/novedades/registro-despliegue";

const APLICAR = process.argv.includes("--aplicar");
const SOBRESCRIBIR = process.argv.includes("--sobrescribir");
const ARCHIVO = process.argv.slice(2).find((a) => !a.startsWith("--"));

async function main() {
  if (!ARCHIVO) {
    console.error("Falta el archivo con el historial del servidor. Uso: npx tsx scripts/novedades-fechas-despliegue.ts historial.txt [--aplicar] [--sobrescribir]");
    process.exitCode = 1;
    return;
  }
  const entradas = leerHistorialServidor(readFileSync(ARCHIVO, "utf8"));
  if (entradas.length === 0) {
    console.error("El archivo no trae ninguna línea reconocible del historial.");
    process.exitCode = 1;
    return;
  }
  console.log(`BD destino: ${new URL(process.env.DATABASE_URL ?? "postgres://x").hostname} · modo: ${APLICAR ? "APLICAR" : "simulación"}${SOBRESCRIBIR ? " + sobrescribir" : ""}`);
  console.log(`Historial: ${entradas.length} entradas, del ${fechaDespliegueTexto(entradas[0].instante)} al ${fechaDespliegueTexto(entradas.at(-1)!.instante)}.\n`);

  const versiones = (
    await prisma.platformVersion.findMany({ select: { id: true, number: true, status: true, deployedAt: true } })
  ).sort((a, b) => compararVersiones(a.number, b.number));
  const fechas = fechasDesdeHistorial(entradas, versiones.map((v) => v.number));

  const nuevas: Array<{ id: number; numero: string; dia: Date }> = [];
  const distintas: Array<{ id: number; numero: string; dia: Date }> = [];
  for (const v of versiones) {
    const dia = fechas.get(v.number);
    const actual = fechaDespliegueTexto(v.deployedAt);
    const segunHistorial = fechaDespliegueTexto(dia ?? null);
    const estado = !dia
      ? "sin dato en el historial"
      : actual === null
        ? "nueva"
        : actual === segunHistorial
          ? "igual"
          : `distinta (hoy ${actual})`;
    console.log(`  v${v.number.padEnd(8)} ${v.status.padEnd(10)} ${(segunHistorial ?? "—").padEnd(11)} ${estado}`);
    if (!dia) continue;
    if (actual === null) nuevas.push({ id: v.id, numero: v.number, dia });
    else if (actual !== segunHistorial) distintas.push({ id: v.id, numero: v.number, dia });
  }

  const existentes = new Set((await prisma.platformDeployment.findMany({ select: { version: true } })).map((d) => d.version));
  const despliegues = [...primerArranquePorVersion(entradas)].filter(([version]) => !existentes.has(version));

  const aEscribir = SOBRESCRIBIR ? [...nuevas, ...distintas] : nuevas;
  console.log(
    `\nFechas nuevas: ${nuevas.length}. Distintas: ${distintas.length}${distintas.length && !SOBRESCRIBIR ? " (no se tocan sin --sobrescribir)" : ""}. ` +
      `Despliegues por anotar: ${despliegues.length}.`,
  );

  if (!APLICAR) {
    console.log("Simulación: nada se escribió. Usa --aplicar para escribir.");
    return;
  }
  await prisma.$transaction([
    ...aEscribir.map((c) => prisma.platformVersion.update({ where: { id: c.id }, data: { deployedAt: c.dia } })),
    ...despliegues.map(([version, instante]) =>
      prisma.platformDeployment.create({ data: { version, startedAt: instante, origin: "historial" } }),
    ),
  ]);
  console.log(`Escritas: ${aEscribir.length} fechas y ${despliegues.length} despliegues.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
