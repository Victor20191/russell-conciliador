// Parser del Excel de importación de clientes (`Plantilla_Importacion_Clientes.xlsx`).
// Lee la hoja «Clientes» (encabezados en la fila 1, datos desde la fila 2) y
// devuelve las filas crudas + errores de estructura. La resolución de personas,
// módulos y formatos DIAN contra la BD y la validación de jerarquía viven en la
// Server Action.

import type ExcelJS from "exceljs";
import { celdaTexto, normalizar, cargarWorkbook } from "./xlsx";
import type { ErrorImport } from "./maestros";

const HOJA = "Clientes";
const TIPOS = ["A", "B", "C"];

export type FilaCliente = {
  fila: number;
  name: string;
  nit: string;
  tipo: string;
  erp: string;
  sector: string;
  socio: string;
  gerente: string;
  senior: string;
  staff: string[]; // nombres (uno o varios)
  modulos: string[]; // nombres de módulos marcados «Sí»
  dianCodes: string[]; // códigos DIAN (F-300…) marcados «Sí»
  // Bloque SIN ningún valor (ni «Sí» ni «No»): la Server Action lo interpreta
  // como «activar todos» por defecto. Un «No» explícito NO deja el bloque en blanco.
  modulosEnBlanco: boolean;
  dianEnBlanco: boolean;
};

export type ParseClientes = { filas: FilaCliente[]; errores: ErrorImport[] };

/** Estado que devuelve la Server Action `importarClientes`. */
export type ImportClientesState = {
  ok?: boolean;
  message?: string;
  errores?: ErrorImport[];
  resumen?: { creados: number; codigos: string[] };
};

/** ¿La celda marca «sí»? Acepta Sí/Si/X/1/true (sin acentos). */
function esSi(v: string): boolean {
  const n = normalizar(v);
  return n === "si" || n === "x" || n === "1" || n === "true";
}

const FIJAS = ["name", "nit", "tipo", "erp", "sector", "socio", "gerente", "senior", "staff"] as const;

export async function parseClientesWorkbook(data: ArrayBuffer | Buffer): Promise<ParseClientes> {
  const wb = await cargarWorkbook(data);
  if (!wb) {
    return {
      filas: [],
      errores: [
        {
          hoja: "Archivo",
          fila: 0,
          mensaje:
            "No se pudo leer el archivo. Asegúrate de subir un .xlsx válido (vuelve a guardarlo desde Excel si es necesario).",
        },
      ],
    };
  }
  const ws = wb.getWorksheet(HOJA);
  if (!ws) {
    return { filas: [], errores: [{ hoja: HOJA, fila: 0, mensaje: `No se encontró la hoja «${HOJA}».` }] };
  }

  // Encabezados en la fila 1. Las columnas DIAN empiezan con «DIAN»; las demás no
  // reconocidas como fijas se tratan como módulos (el encabezado es el nombre).
  const fix: Record<string, number> = {};
  const modCols: { col: number; name: string }[] = [];
  const dianCols: { col: number; code: string }[] = [];
  ws.getRow(1).eachCell((cell, c) => {
    const raw = celdaTexto(cell.value);
    const h = normalizar(raw);
    if (!h) return;
    if (h.startsWith("dian")) {
      const m = /\(([^)]+)\)/.exec(raw);
      dianCols.push({ col: c, code: (m ? m[1] : raw).trim().toUpperCase() });
      return;
    }
    if (h.includes("razon")) fix.name = c;
    else if (h.includes("nit")) fix.nit = c;
    else if (h.includes("tipo")) fix.tipo = c;
    else if (h.includes("erp")) fix.erp = c;
    else if (h.includes("sector")) fix.sector = c;
    else if (h.includes("socio")) fix.socio = c;
    else if (h.includes("gerente")) fix.gerente = c;
    else if (h.includes("senior")) fix.senior = c;
    else if (h.includes("staff")) fix.staff = c;
    else modCols.push({ col: c, name: raw.trim() });
  });

  const errores: ErrorImport[] = [];
  const faltan = FIJAS.filter((k) => !fix[k]);
  if (faltan.length > 0) {
    errores.push({
      hoja: HOJA,
      fila: 1,
      mensaje: `Encabezados incompletos: faltan columnas (${faltan.join(", ")}).`,
    });
    return { filas: [], errores };
  }

  const filas: FilaCliente[] = [];
  const val = (row: ExcelJS.Row, c?: number) => (c ? celdaTexto(row.getCell(c).value) : "");

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const textoFila = ((row.values as ExcelJS.CellValue[]) ?? []).map((v) => celdaTexto(v)).join(" ");
    if (/EJEMPLO/i.test(textoFila)) continue;

    const name = val(row, fix.name);
    const nit = val(row, fix.nit);
    const tipoRaw = val(row, fix.tipo);
    const erp = val(row, fix.erp);
    const sector = val(row, fix.sector);
    const socio = val(row, fix.socio);
    const gerente = val(row, fix.gerente);
    const senior = val(row, fix.senior);
    const staffRaw = val(row, fix.staff);
    const staff = staffRaw.split(";").map((s) => s.trim()).filter(Boolean);

    if (!name && !nit && !tipoRaw && !erp && !sector && !socio && !gerente && !senior && !staffRaw)
      continue; // fila vacía

    const tipo = tipoRaw.trim().toUpperCase();
    const errs: string[] = [];
    if (!name) errs.push("Falta la razón social.");
    if (!nit) errs.push("Falta el NIT.");
    if (!tipo) errs.push("Falta el tipo de cliente.");
    else if (!TIPOS.includes(tipo)) errs.push(`Tipo inválido: «${tipoRaw}» (usa A, B o C).`);
    if (!erp) errs.push("Falta el ERP.");
    // El sector es opcional (hay clientes sin sector): no se exige aquí.
    if (!socio) errs.push("Falta el socio.");
    if (!gerente) errs.push("Falta el gerente.");
    if (!senior) errs.push("Falta el senior.");
    if (staff.length === 0) errs.push("Falta al menos un staff.");

    const modulos = modCols.filter((m) => esSi(val(row, m.col))).map((m) => m.name);
    const dianCodes = dianCols.filter((d) => esSi(val(row, d.col))).map((d) => d.code);
    // Bloque en blanco = ninguna celda con texto (ni «Sí» ni «No»).
    const modulosEnBlanco = modCols.every((m) => val(row, m.col) === "");
    const dianEnBlanco = dianCols.every((d) => val(row, d.col) === "");

    if (errs.length > 0) {
      for (const m of errs) errores.push({ hoja: HOJA, fila: r, mensaje: m });
      continue;
    }

    filas.push({
      fila: r, name, nit, tipo, erp, sector, socio, gerente, senior, staff,
      modulos, dianCodes, modulosEnBlanco, dianEnBlanco,
    });
  }

  return { filas, errores };
}
