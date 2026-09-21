import { test, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseConceptosNominaWorkbook, partirCuentas, planEscrituraConceptos, HOJA_CONCEPTOS, type FilaConceptoAEscribir } from "./conceptos-nomina";

/** Encabezados de la plantilla RF-NOM-08 (cliente / grupo / código / nombre / cuenta del cliente + centro opcional). */
const HEADERS = [
  "Cliente (NIT o código) *",
  "Grupo de cuenta contable",
  "Código del concepto *",
  "Nombre del concepto *",
  "Cuenta contable del cliente *",
  "Centro de costo / clase",
];

async function construir(filas: (string | null)[][], hoja = HOJA_CONCEPTOS, headers = HEADERS) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(hoja);
  headers.forEach((h, i) => (ws.getRow(1).getCell(i + 1).value = h));
  filas.forEach((fila, fi) => fila.forEach((v, ci) => (ws.getRow(2 + fi).getCell(ci + 1).value = v)));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

test("parsea conceptos de varios clientes con grupo, cuenta del cliente y centro", async () => {
  const buf = await construir([
    ["900.451.227-3", "Sueldos", "001", "Sueldo básico", "51050601", null],
    ["C-1042", "Auxilio de transporte", "002", "Auxilio de transporte", "510595", "GYA"],
    ["C-1042", null, "002", "Auxilio de transporte", "72052701", "MOD"],
  ]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas).toHaveLength(3);
  // El código se canoniza: «001» y «1» son el mismo concepto.
  expect(filas[0]).toMatchObject({ fila: 2, cliente: "900.451.227-3", grupo: "sueldos", codigo: "1", concepto: "Sueldo básico", cuentas: ["51050601"], agrupador: "" });
  expect(filas[1]).toMatchObject({ cliente: "C-1042", grupo: "auxilio_transporte", codigo: "2", cuentas: ["510595"], agrupador: "GYA" });
  expect(filas[2]).toMatchObject({ grupo: null, codigo: "2", cuentas: ["72052701"], agrupador: "MOD" });
});

test("una fila admite varias cuentas separadas con «;» y las deduplica", async () => {
  const buf = await construir([["900", null, "010", "Cesantías", "510530 ; 720510; 510530"]]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas[0].cuentas).toEqual(["510530", "720510"]);
});

test("la cuenta acepta separadores pero NUNCA se trunca: el subgrupo de 4 se rechaza con pista", async () => {
  const buf = await construir([["900", null, "020", "Prima", "51.05.36"]]);
  const { filas } = await parseConceptosNominaWorkbook(buf);
  expect(filas[0].cuentas).toEqual(["510536"]);

  const subgrupo = await construir([["900", null, "021", "Prima", "5105"]]);
  const r = await parseConceptosNominaWorkbook(subgrupo);
  expect(r.filas).toEqual([]);
  expect(r.errores[0].mensaje).toMatch(/es el subgrupo; escribe la cuenta contable del cliente/);

  // La cuenta del cliente de 8 o 10 dígitos (51050601, 0005060000 de SIIGO) SÍ se acepta: la
  // Server Action la lleva a Russell.
  const largo = await construir([["900", null, "022", "Prima", "51053601; 0005360000"]]);
  const l = await parseConceptosNominaWorkbook(largo);
  expect(l.errores).toEqual([]);
  expect(l.filas[0].cuentas).toEqual(["51053601", "0005360000"]);
});

test("partirCuentas", () => {
  expect(partirCuentas("510506;720505")).toEqual({ cuentas: ["510506", "720505"], errores: [] });
  expect(partirCuentas("51")).toMatchObject({ cuentas: [] });
  expect(partirCuentas("51").errores[0]).toMatch(/Cuenta inválida/);
  expect(partirCuentas("")).toEqual({ cuentas: [], errores: [] });
});

test("un grupo que no está en el catálogo se rechaza (no se adivina)", async () => {
  const buf = await construir([["900", "Gastos varios", "030", "Bono", "510595"]]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(filas).toEqual([]);
  expect(errores[0].mensaje).toMatch(/Grupo de cuenta contable no reconocido: «Gastos varios»/);
});

test("los cuatro campos requeridos siguen siéndolo; grupo y centro son opcionales", async () => {
  const buf = await construir([
    [null, null, "001", "Sueldo", "510506"],
    ["900", null, null, "Sueldo", "510506"],
    ["900", null, "002", null, "510506"],
    ["900", null, "003", "Sueldo", null],
  ]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(filas).toEqual([]);
  expect(errores.map((e) => e.fila)).toEqual([2, 3, 4, 5]);
  expect(errores[0].mensaje).toMatch(/cliente/i);
  expect(errores[1].mensaje).toMatch(/código/i);
  expect(errores[2].mensaje).toMatch(/nombre del concepto/i);
  expect(errores[3].mensaje).toMatch(/cuenta/i);
});

test("delata el mismo código repetido para un cliente y el mismo centro", async () => {
  const buf = await construir([
    ["900", null, "001", "Sueldo básico", "510506"],
    ["900", null, "1", "Sueldo básico", "720505"],
    ["900", null, "001", "Sueldo básico", "720505", "MOD"],
  ]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(filas).toHaveLength(2);
  expect(errores).toHaveLength(1);
  expect(errores[0].fila).toBe(3);
  expect(errores[0].mensaje).toMatch(/ya venía para este cliente en la fila 2/);
});

test("el mismo código en clientes distintos no es duplicado", async () => {
  const buf = await construir([
    ["900", null, "001", "Sueldo básico", "510506"],
    ["800", null, "001", "Sueldo básico", "510506"],
  ]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas).toHaveLength(2);
});

test("salta filas vacías y de EJEMPLO", async () => {
  const buf = await construir([
    ["900", null, "001", "EJEMPLO — borrar esta fila", "510506"],
    [null, null, null, null, null],
    ["900", null, "002", "Sueldo básico", "510506"],
  ]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas).toHaveLength(1);
  expect(filas[0].codigo).toBe("2");
});

test("sin la hoja «Conceptos» devuelve un error de estructura", async () => {
  const buf = await construir([["900", null, "001", "Sueldo", "510506"]], "Hoja1");
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(filas).toEqual([]);
  expect(errores[0].mensaje).toMatch(/No se encontró la hoja/);
});

test("delata encabezados faltantes sin procesar filas", async () => {
  const buf = await construir([["900", "001", "Sueldo"]], HOJA_CONCEPTOS, ["Cliente *", "Código *", "Concepto *"]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(filas).toEqual([]);
  expect(errores).toHaveLength(1);
  expect(errores[0].mensaje).toMatch(/faltan columnas \(Cuenta contable del cliente/);
});

test("la plantilla ANTERIOR (cliente / código / concepto / cuenta Russell) sigue leyéndose", async () => {
  const buf = await construir([["900", "001", "Sueldo básico", "510506"]], HOJA_CONCEPTOS, [
    "Cliente (NIT o código) *",
    "Código *",
    "Concepto *",
    "Cuenta (6 dígitos) *",
  ]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas[0]).toMatchObject({ codigo: "1", concepto: "Sueldo básico", cuentas: ["510506"], grupo: null, agrupador: "" });
});

test("«Código del concepto» no se confunde con la columna del concepto ni «Grupo de cuenta» con la cuenta", async () => {
  const buf = await construir([["900", "Prima", "001", "Sueldo básico", "510506"]], HOJA_CONCEPTOS, [
    "NIT del cliente",
    "Grupo de cuenta contable",
    "Código del concepto",
    "Concepto",
    "Cuenta Russell",
  ]);
  const { filas, errores } = await parseConceptosNominaWorkbook(buf);
  expect(errores).toEqual([]);
  expect(filas[0]).toMatchObject({ codigo: "1", concepto: "Sueldo básico", grupo: "prima", cuentas: ["510506"] });
});

test("un archivo que no es .xlsx devuelve el error de archivo", async () => {
  const { filas, errores } = await parseConceptosNominaWorkbook(Buffer.from("no soy un excel"));
  expect(filas).toEqual([]);
  expect(errores[0].hoja).toBe("Archivo");
});

// La escritura de la carga masiva: dos sentencias en total (borrar las claves, insertar las
// filas), no dos por concepto; con 67 conceptos la transacción se pasaba de tiempo (P2028).
test("planEscrituraConceptos: una clave por (cliente, concepto, centro) y sin cuentas repetidas", () => {
  const fila = (extra: Partial<FilaConceptoAEscribir>): FilaConceptoAEscribir => ({
    clienteId: 7, clasificador: "1", descripcion: "SALARIO BASICO", agrupador: "", grupo: "sueldos",
    subcuentaPuc: "06", cuentaCliente: "0005060000", cuenta4: "", cuenta6: "", ...extra,
  });
  const { claves, data } = planEscrituraConceptos([
    fila({}),
    fila({}), // la misma cuenta repetida en el archivo
    fila({ cuentaCliente: "51050601", cuenta4: "5105", cuenta6: "510506" }),
    fila({ agrupador: "MOD", cuentaCliente: "72050601", cuenta4: "7205", cuenta6: "720506" }),
    fila({ clasificador: "4", descripcion: "PRESTAMO EMPLEADOS", grupo: null, subcuentaPuc: "95", cuentaCliente: "1365950000" }),
    fila({ clienteId: 8 }),
  ], "Victor");
  expect(claves).toEqual([
    { clienteId: 7, clasificador: "1", agrupador: "" },
    { clienteId: 7, clasificador: "1", agrupador: "MOD" },
    { clienteId: 7, clasificador: "4", agrupador: "" },
    { clienteId: 8, clasificador: "1", agrupador: "" },
  ]);
  expect(data.map((d) => [d.clienteId, d.clasificador, d.agrupador, d.cuentaCliente])).toEqual([
    [7, "1", "", "0005060000"],
    [7, "1", "", "51050601"],
    [7, "1", "MOD", "72050601"],
    [7, "4", "", "1365950000"],
    [8, "1", "", "0005060000"],
  ]);
  expect(data[0]).toMatchObject({ moduloCodigo: "NOM", origen: "carga_masiva", actualizadoPor: "Victor", grupo: "sueldos", subcuentaPuc: "06" });
});
