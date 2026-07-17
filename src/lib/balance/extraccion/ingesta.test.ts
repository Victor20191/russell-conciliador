import { describe, it, expect } from "vitest";
import { construirVistaPrevia, detectarDelimitador, detectarFormato, ingerir, type GridHoja } from "./ingesta";

function buf(texto: string, encoding: BufferEncoding = "utf-8"): ArrayBuffer {
  const b = Buffer.from(texto, encoding);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe("detectarFormato", () => {
  it("distingue txt de csv por extensión", () => {
    expect(detectarFormato("balanza.txt", buf("a\tb"))).toBe("txt");
    expect(detectarFormato("balanza.TXT", buf("a\tb"))).toBe("txt");
    expect(detectarFormato("balanza.csv", buf("a,b"))).toBe("csv");
  });
});

describe("detectarDelimitador", () => {
  it("detecta tabulador", () => {
    const t = "CUENTA\tNOMBRE\tSALDO\n1105\tCAJA\t1.000,50\n1110\tBANCOS\t2.000,00";
    expect(detectarDelimitador(t)).toBe("\t");
  });

  it("detecta pipe", () => {
    const t = "CUENTA|NOMBRE|SALDO\n1105|CAJA|1000\n1110|BANCOS|2000";
    expect(detectarDelimitador(t)).toBe("|");
  });

  it("prefiere punto y coma sobre la coma decimal", () => {
    // CSV es-CO: separador «;» y decimales con coma — la coma NO debe ganar.
    const t = "CUENTA;NOMBRE;SALDO\n1105;CAJA;1.234,56\n1110;BANCOS;7.890,12";
    expect(detectarDelimitador(t)).toBe(";");
  });

  it("detecta coma cuando es el único separador", () => {
    const t = "CUENTA,NOMBRE,SALDO\n1105,CAJA,1000.50\n1110,BANCOS,2000";
    expect(detectarDelimitador(t)).toBe(",");
  });

  it("ignora delimitadores dentro de comillas", () => {
    const t = "CUENTA,NOMBRE\n1105,\"PEREZ; JUAN\"\n1110,\"GOMEZ; ANA\"";
    expect(detectarDelimitador(t)).toBe(",");
  });

  it("devuelve null en texto de ancho fijo (sin delimitador)", () => {
    const t = "1105      CAJA GENERAL        1000\n1110      BANCOS NACIONALES   2000";
    expect(detectarDelimitador(t)).toBeNull();
  });

  it("devuelve null en texto vacío", () => {
    expect(detectarDelimitador("")).toBeNull();
    expect(detectarDelimitador("\n\n")).toBeNull();
  });

  it("exige el delimitador en más de la mitad de las líneas", () => {
    // Una sola línea con «;» entre muchas sin él: no es el delimitador.
    const t = "ENCABEZADO LIBRE; EMPRESA XYZ\n1105 CAJA 1000\n1110 BANCOS 2000\n1120 INVERSIONES 3000";
    expect(detectarDelimitador(t)).toBeNull();
  });
});

describe("ingerir texto plano (.txt)", () => {
  it("txt delimitado por tabulador → tabular con números parseados", async () => {
    const t = "CUENTA\tNOMBRE\tSALDO\n1105\tCAJA\t1.234,56";
    const ing = await ingerir(buf(t), "balanza.txt");
    expect(ing.modo).toBe("tabular");
    if (ing.modo !== "tabular") return;
    expect(ing.hojas).toHaveLength(1);
    // Mismo nombre de hoja que CSV: la huella de perfiles guardados lo incluye.
    expect(ing.hojas[0].nombre).toBe("csv");
    expect(ing.hojas[0].filas).toEqual([
      ["CUENTA", "NOMBRE", "SALDO"],
      [1105, "CAJA", 1234.56],
    ]);
  });

  it("txt delimitado por punto y coma → tabular", async () => {
    const t = "CUENTA;NOMBRE;SALDO\n1105;CAJA;1000";
    const ing = await ingerir(buf(t), "balanza.txt");
    expect(ing.modo).toBe("tabular");
    if (ing.modo !== "tabular") return;
    expect(ing.hojas[0].filas[1]).toEqual([1105, "CAJA", 1000]);
  });

  it("txt de ancho fijo (sin delimitador) → documento de texto para la IA", async () => {
    const t = "1105      CAJA GENERAL        1000\n1110      BANCOS NACIONALES   2000";
    const ing = await ingerir(buf(t), "balanza.txt");
    expect(ing.modo).toBe("documento");
    if (ing.modo !== "documento") return;
    expect(ing.documento).toEqual({ tipo: "texto", texto: t });
  });

  it("decodifica latin1 (exportes windows-1252 de ERP)", async () => {
    const t = "CUENTA\tNOMBRE\n1105\tCAJA PEQUEÑA";
    const ing = await ingerir(buf(t, "latin1"), "balanza.txt");
    expect(ing.modo).toBe("tabular");
    if (ing.modo !== "tabular") return;
    expect(ing.hojas[0].filas[1]).toEqual([1105, "CAJA PEQUEÑA"]);
  });
});

describe("ingerir CSV (compatibilidad y delimitador detectado)", () => {
  it("csv por comas se mantiene igual", async () => {
    const t = "CUENTA,NOMBRE,SALDO\n1105,CAJA,1000.50";
    const ing = await ingerir(buf(t), "balance.csv");
    expect(ing.modo).toBe("tabular");
    if (ing.modo !== "tabular") return;
    expect(ing.hojas[0].nombre).toBe("csv");
    expect(ing.hojas[0].filas[1]).toEqual([1105, "CAJA", 1000.5]);
  });

  it("csv es-CO con «;» y decimales con coma ahora separa bien", async () => {
    const t = "CUENTA;NOMBRE;SALDO\n1105;CAJA;1.234,56";
    const ing = await ingerir(buf(t), "balance.csv");
    expect(ing.modo).toBe("tabular");
    if (ing.modo !== "tabular") return;
    expect(ing.hojas[0].filas[1]).toEqual([1105, "CAJA", 1234.56]);
  });

  it("csv sin delimitador detectable cae a coma (una columna)", async () => {
    const t = "ENCABEZADO\n1105 CAJA\n1110 BANCOS";
    const ing = await ingerir(buf(t), "balance.csv");
    expect(ing.modo).toBe("tabular");
    if (ing.modo !== "tabular") return;
    expect(ing.hojas[0].filas.map((f) => f.length)).toEqual([1, 1, 1]);
  });
});

describe("construirVistaPrevia", () => {
  const fila = (codigo: string, nombre: string, saldo: number) => [codigo, nombre, saldo];

  it("marca con * solo las filas en negrita (celdas con datos)", () => {
    const hoja: GridHoja = {
      nombre: "Balance",
      filas: [fila("1105", "CAJA", 100), fila("110505", "CAJA GENERAL", 100)],
      negrita: [
        [true, true, false],
        [false, false, false],
      ],
    };
    const vista = construirVistaPrevia([hoja]);
    expect(vista).toContain("F1*: ");
    expect(vista).toContain("F2: ");
    expect(vista).not.toContain("F2*:");
  });

  it("negrita en celda vacía no marca la fila", () => {
    const hoja: GridHoja = {
      nombre: "B",
      filas: [["1105", null, 100]],
      negrita: [[false, true, false]],
    };
    expect(construirVistaPrevia([hoja])).toContain("F1: ");
  });

  it("sin metadato de negrita (CSV) no marca nada", () => {
    const hoja: GridHoja = { nombre: "csv", filas: [fila("1105", "CAJA", 100)] };
    const vista = construirVistaPrevia([hoja]);
    expect(vista).toContain("F1: ");
    expect(vista).not.toContain("*:");
  });

  it("hoja larga: muestra la cola con índices 1-based REALES", () => {
    const filas = Array.from({ length: 100 }, (_, i) => fila(`11${String(i).padStart(4, "0")}`, `CUENTA ${i + 1}`, i));
    filas[99] = ["", "TOTAL GENERAL", 999];
    const vista = construirVistaPrevia([{ nombre: "B", filas }], 60, 25);
    expect(vista).toContain("F50: "); // cabeza = 60 − 10
    expect(vista).not.toContain("F51: "); // primera fila omitida
    expect(vista).toContain("(40 filas intermedias omitidas)");
    expect(vista).toContain("F91: "); // inicio de la cola (100 − 10 + 1)
    expect(vista).toContain("F100: "); // la fila TOTALES del final, con su índice real
    expect(vista).toContain("TOTAL GENERAL");
  });

  it("hoja corta: sin cola ni omisiones", () => {
    const filas = Array.from({ length: 5 }, (_, i) => fila(`110${i}`, `C${i}`, i));
    const vista = construirVistaPrevia([{ nombre: "B", filas }]);
    expect(vista).not.toContain("omitidas");
    expect(vista).toContain("F5: ");
  });

  it("amplía las columnas hasta la última con datos (tope 40)", () => {
    const ancha: (string | number | null)[] = Array(45).fill(null);
    ancha[0] = "1105";
    ancha[29] = 500; // dato en la columna 30
    ancha[44] = 900; // dato en la columna 45 (más allá del tope 40)
    const vista = construirVistaPrevia([{ nombre: "B", filas: [ancha] }]);
    expect(vista).toContain("C30=«500»");
    expect(vista).not.toContain("C41=");
    expect(vista).not.toContain("C45=");
  });

  it("respeta el mínimo de 25 columnas aunque la hoja sea angosta", () => {
    const vista = construirVistaPrevia([{ nombre: "B", filas: [["1105", "CAJA", 100]] }]);
    expect(vista).toContain("C3=«100»");
    expect(vista).not.toContain("C26=");
  });
});
