import { describe, expect, it } from "vitest";
import { ingerir, type GridHoja } from "@/lib/balance/extraccion/ingesta";
import { descriptorModulo } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import type { VersionCandidata } from "./mejor-version";
import { FILAS_DATOS_MUESTRA, generarMuestraRecortada, recortarYAnonimizar, TEXTO_REPORTE } from "./muestra-recortada";

const ING = descriptorModulo("ING")!;
const ENCABEZADO = ["Concepto", "Documento", "Tercero", "Valor", "Teléfono"];
const spec: SpecModulo = { hoja: "Ventas", filaEncabezado: 2, primeraFilaDatos: 3, columnas: { concepto: 1, documento: 2, tercero: 3, valor: 4 } };

/** Un reporte de ventas con rótulo de empresa, 150 facturas y una fila de total por concepto. */
function hojaVentas(): GridHoja {
  const filas: (string | number | null)[][] = [["INFORME DE VENTAS · EMPRESA REAL SAS · NIT 900123456", null, null, null, null], ENCABEZADO];
  for (let i = 0; i < 150; i++) {
    const tercero = i % 3 === 0 ? "800555111 CLIENTE UNO SAS" : i % 3 === 1 ? "830444222 CLIENTE DOS LTDA" : "JUAN PÉREZ";
    filas.push([i < 75 ? "VENTAS NACIONALES" : "EXPORTACIONES", `FV-${100000 + i}`, tercero, 1000 + i, `30012345${String(i).padStart(2, "0")}`]);
  }
  return { nombre: "Ventas", filas };
}

const version: VersionCandidata = {
  id: 1, version: 1, estado: "validada_cliente", clienteOrigenId: 5,
  hoja: "Ventas", filaEncabezado: 2, primeraFilaDatos: 3, encabezado: ENCABEZADO, spec,
};

const textos = (hoja: GridHoja) => hoja.filas.flat().filter((c): c is string => typeof c === "string").join(" | ");

describe("muestra recortada y anónima del original", () => {
  it("conserva el encabezado y las primeras 100 filas; oculta la empresa, los terceros y lo que no se lee", () => {
    const muestra = recortarYAnonimizar(ING, hojaVentas(), spec);
    expect(muestra.filas).toHaveLength(2 + FILAS_DATOS_MUESTRA);
    expect(muestra.filas[0][0]).toBe(TEXTO_REPORTE);
    expect(muestra.filas[1]).toEqual(ENCABEZADO);
    const todo = textos(muestra);
    for (const privado of ["900123456", "800555111", "CLIENTE UNO", "JUAN PÉREZ", "3001234500", "100000"]) expect(todo).not.toContain(privado);
    // Importes y clasificador intactos; la columna que no se lee pasa a «Texto».
    expect(muestra.filas[2][0]).toBe("VENTAS NACIONALES");
    expect(muestra.filas[2][3]).toBe(1000);
    expect(muestra.filas[2][4]).toBe("Texto");
  });

  it("el mismo tercero recibe siempre el mismo ficticio, del mismo largo", () => {
    const muestra = recortarYAnonimizar(ING, hojaVentas(), spec);
    const uno = muestra.filas[2][2];
    expect(muestra.filas[5][2]).toBe(uno); // i = 0 y i = 3 son CLIENTE UNO
    expect(String(uno)).toMatch(/^9\d{8} Tercero \d{3}$/);
    expect(muestra.filas[3][2]).not.toBe(uno);
    expect(String(muestra.filas[2][1])).toMatch(/^FV-9\d{5}$/);
  });

  it("conserva el rótulo de un total y oculta el nombre que lo acompaña", () => {
    const hoja = hojaVentas();
    hoja.filas.splice(5, 0, ["VENTAS NACIONALES", null, "Total CLIENTE UNO SAS", 3000, null]);
    const muestra = recortarYAnonimizar(ING, hoja, spec);
    expect(String(muestra.filas[5][2])).toMatch(/^Total Tercero \d{3}$/);
  });

  it("genera un .xlsx que el patrón reconoce y lee igual que esas filas del original", async () => {
    const r = await generarMuestraRecortada(ING, hojaVentas(), version);
    expect(r).toMatchObject({ ok: true, filasDatos: FILAS_DATOS_MUESTRA });
    if (!r.ok) return;
    const ingesta = await ingerir(r.bytes.slice().buffer as ArrayBuffer, "muestra.xlsx");
    expect(ingesta.modo).toBe("tabular");
    if (ingesta.modo !== "tabular") return;
    expect(textos(ingesta.hojas[0])).not.toContain("CLIENTE UNO");
  });

  it("una versión con el encabezado guardado más abajo (numeración física) no deja datos sin ocultar", async () => {
    // Rótulos en la fila 2 de la grilla; la versión dice fila 3 (la física, con una fila vacía arriba).
    const legado: VersionCandidata = { ...version, filaEncabezado: 3, primeraFilaDatos: 4, spec: { ...spec, filaEncabezado: 3, primeraFilaDatos: 4 } };
    const r = await generarMuestraRecortada(ING, hojaVentas(), legado);
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    const ingesta = await ingerir(r.bytes.slice().buffer as ArrayBuffer, "muestra.xlsx");
    if (ingesta.modo !== "tabular") return;
    expect(ingesta.hojas[0].filas[1]).toEqual(ENCABEZADO);
    expect(textos(ingesta.hojas[0])).not.toMatch(/CLIENTE|PÉREZ|800555111/);
  });

  it("si las filas no sirven de muestra no la genera (el administrador sube una)", async () => {
    const sinDatos: GridHoja = { nombre: "Ventas", filas: [["x"], ENCABEZADO] };
    expect(await generarMuestraRecortada(ING, sinDatos, version)).toMatchObject({ ok: false });
    // El archivo cambió de rótulos: el patrón no reconocería la muestra.
    const otroFormato = hojaVentas();
    otroFormato.filas[1] = ["Línea", "Factura", "Cliente", "Neto", "Celular"];
    expect(await generarMuestraRecortada(ING, otroFormato, version)).toMatchObject({ ok: false, motivo: expect.stringContaining("no reconoce") });
  });
});
