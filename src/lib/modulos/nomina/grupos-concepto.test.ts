import { describe, expect, it } from "vitest";
import {
  GRUPOS_CONCEPTO_NOMINA,
  etiquetaSubcuentaPuc,
  grupoPorSubcuentaPuc,
  normalizarGrupoConcepto,
  sugerirGrupoConcepto,
} from "./grupos-concepto";
import { SUBCUENTAS_CONCILIA_NOMINA, SUBCUENTAS_VISIBLES_NOMINA } from "../descriptores";

describe("catálogo RF-NOM-02", () => {
  it("cada grupo tiene id único, sufijo Russell de dos dígitos y al menos una subcuenta PUC", () => {
    const ids = GRUPOS_CONCEPTO_NOMINA.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of GRUPOS_CONCEPTO_NOMINA) {
      expect(g.sufijoRussell).toMatch(/^\d{2}$/);
      expect(g.subcuentasPuc.length).toBeGreaterThan(0);
    }
  });

  it("el sufijo Russell es la subcuenta PUC del grupo cuando el plan la tiene; si no, «Otros» (1/Oct/2026)", () => {
    // El plan Russell tiene las 27 subcuentas en 5105 (las que concilian y las solo visibles).
    const plan = new Set([...SUBCUENTAS_CONCILIA_NOMINA, ...SUBCUENTAS_VISIBLES_NOMINA]);
    for (const g of GRUPOS_CONCEPTO_NOMINA) {
      expect(plan.has(g.sufijoRussell), g.id).toBe(true);
      const delPlan = g.subcuentasPuc.find((s) => plan.has(s));
      expect(g.sufijoRussell, g.id).toBe(delPlan ?? "95");
    }
    // Lo que antes colapsaba en xx06 / xx95.
    const sufijo = (id: string) => GRUPOS_CONCEPTO_NOMINA.find((g) => g.id === id)?.sufijoRussell;
    expect(sufijo("horas_extras")).toBe("15");
    expect(sufijo("comisiones")).toBe("18");
    expect(sufijo("incapacidades")).toBe("24");
    expect(sufijo("auxilio_transporte")).toBe("27");
    expect(sufijo("viaticos")).toBe("95");
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
    // NOMINAI (KP EMPAQUES, dic-2025): abreviaturas.
    ["003 - HOR EXT DIUR 125%", "horas_extras"],
    ["005 - HORA EXT NOCT 175%", "horas_extras"],
    ["010 - REC NOCT 35%", "horas_extras"],
    ["069 - INC. NUEVA EPS", "incapacidades"],
    ["074 - INC. SURA", "incapacidades"],
    ["060 - INCAP. KP EMPAQUES", "incapacidades"],
    ["063 - LICENC. MATERNIDAD", "incapacidades"],
    ["602 - EPS SURA", "aportes_eps"],
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
