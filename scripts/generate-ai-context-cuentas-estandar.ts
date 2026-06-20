import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import prisma from "../src/lib/prisma";

type AccountRow = {
  code: string;
  name: string;
  level: number;
  nature: string;
  parent: string | null;
  critical: boolean;
  russellAccount: string | null;
  categoryType: string | null;
  includes: string | null;
  excludes: string | null;
  possibleAccounts: string | null;
  supportingDocuments: string | null;
  controlSupports: string | null;
  mappingNotes: string | null;
};

const OUTPUT = "docs/ai-context/cuentas-estandar-russell.md";
const CLASS_LABELS: Record<string, string> = {
  "1": "Activo",
  "2": "Pasivo",
  "3": "Patrimonio",
  "4": "Ingresos",
  "5": "Gastos",
  "6": "Costos de ventas",
  "7": "Costos de produccion",
  "8": "Cuentas de orden deudoras",
  "9": "Cuentas de orden acreedoras",
};

function text(value: string | null | undefined): string {
  return value?.trim() ? value.trim() : "No especificado en el maestro.";
}

function inline(value: string | null | undefined): string {
  return text(value).replace(/\|/g, "\\|");
}

function anchor(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function yesNo(value: boolean): string {
  return value ? "si" : "no";
}

async function main() {
  const rows = await prisma.standardAccount.findMany({
    select: {
      code: true,
      name: true,
      level: true,
      nature: true,
      parent: true,
      critical: true,
      russellAccount: true,
      categoryType: true,
      includes: true,
      excludes: true,
      possibleAccounts: true,
      supportingDocuments: true,
      controlSupports: true,
      mappingNotes: true,
    },
    orderBy: { code: "asc" },
  });

  const byClass = new Map<string, AccountRow[]>();
  for (const row of rows) {
    const klass = row.code.slice(0, 1);
    if (!byClass.has(klass)) byClass.set(klass, []);
    byClass.get(klass)!.push(row);
  }

  let md = "";
  md += "# Cuenta estandar Russell Bedford - contexto para modelos de IA\n\n";
  md += `Generado desde la tabla PostgreSQL \`cuentas_estandar\` el ${new Date().toISOString()}.\n\n`;
  md += "Este documento describe la estructura semantica del plan estandar Russell Bedford y enumera todas las cuentas cargadas en base de datos. Su proposito es servir como contexto de recuperacion para modelos de inteligencia artificial que comparen cuentas de clientes contra el plan estandar Russell.\n\n";

  md += "## Fuente de verdad\n\n";
  md += "- Tabla fisica: `cuentas_estandar`.\n";
  md += "- Modelo Prisma: `StandardAccount`.\n";
  md += "- Consumo actual en la app: `src/app/(app)/balance/page.tsx` consulta `prisma.standardAccount.findMany(...)`.\n";
  md += `- Cantidad de cuentas cargadas: \`${rows.length}\`.\n`;
  md += "- Este archivo es documentacion derivada. El runtime de la app debe seguir consumiendo la base de datos.\n\n";

  md += "## Que informacion contiene la tabla\n\n";
  md += "La tabla no almacena saldos, movimientos, clientes ni periodos contables. Almacena el catalogo maestro de homologacion: codigo PUC, nombre, clasificacion Russell, naturaleza contable, descripcion funcional, exclusiones, sinonimos probables, soportes esperados y observaciones de auditoria/homologacion.\n\n";

  md += "## Diccionario de campos\n\n";
  md += "| Campo BD | Campo Prisma | Tipo | Descripcion para IA |\n";
  md += "|---|---|---|---|\n";
  md += "| `id` | `id` | integer | Identificador tecnico autoincremental. No usar para homologacion semantica. |\n";
  md += "| `codigo` | `code` | text | Codigo PUC estandar de 6 digitos. Es la clave de negocio principal. |\n";
  md += "| `nombre` | `name` | text | Nombre de la cuenta estandar. |\n";
  md += "| `nivel` | `level` | integer | Nivel jerarquico usado por la app. En este maestro las cuentas vienen a 6 digitos y se registran como nivel 4. |\n";
  md += "| `naturaleza` | `nature` | text | Naturaleza contable esperada: `D` debito o `C` credito. |\n";
  md += "| `padre` | `parent` | text/null | Codigo padre logico derivado del prefijo de 4 digitos. Sirve para agrupar familia PUC. |\n";
  md += "| `critica` | `critical` | boolean | Marcador operativo de criticidad. El maestro actual no lo usa como criterio principal. |\n";
  md += "| `cuenta_russell` | `russellAccount` | text/null | Agrupador Russell o cuenta 4D destino. Es una senal fuerte para homologacion. |\n";
  md += "| `tipo_rubro` | `categoryType` | text/null | Rubro o categoria contable/financiera. Ayuda a clasificar por estado financiero o area de auditoria. |\n";
  md += "| `incluye` | `includes` | text/null | Describe exactamente que debe entrar en esta cuenta. Campo principal para razonamiento semantico. |\n";
  md += "| `no_incluye` | `excludes` | text/null | Describe partidas que NO deben mapearse a esta cuenta. Campo clave para evitar falsos positivos. |\n";
  md += "| `cuentas_posibles` | `possibleAccounts` | text/null | Sinonimos, nombres alternos o etiquetas de cuentas de cliente que podrian corresponder a esta cuenta. |\n";
  md += "| `soportes_terceros` | `supportingDocuments` | text/null | Evidencia documental esperada para validar el saldo o la clasificacion. |\n";
  md += "| `soportes_control` | `controlSupports` | text/null | Atributos de control o tercero que conviene capturar para auditoria. |\n";
  md += "| `observaciones_homologacion` | `mappingNotes` | text/null | Reglas, riesgos, alertas NIIF/NIA y criterios de homologacion. |\n\n";

  md += "## Reglas de uso para modelos de IA\n\n";
  md += "1. Para proponer una homologacion, comparar la cuenta del cliente contra `codigo`, `nombre`, `cuenta_russell`, `tipo_rubro`, `incluye` y `cuentas_posibles`.\n";
  md += "2. Usar `no_incluye` como filtro negativo obligatorio antes de aceptar una sugerencia.\n";
  md += "3. Usar `naturaleza` para detectar saldos con signo o naturaleza contraria.\n";
  md += "4. Usar `soportes_terceros` y `soportes_control` para pedir evidencia o explicar validaciones.\n";
  md += "5. Usar `observaciones_homologacion` para justificar riesgos, reclasificaciones y criterios de auditoria.\n";
  md += "6. No inferir saldos, materialidad o periodo desde esta tabla: esos datos pertenecen al balance del cliente.\n\n";

  md += "## Resumen por clase PUC\n\n";
  md += "| Clase | Nombre | Cuentas |\n";
  md += "|---|---|---:|\n";
  for (const [klass, classRows] of [...byClass.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    md += `| ${klass} | ${CLASS_LABELS[klass] ?? "Sin clasificar"} | ${classRows.length} |\n`;
  }
  md += "\n";

  md += "## Indice rapido\n\n";
  for (const [klass, classRows] of [...byClass.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const label = CLASS_LABELS[klass] ?? "Sin clasificar";
    md += `- [Clase ${klass} - ${label}](#clase-${klass}-${anchor(label)}) (${classRows.length} cuentas)\n`;
  }
  md += "\n";

  md += "## Cuentas estandar Russell\n\n";
  for (const [klass, classRows] of [...byClass.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const label = CLASS_LABELS[klass] ?? "Sin clasificar";
    md += `## Clase ${klass} - ${label}\n\n`;
    for (const row of classRows) {
      md += `### ${row.code} - ${row.name}\n\n`;
      md += "| Atributo | Valor |\n|---|---|\n";
      md += `| Codigo | \`${inline(row.code)}\` |\n`;
      md += `| Nombre | ${inline(row.name)} |\n`;
      md += `| Cuenta Russell / 4D | ${inline(row.russellAccount)} |\n`;
      md += `| Tipo de rubro | ${inline(row.categoryType)} |\n`;
      md += `| Naturaleza | ${row.nature === "D" ? "Debito (`D`)" : "Credito (`C`)"} |\n`;
      md += `| Padre logico | ${row.parent ? `\`${inline(row.parent)}\`` : "No especificado"} |\n`;
      md += `| Critica | ${yesNo(row.critical)} |\n\n`;
      md += `**Que incluye:** ${text(row.includes)}\n\n`;
      md += `**Que no incluye:** ${text(row.excludes)}\n\n`;
      md += `**Cuentas o nombres de cliente que podrian llegar aqui:** ${text(row.possibleAccounts)}\n\n`;
      md += `**Soportes o terceros esperados:** ${text(row.supportingDocuments)}\n\n`;
      md += `**Soportes de control recomendados:** ${text(row.controlSupports)}\n\n`;
      md += `**Observaciones de homologacion:** ${text(row.mappingNotes)}\n\n`;
    }
  }

  mkdirSync("docs/ai-context", { recursive: true });
  writeFileSync(OUTPUT, md, "utf8");
  console.log(JSON.stringify({ output: OUTPUT, accounts: rows.length, bytes: Buffer.byteLength(md, "utf8") }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
