import { describe, expect, it } from "vitest";
import { claseSuma, esRotuloEdad, ordenarRotulos, type RotuloEdad } from "./edades";
import encabezados from "./__fixtures__/encabezados-cxc.json";

/**
 * Baldes de edad que debe reconocer cada uno de los catorce archivos reales de clientes
 * (carpeta `MODULOS ORIG/CXC`). El fixture guarda la fila de encabezado tal cual la lee la
 * ingesta de la plataforma; aquí se fija QUÉ columnas de esa fila son rangos de
 * vencimiento. Si un cambio en los patrones deja de reconocer un balde —o empieza a
 * reconocer una columna de importe como si lo fuera— este test lo caza.
 */
const ESPERADO: Record<string, { edades: string[]; clases?: Record<string, string> }> = {
  ilimitada: {
    edades: [
      "1 - 30 DIAS", "31 - 60 DIAS", "61 - 90 DIAS", "91 - 120 DIAS", "121 - 150 DIAS",
      "151 - 180 DIAS", "181 - 210 DIAS", "211 - 240 DIAS", "POR VENCER",
    ],
    clases: { "POR VENCER": "corriente" },
  },
  // La edad viene como ETIQUETA en una columna («EDAD»), no como columnas de importe.
  libra: { edades: [] },
  ofimatica: { edades: ["0-30 días", "31-60 días", "61-90 días", "Más de 90 días"] },
  "sap-igb": {
    edades: ["Sin vencer", "0-20", "61 - 90", "91 - 180", "181+", "Deuda dudosa"],
    clases: { "Sin vencer": "corriente", "Deuda dudosa": "excluir" },
  },
  "sap-motozone": {
    edades: ["Abono futuro", "0 - 60", "61 - 90", "91 - 180", "181 - 360", "361+", "Deuda dudosa"],
    clases: { "Abono futuro": "corriente", "Deuda dudosa": "excluir" },
  },
  // Resumen de saldos sin antigüedad: solo «Saldo» y «Cupo»/«Posfechados» (excluibles).
  "siesa-aceros": { edades: ["Cupo", "Posfechados"], clases: { Cupo: "excluir", Posfechados: "excluir" } },
  "siesa-mineralin-edades": {
    edades: ["Corriente", "De 1 a 90", "De 91 a 180", "De 181 a 360", "De 361 o mas"],
    clases: { Corriente: "corriente" },
  },
  "siesa-mineralin-detalle": { edades: ["Cupo", "Posfechados"], clases: { Cupo: "excluir", Posfechados: "excluir" } },
  // La columna «Edades» es una etiqueta de texto, no un importe: no entra en la familia.
  "siesa-plasmar": { edades: [] },
  "siesa-zarzal": {
    edades: ["Corriente", "De 1 a 30", "De 31 a 60", "De 61 a 90", "De 91 a 120", "De 121 a 360", "De 361 o mas"],
    clases: { Corriente: "corriente" },
  },
  sievensoft: {
    edades: [
      "SIN VENCER", "0 a 30 DIAS", "30 A 60 DIAS", "60 A 90 DIAS", "90 A 120 DIAS",
      "120 A 180 DIAS", "180 A 360 DIAS", "MAS DE 360",
    ],
    clases: { "SIN VENCER": "corriente" },
  },
  "siigo-kakaraka": {
    edades: ["<== 90-", "DE 89- A 60-", "DE 59- A 30-", "DE 29- A 1-", "0 ==>"],
    clases: { "0 ==>": "corriente" },
  },
  "siigo-pure-nature": {
    edades: [
      "Vencido 1 a 30", "Vencido 31 a 60", "Vencido 61 a 90", "Vencido más de 91",
      "Saldo por vencer", "Saldo a favor",
    ],
    clases: { "Saldo por vencer": "corriente", "Saldo a favor": "saldo_favor" },
  },
  "world-office": {
    edades: ["Por Vencer", "1 A 30", "31 A 60", "61 A 90", "Más De 90"],
    clases: { "Por Vencer": "corriente" },
  },
};

const fixture = encabezados as Record<string, { software: string; encabezado: (string | null)[] }>;

describe("esRotuloEdad sobre los encabezados reales de los 14 archivos", () => {
  for (const [slug, esperado] of Object.entries(ESPERADO)) {
    it(`${slug} (${fixture[slug]?.software})`, () => {
      const celdas = fixture[slug].encabezado;
      const detectadas = celdas.filter((c): c is string => c != null && esRotuloEdad(c) != null);
      expect(detectadas).toEqual(esperado.edades);
      for (const [rotulo, clase] of Object.entries(esperado.clases ?? {})) {
        expect(esRotuloEdad(rotulo)?.clase, rotulo).toBe(clase);
      }
    });
  }

  it("el fixture cubre los catorce archivos", () => {
    expect(Object.keys(fixture).sort()).toEqual(Object.keys(ESPERADO).sort());
  });
});

describe("esRotuloEdad: lo que NO debe reconocer", () => {
  // Columnas de importe que, si entraran en la familia, duplicarían el saldo del tercero.
  const noSonEdades = [
    "Valor Total", "Total cartera", "Total", "Saldo", "SALDO", "Importe", "Deuda", "Pagado",
    "Saldo vencido", "VALOR VENCIDO", "NIT", "Documento", "Fecha Vence", "DiasVc", "NumDias",
    "# DV", "Vencido", "Edades", "EDAD", "Plazo", "Venc.", "#Ter.", "",
  ];
  for (const texto of noSonEdades) {
    it(`«${texto}» no es un balde`, () => {
      expect(esRotuloEdad(texto)).toBeNull();
    });
  }

  it("un rango invertido no es un balde (no es antigüedad en días)", () => {
    expect(esRotuloEdad("2025 - 12")).toBeNull();
  });
});

describe("límites del rango", () => {
  it("cerrado: toma los dos extremos", () => {
    expect(esRotuloEdad("31 - 60 DIAS")).toEqual({ clase: "vencido", desde: 31, hasta: 60 });
    expect(esRotuloEdad("De 121 a 360")).toEqual({ clase: "vencido", desde: 121, hasta: 360 });
  });

  it("abierto: solo el inferior", () => {
    expect(esRotuloEdad("Más de 90")).toEqual({ clase: "vencido", desde: 90 });
    expect(esRotuloEdad("181+")).toEqual({ clase: "vencido", desde: 181 });
    expect(esRotuloEdad("De 361 o mas")).toEqual({ clase: "vencido", desde: 361 });
  });

  it("abierto con «días» EN MEDIO del rótulo", () => {
    // Si este no se reconoce, su importe sale del saldo y además la columna queda libre
    // para que otro rol se la lleve.
    expect(esRotuloEdad("241 DIAS O MAS")).toEqual({ clase: "vencido", desde: 241 });
    expect(esRotuloEdad("360 días en adelante")).toEqual({ clase: "vencido", desde: 360 });
  });

  it("SIIGO Escritorio numera los días vencidos en negativo", () => {
    expect(esRotuloEdad("<== 90-")).toEqual({ clase: "vencido", desde: 90 });
    expect(esRotuloEdad("DE 89- A 60-")).toEqual({ clase: "vencido", desde: 60, hasta: 89 });
    expect(esRotuloEdad("0 ==>")).toEqual({ clase: "corriente", desde: 0 });
  });

  it("el prefijo redundante del rótulo no estorba", () => {
    expect(esRotuloEdad("Vencido 1 a 30")).toEqual({ clase: "vencido", desde: 1, hasta: 30 });
  });
});

describe("ordenarRotulos", () => {
  it("corriente primero, luego por antigüedad, y lo excluido al final", () => {
    const items: { id: string; rotulo: RotuloEdad }[] = [
      { id: "181+", rotulo: { clase: "vencido", desde: 181 } },
      { id: "dudosa", rotulo: { clase: "excluir" } },
      { id: "1-30", rotulo: { clase: "vencido", desde: 1, hasta: 30 } },
      { id: "corriente", rotulo: { clase: "corriente", desde: 0 } },
      { id: "favor", rotulo: { clase: "saldo_favor" } },
    ];
    expect(ordenarRotulos(items).map((i) => i.id)).toEqual(["corriente", "favor", "1-30", "181+", "dudosa"]);
  });
});

describe("claseSuma", () => {
  it("todo suma al saldo del tercero salvo lo marcado para excluir", () => {
    expect(claseSuma("corriente")).toBe(true);
    expect(claseSuma("vencido")).toBe(true);
    expect(claseSuma("saldo_favor")).toBe(true);
    expect(claseSuma("excluir")).toBe(false);
  });
});
