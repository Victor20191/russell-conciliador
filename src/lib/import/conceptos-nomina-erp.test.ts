import { describe, expect, it } from "vitest";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { detectarCatalogoConceptos, leerCatalogoConceptosErp, rolDeEncabezado } from "./conceptos-nomina-erp";

/** Las primeras filas REALES de los catálogos de la taxonomía (reducidas). */
const SIIGO: GridHoja = {
  nombre: "CONCEPTOS DE NOMINA",
  filas: [
    ["Siigo - KAKARAKA S.A.S", "Siigo - KAKARAKA S.A.S", "Siigo - KAKARAKA S.A.S", "Siigo - KAKARAKA S.A.S"],
    ["INFORME CONCEPTOS DE NOMINA", "INFORME CONCEPTOS DE NOMINA", "INFORME CONCEPTOS DE NOMINA", "INFORME CONCEPTOS DE NOMINA"],
    ["Procesado en: 2026/01/19  08:37:24:72", "Procesado en: 2026/01/19  08:37:24:72", "Procesado en: 2026/01/19  08:37:24:72", "Procesado en: 2026/01/19  08:37:24:72"],
    ["TIPO CONCEPTO  ", "CODIGO SIIGO   ", "NOMBRE                                            ", "CUENTA    "],
    ["INGRESO        ", " 01            ", "SALARIO BASICO                                    ", "0005060000"],
    ["INGRESO        ", " 02            ", "SUBSIDIO DE TRANSPORTE                            ", "0005270000"],
    ["INGRESO        ", " 04            ", "PRESTAMO EMPLEADOS                                ", "1365950000"],
    ["DEDUCION       ", "234            ", "CREDITO OPTICA                                    ", "2370300300"],
    ["INGRESO        ", "250            ", "DEVOLUCION SALUD                                  ", "2370050000"],
  ],
};

const INCODOL: GridHoja = {
  nombre: "EQUIVALENCIAS",
  filas: [
    ["Id. cia", "Nombre cia.", "Concepto", "Descripcion del concepto", "Id. Grupo de C.Costos", "Grupo de centros de costos", "Id. Cuenta PCGA", "Cuenta PCGA", "Naturaleza PCGA", "Naturaleza NIIF"],
    ["1", "INSTITUTO COLOMBIANO DEL DOLOR SAS", "100", "SALARIO BASICO", "CV", "GASTO DE VENTA", "52050601", "SUELDOS", "Debito", "Credito"],
    ["1", "INSTITUTO COLOMBIANO DEL DOLOR SAS", "100", "SALARIO BASICO", "AS", "ASISTENCIALES", "61050506", "SUELDOS", "Debito", "Credito"],
    ["1", "INSTITUTO COLOMBIANO DEL DOLOR SAS", "100", "SALARIO BASICO", "CA", "ADMINISTRATIVO", "51050601", "SUELDOS", "Debito", "Credito"],
    ["1", "INSTITUTO COLOMBIANO DEL DOLOR SAS", "703", "DEDUCCION MAYOR VALOR PAGADO", null, null, "13655007", "DEDUCCION MAYOR VALOR PAGADO", "Credito", "Credito"],
  ],
};

const NOMINAI: GridHoja = {
  nombre: "MAESTRO DE CONCEPTOS",
  filas: [
    ["KJIPLAS S A - 800.157.926-1"],
    ["Prenómina Acumulada por Centro de Costo  Ene-31-2023"],
    ["Centro de Costo", null, "AREA", "Concepto", "descrp", "cuenta", null, null, "SD", "SD", "NEGATIVAS"],
    [100101, " DIRECTORES Y JEFES DE AREA    ", "ADMON", 43, " BASICO MEDIO TIEMPO ", 51050601, 1],
    [null, null, "ADMON", 790, " DIA FAMILIA ADMIN", 51050601, 1],
    [null, null, "PRODUCCIÓN", 134, " REDUC JORN LAB PRODU", 72050601, 1],
    [null, null, "PRODUCCIÓN", 561, " MYR VALOR  HEFN 255%", 72051501, -1],
    [100101, " DIRECTORES Y JEFES DE AREA    ", "ADMON", 1, " BASICO              ", 51050601, 1],
    [100102, " OTRO CENTRO", "ADMON", 1, " BASICO              ", 51050601, 1],
    [null, null, "ADMON", 900, " SIN CUENTA", 3, 1],
    [" VACAC EN LDCT       "],
  ],
};

const ACUM: GridHoja = {
  nombre: "ACUM NOMINA",
  filas: [
    [null, "KJIPLAS S A - 800.157.926-1"],
    ["CCOSTO", "Centro de Costo", "Empleado", "NOMBRE EMPLEADO", "ÁREA", "Concepto", "NOMBRE CONCEPTO", "CUENTA", "Turno"],
    ["1001", " DIRECTORES", 8032318, " GALLEGO GUZMAN", "ADMON", 1, " BASICO", 51050601, "001 - BASICO"],
    ["1001", " DIRECTORES", 8032318, " GALLEGO GUZMAN", "ADMON", 602, " EPS SURA", 51056901, "001 - BASICO"],
    ["1001", " DIRECTORES", 39273809, " AGUDELO GOEZ", "ADMON", 1, " BASICO", 51050601, "001 - BASICO"],
  ],
};

const ZARZAL_SIN_CUENTA: GridHoja = {
  nombre: "TD (2)",
  filas: [
    [null, "Concepto", "Descripción Concepto", "Suma de Neto a pagar"],
    [null, "502", "DEDUCCION PENSION", -371754864],
    [null, "018", "VACACIONES", 306480791],
  ],
};

describe("rolDeEncabezado", () => {
  it.each([
    ["CODIGO SIIGO   ", "codigo"], ["Concepto", "codigo"], ["Código Interno Buk", "codigo"],
    ["NOMBRE   ", "concepto"], ["Descripcion del concepto", "concepto"], ["descrp", "concepto"], ["NOMBRE CONCEPTO", "concepto"],
    ["CUENTA    ", "cuenta"], ["Id. Cuenta PCGA", "cuenta"], ["Cuenta PCGA", "cuenta"], ["Cuenta contable", "cuenta"],
    ["TIPO CONCEPTO  ", "tipo"], ["Naturaleza PCGA", "tipo"],
    ["Id. Grupo de C.Costos", "agrupador"], ["AREA", "agrupador"], ["Centro de Costo", "agrupador"], ["GRUPO", "agrupador"],
    ["Nombre cia.", null], ["Turno", null], ["NEGATIVAS", null], [null, null],
  ])("«%s» → %s", (h, rol) => {
    expect(rolDeEncabezado(h as string | null)).toBe(rol);
  });
});

describe("SIIGO (Kakaraka)", () => {
  it("salta el banner, lee código/nombre/cuenta/tipo y canoniza los códigos", () => {
    const r = leerCatalogoConceptosErp([SIIGO]);
    expect(r).not.toBeNull();
    expect(r!.deteccion).toMatchObject({ hoja: "CONCEPTOS DE NOMINA", filaEncabezado: 4, columnas: { tipo: 1, codigo: 2, concepto: 3, cuenta: 4 } });
    expect(r!.filas.map((f) => [f.codigo, f.concepto, f.cuentas[0], f.tipo])).toEqual([
      ["1", "SALARIO BASICO", "0005060000", "INGRESO"],
      ["2", "SUBSIDIO DE TRANSPORTE", "0005270000", "INGRESO"],
      ["4", "PRESTAMO EMPLEADOS", "1365950000", "INGRESO"],
      ["234", "CREDITO OPTICA", "2370300300", "DEDUCION"],
      ["250", "DEVOLUCION SALUD", "2370050000", "INGRESO"],
    ]);
    expect(r!.filas.every((f) => f.agrupador === "")).toBe(true);
  });
});

describe("INCODOL (concepto × grupo de centros)", () => {
  it("«Concepto» numérico es el código, el nombre está al lado, la cuenta es el Id. Cuenta PCGA y el agrupador el Id. Grupo", () => {
    const r = leerCatalogoConceptosErp([INCODOL])!;
    expect(r.deteccion.columnas).toMatchObject({ codigo: 3, concepto: 4, agrupador: 5, cuenta: 7, tipo: 9 });
    expect(r.filas).toHaveLength(4);
    expect(r.filas.map((f) => [f.codigo, f.agrupador, f.cuentas[0]])).toEqual([
      ["100", "CV", "52050601"],
      ["100", "AS", "61050506"],
      ["100", "CA", "51050601"],
      ["703", "", "13655007"],
    ]);
    expect(r.filas[0].concepto).toBe("SALARIO BASICO");
  });
});

describe("NOMINAI (KP: maestro por centro y área)", () => {
  it("encabezado en la fila 3, AREA como agrupador (no el centro numérico), cuentas de 1 dígito descartadas y duplicados fusionados", () => {
    const r = leerCatalogoConceptosErp([NOMINAI])!;
    expect(r.deteccion.filaEncabezado).toBe(3);
    expect(r.deteccion.columnas).toMatchObject({ agrupador: 3, codigo: 4, concepto: 5, cuenta: 6 });
    const porClave = new Map(r.filas.map((f) => [`${f.codigo}|${f.agrupador}`, f]));
    expect(porClave.get("1|ADMON")?.cuentas).toEqual(["51050601"]);
    expect(porClave.get("43|ADMON")?.concepto).toBe("BASICO MEDIO TIEMPO");
    expect(porClave.get("561|PRODUCCIÓN")?.cuentas).toEqual(["72051501"]);
    expect(porClave.has("900|ADMON")).toBe(false);
    expect(r.avisos.join(" ")).toMatch(/1 fila\(s\) sin cuenta contable legible/);
    expect(r.filas).toHaveLength(5);
  });

  it("prefiere la hoja del maestro sobre el acumulado por empleado del mismo libro", () => {
    const candidatas = detectarCatalogoConceptos([ACUM, NOMINAI]);
    expect(candidatas[0].hoja).toBe("MAESTRO DE CONCEPTOS");
    expect(candidatas[1].hoja).toBe("ACUM NOMINA");
    expect(candidatas[1].motivos.join(" ")).toMatch(/detalle de la nómina/);
  });

  it("el usuario puede pedir otra hoja por nombre", () => {
    const r = leerCatalogoConceptosErp([ACUM, NOMINAI], "ACUM NOMINA")!;
    expect(r.deteccion.hoja).toBe("ACUM NOMINA");
    expect(r.filas.map((f) => f.codigo)).toEqual(["1", "602"]);
  });
});

describe("sin cuenta no hay catálogo", () => {
  it("la tabla dinámica de Zarzal (concepto + neto, sin cuenta) no se acepta", () => {
    expect(leerCatalogoConceptosErp([ZARZAL_SIN_CUENTA])).toBeNull();
  });
  it("una hoja oculta queda al final", () => {
    const oculta: GridHoja = { ...SIIGO, nombre: "Copia", oculta: true };
    const c = detectarCatalogoConceptos([oculta, INCODOL]);
    expect(c.map((x) => x.hoja)).toEqual(["EQUIVALENCIAS", "Copia"]);
  });
});
