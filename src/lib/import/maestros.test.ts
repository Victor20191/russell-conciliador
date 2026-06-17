import { test, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseMaestrosWorkbook, normalizarCedula, iniciales } from "./maestros";

type Fila = (string | number)[];

/** Arma un workbook de maestros con las 4 hojas (banner fila 1, headers fila 2). */
async function construir(hojas: Record<string, { headers: string[]; filas: Fila[] }>) {
  const wb = new ExcelJS.Workbook();
  for (const [nombre, { headers, filas }] of Object.entries(hojas)) {
    const ws = wb.addWorksheet(nombre);
    ws.getRow(1).getCell(1).value = `Maestro de ${nombre}`;
    headers.forEach((h, i) => (ws.getRow(2).getCell(i + 1).value = h));
    filas.forEach((fila, fi) => {
      fila.forEach((v, ci) => (ws.getRow(3 + fi).getCell(ci + 1).value = v));
    });
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const H_SOCIO = ["Nombre completo *", "Cédula *", "Cargo *", "Correo *", "Estado"];
const H_GERENTE = ["Nombre completo *", "Cédula *", "Cargo *", "Correo *", "Cédula del Socio *", "Estado"];
const H_SENIOR = ["Nombre completo *", "Cédula *", "Cargo *", "Correo *", "Cédula del Gerente *", "Estado"];
const H_STAFF = ["Nombre completo *", "Cédula *", "Cargo *", "Correo *", "Cédula del Senior *", "Estado"];

test("normalizarCedula quita puntos, espacios y guiones", () => {
  expect(normalizarCedula("79.123.456")).toBe("79123456");
  expect(normalizarCedula(" 1 020-304 ")).toBe("1020304");
});

test("iniciales toma primera y última palabra (≤3)", () => {
  expect(iniciales("Carlos Andrés Gómez")).toBe("CG");
  expect(iniciales("Laura")).toBe("LA");
});

test("parsea una cadena completa Socio→Gerente→Senior→Staff sin errores", async () => {
  const buf = await construir({
    Socios: { headers: H_SOCIO, filas: [["Carlos Gómez", "79.123.456", "Socio Director", "c@rb.co", "Activo"]] },
    Gerentes: { headers: H_GERENTE, filas: [["Juan Mejía", "1.020.304", "Gerente", "j@rb.co", "79.123.456", "Activo"]] },
    Seniors: { headers: H_SENIOR, filas: [["Laura Ríos", "1.130.250", "Senior", "l@rb.co", "1.020.304", ""]] },
    Staff: { headers: H_STAFF, filas: [["Ana Quintero", "1.040.560", "Junior", "a@rb.co", "1.130.250", "Inactivo"]] },
  });
  const { filas, errores } = await parseMaestrosWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas).toHaveLength(4);

  const gerente = filas.find((f) => f.rol === "Gerente")!;
  expect(gerente.superiorRol).toBe("Socio");
  expect(gerente.superiorCedula).toBe("79.123.456");
  expect(gerente.activo).toBe(true);

  const socio = filas.find((f) => f.rol === "Socio")!;
  expect(socio.superiorRol).toBeNull();
  expect(socio.superiorCedula).toBeNull();

  const staff = filas.find((f) => f.rol === "Staff")!;
  expect(staff.activo).toBe(false); // Estado «Inactivo»
});

test("omite filas de ejemplo y filas vacías", async () => {
  const buf = await construir({
    Socios: {
      headers: H_SOCIO,
      filas: [
        ["Ejemplo X", "1", "Socio", "x@rb.co", "Activo", "", "← EJEMPLO (borrar)"],
        ["", "", "", "", ""],
        ["Real Socio", "900", "Socio Director", "real@rb.co", "Activo"],
      ],
    },
    Gerentes: { headers: H_GERENTE, filas: [] },
    Seniors: { headers: H_SENIOR, filas: [] },
    Staff: { headers: H_STAFF, filas: [] },
  });
  const { filas, errores } = await parseMaestrosWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas).toHaveLength(1);
  expect(filas[0].name).toBe("Real Socio");
});

test("reporta campos faltantes, correo inválido y superior ausente", async () => {
  const buf = await construir({
    Socios: { headers: H_SOCIO, filas: [["Sin Correo", "111", "Socio", "", "Activo"]] },
    Gerentes: { headers: H_GERENTE, filas: [["Correo Malo", "222", "Gerente", "no-es-correo", "111", "Activo"]] },
    Seniors: { headers: H_SENIOR, filas: [["Sin Superior", "333", "Senior", "s@rb.co", "", "Activo"]] },
    Staff: { headers: H_STAFF, filas: [] },
  });
  const { errores } = await parseMaestrosWorkbook(buf);
  const msgs = errores.map((e) => e.mensaje).join(" | ");
  expect(msgs).toMatch(/Falta el correo/);
  expect(msgs).toMatch(/Correo inválido/);
  expect(msgs).toMatch(/Falta la cédula del Gerente/);
});

test("error si falta una hoja", async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Socios").getRow(2).getCell(1).value = "Nombre completo *";
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const { errores } = await parseMaestrosWorkbook(buf);
  expect(errores.some((e) => /No se encontró la hoja «Gerentes»/.test(e.mensaje))).toBe(true);
});
