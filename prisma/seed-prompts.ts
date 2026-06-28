// ============================================================
// Seed de PROMPTS DE IA — provisiona en BD el contenido de los prompts de
// sistema (extracción de balances y mapeo de cuentas) tomando el valor de
// fábrica del catálogo (src/lib/ia/prompts-catalogo.ts). Así la plataforma
// usa el prompt COMPLETO en producción (donde el FS es de solo lectura) y el
// Superadministrador puede editarlo desde /config/prompts.
//
// Ejecutar:  npm run db:seed:prompts   (DESPUÉS de migrar)
//
// IDEMPOTENTE y NO destructivo de ediciones: en cada corrida REFRESCA
// `predeterminado` al valor de fábrica vigente del código, pero solo escribe
// `contenido` al CREAR la fila — si un admin ya editó el prompt, su texto se
// conserva.
// ============================================================

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PROMPTS_CATALOGO } from "../src/lib/ia/prompts-catalogo";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seed de Prompts de IA…");
  for (const def of PROMPTS_CATALOGO) {
    const defecto = def.defecto();
    const fila = await prisma.promptIA.upsert({
      where: { clave: def.clave },
      create: { clave: def.clave, contenido: defecto, predeterminado: defecto, actualizadoPor: "Sistema (seed)" },
      // No piso `contenido` (puede estar editado); solo refresco el predeterminado.
      update: { predeterminado: defecto },
      select: { id: true, contenido: true },
    });
    const editado = fila.contenido.trim() !== defecto.trim();
    console.log(`+ ${def.clave} · ${def.nombre} (${defecto.length} caracteres de fábrica)${editado ? " · contenido editado conservado" : ""}`);
  }
  console.log(`✅ Prompts de IA: ${PROMPTS_CATALOGO.length} prompt(s) provisionado(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
