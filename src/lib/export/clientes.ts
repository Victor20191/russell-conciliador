// Generador del Excel de EXPORTACIÓN de clientes (descarga «todos los clientes»
// de la plataforma desde /config/clientes). Función PURA y testeable: recibe las
// filas ya resueltas (nombres de responsables, estado de módulos/DIAN) y el
// catálogo de módulos/formatos, y devuelve el Buffer del .xlsx. La lectura de BD
// y el filtrado por cartera viven en la Route Handler.
//
// El layout refleja el estilo de `clientes-template.ts` (plantilla de
// importación) para que el archivo resulte familiar, pero aquí es un REPORTE:
// añade la columna «Código» y muestra el estado real de cada módulo
// (Parametrizado / Pendiente / No activo) y formato DIAN (Sí / No).

import ExcelJS from "exceljs";
import { fmtDate } from "@/lib/format";
import { PROCESOS_ERP_BASE, type CodigoProcesoErp } from "@/lib/erp-procesos";

/** Una fila de cliente ya resuelta para exportar (sin dependencias de Prisma). */
export type FilaClienteExport = {
  code: string;
  name: string;
  nit: string;
  tipo: string;
  erpName: string | null;
  erpsPorProceso?: Partial<Record<CodigoProcesoErp, string | null>>;
  sectorName: string | null;
  socio: string | null;
  gerente: string | null;
  senior: string | null;
  staff: string[]; // uno o varios
  modules: { moduleId: number; status: string }[]; // status: configured | pending
  dianFormIds: number[]; // formatos DIAN activos para el cliente
};

/** Catálogo global que define el orden de las columnas de módulos y DIAN. */
export type CatalogoExportClientes = {
  modulos: { id: number; name: string }[];
  dianForms: { id: number; name: string; code: string }[];
};

const HOJA_CLIENTES = "Clientes";
const HOJA_RESUMEN = "Resumen";

const COLOR_HEADER = "FF0F2744";
const COLOR_HEADER_DIAN = "FF254E7A";
const COLOR_FILL = "FFFFFFFF";
const COLOR_ZEBRA = "FFF6F8FB";
const COLOR_BORDER = "FFD8E0EA";
const COLOR_OK = "FFE3F4E9"; // verde suave — Parametrizado / Sí
const COLOR_WARN = "FFFFF4D6"; // ámbar suave — Pendiente
const COLOR_OFF = "FFF1F3F6"; // gris — No activo / No

const FIJAS = [
  "Código",
  "Razón social",
  "NIT",
  "Tipo",
  ...PROCESOS_ERP_BASE.map((proceso) => `ERP · ${proceso.codigo} · ${proceso.nombre}`),
  "Sector",
  "Socio (firma)",
  "Gerente (valida)",
  "Senior (revisa)",
  "Staff (ejecuta)",
];
const ANCHOS_FIJAS = [14, 36, 16, 8, ...PROCESOS_ERP_BASE.map(() => 19), 22, 24, 24, 24, 38];

const BORDE = {
  top: { style: "thin" as const, color: { argb: COLOR_BORDER } },
  left: { style: "thin" as const, color: { argb: COLOR_BORDER } },
  bottom: { style: "thin" as const, color: { argb: COLOR_BORDER } },
  right: { style: "thin" as const, color: { argb: COLOR_BORDER } },
};

function erpDeProceso(
  cliente: FilaClienteExport,
  codigo: CodigoProcesoErp,
): string | null {
  if (
    cliente.erpsPorProceso
    && Object.prototype.hasOwnProperty.call(cliente.erpsPorProceso, codigo)
  ) {
    return cliente.erpsPorProceso[codigo] ?? null;
  }
  return codigo === "CONT" ? cliente.erpName : null;
}

function relleno(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function columnaLetra(indice: number): string {
  let n = indice;
  let letra = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    letra = String.fromCharCode(65 + r) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

/** Estado visible de un módulo para el cliente. Espeja las etiquetas de la UI:
 *  «parametrizado, pendiente o no activo». */
function estadoModulo(
  cliente: FilaClienteExport,
  moduleId: number,
): { label: string; color: string } {
  const m = cliente.modules.find((x) => x.moduleId === moduleId);
  if (!m) return { label: "No activo", color: COLOR_OFF };
  if (m.status === "configured") return { label: "Parametrizado", color: COLOR_OK };
  return { label: "Pendiente", color: COLOR_WARN };
}

function estadoDian(
  cliente: FilaClienteExport,
  formId: number,
): { label: string; color: string } {
  return cliente.dianFormIds.includes(formId)
    ? { label: "Sí", color: COLOR_OK }
    : { label: "No", color: COLOR_OFF };
}

function estilizarEncabezado(
  ws: ExcelJS.Worksheet,
  totalColumnas: number,
  desdeDian: number,
) {
  const fila = ws.getRow(1);
  fila.height = 30;
  for (let col = 1; col <= totalColumnas; col++) {
    const cell = fila.getCell(col);
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
    cell.fill = relleno(col >= desdeDian ? COLOR_HEADER_DIAN : COLOR_HEADER);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDE;
  }
}

function agregarResumen(
  wb: ExcelJS.Workbook,
  clientes: FilaClienteExport[],
  generadoEn: Date,
) {
  const ws = wb.addWorksheet(HOJA_RESUMEN);
  ws.columns = [{ width: 34 }, { width: 18 }];

  const porTipo = new Map<string, number>();
  const porErp = new Map<string, number>();
  for (const c of clientes) {
    const tipo = c.tipo?.trim() || "—";
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
    const erp = erpDeProceso(c, "CONT")?.trim() || "Sin ERP";
    porErp.set(erp, (porErp.get(erp) ?? 0) + 1);
  }

  const filas: [string, string | number][] = [
    ["Reporte", "Clientes de la plataforma"],
    ["Generado el", fmtDate(generadoEn)],
    ["Total de clientes", clientes.length],
    ["", ""],
    ["Por tipo de cliente", ""],
  ];
  for (const tipo of [...porTipo.keys()].sort((a, b) => a.localeCompare(b, "es"))) {
    filas.push([`  Tipo ${tipo}`, porTipo.get(tipo)!]);
  }
  filas.push(["", ""], ["Por ERP", ""]);
  for (const erp of [...porErp.keys()].sort((a, b) => a.localeCompare(b, "es"))) {
    filas.push([`  ${erp}`, porErp.get(erp)!]);
  }

  filas.forEach(([etiqueta, valor], i) => {
    const row = ws.addRow([etiqueta, valor]);
    const esTitulo =
      etiqueta === "Por tipo de cliente" || etiqueta === "Por ERP" || i === 0;
    row.getCell(1).font = { bold: esTitulo, color: esTitulo ? { argb: COLOR_HEADER } : undefined };
    row.getCell(2).alignment = { horizontal: "right" };
  });
}

export async function crearExportacionClientes(
  clientes: FilaClienteExport[],
  catalogo: CatalogoExportClientes,
  generadoEn: Date = new Date(),
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell LFM";
  wb.created = generadoEn;

  const ws = wb.addWorksheet(HOJA_CLIENTES, {
    views: [{ state: "frozen", xSplit: 2, ySplit: 1 }],
  });

  const modulos = catalogo.modulos;
  const dianForms = [...catalogo.dianForms].sort((a, b) =>
    a.code.localeCompare(b.code, "es"),
  );
  const dianHeaders = dianForms.map((f) => `DIAN · ${f.name} (${f.code})`);
  const headers = [...FIJAS, ...modulos.map((m) => m.name), ...dianHeaders];
  ws.addRow(headers);

  const totalColumnas = headers.length;
  const primeraColModulo = FIJAS.length + 1;
  const primeraColDian = FIJAS.length + modulos.length + 1;
  estilizarEncabezado(ws, totalColumnas, primeraColDian);

  for (const c of clientes) {
    const fijas = [
      c.code,
      c.name,
      c.nit,
      c.tipo,
      ...PROCESOS_ERP_BASE.map((proceso) =>
        erpDeProceso(c, proceso.codigo) ?? "Pendiente / sin definir",
      ),
      c.sectorName ?? "Sin sector",
      c.socio ?? "—",
      c.gerente ?? "—",
      c.senior ?? "—",
      c.staff.length > 0 ? c.staff.join("; ") : "—",
    ];
    const modCells = modulos.map((m) => estadoModulo(c, m.id));
    const dianCells = dianForms.map((f) => estadoDian(c, f.id));
    ws.addRow([
      ...fijas,
      ...modCells.map((x) => x.label),
      ...dianCells.map((x) => x.label),
    ]);
  }

  // Anchos: fijas con sus valores, módulos y DIAN con un ancho cómodo.
  headers.forEach((_, i) => {
    const col = ws.getColumn(i + 1);
    if (i < FIJAS.length) col.width = ANCHOS_FIJAS[i];
    else if (i < FIJAS.length + modulos.length) col.width = 16;
    else col.width = 22;
  });

  ws.autoFilter = { from: "A1", to: `${columnaLetra(totalColumnas)}1` };

  // Estilos por celda en el cuerpo: zebra, bordes, alineación y color de estado.
  for (let i = 0; i < clientes.length; i++) {
    const c = clientes[i];
    const fila = i + 2; // fila 1 = encabezado
    const row = ws.getRow(fila);
    const fondo = i % 2 === 0 ? COLOR_FILL : COLOR_ZEBRA;
    for (let col = 1; col <= totalColumnas; col++) {
      const cell = row.getCell(col);
      cell.border = BORDE;
      cell.alignment = {
        vertical: "middle",
        wrapText: col === 2 || col === 10, // razón social y staff
        horizontal: col === 1 || col === 4 ? "center" : col >= primeraColModulo ? "center" : "left",
      };
      if (col >= primeraColModulo && col < primeraColDian) {
        cell.fill = relleno(estadoModulo(c, modulos[col - primeraColModulo].id).color);
      } else if (col >= primeraColDian) {
        cell.fill = relleno(estadoDian(c, dianForms[col - primeraColDian].id).color);
      } else {
        cell.fill = relleno(fondo);
      }
    }
    // Código y NIT en fuente monoespaciada para que se lean como identificadores.
    row.getCell(1).font = { name: "Consolas", size: 10.5 };
    row.getCell(3).font = { name: "Consolas", size: 10.5 };
  }

  agregarResumen(wb, clientes, generadoEn);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
}
