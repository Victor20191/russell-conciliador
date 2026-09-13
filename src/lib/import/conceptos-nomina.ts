// Parser del Excel de carga masiva de CONCEPTOS DE NÓMINA (RF-NOM-08):
// `Plantilla_Conceptos_Nomina.xlsx`, hoja «Conceptos» (encabezados en la fila 1, datos desde
// la fila 2). Devuelve las filas crudas + errores de ESTRUCTURA.
//
// Columnas de la plantilla (las del documento de requisitos, en ese orden):
//   cliente    → `cliente_id` (se resuelve por NIT o código en la Server Action)          *
//   grupo      → `grupo` (grupo de cuenta contable RF-NOM-02: sueldos, prima, cesantías…)
//   código     → `clasificador` (la llave: en Nómina el clasificador ES el código)         *
//   concepto   → `descripcion` (el nombre legible)                                          *
//   cuenta     → cuenta contable DEL CLIENTE (6-10 dígitos: 51050601, 0005060000) o la     *
//                Russell de 6 (510506). Una o varias separadas con «;». La Server Action la
//                lleva a Russell por la homologación del balance (RF-NOM-10) o por su
//                estructura PUC; aquí solo se exige que tenga al menos 6 dígitos.
//   agrupador  → centro de costo / clase del archivo (opcional): permite que un mismo
//                concepto vaya a 510506 en administración y a 720505 en producción.
//
// Como todos los importadores, el parser es PURO: no consulta la BD. La existencia del
// cliente y la resolución de la cuenta se hacen en la Server Action (`importarConceptosNomina`).

import type ExcelJS from "exceljs";
import { celdaTexto, normalizar, cargarWorkbook } from "./xlsx";
import type { ErrorImport } from "./maestros";
import { normalizarGrupoConcepto } from "@/lib/modulos/nomina/grupos-concepto";
import { codigoConceptoCanonico, digitosCuenta } from "@/lib/modulos/nomina/homologacion";

export const HOJA_CONCEPTOS = "Conceptos";

/** Módulo al que pertenecen los conceptos cargados (código de `Module.code`). */
export const MODULO_CONCEPTOS_NOMINA = "NOM";

/** Dígitos de la cuenta Russell de Nómina: el módulo cruza a 6 (`nivelCruce` del descriptor). */
export const DIGITOS_CUENTA_NOMINA = 6;

/** Mínimo de dígitos de una cuenta aceptable (Russell de 6 o cuenta del cliente de 6+). */
export const MIN_DIGITOS_CUENTA = 6;

export const COLUMNAS_REQUERIDAS = ["cliente", "codigo", "concepto", "cuenta"] as const;
export type ColumnaConcepto = (typeof COLUMNAS_REQUERIDAS)[number] | "grupo" | "agrupador";

const ETIQUETA_COLUMNA: Record<ColumnaConcepto, string> = {
  cliente: "Cliente (NIT o código)",
  grupo: "Grupo de cuenta contable",
  codigo: "Código del concepto",
  concepto: "Nombre del concepto",
  cuenta: "Cuenta contable del cliente",
  agrupador: "Centro de costo / clase",
};

/**
 * Una entrada del catálogo de conceptos, venga de la plantilla o del catálogo nativo del ERP.
 * Es lo que la Server Action resuelve y escribe.
 */
export type ConceptoCatalogoEntrada = {
  fila: number;
  /** Código canónico del concepto (sin ceros a la izquierda). */
  codigo: string;
  /** Nombre legible del concepto. */
  concepto: string;
  /** Id del grupo RF-NOM-02, o null para sugerirlo (por nombre o subcuenta). */
  grupo: string | null;
  /** Centro de costo / clase del archivo ('' = a todos). */
  agrupador: string;
  /** Cuentas (solo dígitos, ≥ 6): del cliente o Russell de 6, sin repetir. */
  cuentas: string[];
  /** Tipo del concepto tal como lo imprime el ERP (Ingreso / Deducción), informativo. */
  tipo?: string | null;
};

export type FilaConceptoNomina = ConceptoCatalogoEntrada & {
  /** NIT o código del cliente, tal como vino en el archivo. */
  cliente: string;
};

export type ParseConceptosNomina = { filas: FilaConceptoNomina[]; errores: ErrorImport[] };

/** Estado que devuelve la Server Action `importarConceptosNomina`. */
export type ImportConceptosNominaState = {
  ok?: boolean;
  message?: string;
  errores?: ErrorImport[];
  /** Avisos que no impiden la carga (cuentas derivadas por estructura, grupos sugeridos…). */
  avisos?: string[];
  resumen?: {
    clientes: number;
    conceptos: number;
    cuentas: number;
    /** Conceptos que ya existían y quedaron con otras cuentas o distinto nombre. */
    actualizados: number;
    /** Cuentas que no llegaron a Russell (clase «00» o de control): quedan con subcuenta. */
    sinRussell: number;
  };
};

/**
 * Solo dígitos, sin truncar: la validación del largo es aparte, para poder decir «5105 es
 * el subgrupo, escribe la cuenta de 6» en vez de convertir en silencio una cuenta en otra.
 */
export function normalizarCuentaConcepto(v: string): string {
  return digitosCuenta(v);
}

/** Código del concepto canónico (sin espacios sobrantes ni ceros a la izquierda). */
export function normalizarCodigoConcepto(v: string): string {
  return codigoConceptoCanonico(v);
}

/** Separa «510530 ; 720510» en cuentas normalizadas, sin repetir. Devuelve errores por parte. */
export function partirCuentas(cuentaRaw: string): { cuentas: string[]; errores: string[] } {
  const partes = String(cuentaRaw ?? "").split(/[;|]/).map((c) => c.trim()).filter(Boolean);
  const cuentas: string[] = [];
  const errores: string[] = [];
  for (const parte of partes) {
    const cuenta = normalizarCuentaConcepto(parte);
    if (cuenta.length < MIN_DIGITOS_CUENTA) {
      errores.push(
        cuenta.length === 4
          ? `Cuenta inválida: «${parte}» es el subgrupo; escribe la cuenta contable del cliente (51050601) o la Russell de ${DIGITOS_CUENTA_NOMINA} dígitos (${cuenta}06).`
          : `Cuenta inválida: «${parte}» (debe ser la cuenta contable del cliente o la Russell de ${DIGITOS_CUENTA_NOMINA} dígitos).`,
      );
      continue;
    }
    if (!cuentas.includes(cuenta)) cuentas.push(cuenta);
  }
  return { cuentas, errores };
}

/** Localiza cada columna en la fila de encabezados. */
function ubicarColumnas(ws: ExcelJS.Worksheet): Partial<Record<ColumnaConcepto, number>> {
  const cols: Partial<Record<ColumnaConcepto, number>> = {};
  ws.getRow(1).eachCell((cell, c) => {
    const h = normalizar(celdaTexto(cell.value));
    if (!h) return;
    // El orden importa: «grupo de cuenta contable» contiene «cuenta»; «código del concepto»
    // contiene «concepto»; «centro de costo / clase» no debe caer en ninguna otra.
    if (!cols.cliente && (h.includes("cliente") || h.includes("nit"))) cols.cliente = c;
    else if (!cols.agrupador && (h.includes("centro") || h.includes("agrupador") || h.startsWith("clase") || h.includes("area"))) cols.agrupador = c;
    else if (!cols.grupo && h.startsWith("grupo")) cols.grupo = c;
    else if (!cols.codigo && (h.startsWith("codigo") || h.startsWith("cod "))) cols.codigo = c;
    else if (!cols.concepto && (h.includes("concepto") || h.includes("descripcion") || h.startsWith("nombre"))) cols.concepto = c;
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
  // (cliente normalizado + código + agrupador) ya visto → fila donde apareció, para delatar duplicados.
  const vistos = new Map<string, number>();

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const textoFila = ((row.values as ExcelJS.CellValue[]) ?? []).map((v) => celdaTexto(v)).join(" ");
    if (/EJEMPLO/i.test(textoFila)) continue;

    const cliente = val(row, cols.cliente).trim();
    const codigo = normalizarCodigoConcepto(val(row, cols.codigo));
    const concepto = val(row, cols.concepto).trim();
    const cuentaRaw = val(row, cols.cuenta).trim();
    const grupoRaw = val(row, cols.grupo).trim();
    const agrupador = val(row, cols.agrupador).trim();

    if (!cliente && !codigo && !concepto && !cuentaRaw && !grupoRaw && !agrupador) continue; // fila vacía

    const errs: string[] = [];
    if (!cliente) errs.push("Falta el cliente (NIT o código).");
    if (!codigo) errs.push("Falta el código del concepto.");
    if (!concepto) errs.push("Falta el nombre del concepto.");

    const { cuentas, errores: errCuentas } = partirCuentas(cuentaRaw);
    if (!cuentaRaw) errs.push("Falta la cuenta contable.");
    errs.push(...errCuentas);

    let grupo: string | null = null;
    if (grupoRaw) {
      grupo = normalizarGrupoConcepto(grupoRaw);
      if (!grupo) errs.push(`Grupo de cuenta contable no reconocido: «${grupoRaw}». Usa uno de la hoja Referencias (Sueldos, Horas extras, Cesantías, Prima de servicios…) o déjalo vacío para que se sugiera.`);
    }

    if (cliente && codigo) {
      const clave = `${normalizar(cliente)}|${normalizar(codigo)}|${normalizar(agrupador)}`;
      const previa = vistos.get(clave);
      if (previa != null) {
        errs.push(
          agrupador
            ? `El código «${codigo}» ya venía para este cliente y el centro «${agrupador}» en la fila ${previa}. Deja una sola fila por concepto y centro, y separa sus cuentas con «;».`
            : `El código «${codigo}» ya venía para este cliente en la fila ${previa}. Deja una sola fila por concepto y separa sus cuentas con «;».`,
        );
      } else {
        vistos.set(clave, r);
      }
    }

    if (errs.length > 0) {
      for (const m of errs) errores.push({ hoja: HOJA_CONCEPTOS, fila: r, mensaje: m });
      continue;
    }

    filas.push({ fila: r, cliente, codigo, concepto, grupo, agrupador, cuentas });
  }

  return { filas, errores };
}
