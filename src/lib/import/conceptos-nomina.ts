// Parser del Excel de carga masiva de CONCEPTOS DE NÓMINA
// (`Plantilla_Conceptos_Nomina.xlsx`). Lee la hoja «Conceptos» (encabezados en la
// fila 1, datos desde la fila 2) y devuelve las filas crudas + errores de ESTRUCTURA.
//
// Lo que produce alimenta `consolidacion_modulo_cliente` para el módulo NOM:
//   cliente  → `cliente_id` (se resuelve por NIT o código en la Server Action)
//   código   → `clasificador` (la llave del mapeo: en Nómina el clasificador ES el código)
//   concepto → `descripcion` (el nombre legible)
//   cuenta   → `cuenta_4` (una o varias, separadas con «;», una fila por par)
//
// Como todos los importadores, el parser es PURO: no consulta la BD. La existencia
// del cliente y la validez de la cuenta contra el plan estándar se resuelven en la
// Server Action (`importarConceptosNomina`).

import type ExcelJS from "exceljs";
import { celdaTexto, normalizar, cargarWorkbook } from "./xlsx";
import type { ErrorImport } from "./maestros";

export const HOJA_CONCEPTOS = "Conceptos";

/** Módulo al que pertenecen los conceptos cargados (código de `Module.code`). */
export const MODULO_CONCEPTOS_NOMINA = "NOM";

/**
 * CAMPOS REQUERIDOS de la plantilla. Las cuatro columnas son obligatorias: sin
 * cliente no se sabe a quién pertenece la regla, sin código no hay llave con la
 * cual homologar el archivo de nómina, sin concepto la fila es ilegible para quien
 * audita, y sin cuenta no hay cruce contra el balance.
 */
export const COLUMNAS_REQUERIDAS = ["cliente", "codigo", "concepto", "cuenta"] as const;
export type ColumnaConcepto = (typeof COLUMNAS_REQUERIDAS)[number];

const ETIQUETA_COLUMNA: Record<ColumnaConcepto, string> = {
  cliente: "Cliente (NIT o código)",
  codigo: "Código",
  concepto: "Concepto",
  cuenta: "Cuenta (4 dígitos)",
};

export type FilaConceptoNomina = {
  fila: number;
  /** NIT o código del cliente, tal como vino en el archivo. */
  cliente: string;
  /** Código del concepto de nómina (llave del mapeo). */
  codigo: string;
  /** Nombre legible del concepto. */
  concepto: string;
  /** Cuentas Russell de 4 dígitos (una o varias, ya normalizadas y sin repetir). */
  cuentas4: string[];
};

export type ParseConceptosNomina = { filas: FilaConceptoNomina[]; errores: ErrorImport[] };

/** Estado que devuelve la Server Action `importarConceptosNomina`. */
export type ImportConceptosNominaState = {
  ok?: boolean;
  message?: string;
  errores?: ErrorImport[];
  resumen?: {
    clientes: number;
    conceptos: number;
    cuentas: number;
    /** Conceptos que ya existían y quedaron con otras cuentas o distinto nombre. */
    actualizados: number;
  };
};

/** Solo dígitos, a lo sumo 4: la cuenta Russell del cruce es de 4 dígitos. */
export function normalizarCuenta4Concepto(v: string): string {
  return String(v ?? "").replace(/\D/g, "").slice(0, 4);
}

/** Código del concepto sin espacios sobrantes. Se conserva tal cual (no se normaliza a mayúsculas). */
export function normalizarCodigoConcepto(v: string): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

/** Localiza cada columna requerida en la fila de encabezados. */
function ubicarColumnas(ws: ExcelJS.Worksheet): Partial<Record<ColumnaConcepto, number>> {
  const cols: Partial<Record<ColumnaConcepto, number>> = {};
  ws.getRow(1).eachCell((cell, c) => {
    const h = normalizar(celdaTexto(cell.value));
    if (!h) return;
    // El orden importa: «código» se evalúa antes que «concepto» porque el encabezado
    // «Código del concepto» contendría ambas palabras.
    if (!cols.cliente && (h.includes("cliente") || h.includes("nit"))) cols.cliente = c;
    else if (!cols.codigo && (h.startsWith("codigo") || h.startsWith("cod "))) cols.codigo = c;
    else if (!cols.concepto && (h.includes("concepto") || h.includes("descripcion"))) cols.concepto = c;
    else if (!cols.cuenta && h.includes("cuenta")) cols.cuenta = c;
  });
  return cols;
}

export async function parseConceptosNominaWorkbook(
  data: ArrayBuffer | Buffer,
): Promise<ParseConceptosNomina> {
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

  const ws = wb.getWorksheet(HOJA_CONCEPTOS);
  if (!ws) {
    return {
      filas: [],
      errores: [{ hoja: HOJA_CONCEPTOS, fila: 0, mensaje: `No se encontró la hoja «${HOJA_CONCEPTOS}».` }],
    };
  }

  const cols = ubicarColumnas(ws);
  const faltan = COLUMNAS_REQUERIDAS.filter((k) => !cols[k]);
  if (faltan.length > 0) {
    return {
      filas: [],
      errores: [
        {
          hoja: HOJA_CONCEPTOS,
          fila: 1,
          mensaje: `Encabezados incompletos: faltan columnas (${faltan
            .map((k) => ETIQUETA_COLUMNA[k])
            .join(", ")}).`,
        },
      ],
    };
  }

  const errores: ErrorImport[] = [];
  const filas: FilaConceptoNomina[] = [];
  const val = (row: ExcelJS.Row, c?: number) => (c ? celdaTexto(row.getCell(c).value) : "");
  // (cliente normalizado + código) ya visto → fila donde apareció, para delatar duplicados.
  const vistos = new Map<string, number>();

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const textoFila = ((row.values as ExcelJS.CellValue[]) ?? []).map((v) => celdaTexto(v)).join(" ");
    if (/EJEMPLO/i.test(textoFila)) continue;

    const cliente = val(row, cols.cliente).trim();
    const codigo = normalizarCodigoConcepto(val(row, cols.codigo));
    const concepto = val(row, cols.concepto).trim();
    const cuentaRaw = val(row, cols.cuenta).trim();

    if (!cliente && !codigo && !concepto && !cuentaRaw) continue; // fila vacía

    const errs: string[] = [];
    if (!cliente) errs.push("Falta el cliente (NIT o código).");
    if (!codigo) errs.push("Falta el código del concepto.");
    if (!concepto) errs.push("Falta el nombre del concepto.");

    // Una cuenta por fila o varias separadas con «;» (mismo criterio que el staff
    // múltiple de la plantilla de clientes).
    const partes = cuentaRaw.split(";").map((c) => c.trim()).filter(Boolean);
    if (partes.length === 0) errs.push("Falta la cuenta.");
    const cuentas4: string[] = [];
    for (const parte of partes) {
      const cuenta = normalizarCuenta4Concepto(parte);
      if (cuenta.length !== 4) {
        errs.push(`Cuenta inválida: «${parte}» (debe tener 4 dígitos).`);
        continue;
      }
      if (!cuentas4.includes(cuenta)) cuentas4.push(cuenta);
    }

    if (cliente && codigo) {
      const clave = `${normalizar(cliente)}|${normalizar(codigo)}`;
      const previa = vistos.get(clave);
      if (previa != null) {
        errs.push(
          `El código «${codigo}» ya venía para este cliente en la fila ${previa}. Deja una sola fila por concepto y separa sus cuentas con «;».`,
        );
      } else {
        vistos.set(clave, r);
      }
    }

    if (errs.length > 0) {
      for (const m of errs) errores.push({ hoja: HOJA_CONCEPTOS, fila: r, mensaje: m });
      continue;
    }

    filas.push({ fila: r, cliente, codigo, concepto, cuentas4 });
  }

  return { filas, errores };
}
