import { describe, expect, it } from "vitest";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { descriptorModulo } from "./descriptores";
import type { SpecModulo } from "./extraccion/esquema";
import {
  debeGuardarFormatoManual,
  elegirFormatoManual,
  huellaFormatoManual,
  mismoFormatoManual,
  motivoNoGuardable,
  planFormatoManual,
  type FormatoManualGuardado,
  type PropuestaFormatoManual,
} from "./formatos-manuales";

const INV = descriptorModulo("INV")!;
const CAR = descriptorModulo("CAR")!;
const columnasDe = (descriptor: typeof INV, mapa: Record<string, number>) =>
  Object.fromEntries(descriptor.columnas.map((rol) => [rol.nombre, mapa[rol.nombre] ?? 0]));

const TITULOS = ["Tipo", "Referencia", "Descripción", "Cantidad", "Valor total"];
const SPEC_INV: SpecModulo = {
  hoja: "kardex diciembre",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: columnasDe(INV, { tipo: 1, referencia: 2, descripcion: 3, cantidad: 4, valorTotal: 5 }),
  clasificadorModo: "columna",
};

const fecha = (dia: number) => new Date(`2026-10-${String(dia).padStart(2, "0")}T12:00:00Z`);
function formato(datos: Partial<FormatoManualGuardado> & { id: number }): FormatoManualGuardado {
  return {
    huella: huellaFormatoManual(INV, TITULOS)!,
    encabezado: TITULOS,
    specJson: SPEC_INV,
    archivoEjemplo: "kardex dic.xlsx",
    vecesUsado: 1,
    ultimoUsoEn: fecha(1),
    guardadoEn: fecha(1),
    guardadoPor: "Camilo",
    creadoEn: fecha(1),
    creadoPor: "Camilo",
    ...datos,
  };
}
const hoja = (nombre: string, filas: (string | number | null)[][], extra: Partial<GridHoja> = {}): GridHoja => ({ nombre, filas, ...extra });
const libro = (nombre: string, titulos = TITULOS) => [hoja(nombre, [["INVENTARIO A ENERO"], titulos, ["MP", "A-1", "Tornillo", 3, 300]])];

describe("huellaFormatoManual", () => {
  it("ignora tildes, mayúsculas, espacios y la hoja; distingue otros títulos", () => {
    expect(huellaFormatoManual(INV, ["TIPO", "referencia ", "Descripcion", "CANTIDAD", "valor  total"])).toBe(huellaFormatoManual(INV, TITULOS));
    expect(huellaFormatoManual(INV, [...TITULOS, "Bodega"])).not.toBe(huellaFormatoManual(INV, TITULOS));
    expect(huellaFormatoManual(INV, TITULOS)?.startsWith("fm1:")).toBe(true);
  });

  it("los rangos de vencimiento cuentan como uno, sin importar cuántos ni cómo se rotulen", () => {
    const a = huellaFormatoManual(CAR, ["NIT", "Nombre", "Documento", "1-30", "31-60", "Total"]);
    const b = huellaFormatoManual(CAR, ["NIT", "Nombre", "Documento", "De 1 a 30", "De 31 a 60", "61-90", "Total"]);
    expect(a).toBe(b);
  });

  it("con menos de dos títulos no hay llave", () => {
    expect(huellaFormatoManual(INV, ["Inventario", "", null])).toBeNull();
  });
});

describe("elegirFormatoManual", () => {
  it("reconoce los mismos títulos aunque la hoja se llame distinto y traslada el mapeo a esta hoja", () => {
    const elegido = elegirFormatoManual(INV, libro("kardex enero"), [formato({ id: 7 })]);
    expect(elegido).toMatchObject({ porcentaje: 100, formato: { id: 7 } });
    expect(elegido!.spec).toMatchObject({ hoja: "kardex enero", filaEncabezado: 2, primeraFilaDatos: 3 });
    expect(elegido!.spec.columnas).toMatchObject({ tipo: 1, valorTotal: 5 });
  });

  it("las hojas «99» y «01» con los mismos títulos son el mismo formato", () => {
    expect(elegirFormatoManual(INV, libro("99"), [formato({ id: 7 })])?.porcentaje).toBe(100);
    expect(elegirFormatoManual(INV, libro("01"), [formato({ id: 7 })])?.porcentaje).toBe(100);
  });

  it("traslada columnas corridas", () => {
    const elegido = elegirFormatoManual(INV, [hoja("Hoja1", [["Bodega", ...TITULOS], ["B1", "MP", "A-1", "Tornillo", 3, 300]])], [formato({ id: 7 })]);
    expect(elegido!.spec.columnas).toMatchObject({ tipo: 2, referencia: 3, valorTotal: 6 });
  });

  it("un archivo con otros títulos no coincide", () => {
    expect(elegirFormatoManual(INV, [hoja("H", [["Código", "Nombre", "Existencia", "Costo"]])], [formato({ id: 7 })])).toBeNull();
  });

  it("la hoja que eligió el usuario restringe la búsqueda", () => {
    const hojas = [...libro("kardex"), hoja("Resumen", [["Bodega", "Total"]])];
    expect(elegirFormatoManual(INV, hojas, [formato({ id: 7 })], { hojaElegida: "Resumen" })).toBeNull();
    expect(elegirFormatoManual(INV, hojas, [formato({ id: 7 })], { hojaElegida: "kardex" })?.formato.id).toBe(7);
  });

  it("entre dos formatos que empatan gana el usado más recientemente", () => {
    const viejo = formato({ id: 1, ultimoUsoEn: fecha(2) });
    const reciente = formato({ id: 2, ultimoUsoEn: fecha(9) });
    expect(elegirFormatoManual(INV, libro("x"), [reciente, viejo])?.formato.id).toBe(2);
    expect(elegirFormatoManual(INV, libro("x"), [viejo, reciente])?.formato.id).toBe(2);
  });

  it("un perfil anterior (sin títulos) no participa: se reconoce solo por su huella exacta", () => {
    expect(elegirFormatoManual(INV, libro("x"), [formato({ id: 3, encabezado: null, huella: "abc" })])).toBeNull();
  });

  it("Cartera: con el tipo deducido se exige su columna aunque el porcentaje alcance", () => {
    const titulos = ["NIT", "Nombre", "Documento", "Saldo", "Ciudad", "Zona", "Vendedor", "Teléfono", "Correo", "Plazo"];
    const spec: SpecModulo = {
      hoja: "Cartera", filaEncabezado: 1, primeraFilaDatos: 2,
      columnas: columnasDe(CAR, { nit: 1, nombre: 2, documento: 3, [CAR.valor]: 4 }),
    };
    const guardado = formato({ id: 4, encabezado: titulos, specJson: spec, huella: huellaFormatoManual(CAR, titulos)! });
    // Sin la columna «Documento» el resto aún suma más de 80 %, pero un formato por documento no se lee sin ella.
    const sinDocumento = titulos.filter((t) => t !== "Documento");
    expect(elegirFormatoManual(CAR, [hoja("Cartera", [sinDocumento])], [guardado])).toBeNull();
    const conDocumento = elegirFormatoManual(CAR, [hoja("Cartera", [titulos])], [guardado]);
    expect(conDocumento?.porcentaje).toBe(100);
    // El tipo deducido solo se usó para comparar: el mapeo aplicado no lo declara.
    expect(conDocumento!.spec.tipoFormato).toBeUndefined();
  });

  it("avisa cuando la moneda del formato no coincide con la de la hoja", () => {
    const titulos = ["NIT", "Nombre", "Documento", "Saldo"];
    const spec: SpecModulo = {
      hoja: "USD", filaEncabezado: 1, primeraFilaDatos: 2, monedaArchivo: "USD",
      columnas: columnasDe(CAR, { nit: 1, nombre: 2, documento: 3, [CAR.valor]: 4 }),
    };
    const guardado = formato({ id: 5, encabezado: titulos, specJson: spec, huella: huellaFormatoManual(CAR, titulos)! });
    const elegido = elegirFormatoManual(CAR, [hoja("Pesos", [titulos])], [guardado]);
    expect(elegido?.advertencias.join(" ")).toContain("USD");
  });
});

describe("mismoFormatoManual y motivoNoGuardable", () => {
  it("el mismo mapeo en otra hoja y con el encabezado más abajo es el mismo formato", () => {
    expect(mismoFormatoManual(SPEC_INV, { ...SPEC_INV, hoja: "enero", filaEncabezado: 4, primeraFilaDatos: 5 })).toBe(true);
    expect(mismoFormatoManual(SPEC_INV, { ...SPEC_INV, primeraFilaDatos: 3 })).toBe(false);
    expect(mismoFormatoManual(SPEC_INV, { ...SPEC_INV, columnas: { ...SPEC_INV.columnas, cantidad: 0 } })).toBe(false);
  });

  it("no guarda un encabezado de un título ni uno que parece fila de datos", () => {
    expect(motivoNoGuardable(INV, ["Inventario"], SPEC_INV)).toMatch(/menos de dos títulos/);
    expect(motivoNoGuardable(INV, ["MP", "1001", "25", "300.000"], SPEC_INV)).toMatch(/fila de datos/);
    expect(motivoNoGuardable(INV, TITULOS, SPEC_INV)).toBeNull();
  });
});

describe("planFormatoManual", () => {
  const propuesta = (extra: Partial<PropuestaFormatoManual> = {}): PropuestaFormatoManual => ({ version: 1, encabezado: TITULOS, spec: SPEC_INV, ...extra });

  it("sin formatos guardados es nuevo", () => {
    expect(planFormatoManual(INV, propuesta(), [])).toMatchObject({ estado: "nuevo", accion: { tipo: "crear" } });
  });

  it("los mismos títulos y el mismo mapeo solo suman un uso, aunque cambie la hoja", () => {
    const plan = planFormatoManual(INV, propuesta({ spec: { ...SPEC_INV, hoja: "enero" } }), [formato({ id: 7 })]);
    expect(plan).toMatchObject({ estado: "igual", accion: { tipo: "sumar_uso", id: 7 } });
  });

  it("los mismos títulos con otro mapeo reemplazan el guardado", () => {
    const plan = planFormatoManual(INV, propuesta({ spec: { ...SPEC_INV, columnas: { ...SPEC_INV.columnas, cantidad: 0 } } }), [formato({ id: 7 })]);
    expect(plan).toMatchObject({ estado: "reemplaza", accion: { tipo: "actualizar", id: 7, cambiaMapeo: true }, existente: { id: 7 } });
  });

  it("leído con un formato que coincidió (títulos algo distintos): ese formato se actualiza", () => {
    const titulos = [...TITULOS, "Bodega"];
    const plan = planFormatoManual(INV, propuesta({ encabezado: titulos, formatoUsadoId: 7, porcentaje: 92 }), [formato({ id: 7 })]);
    expect(plan).toMatchObject({ estado: "igual", accion: { tipo: "actualizar", id: 7, cambiaMapeo: false } });
  });

  it("un perfil anterior usado tal cual gana sus títulos sin pedir confirmación", () => {
    const anterior = formato({ id: 3, encabezado: null, huella: "abcdef0123456789" });
    expect(planFormatoManual(INV, propuesta({ perfilLegadoId: 3 }), [anterior])).toMatchObject({ estado: "igual", accion: { tipo: "actualizar", id: 3, cambiaMapeo: false } });
  });

  it("un formato que no identifica nada no se guarda", () => {
    expect(planFormatoManual(INV, propuesta({ encabezado: ["Inventario"] }), [])).toMatchObject({ estado: "no_guardable", accion: null });
  });

  it("la casilla decide lo nuevo y lo reemplazado; «igual» cuenta el uso siempre", () => {
    expect(debeGuardarFormatoManual("igual", undefined)).toBe(true);
    expect(debeGuardarFormatoManual("nuevo", "1")).toBe(true);
    expect(debeGuardarFormatoManual("nuevo", undefined)).toBe(false);
    expect(debeGuardarFormatoManual("reemplaza", "0")).toBe(false);
    expect(debeGuardarFormatoManual("no_guardable", "1")).toBe(false);
  });
});
