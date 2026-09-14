import { describe, expect, it } from "vitest";
import {
  archivoConDocumentos,
  esIdentificadorVacio,
  esNumeroDocumento,
  rolDeCeldaCompartida,
} from "./identificador-compartido";

// Los valores de estas pruebas son los que aparecen en la columna compartida de los tres
// reportes reales de SIESA (Zarzal, detalle de Mineralin, Aceros Mapa), con la negrita y la
// marca de sección tal como las lee la ingesta de la plataforma.

const conDocumentos = { hayDocumentos: true };
const sinDocumentos = { hayDocumentos: false };

describe("rolDeCeldaCompartida · reporte CON documentos (Zarzal, detalle de Mineralin)", () => {
  it("el número de documento del ERP es un documento", () => {
    expect(rolDeCeldaCompartida({ valor: "001-FVM-00735278-000", negrita: false, marcaSeccion: null, ...conDocumentos })).toBe("documento");
    expect(rolDeCeldaCompartida({ valor: "001-NCM-00492829-000", negrita: false, marcaSeccion: null, ...conDocumentos })).toBe("documento");
    // Mineralin deja un espacio antes del guion en los recibos de caja.
    expect(rolDeCeldaCompartida({ valor: "001-RC -00033422-000", negrita: false, marcaSeccion: null, ...conDocumentos })).toBe("documento");
  });

  it("dígitos en negrita sin «#Ter.» son la cabecera de un tercero", () => {
    for (const nit of ["1000294846", "10078880", "103661809", "1246311", "0992796928001", "72771"]) {
      expect(rolDeCeldaCompartida({ valor: nit, negrita: true, marcaSeccion: null, ...conDocumentos }), nit).toBe("tercero");
    }
  });

  it("con «#Ter.» lleno es la sección de una cuenta", () => {
    expect(rolDeCeldaCompartida({ valor: "13050500", negrita: true, marcaSeccion: 1307, ...conDocumentos })).toBe("cuenta");
    expect(rolDeCeldaCompartida({ valor: "28050501", negrita: true, marcaSeccion: "33", ...conDocumentos })).toBe("cuenta");
  });

  it("la marca «*» de relleno es una celda vacía, para que el documento herede su tercero", () => {
    expect(rolDeCeldaCompartida({ valor: "*", negrita: false, marcaSeccion: null, ...conDocumentos })).toBe("vacia");
    expect(rolDeCeldaCompartida({ valor: "", negrita: false, marcaSeccion: null, ...conDocumentos })).toBe("vacia");
  });

  it("rótulos y marcas del ERP no son identificadores", () => {
    expect(rolDeCeldaCompartida({ valor: "Total", negrita: true, marcaSeccion: null, ...conDocumentos })).toBe("otro");
    expect(rolDeCeldaCompartida({ valor: "SBS 1.25.0", negrita: false, marcaSeccion: null, ...conDocumentos })).toBe("otro");
  });
});

describe("rolDeCeldaCompartida · reporte SIN documentos (Aceros Mapa)", () => {
  it("aquí la negrita marca la CUENTA, no el tercero", () => {
    expect(rolDeCeldaCompartida({ valor: "280505", negrita: true, marcaSeccion: null, ...sinDocumentos })).toBe("cuenta");
    expect(rolDeCeldaCompartida({ valor: "13", negrita: true, marcaSeccion: 563, ...sinDocumentos })).toBe("cuenta");
  });

  it("y el tercero va en letra normal", () => {
    for (const nit of ["800161633", "10110223", "1001161964", "2613383"]) {
      expect(rolDeCeldaCompartida({ valor: nit, negrita: false, marcaSeccion: null, ...sinDocumentos }), nit).toBe("tercero");
    }
  });
});

describe("la misma celda cambia de rol según el archivo", () => {
  it("un número en negrita es tercero con documentos y cuenta sin ellos", () => {
    // Es el caso que una regla por celda no puede resolver.
    const celda = { valor: "10078880", negrita: true, marcaSeccion: null };
    expect(rolDeCeldaCompartida({ ...celda, hayDocumentos: true })).toBe("tercero");
    expect(rolDeCeldaCompartida({ ...celda, hayDocumentos: false })).toBe("cuenta");
  });
});

describe("archivoConDocumentos", () => {
  it("reconoce el reporte con detalle aunque la mayoría de celdas no sean documentos", () => {
    // Zarzal: 10.131 documentos entre ~11.700 filas.
    const zarzal = [...Array(10).fill("001-FVM-00735278-000"), "1000294846", "13050500", "", "*"];
    expect(archivoConDocumentos(zarzal)).toBe(true);
  });

  it("un resumen por tercero no tiene documentos", () => {
    expect(archivoConDocumentos(["280505", "800161633", "10110223", "13", ""])).toBe(false);
  });

  it("un documento suelto tecleado en un resumen no convierte el archivo", () => {
    const resumen = [...Array(40).fill("800161633"), "001-FVM-00000001-000"];
    expect(archivoConDocumentos(resumen)).toBe(false);
  });

  it("una columna vacía no afirma nada", () => {
    expect(archivoConDocumentos(["", "*", null])).toBe(false);
  });
});

describe("utilidades", () => {
  it("esIdentificadorVacio cubre las marcas de relleno del ERP", () => {
    for (const v of ["", "  ", "*", "**", "-", null, undefined]) expect(esIdentificadorVacio(v), String(v)).toBe(true);
    expect(esIdentificadorVacio("1000294846")).toBe(false);
  });

  it("esNumeroDocumento no confunde un NIT con un documento", () => {
    expect(esNumeroDocumento("001-FVM-00735278-000")).toBe(true);
    expect(esNumeroDocumento("900123456-7")).toBe(false);
    expect(esNumeroDocumento("1000294846")).toBe(false);
  });
});

describe("documentos del auxiliar de CxP (SIESA Zarzal)", () => {
  it("reconoce el documento sin tipo, con tipo numérico o alfanumérico y con guiones dobles", () => {
    for (const doc of ["001--00001596-000", "001-8850-00000000-000", "001-FAJ--00015989-000", "001-FAJ1-00016206-000", "001-174-00000005-000", "001-VPP42042916-00000000-000"]) {
      expect(esNumeroDocumento(doc), doc).toBe(true);
    }
  });

  it("una fecha no es un documento", () => {
    expect(esNumeroDocumento("2025-12-31")).toBe(false);
  });
});
