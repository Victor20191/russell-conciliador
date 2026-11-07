import { describe, expect, it } from "vitest";
import { avisosColumnaDoble, sumaDelRol } from "./columna-doble";
import { MODULOS_IMPORT, descriptorModulo, type DescriptorModulo } from "./descriptores";
import type { SpecModulo } from "./extraccion/esquema";

const AFI = descriptorModulo("AFI")!;
const NOM = descriptorModulo("NOM")!;

const rolesDe = (d: DescriptorModulo) => d.columnas.map((c) => ({ nombre: c.nombre, etiqueta: c.etiqueta, ...sumaDelRol(d, c.nombre) }));
const letra = (c: number) => String.fromCharCode(64 + c);
const avisos = (d: DescriptorModulo, columnas: Record<string, number>, valorFormula?: SpecModulo["valorFormula"]) =>
  avisosColumnaDoble({ roles: rolesDe(d), spec: { columnas, valorFormula }, rolValor: d.valor, rotulo: letra });

describe("columna doble en el mapeo", () => {
  it("KOEN PACK: la valorización en la columna del costo duplica el activo", () => {
    const r = avisos(AFI, { grupo: 1, placa: 2, costo: 5, depreciacion: 6, valorizacion: 5 });
    expect(r).toEqual([
      {
        columna: 5,
        roles: ["costo", "valorizacion"],
        mensaje: "La columna E se toma dos veces: en «Costo de adquisición» y en «Valorización». Los dos se suman al costo del activo, así que su valor quedará duplicado.",
      },
    ]);
  });

  it("la depreciación y el deterioro en la misma columna restan dos veces", () => {
    const [aviso] = avisos(AFI, { costo: 5, depreciacion: 6, deterioro: 6 });
    expect(aviso.roles).toEqual(["depreciacion", "deterioro"]);
    expect(aviso.mensaje).toContain("Los dos se restan del costo neto del activo, así que su valor quedará duplicado.");
  });

  it("tres campos en la misma columna se nombran todos", () => {
    const [aviso] = avisos(AFI, { costo: 5, adiciones: 5, mejoras: 5 });
    expect(aviso.mensaje).toBe(
      "La columna E se toma tres veces: en «Costo de adquisición», en «Adiciones» y en «Mejoras». Los tres se suman al costo del activo, así que su valor quedará duplicado.",
    );
  });

  it("no avisa entre campos que no se suman: costo y depreciación, textos, sin mapear", () => {
    expect(avisos(AFI, { costo: 5, depreciacion: 5 })).toEqual([]);
    expect(avisos(AFI, { grupo: 1, placa: 1, descripcion: 1, costo: 5 })).toEqual([]);
    expect(avisos(AFI, { costo: 5, valorizacion: 0, adiciones: 0 })).toEqual([]);
    // El costo neto del archivo solo se compara: compartir columna no lo suma.
    expect(avisos(AFI, { costo: 5, valorNeto: 5 })).toEqual([]);
  });

  it("con el costo por fórmula cuenta cada término que suma, no los que restan", () => {
    const formula: SpecModulo["valorFormula"] = [{ columna: 5, signo: "+" }, { columna: 7, signo: "-" }];
    expect(avisos(AFI, { costo: 0, valorizacion: 5 }, formula).map((a) => a.columna)).toEqual([5]);
    expect(avisos(AFI, { costo: 0, valorizacion: 7 }, formula)).toEqual([]);
    // Con un solo término no hay fórmula: manda la columna del costo.
    expect(avisos(AFI, { costo: 3, valorizacion: 5 }, [{ columna: 5, signo: "+" }])).toEqual([]);
  });

  it("Nómina no avisa: devengo y deducción en la misma columna se anulan, no se suman", () => {
    expect(avisos(NOM, { concepto: 1, devengo: 4, deduccion: 4, valor: 4 })).toEqual([]);
  });

  it("solo Activos fijos declara importes que se suman, y cada grupo nombra roles de importe del módulo", () => {
    const conGrupos = Object.values(MODULOS_IMPORT).filter((d) => (d.importesQueSeSuman?.length ?? 0) > 0).map((d) => d.codigo);
    expect(conGrupos).toEqual(["AFI"]);
    for (const g of AFI.importesQueSeSuman ?? []) {
      for (const rol of g.roles) expect(AFI.columnas.find((c) => c.nombre === rol)?.tipo).toBe("moneda");
    }
  });

  it("Activos fijos: los grupos siguen a la cédula (lo que suma al costo y lo que resta del neto)", () => {
    const [costo, rebajas] = AFI.importesQueSeSuman ?? [];
    expect([...costo.roles].sort()).toEqual([AFI.valor, ...(AFI.cedula?.sumaAlCosto ?? [])].sort());
    expect([...rebajas.roles].sort()).toEqual([AFI.cedula?.valorRelacionado?.rol, AFI.cedula?.correctoraFija?.rol].sort());
  });
});
