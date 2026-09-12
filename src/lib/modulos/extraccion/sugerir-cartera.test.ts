import { describe, expect, it } from "vitest";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { descriptorModulo } from "../descriptores";
import { detectarFamilias, detectarTerceroModo, sugerirSpec } from "./sugerir";
import encabezados from "../cartera/__fixtures__/encabezados-cxc.json";

/**
 * El sugeridor contra los ENCABEZADOS REALES de los catorce archivos de cartera que los
 * clientes de la firma entregan (ocho softwares distintos). El fixture guarda solo la fila
 * de encabezado tal como la lee la ingesta de la plataforma —sin datos de terceros—, que es
 * lo que decide el mapeo de columnas.
 *
 * Se fija el rol de CADA columna que importa: si un cambio en los sinónimos mueve el saldo
 * a otra columna o deja el NIT sin mapear, el archivo entra mal y el módulo queda mal
 * conciliado. Las columnas que el módulo no usa (ciudad, vendedor, zona…) se omiten.
 */
const CAR = descriptorModulo("CAR")!;

const fixture = encabezados as Record<string, { software: string; hoja: string; encabezado: (string | null)[] }>;

/** Hoja sintética con el encabezado real en la fila 1 (los datos no influyen en el mapeo). */
const hojaDe = (slug: string): GridHoja => ({
  nombre: fixture[slug].hoja,
  filas: [fixture[slug].encabezado],
});

/** Rol asignado a cada columna 1-based, para poder afirmar por índice. */
const rolPorColumna = (slug: string): Map<number, string> => {
  const spec = sugerirSpec(CAR, hojaDe(slug));
  const mapa = new Map<number, string>();
  for (const [rol, col] of Object.entries(spec.columnas)) if (col >= 1) mapa.set(col, rol);
  return mapa;
};

describe("sugerirSpec · mapeo de los catorce archivos reales", () => {
  // Columna 1-based → rol esperado. Solo las columnas que el módulo necesita.
  const ESPERADO: Record<string, Record<number, string>> = {
    ilimitada: { 1: "nit", 2: "nombre" },
    libra: { 3: "cuenta", 5: "vencimiento", 6: "nit", 9: "documento", 15: "edadEtiqueta" },
    ofimatica: { 1: "nit", 2: "nombre", 3: "total" },
    "sap-igb": { 1: "nit", 2: "nombre", 5: "documento", 8: "vencimiento", 10: "total" },
    "sap-motozone": { 1: "nit", 2: "nombre", 5: "documento", 8: "vencimiento", 10: "total" },
    // SIESA jerárquico: la columna 1 lleva la cuenta en las filas de sección y el NIT en
    // las de tercero. Se mapea como `nit` (las filas de datos son terceros); la lectura de
    // la cuenta en esa misma columna llega con el modo de identificador compartido.
    "siesa-aceros": { 1: "nit", 8: "marcaSeccion", 13: "total" },
    "siesa-mineralin-edades": { 1: "nit", 8: "marcaSeccion", 15: "total" },
    "siesa-mineralin-detalle": { 2: "documento", 4: "vencimiento", 8: "marcaSeccion", 13: "total" },
    "siesa-plasmar": { 2: "nombre", 3: "tipoDocumento", 4: "documento", 6: "vencimiento", 10: "total", 11: "edadEtiqueta" },
    "siesa-zarzal": { 4: "documento", 6: "vencimiento", 10: "marcaSeccion", 19: "total" },
    sievensoft: { 1: "nit", 2: "nombre", 4: "documento", 6: "vencimiento", 8: "total" },
    // Kakaraka trae el NIT limpio en «TERCERO» (col 3); la col 1 «NIT» viene mezclada con
    // la sucursal, así que mapear la 3 es lo correcto.
    "siigo-kakaraka": { 2: "dv", 3: "nit", 4: "sucursal", 5: "nombre", 9: "total", 13: "vencimiento" },
    "siigo-pure-nature": { 1: "nit", 3: "sucursal", 4: "documento", 5: "vencimiento" },
    "world-office": { 2: "nombre", 3: "nit", 6: "sucursal", 11: "tipoDocumento", 12: "documento", 14: "vencimiento", 15: "total" },
  };

  for (const [slug, columnas] of Object.entries(ESPERADO)) {
    it(`${slug} (${fixture[slug].software})`, () => {
      const mapa = rolPorColumna(slug);
      for (const [col, rol] of Object.entries(columnas)) {
        expect(mapa.get(Number(col)), `columna ${col} → ${rol}`).toBe(rol);
      }
    });
  }

  it("el fixture cubre los catorce archivos", () => {
    expect(Object.keys(ESPERADO).sort()).toEqual(Object.keys(fixture).sort());
  });
});

describe("sugerirSpec · los baldes de edad no compiten por un rol", () => {
  it("las columnas de la familia quedan fuera del reparto", () => {
    const spec = sugerirSpec(CAR, hojaDe("ilimitada"));
    const columnasFamilia = (spec.familias?.edades ?? []).map((c) => c.columna);
    expect(columnasFamilia).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const deRoles = Object.values(spec.columnas).filter((c) => c >= 1);
    expect(deRoles.some((c) => columnasFamilia.includes(c))).toBe(false);
  });

  it("un balde no le roba el saldo a la columna de total", () => {
    // SIESA Zarzal rotula su última edad «De 361 o mas» y trae «Total» aparte.
    const spec = sugerirSpec(CAR, hojaDe("siesa-zarzal"));
    expect(spec.columnas.total).toBe(19);
    expect((spec.familias?.edades ?? []).map((c) => c.columna)).toEqual([12, 13, 14, 15, 16, 17, 18]);
  });

  it("clasifica cada balde y marca como excluible lo que ya está contado", () => {
    const spec = sugerirSpec(CAR, hojaDe("sap-igb"));
    const porEtiqueta = new Map((spec.familias?.edades ?? []).map((c) => [c.etiqueta, c.clase]));
    expect(porEtiqueta.get("Sin vencer")).toBe("corriente");
    expect(porEtiqueta.get("91 - 180")).toBe("vencido");
    // «Deuda dudosa» es un subconjunto de los baldes anteriores: sumarla duplicaría.
    expect(porEtiqueta.get("Deuda dudosa")).toBe("excluir");
  });

  it("declara el modo de las edades según cómo vengan", () => {
    expect(sugerirSpec(CAR, hojaDe("ilimitada")).edadesModo).toBe("ancho");
    expect(sugerirSpec(CAR, hojaDe("libra")).edadesModo).toBe("largo");
    expect(sugerirSpec(CAR, hojaDe("siesa-mineralin-detalle")).edadesModo).toBe("ancho");
  });

  it("un módulo sin familias no gana campos nuevos", () => {
    const INV = descriptorModulo("INV")!;
    const spec = sugerirSpec(INV, { nombre: "H", filas: [["Tipo", "Referencia", "Valor total", "1 - 30 DIAS"]] });
    expect(spec.familias).toBeUndefined();
    expect(spec.edadesModo).toBeUndefined();
    expect(spec.terceroModo).toBeUndefined();
  });
});

describe("detectarFamilias", () => {
  it("guarda el rótulo literal del ERP como etiqueta", () => {
    const familias = detectarFamilias(CAR, ["NIT", "1 - 30 DIAS", "POR VENCER"]);
    expect(familias?.edades).toEqual([
      { columna: 2, etiqueta: "1 - 30 DIAS", clase: "vencido" },
      { columna: 3, etiqueta: "POR VENCER", clase: "corriente" },
    ]);
  });

  it("ignora las celdas vacías del encabezado", () => {
    expect(detectarFamilias(CAR, ["NIT", null, "", "1-30 días"])?.edades).toHaveLength(1);
  });

  it("sin baldes no devuelve familia", () => {
    expect(detectarFamilias(CAR, ["NIT", "NOMBRE", "Saldo"])).toBeUndefined();
  });
});

describe("detectarTerceroModo", () => {
  const spec = { primeraFilaDatos: 2, columnas: { nit: 1, documento: 2 } };

  it("plano: cada fila trae NIT y documento", () => {
    const hoja: GridHoja = {
      nombre: "H",
      filas: [["NIT", "Doc"], ["900123456", "FV-1"], ["900123456", "FV-2"], ["800987654", "FV-3"]],
    };
    expect(detectarTerceroModo(hoja, spec, "nit")).toBe("columna");
  });

  it("jerárquico: una fila de tercero y sus documentos debajo", () => {
    const hoja: GridHoja = {
      nombre: "H",
      filas: [
        ["NIT", "Doc"],
        ["900123456", ""], ["", "FV-1"], ["", "FV-2"],
        ["800987654", ""], ["", "FV-3"], ["", "FV-4"],
      ],
    };
    expect(detectarTerceroModo(hoja, spec, "nit")).toBe("cabecera");
  });

  it("sin columna de documento no hay jerarquía que detectar", () => {
    const hoja: GridHoja = { nombre: "H", filas: [["NIT"], ["900123456"]] };
    expect(detectarTerceroModo(hoja, { primeraFilaDatos: 2, columnas: { nit: 1 } }, "nit")).toBe("columna");
  });

  it("una hoja sin datos no arriesga un modo", () => {
    expect(detectarTerceroModo({ nombre: "H", filas: [["NIT", "Doc"]] }, spec, "nit")).toBe("columna");
  });
});
