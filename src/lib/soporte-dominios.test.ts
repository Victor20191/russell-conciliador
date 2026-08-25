import { describe, expect, it } from "vitest";
import {
  clasificarDominioReporte,
  contarPorDominio,
  DOMINIOS_REPORTE,
  esFiltroDominioReporte,
  FILTRO_DOMINIO_TODOS,
  filtrarPorDominio,
  type DominioReporte,
} from "./soporte-dominios";

function fila(id: number, dominio: DominioReporte) {
  return { id, dominio };
}

describe("clasificarDominioReporte", () => {
  it("reconoce los dos dominios corporativos sin importar formato", () => {
    expect(clasificarDominioReporte("admin@russellbedford.co")).toBe("russell");
    expect(clasificarDominioReporte("  Luisa@XENTRIA.CO ")).toBe("xentria");
  });

  it("manda a «otros» los dominios que solo se parecen", () => {
    expect(clasificarDominioReporte("falso@noxentria.co")).toBe("otros");
    expect(clasificarDominioReporte("xentria.co@gmail.com")).toBe("otros");
    expect(clasificarDominioReporte("ana@falsorussellbedford.co")).toBe("otros");
  });

  it("manda a «otros» un correo externo o ausente en vez de perder el ticket", () => {
    expect(clasificarDominioReporte("contacto@cliente.com")).toBe("otros");
    expect(clasificarDominioReporte("")).toBe("otros");
    expect(clasificarDominioReporte(null)).toBe("otros");
    // Usuario borrado: el ticket conserva el id, pero ya no hay correo que leer.
    expect(clasificarDominioReporte(undefined)).toBe("otros");
  });
});

describe("filtrarPorDominio", () => {
  const filas = [fila(1, "russell"), fila(2, "xentria"), fila(3, "russell"), fila(4, "otros")];

  it("«todos» devuelve la lista íntegra y en el mismo orden", () => {
    expect(filtrarPorDominio(filas, FILTRO_DOMINIO_TODOS).map((f) => f.id)).toEqual([1, 2, 3, 4]);
  });

  it("deja solo el origen elegido, conservando el orden de llegada", () => {
    expect(filtrarPorDominio(filas, "russell").map((f) => f.id)).toEqual([1, 3]);
    expect(filtrarPorDominio(filas, "xentria").map((f) => f.id)).toEqual([2]);
    expect(filtrarPorDominio(filas, "otros").map((f) => f.id)).toEqual([4]);
  });

  it("los tres orígenes juntos reconstruyen la lista: ningún ticket es inalcanzable", () => {
    const porCajon = DOMINIOS_REPORTE.flatMap((d) => filtrarPorDominio(filas, d));
    expect(porCajon.map((f) => f.id).sort()).toEqual(filas.map((f) => f.id).sort());
  });

  it("no muta la lista original", () => {
    const original = [...filas];
    filtrarPorDominio(filas, "russell");
    expect(filas).toEqual(original);
  });
});

describe("contarPorDominio", () => {
  it("cuenta cada origen", () => {
    expect(contarPorDominio([fila(1, "russell"), fila(2, "russell"), fila(3, "otros")])).toEqual({
      russell: 2,
      xentria: 0,
      otros: 1,
    });
  });

  it("siempre trae los tres orígenes aunque la lista esté vacía", () => {
    expect(Object.keys(contarPorDominio([])).sort()).toEqual([...DOMINIOS_REPORTE].sort());
  });
});

describe("esFiltroDominioReporte", () => {
  it("acepta los valores del filtro y rechaza cualquier otro", () => {
    expect(esFiltroDominioReporte(FILTRO_DOMINIO_TODOS)).toBe(true);
    expect(esFiltroDominioReporte("russell")).toBe(true);
    expect(esFiltroDominioReporte("xentria")).toBe(true);
    expect(esFiltroDominioReporte("otros")).toBe(true);
    expect(esFiltroDominioReporte("gmail")).toBe(false);
    expect(esFiltroDominioReporte("")).toBe(false);
  });
});
