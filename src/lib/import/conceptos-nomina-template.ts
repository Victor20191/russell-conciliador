// Generador de `Plantilla_Conceptos_Nomina.xlsx` — la carga masiva de conceptos de
// nómina (cliente / código / concepto / cuenta). Mismo criterio que la plantilla de
// clientes: hoja de captura + hoja de referencias (clientes de la cartera y cuentas
// válidas del módulo) + hoja de instrucciones.
//
// Las referencias se listan para que el usuario no adivine ni el NIT ni la cuenta;
// la validación real la hace la Server Action contra la BD.

import ExcelJS from "exceljs";

export type CatalogoPlantillaConceptos = {
  /** Clientes que el usuario puede configurar (su cartera). */
  clientes: { code: string; name: string; nit: string }[];
  /** Cuentas Russell de 4 dígitos válidas para Nómina. */
  cuentas: { codigo: string; nombre: string }[];
};

const HOJA_CONCEPTOS = "Conceptos";
const HOJA_INSTRUCCIONES = "Instrucciones";
const HOJA_REFERENCIAS = "Referencias";
const FILAS_EDICION = 500;

const HEADERS = ["Cliente (NIT o código) *", "Código *", "Concepto *", "Cuenta (4 dígitos) *"];

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

  ws.addRow(["NIT del cliente", "Cliente", "Código", "Cuenta Russell", "Nombre de la cuenta"]);
  const total = Math.max(clientes.length, cuentas.length, 1);
  for (let i = 0; i < total; i++) {
    ws.addRow([
      clientes[i]?.nit ?? "",
      clientes[i]?.name ?? "",
      clientes[i]?.code ?? "",
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

  return { clientes, cuentas };
}

function agregarInstrucciones(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet(HOJA_INSTRUCCIONES);
  ws.columns = [{ width: 34 }, { width: 100 }];
  ws.addRows([
    ["Uso", "Diligencia la hoja Conceptos. Borra o reemplaza las filas que empiezan por EJEMPLO."],
    ["Campos obligatorios", "Los cuatro: cliente, código, concepto y cuenta. Una fila con cualquiera de ellos vacío se rechaza."],
    ["Cliente", "Escribe el NIT o el código del cliente (C-1042). Consulta la hoja Referencias; solo aparecen los clientes que tienes asignados."],
    ["Código", "El código del concepto en la nómina del cliente. Es la LLAVE del mapeo: es lo que la plataforma busca en el archivo de nómina para saber a qué cuenta lleva cada fila."],
    ["Concepto", "El nombre legible del concepto (Sueldo básico, Auxilio de transporte…). Es la etiqueta que se ve al revisar el consolidado."],
    ["Cuenta", "Cuenta Russell de 4 dígitos. Si un concepto cruza contra varias, escríbelas en la MISMA fila separadas con punto y coma (;), p. ej. 5105; 7205."],
    ["Un concepto, una fila", "No repitas el mismo código para un cliente en dos filas: el archivo se rechaza. Usa el punto y coma para las cuentas múltiples."],
    ["Qué hace la carga", "Cada concepto REEMPLAZA las cuentas que ese código tuviera asignadas. Los conceptos que no vengan en el archivo se quedan como están (la carga no borra lo que no menciona)."],
    ["Validación", "No se importa nada si alguna fila tiene errores, si el cliente no existe o no está en tu cartera, o si la cuenta no pertenece al módulo de Nómina."],
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

  ws.addRow(HEADERS);
  const encabezado = ws.getRow(1);
  encabezado.height = 28;
  for (let col = 1; col <= HEADERS.length; col++) {
    const cell = encabezado.getCell(col);
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDE;
  }

  const nitEjemplo = referencias.clientes[0]?.nit ?? "900451227-3";
  const cuentaEjemplo = referencias.cuentas[0]?.codigo ?? "5105";
  const otraCuenta = referencias.cuentas[1]?.codigo ?? "7205";
  ws.addRow([nitEjemplo, "001", "EJEMPLO - Sueldo básico", cuentaEjemplo]);
  ws.addRow([nitEjemplo, "010", "EJEMPLO - Cesantías (dos cuentas)", `${cuentaEjemplo}; ${otraCuenta}`]);

  ws.autoFilter = { from: "A1", to: "D1" };
  [30, 16, 46, 26].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  for (let fila = 2; fila <= FILAS_EDICION; fila++) {
    const row = ws.getRow(fila);
    const fondo = fila <= 3 ? COLOR_WARN : COLOR_FILL;
    for (let col = 1; col <= HEADERS.length; col++) {
      const cell = row.getCell(col);
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = BORDE;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fondo } };
      // El código puede ser «001»: sin formato de texto Excel se lo comería.
      if (col === 2) cell.numFmt = "@";
    }
  }

  const clientesRange = rangoReferencia("A", referencias.clientes.length);
  if (clientesRange) {
    aplicarValidacionLista(ws, 1, clientesRange, "Cliente", "Selecciona el NIT de un cliente de tu cartera.");
  }
  // La cuenta NO se valida con lista: una celda puede llevar varias separadas con «;».

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
