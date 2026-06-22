// Completa la JERARQUÍA muchos-a-muchos (jerarquia_usuarios) tras importar los
// maestros de personas. El importador de maestros solo crea UNA arista por
// persona (su único superior), pero el maestro de la firma es una malla: muchos
// staff reportan a varios seniors y algunos seniors a varios gerentes.
//
// Lee docs/clientes/jerarquia-aristas.json (generado por
// scripts/gen_plantillas_desde_consolidada.py), resuelve cédula -> User.id y
// hace un createMany idempotente (skipDuplicates respeta el @@unique, así que
// las aristas ya creadas por el importador no se duplican).
//
// Uso:  npm run db:completar:jerarquia   (o: npx tsx scripts/completar_jerarquia.ts)
import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const ARCHIVO = resolve(process.cwd(), "docs/clientes/jerarquia-aristas.json");

const norm = (c: string) => c.replace(/[.\s-]/g, "").trim();

async function main() {
  const aristas = JSON.parse(readFileSync(ARCHIVO, "utf-8")) as {
    superior: string;
    subordinado: string;
  }[];

  const usuarios = await prisma.user.findMany({
    where: { cedula: { not: null } },
    select: { id: true, cedula: true },
  });
  const idPorCedula = new Map(usuarios.map((u) => [norm(u.cedula!), u.id]));

  const pares: { superiorId: number; subordinateId: number }[] = [];
  const faltantes: string[] = [];
  for (const a of aristas) {
    const sup = idPorCedula.get(norm(a.superior));
    const sub = idPorCedula.get(norm(a.subordinado));
    if (sup == null || sub == null) {
      faltantes.push(`${a.superior} → ${a.subordinado}`);
      continue;
    }
    pares.push({ superiorId: sup, subordinateId: sub });
  }

  const res = await prisma.userHierarchy.createMany({ data: pares, skipDuplicates: true });

  console.log(`Aristas en el archivo:               ${aristas.length}`);
  console.log(`Resueltas (ambas cédulas existen):   ${pares.length}`);
  console.log(`Insertadas nuevas:                   ${res.count} (las demás ya existían)`);
  if (faltantes.length) {
    console.log(
      `\n⚠️  ${faltantes.length} aristas con cédula sin usuario (¿faltó importar los maestros?):`,
    );
    faltantes.slice(0, 40).forEach((f) => console.log("   " + f));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
