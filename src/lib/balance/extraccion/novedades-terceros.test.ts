import { describe, expect, it } from "vitest";
import { transformarTabular, resolverColumnaNombreTercero } from "./transformar";
import type { MappingSpec } from "./esquema";
import type { GridHoja } from "./ingesta";
import { derivarStagingTercero, filasEfectivasTercero } from "../staging-tercero";

const params = { nit: null, periodoInicial: null, periodoFinal: null, estandar: "AUTO" as const };
const spec = (over: Partial<MappingSpec> = {}): MappingSpec => ({
  hoja: "Balance", filaEncabezado: 1, primeraFilaDatos: 2,
  columnas: { codigo: 1, codigoFragmentos: [], nombre: 2, tercero: 3, nombreTercero: 4, saldoInicial: 6, debitos: 7, creditos: 8, saldoFinal: 9, saldoFinalDebito: 0, saldoFinalCredito: 0 },
  signoCredito: "firmado", reglaDetalle: { tipo: "prefijo", columna: null, valor: null }, agregarPorTercero: false,
  prefijoDocumentoTercero: null, subtotalesTercero: "auto", importable: true, motivoNoImportable: null,
  nit: { valor: null, fuente: "NINGUNO" }, periodoInicial: { valor: null, fuente: "NINGUNO" }, periodoFinal: { valor: null, fuente: "NINGUNO" },
  estandar: "AUTO", excepciones: [], confianza: 1, notas: "", ...over,
});
const encabezado = ["Cuenta", "Descripción", "Identificación", "Tercero", "Centro Costo", "Saldo inicial", "Débito", "Crédito", "Saldo final"];
const transformar = (filas: GridHoja["filas"], over: Partial<MappingSpec> = {}) => transformarTabular(spec(over), [{ nombre: "Balance", filas }], params);

describe("identidad de tercero en columnas separadas", () => {
  it.each(["Nombre NIT", "Nombre tercero", "Tercero"])("recupera %s sin confundirlo con el nombre de cuenta", (nombre) => {
    const s = spec({ columnas: { ...spec().columnas, nombreTercero: 0 } });
    const hoja = { nombre: "Balance", filas: [[...encabezado.slice(0, 3), nombre, ...encabezado.slice(4)]] };
    expect(resolverColumnaNombreTercero(s, hoja).nombreTercero).toBe(4);
  });

  it("infiere la columna adyacente sin rótulo solo con pares documento/nombre consistentes", () => {
    const s = spec({ columnas: { ...spec().columnas, nombreTercero: 0 } });
    const hoja = { nombre: "Balance", filas: [
      ["Cuenta", "Nombre", "Tercero", "", "Centro Costo", "SI", "D", "C", "SF"],
      ["130505", "Clientes", "", "", "", 0, 60, 0, 60],
      ["", "", "900111111", "CLIENTE UNO", "", 0, 10, 0, 10],
      ["", "", "900222222", "CLIENTE DOS", "", 0, 20, 0, 20],
      ["", "", "900333333", "CLIENTE TRES", "", 0, 30, 0, 30],
    ] };
    expect(resolverColumnaNombreTercero(s, hoja).nombreTercero).toBe(4);
    const ambiguo = { ...hoja, filas: hoja.filas.map((f, i) => i === 0 ? [...f.slice(0, 3), "Sucursal", ...f.slice(4)] : f) };
    expect(resolverColumnaNombreTercero(s, ambiguo).nombreTercero ?? 0).toBe(0);
    const movimientos = { ...hoja, filas: hoja.filas.map((f, i) => i > 1 ? ["130505", "Clientes", ...f.slice(2)] : f) };
    expect(resolverColumnaNombreTercero(s, movimientos).nombreTercero ?? 0).toBe(0);
  });
});

describe("terceros con cuenta heredada (CIB)", () => {
  it("captura el detalle con A/B vacías sin duplicar el consolidado", () => {
    const r = transformar([encabezado,
      ["13050505", "Libros", "", "", "", 100, 20, 0, 120],
      ["", "", "170517", "DC LEARNING", "", 100, 0, 0, 100],
      encabezado,
      ["", "", "8026530", "CLIENTE DOS", "", 0, 20, 0, 20],
    ]);
    expect(r.importReady).toHaveLength(1);
    expect(r.importReady[0]).toMatchObject({ code: "13050505", prevBalance: 100, debitos: 20, creditos: 0, balance: 120 });
    expect(r.filasTercero?.map(t => [t.codigo, t.nitTercero, t.nombreTercero, t.saldoFinal])).toEqual([
      ["13050505", "170517", "DC LEARNING", 100], ["13050505", "8026530", "CLIENTE DOS", 20],
    ]);
  });
  it("rechaza un importe inválido del detalle heredado y deja una excepción", () => {
    const r = transformar([encabezado,
      ["13050505", "Libros", "", "", "", 0, 100, 0, 100],
      ["", "", "170517", "DC LEARNING", "", 0, "valor inválido", 0, 100],
    ]);
    expect(r.filasTercero ?? []).toHaveLength(0);
    expect(r.excepciones.some(e => e.regla === "Monto no numérico")).toBe(true);
    expect(r.importReady[0].balance).toBe(100);
  });
  it.each(["TOTAL", "Encabezado de otra sección"])("no hereda la cuenta a través de %s", (rotulo) => {
    const r = transformar([encabezado,
      ["13050505", "Libros", "", "", "", 0, 100, 0, 100],
      [rotulo, "", "", "", "", 0, 100, 0, 100],
      ["", "", "170517", "TERCERO HUÉRFANO", "", 0, 100, 0, 100],
    ]);
    expect(r.filasTercero ?? []).toHaveLength(0);
  });
});

describe("cuenta, tercero y centro de costo (Corpo Mujer)", () => {
  it("conserva el tercero con nombre y documento vacío y cuenta una sola vez", () => {
    const r = transformar([encabezado,
      ["240400", "Renta", "", "", "", 0, 0, 6937000, -6937000],
      ["240400", "Renta", "", "CONTABILIZACION IMPUESTO DE RENTA", "", 0, 0, 6937000, -6937000],
      ["240400", "Renta", "", "CONTABILIZACION IMPUESTO DE RENTA", "ADMIN", 0, 0, 6937000, -6937000],
    ], { subtotalesTercero: "total_mas_detalle" });
    expect(r.importReady[0]).toMatchObject({ code: "240400", creditos: 6937000, balance: -6937000 });
    expect(r.filasTercero).toHaveLength(1);
    expect(r.filasTercero?.[0]).toMatchObject({ nitTercero: null, nombreTercero: "CONTABILIZACION IMPUESTO DE RENTA", saldoFinal: -6937000 });
  });

  it.each(["auto", "total_mas_detalle"] as const)("%s conserva el total y avisa si los centros difieren", (modo) => {
    const r = transformar([encabezado,
      ["51651506", "Licencias", "", "", "", 0, 1812275.96, 0, 1812275.96],
      ["51651506", "Licencias", "900111111", "ODOO", "", 0, 1812275.96, 0, 1812275.96],
      ["51651506", "Licencias", "900111111", "ODOO", "A", 0, 1000000, 0, 1000000],
      ["51651506", "Licencias", "900111111", "ODOO", "B", 0, 812155.14, 0, 812155.14],
      // Auto necesita un patrón dominante; un centro vacío aislado no prueba un total.
      ...Array.from({ length: 22 }, (_, i) => [
        [String(11050100 + i), "Cuenta", "900111111", "Tercero", "", 0, 10, 0, 10],
        [String(11050100 + i), "Cuenta", "900111111", "Tercero", "CENTRO", 0, 10, 0, 10],
      ]).flat(),
    ], { subtotalesTercero: modo });
    expect(r.filasTercero?.filter(t => t.codigo === "51651506")).toHaveLength(1);
    expect(r.filasTercero?.[0].saldoFinal).toBe(1812275.96);
    expect(r.excepciones.some(e => e.regla === "Desglose por centro de costo no coincide con el total del tercero")).toBe(true);
    expect(r.importReady[0].balance).toBe(1812275.96);
  });

  it("en auto conserva movimientos sin centro asignado cuando no hay evidencia de totales", () => {
    const r = transformar([encabezado,
      ["51651506", "Licencias", "900111111", "ODOO", "", 0, 100, 0, 100],
      ["51651506", "Licencias", "900111111", "ODOO", "A", 0, 200, 0, 200],
      ["51651506", "Licencias", "900111111", "ODOO", "B", 0, 300, 0, 300],
    ]);
    expect(r.filasTercero).toHaveLength(3);
    expect(r.importReady[0].balance).toBe(600);
  });

  it("conserva bloques separados del mismo tercero y funciona sin columna de documento", () => {
    const r = transformar([encabezado,
      ["51651506", "Licencias", "", "ODOO", "", 0, 100, 0, 100],
      ["51651506", "Licencias", "", "ODOO", "A", 0, 100, 0, 100],
      ["51651506", "Licencias", "", "ODOO", "", 0, 200, 0, 200],
      ["51651506", "Licencias", "", "ODOO", "B", 0, 200, 0, 200],
    ], { columnas: { ...spec().columnas, tercero: 0 }, subtotalesTercero: "total_mas_detalle" });
    expect(r.filasTercero).toHaveLength(2);
    expect(r.importReady[0].balance).toBe(300);
    expect(r.filasTercero?.every(t => t.nitTercero === null && t.nombreTercero === "ODOO")).toBe(true);
  });

  it("no omite movimientos independientes con centro de costo aunque sus importes coincidan", () => {
    const r = transformar([encabezado,
      ["51651506", "Licencias", "900111111", "ODOO", "A", 0, 100, 0, 100],
      ["51651506", "Licencias", "900111111", "ODOO", "B", 0, 100, 0, 100],
    ], { subtotalesTercero: "total_mas_detalle" });
    expect(r.filasTercero).toHaveLength(2);
    expect(r.importReady[0].balance).toBe(200);
  });
});

describe("documento y nombre juntos en una celda (Karibik y Zarzal)", () => {
  it("conserva Genérico y nombres con números al derivar el detalle", () => {
    const filas: GridHoja["filas"] = [["Código", "Cuenta", "SI", "D", "C", "SF"]];
    const negrita: boolean[][] = [Array(6).fill(true)];
    const add = (fila: GridHoja["filas"][number], bold: boolean) => { filas.push(fila); negrita.push(Array(6).fill(bold)); };
    for (let i = 0; i < 22; i++) {
      add([String(11050500 + i), "Cuenta", 0, 100, 0, 100], true);
      add(["900111111 PROVEEDOR SAS", "", 0, 100, 0, 100], false);
    }
    add(["14050502", "Materias primas", 0, 577295796.64, 0, 577295796.64], true);
    add(["Código", "Cuenta", "SI", "D", "C", "SF"], false);
    add(["Generico            Genérico", "", 0, 572801296.64, 0, 572801296.64], false);
    add(["900324345           T3 TEXTILES SAS", "", 0, 4494500, 0, 4494500], false);
    add(["CÓDIGO CONTABLE", "", 0, 0, 0, 0], false);
    add(["130505", "Clientes", 0, 100, 0, 100], true);
    add(["13050501 Caja general", "", 0, 100, 0, 100], false);
    add(["TOTAL", "", 0, 100, 0, 100], true);
    add(["Generico Genérico", "", 0, 777, 0, 777], false);
    const s = spec({ columnas: { ...spec().columnas, tercero: 0, nombreTercero: 0, saldoInicial: 3, debitos: 4, creditos: 5, saldoFinal: 6 } });
    const r = transformarTabular(s, [{ nombre: "Balance", filas, negrita }], params);
    expect(r.importReady.find(c => c.code === "13050501")).toMatchObject({ balance: 100 });
    expect(r.filasTercero?.some(t => t.nitTercero === "13050501")).toBe(false);
    expect(r.filasTercero?.some(t => t.saldoFinal === 777)).toBe(false);
    const detalle = derivarStagingTercero(r.filasCrudas, r.filasTercero ?? []).filter(t => t.codigo === "14050502");
    expect(detalle).toHaveLength(2);
    expect(detalle[0]).toMatchObject({ nitTercero: null, nombreTercero: "Genérico", saldoFinal: 572801296.64 });
    expect(detalle[1]).toMatchObject({ nitTercero: "900324345", nombreTercero: "T3 TEXTILES SAS", saldoFinal: 4494500, identidadTercero: { numeroDocumento: "900324345", nombre: "T3 TEXTILES SAS" } });
    // El consumidor nunca suma la fila propia de la cuenta encima del detalle.
    const filasVista = [{ cuenta8: "14050502", nitTercero: null, nombreTercero: null, saldoFinal: 577295796.64 }, ...detalle.map(t => ({ ...t, cuenta8: t.codigo }))];
    expect(filasEfectivasTercero(filasVista).reduce((s, f) => s + f.saldoFinal, 0)).toBe(577295796.64);
  });
});

describe("bloque de terceros que no se corta (Karibik 23359501, Aceros Mapa 143501)", () => {
  const base = () => {
    const filas: GridHoja["filas"] = [["Código", "Cuenta", "SI", "D", "C", "SF"]];
    const negrita: boolean[][] = [Array(6).fill(true)];
    const add = (fila: GridHoja["filas"][number], bold: boolean) => { filas.push(fila); negrita.push(Array(6).fill(bold)); };
    for (let i = 0; i < 22; i++) {
      add([String(11050500 + i), "Cuenta", 0, 100, 0, 100], true);
      add(["900111111 PROVEEDOR SAS", "", 0, 100, 0, 100], false);
    }
    return { filas, negrita, add };
  };
  const s = spec({ columnas: { ...spec().columnas, tercero: 0, nombreTercero: 0, saldoInicial: 3, debitos: 4, creditos: 5, saldoFinal: 6 } });

  it("un tercero del exterior con documento alfanumérico no cierra el bloque de la cuenta", () => {
    const { filas, negrita, add } = base();
    add(["23359501", "OTRAS CXP", 0, 0, 600, 600], true);
    add([" 830078512           ACH COLOMBIA SAS", "", 0, 0, 100, 100], false);
    add([" IE6364992H          ADOBE SYSTEMS SOFTWARE", "", 0, 0, 200, 200], false);
    add([" 1092345461          AGUDELO AGUDELO MIGUEL ANDRES", "", 0, 0, 300, 300], false);
    add(["23359502", "OTRA", 0, 0, 50, 50], true);
    const r = transformarTabular(s, [{ nombre: "Balance", filas, negrita }], params);
    const detalle = (r.filasTercero ?? []).filter(t => t.codigo === "23359501");
    expect(detalle.map(t => t.saldoFinal)).toEqual([100, 200, 300]);
    expect(detalle[1]).toMatchObject({ nitTercero: null, nombreTercero: "ADOBE SYSTEMS SOFTWARE" });
    expect(detalle[2]).toMatchObject({ nitTercero: "109234546", nombreTercero: "AGUDELO AGUDELO MIGUEL ANDRES" });
    // Los terceros posteriores al corte ya no entran como cuentas con código de NIT.
    expect(r.importReady.some(c => c.code === "1092345461")).toBe(false);
    expect(r.importReady.find(c => c.code === "23359501")).toMatchObject({ balance: 600 });
  });

  it("una fila sin documento dentro del bloque se conserva como tercero y un pie de página no lo cierra", () => {
    const { filas, negrita, add } = base();
    add(["13050501", "CLIENTES", 0, 600, 0, 600], true);
    add([" 900111222           CLIENTE UNO SAS", "", 0, 100, 0, 100], false);
    add([" VENTAS MOSTRADOR", "", 0, 200, 0, 200], false);
    add(["Página 2 de 9", "", 0, 0, 0, 0], false);
    add([" 900333444           CLIENTE DOS SAS", "", 0, 300, 0, 300], false);
    add(["TOTAL GENERAL", "", 0, 600, 0, 600], false);
    const r = transformarTabular(s, [{ nombre: "Balance", filas, negrita }], params);
    const detalle = (r.filasTercero ?? []).filter(t => t.codigo === "13050501");
    expect(detalle.map(t => [t.nombreTercero, t.saldoFinal])).toEqual([["CLIENTE UNO SAS", 100], ["VENTAS MOSTRADOR", 200], ["CLIENTE DOS SAS", 300]]);
  });

  it("con el bloque ya explicado por sus terceros, una fila suelta con importes no se toma como tercero", () => {
    const { filas, negrita, add } = base();
    add(["13050501", "CLIENTES", 0, 100, 0, 100], true);
    add([" 900111222           CLIENTE UNO SAS", "", 0, 100, 0, 100], false);
    add(["SALDO CONTABILIDAD", "", 0, 999, 0, 999], false);
    const r = transformarTabular(s, [{ nombre: "Balance", filas, negrita }], params);
    expect((r.filasTercero ?? []).filter(t => t.codigo === "13050501")).toHaveLength(1);
  });
});

describe("documento del tercero en SAP Business One (IGB)", () => {
  const encabezadoSap = ["Rompimiento", "CardCode", "CardName", "Cuenta", "Nombre cuenta", "InfoCo01", "SI", "D", "C", "SF"];
  const specSap = (over: Partial<MappingSpec> = {}) => spec({
    columnas: { codigo: 4, codigoFragmentos: [], nombre: 5, tercero: 2, nombreTercero: 3, saldoInicial: 7, debitos: 8, creditos: 9, saldoFinal: 10, saldoFinalDebito: 0, saldoFinalCredito: 0 },
    reglaDetalle: { tipo: "columna", columna: 1, valor: "Cuenta" }, ...over,
  });
  const archivo = (): GridHoja["filas"] => {
    const filas: GridHoja["filas"] = [encabezadoSap, ["Cuenta", "", "", "13050505", "CLIENTES", "", 0, 2600, 0, 2600]];
    for (let i = 0; i < 25; i++) filas.push(["NIT", `C${900100000 + i}`, `CLIENTE ${i}`, "13050505", "CLIENTES", `${900100000 + i}-${i % 10}`, 0, 100, 0, 100]);
    // Tercero que no es socio de negocio: sin CardCode, con nombre y NIT en la otra columna.
    filas.push(["NIT", "", "CLIENTE SIN CODIGO", "13050505", "CLIENTES", "1000634478", 0, 100, 0, 100]);
    return filas;
  };

  it("retira solo las letras pegadas cuando dominan la columna y toma el documento de la columna alterna", () => {
    const r = transformarTabular(specSap(), [{ nombre: "Balance", filas: archivo() }], params);
    const t = r.filasTercero ?? [];
    expect(t).toHaveLength(26);
    expect(t[0]).toMatchObject({ nitTercero: "900100000", nombreTercero: "CLIENTE 0" });
    expect(t[25]).toMatchObject({ nitTercero: "100063447", nombreTercero: "CLIENTE SIN CODIGO", identidadTercero: { numeroDocumento: "1000634478" } });
    expect(r.excepciones.map(e => e.regla)).toEqual(expect.arrayContaining(["Letras pegadas al documento del tercero retiradas", "Documento del tercero tomado de una columna alterna"]));
  });

  it("no toca un archivo de NIT limpios con unos pocos documentos del exterior", () => {
    const filas = archivo().map((f, i) => i >= 2 && i < 27 ? [f[0], String(f[1]).slice(1), ...f.slice(2)] : f);
    filas[5] = ["NIT", "EU826015023", "ELEGANT THEMES", "13050505", "CLIENTES", "", 0, 100, 0, 100];
    const r = transformarTabular(specSap(), [{ nombre: "Balance", filas }], params);
    expect(r.excepciones.some(e => e.regla === "Letras pegadas al documento del tercero retiradas")).toBe(false);
    expect(r.filasTercero?.[3]).toMatchObject({ nombreTercero: "ELEGANT THEMES" });
  });

  it("los asientos bajo el total de cada tercero no duplican débitos ni créditos", () => {
    const filas: GridHoja["filas"] = [encabezadoSap, ["Cuenta", "", "", "13300505", "ANTICIPOS", "", 1000, 2200, 2200, 1000]];
    for (let i = 0; i < 22; i++) {
      const doc = `P${800200000 + i}`;
      // El total puede venir SIN código de socio de negocio: lo identifica la columna alterna.
      filas.push(["NIT", i === 0 ? "" : doc, `PROVEEDOR ${i}`, "13300505", "ANTICIPOS", `${800200000 + i}-1`, i === 0 ? 1000 : 0, 100, 100, i === 0 ? 1000 : 0]);
      filas.push(["", doc, `PROVEEDOR ${i}`, "13300505", "ANTICIPOS", `${800200000 + i}-1`, 0, 100, 0, ""]);
      filas.push(["", doc, `PROVEEDOR ${i}`, "13300505", "ANTICIPOS", `${800200000 + i}-1`, 0, 0, 100, ""]);
    }
    for (let i = 0; i < 20; i++) filas.push(["NIT", `P${800300000 + i}`, `SIN MOVIMIENTO ${i}`, "13300505", "ANTICIPOS", `${800300000 + i}-1`, 0, 0, 0, 0]);
    const r = transformarTabular(specSap(), [{ nombre: "Balance", filas }], params);
    const t = r.filasTercero ?? [];
    expect(t).toHaveLength(42);
    expect(t.reduce((a, f) => a + f.debitos, 0)).toBe(2200);
    expect(t.reduce((a, f) => a + f.creditos, 0)).toBe(2200);
    expect(t.reduce((a, f) => a + f.saldoFinal, 0)).toBe(1000);
  });
});
