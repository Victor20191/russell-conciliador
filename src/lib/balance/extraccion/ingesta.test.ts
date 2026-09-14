import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { construirVistaPrevia, detectarDelimitador, detectarFormato, extraerCeldasNegritaBiffXls, ingerir, leerCeldaFisicaArchivo, type GridHoja } from "./ingesta";

function buf(texto: string, encoding: BufferEncoding = "utf-8"): ArrayBuffer {
  const b = Buffer.from(texto, encoding);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

function libroXls(hojas: Record<string, (string | number)[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre);
  }
  return XLSX.write(wb, { type: "array", bookType: "biff8" }) as ArrayBuffer;
}

function libroXlsb(hojas: Record<string, (string | number | null)[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsb" }) as ArrayBuffer;
}

/** Libro .xlsb con celdas de fórmula: una con cache != 0 y otra con cache === 0 (falsy). */
function libroXlsbConFormulas(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {
    A1: { t: "s", v: "Código" },
    B1: { t: "s", v: "Nombre" },
    C1: { t: "s", v: "Saldo" },
    A2: { t: "s", v: "110505" }, // código texto: no debe convertirse a número
    B2: { t: "s", v: "Caja general" },
    C2: { t: "n", v: 555, f: "SUM(1,554)" }, // fórmula con valor cacheado != 0
    A3: { t: "s", v: "110510" },
    B3: { t: "s", v: "Caja menor" },
    C3: { t: "n", v: 0, f: "C2-555" }, // fórmula con valor cacheado === 0 (falsy)
    "!ref": "A1:C3",
  };
  XLSX.utils.book_append_sheet(wb, ws, "Balance");
  return XLSX.write(wb, { type: "array", bookType: "xlsb" }) as ArrayBuffer;
}

async function libroXlsxConMetadataTolerada(): Promise<ArrayBuffer> {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Tipo", "Referencia", "Valor total"],
    ["Mercancía", "A-1", 1234.5],
  ]), "Inventario");
  const base = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const zip = await JSZip.loadAsync(base);
  const ruta = "xl/worksheets/sheet1.xml";
  const hoja = await zip.file(ruta)?.async("string");
  if (!hoja) throw new Error("Hoja OOXML no encontrada");
  // Algunos ERP omiten el número de una fila. Excel/SheetJS lo reparan, pero
  // ExcelJS rechaza la metadata con «Invalid row number in model».
  zip.file(ruta, hoja.replace('r="1"', 'r=""'));
  const reparable = await zip.generateAsync({ type: "uint8array" });
  return reparable.buffer.slice(
    reparable.byteOffset,
    reparable.byteOffset + reparable.byteLength,
  ) as ArrayBuffer;
}

function fuentePredeterminadaNegritaXls(data: ArrayBuffer): ArrayBuffer {
  const cfb = XLSX.CFB.read(new Uint8Array(data), { type: "array" });
  const entrada = XLSX.CFB.find(cfb, "/Workbook") ?? XLSX.CFB.find(cfb, "/Book");
  const bytes = entrada?.content as Uint8Array | undefined;
  if (!bytes) throw new Error("Stream BIFF no encontrado");
  let encontrada = false;
  for (let offset = 0; offset + 4 <= bytes.length;) {
    const tipo = bytes[offset] | (bytes[offset + 1] << 8);
    const largo = bytes[offset + 2] | (bytes[offset + 3] << 8);
    const inicio = offset + 4;
    if (inicio + largo > bytes.length) break;
    if (tipo === 0x0031 && largo >= 8) {
      // `bls` de la fuente: 700 = negrita. No cambia el tamaño del CFB.
      bytes[inicio + 6] = 0xbc;
      bytes[inicio + 7] = 0x02;
      encontrada = true;
      break;
    }
    offset = inicio + largo;
  }
  if (!encontrada) throw new Error("Registro Font BIFF no encontrado");
  return XLSX.CFB.write(cfb, { type: "array" }) as ArrayBuffer;
}

function registroBiff(tipo: number, datos: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + datos.length);
  out[0] = tipo & 0xff;
  out[1] = tipo >>> 8;
  out[2] = datos.length & 0xff;
  out[3] = datos.length >>> 8;
  out.set(datos, 4);
  return out;
}

function concatenar(...partes: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(partes.reduce((total, parte) => total + parte.length, 0));
  let offset = 0;
  for (const parte of partes) {
    out.set(parte, offset);
    offset += parte.length;
  }
  return out;
}

describe("detectarFormato", () => {
  it("distingue txt de csv por extensión", () => {
    expect(detectarFormato("balanza.txt", buf("a\tb"))).toBe("txt");
    expect(detectarFormato("balanza.TXT", buf("a\tb"))).toBe("txt");
    expect(detectarFormato("balanza.csv", buf("a,b"))).toBe("csv");
  });

  it("detecta .xls por extensión y por su firma binaria CFB", () => {
    const data = libroXls({ Balance: [["Código", "Cuenta"], ["110505", "Caja"]] });
    expect(detectarFormato("balanza.XLS", data)).toBe("xls");
    expect(detectarFormato("balanza_sin_extension", data)).toBe("xls");
  });
});

describe("ingerir Excel moderno (.xlsx)", () => {
  it("conserva textos, negrita y coordenadas cuando las hojas preceden a sus metadatos", async () => {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Balance");
    hoja.getCell("A3").value = "Cuenta";
    hoja.getCell("A3").font = { bold: true };
    hoja.getCell("B3").value = { richText: [{ text: "Descripción " }, { text: "& nombre" }] };
    hoja.getCell("A5").value = "001105";
    hoja.getCell("B5").value = "Caja <principal>";
    hoja.getCell("C5").value = { formula: "1-1", result: 0 };
    libro.addWorksheet("Otra hoja").getCell("A1").value = "Segundo informe";
    const zip = await JSZip.loadAsync(await libro.xlsx.writeBuffer());
    const entradas = Object.keys(zip.files).filter((nombre) => !zip.files[nombre].dir);
    const reordenado = new JSZip();
    for (const nombre of [
      ...entradas.filter((nombre) => /^xl\/worksheets\/sheet\d+\.xml$/.test(nombre)),
      ...entradas.filter((nombre) => !/^xl\/worksheets\/sheet\d+\.xml$/.test(nombre)),
    ]) reordenado.file(nombre, await zip.files[nombre].async("uint8array"), { createFolders: false });
    const bytes = await reordenado.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
    for (let intento = 0; intento < 3; intento++) {
      const leido = await ingerir(bytes, "balance.xlsx");
      expect(leido.modo).toBe("tabular");
      if (leido.modo !== "tabular") throw new Error("Se esperaba una tabla");
      expect(leido.hojas[0].filas[0].slice(0, 2)).toEqual(["Cuenta", "Descripción & nombre"]);
      expect(leido.hojas[0].filas[1]).toEqual(["001105", "Caja <principal>", 0]);
      expect(leido.hojas[0].filasFisicas).toEqual([3, 5]);
      expect(leido.hojas[0].negrita?.[0][0]).toBe(true);
      expect(leido.hojas[1].filas).toEqual([["Segundo informe"]]);
    }
    expect((await leerCeldaFisicaArchivo(bytes, "balance.xlsx", "Balance", 5, 3)).valor).toBe(0);
  });

  it("usa el lector alterno cuando la metadata del ERP es reparable", async () => {
    const ingesta = await ingerir(await libroXlsxConMetadataTolerada(), "inventario.xlsx");
    expect(ingesta.modo).toBe("tabular");
    if (ingesta.modo !== "tabular") return;
    expect(ingesta.hojas[0]).toMatchObject({
      nombre: "Inventario",
      filas: [
        ["Tipo", "Referencia", "Valor total"],
        ["Mercancía", "A-1", 1234.5],
      ],
    });
  });
});

describe("leerCeldaFisicaArchivo", () => {
  it("resuelve M1347 por su fila física en XLSX/XLSM aunque haya 1345 filas vacías previas", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Inventario");
    ws.getCell("A1").value = "Encabezado";
    ws.getCell("M1347").value = 1_200_978_578.51;
    const data = await wb.xlsx.writeBuffer() as ArrayBuffer;

    await expect(leerCeldaFisicaArchivo(data, "inventario.xlsx", "Inventario", 1347, 13)).resolves.toEqual({
      hojaExiste: true,
      filaExiste: true,
      valor: 1_200_978_578.51,
    });
    await expect(leerCeldaFisicaArchivo(data, "inventario.xlsm", "Inventario", 1347, 13)).resolves.toEqual({
      hojaExiste: true,
      filaExiste: true,
      valor: 1_200_978_578.51,
    });

    // La ruta contable sigue compactando los huecos; esta corrección no altera su grilla.
    const compacta = await ingerir(data, "inventario.xlsx");
    expect(compacta.modo).toBe("tabular");
    if (compacta.modo === "tabular") {
      expect(compacta.hojas[0].filas).toHaveLength(2);
      expect(compacta.hojas[0].filasFisicas).toEqual([1, 1347]);
      expect(compacta.hojas[0].filas[1][12]).toBe(1_200_978_578.51);
    }
  });

  it("usa la dirección física en XLS y conserva registros vacíos al consultar CSV", async () => {
    const xls = libroXls({ Balance: [["Encabezado"], [], [], ["", 77]] });
    await expect(leerCeldaFisicaArchivo(xls, "balance.xls", "Balance", 4, 2)).resolves.toEqual({
      hojaExiste: true,
      filaExiste: true,
      valor: 77,
    });

    const csv = buf("A,B\n\n,\nX,99");
    await expect(leerCeldaFisicaArchivo(csv, "datos.csv", "csv", 4, 2)).resolves.toEqual({
      hojaExiste: true,
      filaExiste: true,
      valor: 99,
    });

    const xlsCompacto = await ingerir(xls, "balance.xls");
    expect(xlsCompacto.modo).toBe("tabular");
    if (xlsCompacto.modo === "tabular") expect(xlsCompacto.hojas[0].filasFisicas).toEqual([1, 4]);
    const csvCompacto = await ingerir(csv, "datos.csv");
    expect(csvCompacto.modo).toBe("tabular");
    if (csvCompacto.modo === "tabular") expect(csvCompacto.hojas[0].filasFisicas).toEqual([1, 4]);
  });
});

describe("ingerir Excel moderno (.xlsx) — celdas con fórmula", () => {
  it("nunca deriva un monto del TEXTO de la fórmula: sin resultado cacheado → celda vacía", async () => {
    // Regresión: exceljs (streaming) omite `result` cuando el valor cacheado es 0; antes la
    // celda llegaba como `{"formula":"P2427*Q2427"}` y el parser numérico extraía «2427».
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Hoja1");
    ws.getCell("A1").value = "Referencia";
    ws.getCell("B1").value = "Valor total";
    ws.getCell("A2427").value = "1879";
    ws.getCell("B2427").value = { formula: "P2427*Q2427", result: 0 };
    ws.getCell("A2428").value = "1880";
    ws.getCell("B2428").value = { formula: "P2428*Q2428", result: 5 };
    ws.getCell("A2429").value = "1881";
    ws.getCell("B2429").value = { formula: "P2429*Q2429" };
    const buf = await wb.xlsx.writeBuffer();
    const ingesta = await ingerir(buf as ArrayBuffer, "inventario.xlsx");
    expect(ingesta.modo).toBe("tabular");
    if (ingesta.modo !== "tabular") return;
    const filas = ingesta.hojas[0].filas;
    // exceljs conserva o pierde el `result: 0` según cómo caiga el chunk del parser XML:
    // ambos desenlaces (0 o vacío) son «sin monto»; lo prohibido es un número inventado.
    expect(filas[1][0]).toBe("1879");
    expect([null, 0]).toContain(filas[1][1]);
    expect(filas[2]).toEqual(["1880", 5]);
    expect(filas[3]).toEqual(["1881", null]);
    expect(ingesta.hojas[0].filasFisicas).toEqual([1, 2427, 2428, 2429]);
    for (const f of filas) for (const c of f) expect(typeof c === "string" && c.includes("formula")).toBe(false);
  });
});

describe("ingerir Excel 97-2003 (.xls)", () => {
  it("lee todas las hojas, conserva textos y números y descarta filas vacías", async () => {
    const data = libroXls({
      Balance: [
        ["Código", "Cuenta", "Saldo"],
        ["00110505", "Caja", 1234.56],
        ["", "", ""],
      ],
      Notas: [["Observación"], ["Cierre mensual"]],
    });

    const ingesta = await ingerir(data, "balance.xls");
    expect(ingesta.modo).toBe("tabular");
    if (ingesta.modo !== "tabular") return;
    expect(ingesta.hojas.map((hoja) => hoja.nombre)).toEqual(["Balance", "Notas"]);
    expect(ingesta.hojas[0].filas).toEqual([
      ["Código", "Cuenta", "Saldo"],
      ["00110505", "Caja", 1234.56],
    ]);
  });

  it("conserva la negrita BIFF del .xls y la alinea después de quitar filas vacías", async () => {
    const data = fuentePredeterminadaNegritaXls(libroXls({
      Balance: [
        ["Código", "Cuenta"],
        ["", ""],
        ["11050501", "CUENTA CONSOLIDADA"],
        ["900123456", "TERCERO"],
      ],
    }));

    const ingesta = await ingerir(data, "balance.xls");
    expect(ingesta.modo).toBe("tabular");
    if (ingesta.modo !== "tabular") return;
    expect(ingesta.hojas[0].filas).toHaveLength(3);
    expect(ingesta.hojas[0].negrita).toEqual([
      [true, true],
      [true, true],
      [true, true],
    ]);
  });

  it("respeta el índice de fuente 4 reservado por BIFF", () => {
    const font = (peso: number) => {
      const datos = new Uint8Array(16);
      datos[6] = peso & 0xff;
      datos[7] = peso >>> 8;
      return registroBiff(0x0031, datos);
    };
    const xf = (fuente: number) => {
      const datos = new Uint8Array(20);
      datos[0] = fuente & 0xff;
      datos[1] = fuente >>> 8;
      return registroBiff(0x00e0, datos);
    };
    const bofHoja = new Uint8Array([0x00, 0x06, 0x10, 0x00]);
    const celda = (fila: number, columna: number, indiceXf: number) => {
      const datos = new Uint8Array(14);
      datos[0] = fila & 0xff;
      datos[1] = fila >>> 8;
      datos[2] = columna & 0xff;
      datos[3] = columna >>> 8;
      datos[4] = indiceXf & 0xff;
      datos[5] = indiceXf >>> 8;
      return registroBiff(0x0203, datos);
    };
    const workbook = concatenar(
      font(400), font(400), font(400), font(400), font(700), // última = índice 5
      xf(0), xf(5),
      registroBiff(0x0809, bofHoja),
      celda(0, 0, 0),
      celda(1, 0, 1),
      registroBiff(0x000a, new Uint8Array()),
    );

    const negrita = extraerCeldasNegritaBiffXls(workbook);
    expect(negrita[0]?.get(0)?.has(0) ?? false).toBe(false);
    expect(negrita[0]?.get(1)?.has(0)).toBe(true);
  });

  it("rechaza un .xls ilegible con un mensaje claro", async () => {
    const cfbTruncado = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).buffer;
    await expect(ingerir(cfbTruncado, "balance.xls")).rejects.toThrow(/Excel 97-2003 válido/i);
  });

});

describe("ingerir Excel binario (.xlsb)", () => {
  it("lee un libro .xlsb con varias hojas, saltando filas vacías y conservando la fila física", async () => {
    const data = libroXlsb({
      Balance: [
        ["Código", "Cuenta"],
        ["1105", "Caja"],
        [null, null],
        ["1110", "Bancos"],
      ],
      Retenciones: [["Concepto", "Valor"], ["Rete IVA", 1000]],
    });
    const ingesta = await ingerir(data, "balance.xlsb");
    expect(ingesta.modo).toBe("tabular");
    if (ingesta.modo !== "tabular") return;
    expect(ingesta.hojas).toHaveLength(2);

    const [balance, retenciones] = ingesta.hojas;
    expect(balance.nombre).toBe("Balance");
    // La fila vacía (física #4) se omite de la grilla compacta, pero las
    // filas físicas de las que sí traen datos se conservan (1, 2 y 4→ la de "Bancos" es la física #4).
    expect(balance.filas).toEqual([
      ["Código", "Cuenta"],
      ["1105", "Caja"],
      ["1110", "Bancos"],
    ]);
    expect(balance.filasFisicas).toEqual([1, 2, 4]);

    expect(retenciones.nombre).toBe("Retenciones");
    expect(retenciones.filas).toEqual([["Concepto", "Valor"], ["Rete IVA", 1000]]);
  });

  it("conserva el valor cacheado de una fórmula .xlsb aunque sea 0 (falsy) y no interpreta códigos texto como número", async () => {
    const ingesta = await ingerir(libroXlsbConFormulas(), "balance.xlsb");
    expect(ingesta.modo).toBe("tabular");
    if (ingesta.modo !== "tabular") return;
    const [hoja] = ingesta.hojas;
    expect(hoja.filas).toEqual([
      ["Código", "Nombre", "Saldo"],
      ["110505", "Caja general", 555],
      ["110510", "Caja menor", 0],
    ]);
    // Los códigos de cuenta son texto, no números (aunque parezcan numéricos).
    expect(typeof hoja.filas[1][0]).toBe("string");
  });

  it("no trunca en 65.536 filas como sí ocurre en .xls (BIFF8)", async () => {
    // El escritor .xlsb de SheetJS recorre todo el rango declarado en `!ref`
    // (ocupado o no): usar un rango disperso —solo encabezado y última fila
    // pobladas— mantiene la prueba honesta sin pagar el costo de poblar 65.540
    // filas reales; lo que se verifica es que la ÚLTIMA fila (más allá del
    // tope BIFF8 de 65.536) sobrevive a la lectura, y que NO se fija ningún
    // `sheetRows` como sí ocurre en el lector de .xls.
    const ULTIMA_FILA = 65_540;
    const wb = XLSX.utils.book_new();
    const ws: XLSX.WorkSheet = {
      A1: { t: "s", v: "Código" },
      B1: { t: "s", v: "Valor" },
      [`A${ULTIMA_FILA}`]: { t: "s", v: "C-ULTIMA" },
      [`B${ULTIMA_FILA}`]: { t: "n", v: 999 },
      "!ref": `A1:B${ULTIMA_FILA}`,
    };
    XLSX.utils.book_append_sheet(wb, ws, "Balance");
    const data = XLSX.write(wb, { type: "array", bookType: "xlsb" }) as ArrayBuffer;

    const ingesta = await ingerir(data, "balance.xlsb");
    expect(ingesta.modo).toBe("tabular");
    if (ingesta.modo !== "tabular") return;
    const hoja = ingesta.hojas[0];
    expect(hoja.filas).toEqual([
      ["Código", "Valor"],
      ["C-ULTIMA", 999],
    ]);
    // La fila física de la última fila conserva su número real (65.540), no un
    // índice recortado a 65.536.
    expect(hoja.filasFisicas).toEqual([1, ULTIMA_FILA]);
  }, 60_000);

  it("rechaza un .xlsb ilegible con un mensaje claro", async () => {
    const zipTruncado = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0]).buffer;
    await expect(ingerir(zipTruncado, "balance.xlsb")).rejects.toThrow(/\.xlsb.*válido/i);
  });

  it("rechaza texto plano disfrazado de .xlsb en vez de leerlo como una hoja inventada", async () => {
    // SheetJS es tolerante: si `XLSX.read` no reconoce ninguna firma de libro
    // cae a un parser de texto plano y devuelve un "Sheet1" de una columna con
    // el contenido partido por líneas, SIN lanzar. Sin la validación previa del
    // contenedor ZIP (xl/workbook.bin), este CSV renombrado a .xlsb se colaría
    // como un balance de una sola cuenta inventada en vez de fallar.
    await expect(
      ingerir(buf("codigo,cuenta,saldo\n1105,Caja,1000\n"), "balance.xlsb"),
    ).rejects.toThrow(/\.xlsb.*válido/i);
  });

  it("rechaza un .zip válido sin xl/workbook.bin (p. ej. un .xlsx renombrado a .xlsb)", async () => {
    const zip = new JSZip();
    zip.file("hola.txt", "esto es un zip cualquiera, no un libro BIFF12");
    const data = await zip.generateAsync({ type: "arraybuffer" });
    await expect(ingerir(data, "balance.xlsb")).rejects.toThrow(/\.xlsb.*válido/i);
  });

  it("leerCeldaFisicaArchivo resuelve una coordenada de un .xlsb", async () => {
    const data = libroXlsb({
      Balance: [
        ["Código", "Cuenta"],
        ["1105", "Caja"],
        [null, null],
        ["1110", "Bancos"],
      ],
    });
    const celda = await leerCeldaFisicaArchivo(data, "balance.xlsb", "Balance", 4, 2);
    expect(celda).toEqual({ hojaExiste: true, filaExiste: true, valor: "Bancos" });
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

  it("csv: una comilla a MITAD de celda (pulgadas) es literal y no se traga el resto del archivo", async () => {
    const t = [
      "Tipo;Referencia;Descripción;Cantidad;Vr total",
      'Mercancía;MNF-51;Válvula de bola 1/2" bronce;480;11256000',
      'Mercancía;MNF-54;Filtro sedimentos 10";260;9074000',
      "Total Mercancía;;;;20330000",
    ].join("\n");
    const ing = await ingerir(buf(t), "inventario.csv");
    expect(ing.modo).toBe("tabular");
    if (ing.modo !== "tabular") return;
    expect(ing.hojas[0].filas).toHaveLength(4);
    expect(ing.hojas[0].filas[1]).toEqual(["Mercancía", "MNF-51", 'Válvula de bola 1/2" bronce', 480, 11256000]);
    expect(ing.hojas[0].filas[2]).toEqual(["Mercancía", "MNF-54", 'Filtro sedimentos 10"', 260, 9074000]);
    expect(ing.hojas[0].filas[3]).toEqual(["Total Mercancía", null, null, null, 20330000]);
  });

  it("csv: campos entrecomillados legítimos (delimitador y comilla escapada dentro) siguen funcionando", async () => {
    const t = 'CUENTA;NOMBRE;SALDO\n1105;"CAJA; GENERAL ""PPAL""";1000\n1110;BANCOS;2000';
    const ing = await ingerir(buf(t), "balanza.csv");
    if (ing.modo !== "tabular") throw new Error("esperaba tabular");
    expect(ing.hojas[0].filas[1]).toEqual([1105, 'CAJA; GENERAL "PPAL"', 1000]);
    expect(ing.hojas[0].filas[2]).toEqual([1110, "BANCOS", 2000]);
  });

  it("csv: una comilla huérfana al INICIO de celda no pierde las filas siguientes", async () => {
    const t = 'CUENTA;NOMBRE;SALDO\n1105;"CAJA SIN CIERRE;1000\n1110;BANCOS;2000';
    const ing = await ingerir(buf(t), "balanza.csv");
    if (ing.modo !== "tabular") throw new Error("esperaba tabular");
    expect(ing.hojas[0].filas).toHaveLength(3);
    expect(ing.hojas[0].filas[1]).toEqual([1105, '"CAJA SIN CIERRE', 1000]);
    expect(ing.hojas[0].filas[2]).toEqual([1110, "BANCOS", 2000]);
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
