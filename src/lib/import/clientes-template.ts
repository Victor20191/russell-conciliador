import ExcelJS from "exceljs";

export type CatalogoPlantillaClientes = {
  modulos: { name: string }[];
  dianForms: { name: string; code: string }[];
  personas: { name: string; role: string }[];
  erps: string[];
  sectores: string[];
};

const HOJA_CLIENTES = "Clientes";
const HOJA_INSTRUCCIONES = "Instrucciones";
const HOJA_REFERENCIAS = "Referencias";
const FILAS_EDICION = 300;

const FIJAS = [
  "Razón social *",
  "NIT *",
  "Tipo de cliente *",
  "ERP",
  "Sector",
  "Socio (firma) *",
  "Gerente (valida) *",
  "Senior (revisa) *",
  "Staff (ejecuta) * - uno o varios, separar con ;",
];

const COLOR_HEADER = "FF0F2744";
const COLOR_HEADER_DIAN = "FF254E7A";
const COLOR_FILL = "FFF6F8FB";
const COLOR_WARN = "FFFFF4D6";
const COLOR_BORDER = "FFD8E0EA";

function valoresUnicos(valores: string[]): string[] {
  return [...new Set(valores.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
}

function nombresPorRol(catalogo: CatalogoPlantillaClientes, rol: string): string[] {
  return valoresUnicos(catalogo.personas.filter((p) => p.role === rol).map((p) => p.name));
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

function aplicarValidacionSiNo(ws: ExcelJS.Worksheet, desde: number, hasta: number) {
  for (let col = desde; col <= hasta; col++) {
    aplicarValidacionLista(ws, col, '"Sí,No"', "Configuración", "Usa Sí para activar o No para excluir.");
  }
}

function estilizarFilaEncabezado(ws: ExcelJS.Worksheet, totalColumnas: number, desdeDian: number) {
  const fila = ws.getRow(1);
  fila.height = 28;
  for (let col = 1; col <= totalColumnas; col++) {
    const cell = fila.getCell(col);
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: col >= desdeDian ? COLOR_HEADER_DIAN : COLOR_HEADER },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: COLOR_BORDER } },
      left: { style: "thin", color: { argb: COLOR_BORDER } },
      bottom: { style: "thin", color: { argb: COLOR_BORDER } },
      right: { style: "thin", color: { argb: COLOR_BORDER } },
    };
  }
}

function agregarReferencias(wb: ExcelJS.Workbook, catalogo: CatalogoPlantillaClientes) {
  const ws = wb.addWorksheet(HOJA_REFERENCIAS);
  const socios = nombresPorRol(catalogo, "Socio");
  const gerentes = nombresPorRol(catalogo, "Gerente");
  const seniors = nombresPorRol(catalogo, "Senior");
  const staff = nombresPorRol(catalogo, "Staff");
  const modulos = valoresUnicos(catalogo.modulos.map((m) => m.name));
  const dian = [...catalogo.dianForms].sort((a, b) => a.code.localeCompare(b.code, "es"));
  const erps = valoresUnicos(catalogo.erps);
  const sectores = valoresUnicos(catalogo.sectores);

  const headers = [
    "Socios",
    "Gerentes",
    "Seniors",
    "Staff",
    "",
    "Módulos",
    "DIAN código",
    "DIAN nombre",
    "",
    "ERPs válidos",
    "Sectores válidos",
  ];
  ws.addRow(headers);

  const total = Math.max(
    socios.length,
    gerentes.length,
    seniors.length,
    staff.length,
    modulos.length,
    dian.length,
    erps.length,
    sectores.length,
    1,
  );
  for (let i = 0; i < total; i++) {
    ws.addRow([
      socios[i] ?? "",
      gerentes[i] ?? "",
      seniors[i] ?? "",
      staff[i] ?? "",
      "",
      modulos[i] ?? "",
      dian[i]?.code ?? "",
      dian[i]?.name ?? "",
      "",
      erps[i] ?? "",
      sectores[i] ?? "",
    ]);
  }

  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER } };
  ws.columns.forEach((col) => {
    col.width = 24;
    col.alignment = { vertical: "top", wrapText: true };
  });

  return { socios, gerentes, seniors, erps, sectores };
}

function agregarInstrucciones(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet(HOJA_INSTRUCCIONES);
  ws.columns = [{ width: 34 }, { width: 100 }];
  ws.addRows([
    ["Uso", "Diligencia la hoja Clientes. Borra o reemplaza las filas que empiezan por EJEMPLO."],
    ["Campos obligatorios", "Razón social, NIT, tipo de cliente, socio, gerente, senior y al menos un staff."],
    ["ERP y sector", "Opcionales al cargar. El ERP es obligatorio para INICIAR una conciliación o cargar el balance: el sistema lo exigirá en ese momento."],
    ["Tipo de cliente", "Usa A, B o C."],
    ["Responsables", "Escribe los nombres exactamente como aparecen en la hoja Referencias. Staff acepta uno o varios nombres separados con punto y coma (;)."],
    ["Módulos", "Marca Sí en los módulos que debe tener el cliente y No en los que no aplican. Si dejas todo el bloque de módulos en blanco, el sistema activará todos."],
    ["Formatos DIAN", "Marca Sí o No en las columnas DIAN. Si dejas todo el bloque DIAN en blanco, el sistema activará todos los formatos."],
    ["Validación", "No se importará ningún cliente si una fila tiene errores o si los responsables no cumplen la jerarquía Socio -> Gerente -> Senior -> Staff."],
  ]);

  ws.eachRow((row) => {
    row.eachCell((cell, col) => {
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: COLOR_BORDER } },
        left: { style: "thin", color: { argb: COLOR_BORDER } },
        bottom: { style: "thin", color: { argb: COLOR_BORDER } },
        right: { style: "thin", color: { argb: COLOR_BORDER } },
      };
      if (col === 1) {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER } };
      }
    });
  });
}

export async function crearPlantillaImportacionClientes(
  catalogo: CatalogoPlantillaClientes,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell LFM";
  wb.created = new Date();

  const ws = wb.addWorksheet(HOJA_CLIENTES, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const referencias = agregarReferencias(wb, catalogo);
  agregarInstrucciones(wb);

  const modulos = valoresUnicos(catalogo.modulos.map((m) => m.name));
  const dianHeaders = [...catalogo.dianForms]
    .sort((a, b) => a.code.localeCompare(b.code, "es"))
    .map((f) => `DIAN · ${f.name} (${f.code})`);
  const headers = [...FIJAS, ...modulos, ...dianHeaders];
  ws.addRow(headers);

  const totalColumnas = headers.length;
  const primeraColDian = FIJAS.length + modulos.length + 1;
  estilizarFilaEncabezado(ws, totalColumnas, primeraColDian);

  ws.addRow([
    "EJEMPLO - Inversiones del Pacífico S.A.S.",
    "900451227-3",
    "A",
    "SIESA",
    "Comercio",
    referencias.socios[0] ?? "Nombre del socio",
    referencias.gerentes[0] ?? "Nombre del gerente",
    referencias.seniors[0] ?? "Nombre del senior",
    "Nombre staff 1; Nombre staff 2",
    ...modulos.map(() => "Sí"),
    ...dianHeaders.map(() => "Sí"),
  ]);
  ws.addRow([
    "EJEMPLO - Cliente con módulos selectivos",
    "800123456-7",
    "B",
    "SAP",
    "Servicios",
    referencias.socios[0] ?? "Nombre del socio",
    referencias.gerentes[0] ?? "Nombre del gerente",
    referencias.seniors[0] ?? "Nombre del senior",
    "Nombre staff 1",
    ...modulos.map((_, i) => (i === 0 ? "Sí" : "No")),
    ...dianHeaders.map((_, i) => (i === 0 ? "Sí" : "No")),
  ]);

  ws.autoFilter = {
    from: "A1",
    to: `${columnaLetra(totalColumnas)}1`,
  };

  const widths = [34, 18, 16, 16, 22, 26, 26, 26, 42];
  headers.forEach((_, i) => {
    ws.getColumn(i + 1).width = widths[i] ?? 18;
  });

  for (let fila = 2; fila <= FILAS_EDICION; fila++) {
    const row = ws.getRow(fila);
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: COLOR_BORDER } },
        left: { style: "thin", color: { argb: COLOR_BORDER } },
        bottom: { style: "thin", color: { argb: COLOR_BORDER } },
        right: { style: "thin", color: { argb: COLOR_BORDER } },
      };
    });
    if (fila <= 3) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_WARN } };
      });
    } else {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_FILL } };
      });
    }
  }

  aplicarValidacionLista(ws, 3, '"A,B,C"', "Tipo de cliente", "Selecciona A, B o C.");

  const socioRange = rangoReferencia("A", referencias.socios.length);
  if (socioRange) aplicarValidacionLista(ws, 6, socioRange, "Socio", "Selecciona un socio activo.");
  const gerenteRange = rangoReferencia("B", referencias.gerentes.length);
  if (gerenteRange) aplicarValidacionLista(ws, 7, gerenteRange, "Gerente", "Selecciona un gerente activo.");
  const seniorRange = rangoReferencia("C", referencias.seniors.length);
  if (seniorRange) aplicarValidacionLista(ws, 8, seniorRange, "Senior", "Selecciona un senior activo.");
  const erpRange = rangoReferencia("J", referencias.erps.length);
  if (erpRange) aplicarValidacionLista(ws, 4, erpRange, "ERP", "Selecciona un ERP del catálogo (o escribe uno nuevo).");
  const sectorRange = rangoReferencia("K", referencias.sectores.length);
  if (sectorRange) aplicarValidacionLista(ws, 5, sectorRange, "Sector", "Selecciona un sector del catálogo (o déjalo vacío).");

  if (modulos.length > 0) {
    aplicarValidacionSiNo(ws, FIJAS.length + 1, FIJAS.length + modulos.length);
  }
  if (dianHeaders.length > 0) {
    aplicarValidacionSiNo(ws, primeraColDian, totalColumnas);
  }

  ws.getCell("I2").note = "Para varios staff, separa nombres con punto y coma (;).";
  ws.getCell("A2").note = "Esta fila se ignora porque contiene EJEMPLO. Puedes borrarla.";

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
}
