import { describe, expect, it } from "vitest";
import {
  agrupaPorOtraDimension,
  agruparPorDeEncabezado,
  agruparPorDeLote,
  agruparPorDefecto,
  agruparPorMapeadas,
  agruparPorPreseleccion,
  clasificadorCanonico,
  detalleAuditoriaAgruparPor,
  esAgruparPor,
  etiquetaAgruparPor,
  etiquetaAgruparPorPlural,
  leerAgruparPorDeLote,
  OPCIONES_AGRUPAR_POR,
  rolDeAgruparPor,
} from "./agrupar-por";

describe("«Agrupar por» del Consolidado de Nómina", () => {
  it("reconoce las tres dimensiones y rechaza lo demás", () => {
    expect(OPCIONES_AGRUPAR_POR).toEqual(["codigo", "concepto", "cuenta"]);
    for (const o of OPCIONES_AGRUPAR_POR) expect(esAgruparPor(o)).toBe(true);
    expect(esAgruparPor("nombre")).toBe(false);
    expect(esAgruparPor(null)).toBe(false);
    expect(esAgruparPor(1)).toBe(false);
  });

  it("cada dimensión tiene su etiqueta, su plural y su rol del descriptor", () => {
    expect(etiquetaAgruparPor("codigo")).toBe("Código del concepto");
    expect(etiquetaAgruparPor("concepto")).toBe("Nombre del concepto");
    expect(etiquetaAgruparPor("cuenta")).toBe("Cuenta contable del cliente");
    expect(etiquetaAgruparPorPlural("concepto")).toBe("Nombres de concepto");
    expect(rolDeAgruparPor("codigo")).toBe("codigo");
    expect(rolDeAgruparPor("concepto")).toBe("concepto");
    expect(rolDeAgruparPor("cuenta")).toBe("cuenta");
  });

  describe("clasificadorCanonico", () => {
    it("por código: la forma canónica de siempre (sin ceros a la izquierda)", () => {
      expect(clasificadorCanonico("codigo", " 01 ")).toBe("1");
      expect(clasificadorCanonico("codigo", "001")).toBe("1");
      expect(clasificadorCanonico("codigo", "HED")).toBe("HED");
    });

    it("por nombre: colapsa espacios y recorta, sin cambiar mayúsculas ni tildes", () => {
      expect(clasificadorCanonico("concepto", "  Sueldo   básico ")).toBe("Sueldo básico");
      expect(clasificadorCanonico("concepto", "SUELDO BÁSICO")).toBe("SUELDO BÁSICO");
      expect(clasificadorCanonico("concepto", "Sueldo\tbásico\n")).toBe("Sueldo básico");
      expect(clasificadorCanonico("concepto", null)).toBe("");
    });

    it("por cuenta: los dígitos de una cuenta válida, conservando los ceros a la izquierda", () => {
      expect(clasificadorCanonico("cuenta", "5105.06.01")).toBe("51050601");
      expect(clasificadorCanonico("cuenta", "0005060000")).toBe("0005060000");
      expect(clasificadorCanonico("cuenta", "888888")).toBe(""); // comodín
      expect(clasificadorCanonico("cuenta", "5105")).toBe(""); // menos de 6 dígitos
      expect(clasificadorCanonico("cuenta", "")).toBe("");
    });
  });

  it("agruparPorDefecto: código → nombre → cuenta, según lo disponible", () => {
    expect(agruparPorDefecto({ codigo: true, concepto: true, cuenta: true })).toBe("codigo");
    expect(agruparPorDefecto({ codigo: false, concepto: true, cuenta: true })).toBe("concepto");
    expect(agruparPorDefecto({ concepto: false, cuenta: true })).toBe("cuenta");
    expect(agruparPorDefecto({})).toBe("codigo");
  });

  it("agruparPorPreseleccion: la última usada si está mapeada; si no, la de por defecto", () => {
    expect(agruparPorPreseleccion("cuenta", { codigo: true, concepto: true, cuenta: true })).toBe("cuenta");
    expect(agruparPorPreseleccion("cuenta", { codigo: true, concepto: true, cuenta: false })).toBe("codigo");
    expect(agruparPorPreseleccion(null, { codigo: false, concepto: true })).toBe("concepto");
    expect(agruparPorPreseleccion(undefined, {})).toBe("codigo");
  });

  it("agruparPorMapeadas: una dimensión está mapeada cuando la columna de su rol es ≥ 1", () => {
    expect(agruparPorMapeadas({ codigo: 2, concepto: 3, cuenta: 0, valor: 7 })).toEqual({ codigo: true, concepto: true, cuenta: false });
    expect(agruparPorMapeadas({ concepto: 1 })).toEqual({ codigo: false, concepto: true, cuenta: false });
    expect(agruparPorMapeadas(null)).toEqual({ codigo: false, concepto: false, cuenta: false });
  });

  it("leerAgruparPorDeLote lee el spec del lote y tolera basura", () => {
    expect(leerAgruparPorDeLote({ agruparPor: "concepto" })).toBe("concepto");
    expect(leerAgruparPorDeLote({ agruparPor: "nombre" })).toBeNull();
    expect(leerAgruparPorDeLote({})).toBeNull();
    expect(leerAgruparPorDeLote(null)).toBeNull();
    expect(leerAgruparPorDeLote("x")).toBeNull();
  });

  it("agruparPorDeLote: la respondida al leer; un lote anterior a la pregunta toma la de por defecto entre lo mapeado", () => {
    expect(agruparPorDeLote({ agruparPor: "cuenta", columnas: { codigo: 1, concepto: 2, cuenta: 3 } })).toBe("cuenta");
    expect(agruparPorDeLote({ columnas: { codigo: 1, concepto: 2 } })).toBe("codigo");
    expect(agruparPorDeLote({ columnas: { codigo: 0, concepto: 2 } })).toBe("concepto");
    expect(agruparPorDeLote(null)).toBe("codigo");
  });

  it("agrupaPorOtraDimension: solo nombre y cuenta calculan el grupo aparte del clasificador", () => {
    expect(agrupaPorOtraDimension("codigo")).toBe(false);
    expect(agrupaPorOtraDimension(null)).toBe(false);
    expect(agrupaPorOtraDimension("concepto")).toBe(true);
    expect(agrupaPorOtraDimension("cuenta")).toBe(true);
  });

  it("agruparPorDeEncabezado: null (cargue anterior) es código", () => {
    expect(agruparPorDeEncabezado(null)).toBe("codigo");
    expect(agruparPorDeEncabezado("cuenta")).toBe("cuenta");
    expect(agruparPorDeEncabezado("otro")).toBe("codigo");
  });

  it("detalleAuditoriaAgruparPor arma el sufijo de la bitácora", () => {
    expect(detalleAuditoriaAgruparPor("concepto")).toBe(" · agrupado por nombre del concepto");
    expect(detalleAuditoriaAgruparPor(null)).toBe("");
  });
});
