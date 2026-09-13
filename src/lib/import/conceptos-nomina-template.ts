// Generador de `Plantilla_Conceptos_Nomina.xlsx` — la carga masiva de conceptos de nómina
// (RF-NOM-08: cliente / grupo de cuenta contable / código / nombre / cuenta contable del
// cliente, más el centro de costo opcional). Mismo criterio que la plantilla de clientes:
// hoja de captura + hoja de referencias (clientes de la cartera, grupos del catálogo y cuentas
// Russell del módulo) + hoja de instrucciones.
//
// Las referencias se listan para que el usuario no adivine ni el NIT ni el grupo; la
// validación real la hace la Server Action contra la BD.

import ExcelJS from "exceljs";
import { GRUPOS_CONCEPTO_NOMINA } from "@/lib/modulos/nomina/grupos-concepto";

export type CatalogoPlantillaConceptos = {
  /** Clientes que el usuario puede configurar (su cartera). */
  clientes: { code: string; name: string; nit: string }[];
  /** Cuentas Russell de 6 dígitos válidas para Nómina (RF-NOM-05). */
  cuentas: { codigo: string; nombre: string }[];
};

const HOJA_CONCEPTOS = "Conceptos";
const HOJA_INSTRUCCIONES = "Instrucciones";
const HOJA_REFERENCIAS = "Referencias";
const FILAS_EDICION = 500;

export const HEADERS_PLANTILLA_CONCEPTOS = [
  "Cliente (NIT o código) *",
  "Grupo de cuenta contable",
  "Código del concepto *",
  "Nombre del concepto *",
  "Cuenta contable del cliente *",
  "Centro de costo / clase",
];

const COLOR_HEADER = "FF0F2744";
const COLOR_FILL = "FFF6F8FB";
const COLOR_WARN = "FFFFF4D6";
const COLOR_BORDER = "FFD8E0EA";

const BORDE = {
  top: { style: "thin" as const, color: { argb: COLOR_BORDER } },
  left: { style: "thin" as const, color: { argb: COLOR_BORDER } },
  bottom: { style: "thin" as const, color: { argb: COLOR_BORDER } },
  right: { style: "thin" as const, color: { argb: COLOR_BORDER } },
};

function rangoReferencia(columna: string, total: number): string | null {
  if (total <= 0) return null;
  return `${HOJA_REFERENCIAS}!$${columna}$2:$${columna}$${total + 1}`;
}

function aplicarValidacionLista(
  ws: ExcelJS.Worksheet,
  columna: number,
  formula: string,
  promptTitle: string,
  prompt: string,
) {
  for (let fila = 2; fila <= FILAS_EDICION; fila++) {
    ws.getCell(fila, columna).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [formula],
      showInputMessage: true,
      promptTitle,
      prompt,
    };
  }
}

function agregarReferencias(wb: ExcelJS.Workbook, catalogo: CatalogoPlantillaConceptos) {
  const ws = wb.addWorksheet(HOJA_REFERENCIAS);
  const clientes = [...catalogo.clientes].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const cuentas = [...catalogo.cuentas].sort((a, b) => a.codigo.localeCompare(b.codigo, "es"));
  const grupos = GRUPOS_CONCEPTO_NOMINA.map((g) => ({ etiqueta: g.etiqueta, sufijo: `5105${g.sufijoRussell} / 5205${g.sufijoRussell}` }));

  ws.addRow(["NIT del cliente", "Cliente", "Código", "Grupo de cuenta contable", "Cuenta Russell del grupo (admón. / ventas)", "Cuenta Russell", "Nombre de la cuenta"]);
  const total = Math.max(clientes.length, cuentas.length, grupos.length, 1);
  for (let i = 0; i < total; i++) {
    ws.addRow([
      clientes[i]?.nit ?? "",
      clientes[i]?.name ?? "",
      clientes[i]?.code ?? "",
      grupos[i]?.etiqueta ?? "",
      grupos[i]?.sufijo ?? "",
      cuentas[i]?.codigo ?? "",
      cuentas[i]?.nombre ?? "",
    ]);
  }

  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER } };
  ws.columns.forEach((col) => {
    col.width = 26;
    col.alignment = { vertical: "top", wrapText: true };
  });

  return { clientes, cuentas, grupos };
}

function agregarInstrucciones(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet(HOJA_INSTRUCCIONES);
  ws.columns = [{ width: 34 }, { width: 110 }];
  ws.addRows([
    ["Uso", "Diligencia la hoja Conceptos. Borra o reemplaza las filas que empiezan por EJEMPLO."],
    ["Campos obligatorios", "Cliente, código, nombre y cuenta contable. Una fila con cualquiera de ellos vacío se rechaza. El grupo y el centro de costo son opcionales."],
    ["Cliente", "Escribe el NIT o el código del cliente (C-1042). Consulta la hoja Referencias; solo aparecen los clientes que tienes asignados."],
    ["Grupo de cuenta contable", "La familia del concepto: Sueldos, Horas extras, Comisiones, Incapacidades, Auxilio de transporte, Cesantías, Intereses sobre cesantías, Prima de servicios, Vacaciones, Auxilios, Bonificaciones, Indemnizaciones, Aportes ARL/EPS/pensión… (lista en Referencias). Si lo dejas vacío, la plataforma lo sugiere por la cuenta o por el nombre."],
    ["Código", "El código del concepto en la nómina del cliente. Es la LLAVE del mapeo: es lo que la plataforma busca en el archivo de nómina para saber a qué cuenta lleva cada fila. «01», «001» y «1» se toman como el mismo código."],
    ["Nombre", "El nombre legible del concepto (Sueldo básico, Auxilio de transporte…). Es la etiqueta que se ve al revisar el consolidado."],
    ["Cuenta contable del cliente", "La cuenta del PUC del cliente a la que el ERP lleva el concepto (51050601, 0005060000 en SIIGO). La plataforma la convierte a la cuenta Russell de 6 dígitos con la homologación del balance (RF-NOM-10) o por su estructura. También acepta la cuenta Russell directamente (510506). Si un concepto va a varias cuentas, escríbelas en la MISMA fila separadas con punto y coma (;), p. ej. 51050601; 72050601."],
    ["Centro de costo / clase", "Opcional. Si el archivo de nómina trae centro de costo o clase (GYA, MOD, CP, GV, 51, 72…) y el concepto va a una cuenta distinta por centro, escribe una fila por centro con el valor exacto que trae el archivo. Sin centro, la fila aplica a todos."],
    ["Un concepto, una fila", "No repitas el mismo código y centro para un cliente en dos filas: el archivo se rechaza. Usa el punto y coma para las cuentas múltiples."],
    ["Qué hace la carga", "Cada concepto (y centro) REEMPLAZA las cuentas que tuviera asignadas. Los conceptos que no vengan en el archivo se quedan como están (la carga no borra lo que no menciona)."],
    ["Cuentas de deducciones", "Las cuentas de pasivo, activo o ingreso (libranzas 2370, retención 2365, préstamos 1365, intereses 4210) se aceptan: no cruzan contra el gasto, van al control de deducciones."],
    ["Catálogo del ERP", "Si el ERP exporta su propio informe de conceptos (SIIGO «Informe conceptos de nómina», «Equivalencias», «Maestro de conceptos»), puedes cargarlo tal cual con «Cargar catálogo del ERP», sin pasarlo a esta plantilla."],
    ["Validación", "No se importa nada si alguna fila tiene errores, si el cliente no existe o no está en tu cartera, si el grupo no está en el catálogo, o si la cuenta no se puede llevar al módulo de Nómina."],
  ]);

  ws.eachRow((row) => {
    row.eachCell((cell, col) => {
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = BORDE;
      if (col === 1) {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER } };
      }
    });
  });
}

export async function crearPlantillaConceptosNomina(
  catalogo: CatalogoPlantillaConceptos,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell LFM";
  wb.created = new Date();

  const ws = wb.addWorksheet(HOJA_CONCEPTOS, { views: [{ state: "frozen", ySplit: 1 }] });
  const referencias = agregarReferencias(wb, catalogo);
  agregarInstrucciones(wb);

  ws.addRow(HEADERS_PLANTILLA_CONCEPTOS);
  const encabezado = ws.getRow(1);
  encabezado.height = 28;
  for (let col = 1; col <= HEADERS_PLANTILLA_CONCEPTOS.length; col++) {
    const cell = encabezado.getCell(col);
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDE;
  }

  const nitEjemplo = referencias.clientes[0]?.nit ?? "900451227-3";
  ws.addRow([nitEjemplo, "Sueldos", "001", "EJEMPLO - Sueldo básico", "51050601", ""]);
  ws.addRow([nitEjemplo, "Cesantías", "010", "EJEMPLO - Cesantías (dos cuentas)", "51053001; 72053001", ""]);
  ws.addRow([nitEjemplo, "Sueldos", "001", "EJEMPLO - Sueldo básico en producción", "72050601", "MOD"]);

  ws.autoFilter = { from: "A1", to: "F1" };
  [30, 26, 16, 46, 30, 20].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  for (let fila = 2; fila <= FILAS_EDICION; fila++) {
    const row = ws.getRow(fila);
    const fondo = fila <= 4 ? COLOR_WARN : COLOR_FILL;
    for (let col = 1; col <= HEADERS_PLANTILLA_CONCEPTOS.length; col++) {
      const cell = row.getCell(col);
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = BORDE;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fondo } };
      // El código puede ser «001» y la cuenta «0005060000»: sin formato de texto Excel se los comería.
      if (col === 3 || col === 5) cell.numFmt = "@";
    }
  }

  const clientesRange = rangoReferencia("A", referencias.clientes.length);
  if (clientesRange) {
    aplicarValidacionLista(ws, 1, clientesRange, "Cliente", "Selecciona el NIT de un cliente de tu cartera.");
  }
  const gruposRange = rangoReferencia("D", referencias.grupos.length);
  if (gruposRange) {
    aplicarValidacionLista(ws, 2, gruposRange, "Grupo de cuenta contable", "Familia del concepto (Sueldos, Prima de servicios…). Déjalo vacío para que se sugiera.");
  }
  // La cuenta NO se valida con lista: acepta la del cliente o la Russell, y varias separadas con «;».

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
