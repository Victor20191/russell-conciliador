// Recalcula «Desplegada el» de las versiones PUBLICADAS como el día de su publicación en Colombia,
// leyendo y escribiendo con el mismo cliente que la aplicación (23/Nov/2026).
//
// Las migraciones 20261123200000 y 20261123210000 lo calcularon en SQL, pero mientras la base siga
// con la zona America/Bogota (ver `corregir-desfase-zona-horaria.ts` y `src/lib/prisma.ts`) los
// instantes guardados van 5 h corridos respecto de lo que lee la aplicación, y en SQL las
// publicaciones de noche cayeron al día siguiente (la 2.5.0, publicada el 3/Oct a las 7:54 p. m.,
// quedó desplegada el 4/Oct). Aquí se aplica `despliegueAlPublicar` a `releasedAt` tal como lo ve la
// app, así que el resultado es el que muestra la pantalla, con la base en Bogotá o ya en UTC.
//
// Solo corrige las que quedaron con ese error (sin fecha, o un día después de la publicación); una
// fecha distinta puesta a mano en Novedades no se toca. Simula por defecto:
//   npx tsx scripts/novedades-desplegado-en.ts            # muestra qué cambiaría
//   npx tsx scripts/novedades-desplegado-en.ts --aplicar  # escribe
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { despliegueAlPublicar, fechaDespliegueTexto, instanteDespliegue } from "../src/lib/novedades/despliegue";

const APLICAR = process.argv.includes("--aplicar");

function diaSiguiente(fecha: string): string {
  return new Date(Date.parse(`${fecha}T12:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
}

async function main() {
  const versiones = await prisma.platformVersion.findMany({
    where: { status: "publicada", releasedAt: { not: null } },
    orderBy: [{ releasedAt: "asc" }, { id: "asc" }],
    select: { id: true, number: true, releasedAt: true, deployedAt: true },
  });

  const cambios: Array<{ id: number; numero: string; antes: string | null; despues: string }> = [];
  for (const v of versiones) {
    const correcto = fechaDespliegueTexto(despliegueAlPublicar(v.releasedAt!))!;
    const actual = fechaDespliegueTexto(v.deployedAt);
    if (actual === correcto) continue;
    // Solo el error de la migración: sin fecha o un día después. Lo demás se puso a mano.
    if (actual !== null && actual !== diaSiguiente(correcto)) continue;
    cambios.push({ id: v.id, numero: v.number, antes: actual, despues: correcto });
  }

  console.log(`Versiones publicadas: ${versiones.length}. Por corregir: ${cambios.length}.`);
  for (const c of cambios) console.log(`  v${c.numero}: ${c.antes ?? "(sin fecha)"} → ${c.despues}`);

  if (!APLICAR) {
    console.log("Simulación: nada se escribió. Usa --aplicar para corregir.");
    return;
  }
  await prisma.$transaction(
    cambios.map((c) =>
      prisma.platformVersion.update({ where: { id: c.id }, data: { deployedAt: instanteDespliegue(c.despues) } }),
    ),
  );
  console.log(`Corregidas: ${cambios.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
