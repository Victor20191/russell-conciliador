// Parser del Excel de maestros de personas (Socio · Gerente · Senior · Staff).
// Lee las 4 hojas de `Plantilla_Maestros_Personas.xlsx`, valida la ESTRUCTURA
// (campos obligatorios, formato de correo, estado) y devuelve las filas listas
// + los errores. La validación contra BD (unicidad, existencia del superior)
// vive en la Server Action, porque depende de datos de la base.

import type ExcelJS from "exceljs";
import { celdaTexto, normalizar, cargarWorkbook } from "./xlsx";

export const ROLES_MAESTRO = ["Socio", "Gerente", "Senior", "Staff"] as const;
export type RolMaestro = (typeof ROLES_MAESTRO)[number];

type DefHoja = { hoja: string; rol: RolMaestro; superior: RolMaestro | null };
// El rol lo define la HOJA; el superior esperado sale de la jerarquía.
const HOJAS: DefHoja[] = [
  { hoja: "Socios", rol: "Socio", superior: null },
  { hoja: "Gerentes", rol: "Gerente", superior: "Socio" },
  { hoja: "Seniors", rol: "Senior", superior: "Gerente" },
  { hoja: "Staff", rol: "Staff", superior: "Senior" },
];

export type FilaMaestro = {
  hoja: string;
  fila: number; // número de fila en el Excel (para reportar)
  rol: RolMaestro;
  name: string;
  cedula: string;
  cargo: string;
  email: string;
  superiorRol: RolMaestro | null;
  superiorCedula: string | null;
  activo: boolean;
};

export type ErrorImport = { hoja: string; fila: number; mensaje: string };
export type ParseMaestros = { filas: FilaMaestro[]; errores: ErrorImport[] };

/** Estado que devuelve la Server Action `importarMaestros` (resultado o errores). */
export type ImportMaestrosState = {
  ok?: boolean;
  message?: string;
  errores?: ErrorImport[];
  resumen?: {
    creados: number;
    porRol: Record<string, number>;
    passwordTemporal: string;
  };
};

/** Cédula sin separadores (puntos, espacios, guiones): clave de comparación y de guardado. */
export function normalizarCedula(c: string): string {
  return c.replace(/[.\s-]/g, "").trim();
}

/** Iniciales (≤3) a partir del nombre, para el avatar del usuario. */
export function iniciales(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "NA";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function parseMaestrosWorkbook(data: ArrayBuffer | Buffer): Promise<ParseMaestros> {
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
  const filas: FilaMaestro[] = [];
  const errores: ErrorImport[] = [];

  for (const def of HOJAS) {
    const ws = wb.getWorksheet(def.hoja);
    if (!ws) {
      errores.push({ hoja: def.hoja, fila: 0, mensaje: `No se encontró la hoja «${def.hoja}».` });
      continue;
    }

    // Encabezados en la fila 2 (la fila 1 es el banner del rol).
    const col: Record<string, number> = {};
    ws.getRow(2).eachCell((cell, c) => {
      const h = normalizar(celdaTexto(cell.value));
      if (!h) return;
      if (h.includes("nombre")) col.nombre = c;
      else if (h.includes("cedula del")) col.superior = c;
      else if (h.startsWith("cedula")) col.cedula = c;
      else if (h.includes("cargo")) col.cargo = c;
      else if (h.includes("correo")) col.correo = c;
      else if (h.includes("estado")) col.estado = c;
    });
    if (!col.nombre || !col.cedula || !col.cargo || !col.correo) {
      errores.push({ hoja: def.hoja, fila: 2, mensaje: `Encabezados incompletos en «${def.hoja}».` });
      continue;
    }
    if (def.superior && !col.superior) {
      errores.push({
        hoja: def.hoja,
        fila: 2,
        mensaje: `Falta la columna «Cédula del ${def.superior}» en «${def.hoja}».`,
      });
      continue;
    }

    for (let r = 3; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      // Saltar filas de ejemplo (marcador «EJEMPLO») y filas vacías.
      const textoFila = ((row.values as ExcelJS.CellValue[]) ?? [])
        .map((v) => celdaTexto(v))
        .join(" ");
      if (/EJEMPLO/i.test(textoFila)) continue;

      const name = celdaTexto(row.getCell(col.nombre).value);
      const cedula = celdaTexto(row.getCell(col.cedula).value);
      const cargo = celdaTexto(row.getCell(col.cargo).value);
      const email = celdaTexto(row.getCell(col.correo).value).toLowerCase();
      const estado = col.estado ? normalizar(celdaTexto(row.getCell(col.estado).value)) : "";
      const superiorCedula = col.superior ? celdaTexto(row.getCell(col.superior).value) : "";

      if (!name && !cedula && !cargo && !email && !superiorCedula) continue; // fila vacía

      const errsFila: string[] = [];
      if (!name) errsFila.push("Falta el nombre.");
      if (!cedula) errsFila.push("Falta la cédula.");
      if (!cargo) errsFila.push("Falta el cargo.");
      if (!email) errsFila.push("Falta el correo.");
      else if (!EMAIL_RE.test(email)) errsFila.push(`Correo inválido: ${email}.`);
      if (estado && estado !== "activo" && estado !== "inactivo")
        errsFila.push("Estado inválido (usa Activo o Inactivo).");
      if (def.superior && !superiorCedula)
        errsFila.push(`Falta la cédula del ${def.superior}.`);

      if (errsFila.length > 0) {
        for (const m of errsFila) errores.push({ hoja: def.hoja, fila: r, mensaje: m });
        continue;
      }

      filas.push({
        hoja: def.hoja,
        fila: r,
        rol: def.rol,
        name,
        cedula,
        cargo,
        email,
        superiorRol: def.superior,
        superiorCedula: def.superior ? superiorCedula : null,
        activo: estado !== "inactivo", // vacío o «activo» ⇒ activo
      });
    }
  }

  return { filas, errores };
}
