import { describe, expect, it } from "vitest";
import {
  GRUPOS_CONCEPTO_NOMINA,
  etiquetaSubcuentaPuc,
  grupoPorSubcuentaPuc,
  normalizarGrupoConcepto,
  sugerirGrupoConcepto,
} from "./grupos-concepto";

describe("catálogo RF-NOM-02", () => {
  it("cada grupo tiene id único, sufijo Russell de dos dígitos y al menos una subcuenta PUC", () => {
    const ids = GRUPOS_CONCEPTO_NOMINA.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of GRUPOS_CONCEPTO_NOMINA) {
      expect(g.sufijoRussell).toMatch(/^\d{2}$/);
      expect(g.subcuentasPuc.length).toBeGreaterThan(0);
    }
  });

  it("los sufijos Russell son los del plan (06/30/36/39/68/69/70/95)", () => {
    const sufijos = new Set(GRUPOS_CONCEPTO_NOMINA.map((g) => g.sufijoRussell));
    expect([...sufijos].sort()).toEqual(["06", "30", "36", "39", "68", "69", "70", "95"]);
  });
});

describe("normalizarGrupoConcepto (lo que escribe el usuario en la plantilla)", () => {
  it.each([
    ["Sueldos", "sueldos"],
    ["sueldo", "sueldos"],
    ["Prima", "prima"],
    ["PRIMA DE SERVICIOS", "prima"],
    ["Cesantías", "cesantias"],
    ["intereses cesantias", "intereses_cesantias"],
    ["Intereses sobre cesantías", "intereses_cesantias"],
    ["horas extras", "horas_extras"],
    ["Auxilio de transporte", "auxilio_transporte"],
    ["ARL", "aportes_arl"],
    ["otros", "otros"],
    ["aportes_pension", "aportes_pension"],
    ["aportes pension", "aportes_pension"],
  ])("«%s» → %s", (texto, esperado) => {
    expect(normalizarGrupoConcepto(texto)).toBe(esperado);
  });

  it("no reconoce lo que no está en el catálogo", () => {
    expect(normalizarGrupoConcepto("gastos varios")).toBeNull();
    expect(normalizarGrupoConcepto("")).toBeNull();
    expect(normalizarGrupoConcepto(null)).toBeNull();
  });
});

describe("sugerirGrupoConcepto (nombres reales de los archivos)", () => {
  it.each([
    ["SALARIO BASICO", "sueldos"],
    ["Sueldo", "sueldos"],
    ["RETROACTIVO DE SALARIO", "sueldos"],
    ["SUBSIDIO DE TRANSPORTE", "auxilio_transporte"],
    ["AUXILIO DE TRANSPORTE", "auxilio_transporte"],
    ["Aux. Transporte", "auxilio_transporte"],
    ["AUXILIO DE RODAMIENTO VARIABLE", "auxilio_transporte"],
    ["COMISIONES", "comisiones"],
    ["HORA EXTRA DIURNA", "horas_extras"],
    ["HED", "horas_extras"],
    ["RECARGO NOCTURNO", "horas_extras"],
    ["INCAPACIDAD EPS", "incapacidades"],
    ["LICENCIA DE MATERNIDAD", "incapacidades"],
    ["INDEMNIZACION", "indemnizaciones"],
    ["CESANTIAS", "cesantias"],
    ["INTERES  CESANTIAS  N DEVENGO", "intereses_cesantias"],
    ["Intereses a las cesantías", "intereses_cesantias"],
    ["PRIMA DE SERVICIOS", "prima"],
    ["Prima legal", "prima"],
    ["VACACIONES DIAS NO HABILES", "vacaciones"],
    ["Vacac en LDCT", "vacaciones"],
    ["BONIFICACION NO SALARIAL", "bonificaciones"],
    ["Bono de alimentación", "bonificaciones"],
    ["VIATICOS", "viaticos"],
    ["DOTACION", "dotacion"],
    ["APORTES ENTIDADES DE SALUD", "aportes_eps"],
    ["EPS SURA", "aportes_eps"],
    ["AFP PROTECCION", "aportes_pension"],
    ["APORTES ARL", "aportes_arl"],
    ["APORTES COMFAMA", "caja_compensacion"],
    ["ICBF", "aportes_icbf"],
    ["SENA", "aportes_sena"],
    ["AUXILIO EDUCATIVO", "auxilios"],
  ])("«%s» → %s", (nombre, esperado) => {
    expect(sugerirGrupoConcepto(nombre)).toBe(esperado);
  });

  it("no adivina cuando el nombre no dice nada", () => {
    expect(sugerirGrupoConcepto("PRESTAMO EMPLEADOS")).toBeNull();
    expect(sugerirGrupoConcepto("CREDITO OPTICA")).toBeNull();
    expect(sugerirGrupoConcepto("")).toBeNull();
  });
});

describe("subcuentas PUC", () => {
  it("grupoPorSubcuentaPuc", () => {
    expect(grupoPorSubcuentaPuc("06")).toBe("sueldos");
    expect(grupoPorSubcuentaPuc("15")).toBe("horas_extras");
    expect(grupoPorSubcuentaPuc("27")).toBe("auxilio_transporte");
    expect(grupoPorSubcuentaPuc("48")).toBe("bonificaciones");
    expect(grupoPorSubcuentaPuc("60")).toBe("indemnizaciones");
    expect(grupoPorSubcuentaPuc("6")).toBe("sueldos");
    expect(grupoPorSubcuentaPuc("99")).toBeNull();
    expect(grupoPorSubcuentaPuc(null)).toBeNull();
  });

  it("etiquetaSubcuentaPuc", () => {
    expect(etiquetaSubcuentaPuc("06")).toBe("Sueldos");
    expect(etiquetaSubcuentaPuc("45")).toBe("Auxilios");
    expect(etiquetaSubcuentaPuc("99")).toBe("Subcuenta 99");
  });
});
