import { describe, expect, it } from "vitest";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { descriptorModulo } from "../descriptores";
import type { SpecModulo } from "./esquema";
import { sugerirSpec } from "./sugerir";
import { transformarModulo } from "./transformar";

/**
 * Lectura de los formatos de cartera. Las grillas son sintéticas —encabezados REALES de los
 * archivos de clientes, con tres o cuatro filas de datos inventados— porque lo que se está
 * fijando es la mecánica: de dónde sale el saldo, qué pasa cuando la columna de total y los
 * baldes no coinciden, y cómo se lee un reporte jerárquico sin contar dos veces.
 */
const CAR = descriptorModulo("CAR")!;
const INV = descriptorModulo("INV")!;

const hoja = (nombre: string, filas: (string | number | null)[][], negrita?: boolean[][]): GridHoja =>
  ({ nombre, filas, ...(negrita ? { negrita } : {}) });

/** Spec sugerido a partir del encabezado (fila 1) — el mismo camino que sigue el wizard. */
const specDe = (h: GridHoja): SpecModulo => sugerirSpec(CAR, h);

const movimientos = (r: ReturnType<typeof transformarModulo>) => r.filas.filter((f) => f.tipoFila === "movimiento");

describe("edades en columnas: el saldo sale de los baldes", () => {
  // ILIMITADA no publica columna de total: el saldo del tercero ES la suma de sus baldes.
  const sinTotal = hoja("H2 DICIEMBRE", [
    ["CODIGO", "NOMBRE", "1 - 30 DIAS", "31 - 60 DIAS", "POR VENCER"],
    ["800197463", "POLLOS EL BUCANERO S.A.", 1_000_000, 500_000, 2_500_000],
    ["890904478", "COOPERATIVA COLANTA", 0, 0, 750_000],
  ]);

  it("sin columna de total, el valor es la suma de los baldes", () => {
    const filas = movimientos(transformarModulo(CAR, specDe(sinTotal), sinTotal));
    expect(filas.map((f) => f.valor)).toEqual([4_000_000, 750_000]);
    expect(filas[0].origenValor).toBe("familia");
    expect(filas[0].valorReportado).toBeNull();
  });

  it("guarda cada balde con el rótulo literal del ERP", () => {
    const filas = movimientos(transformarModulo(CAR, specDe(sinTotal), sinTotal));
    expect(filas[0].familias?.edades).toEqual({
      "1 - 30 DIAS": 1_000_000,
      "31 - 60 DIAS": 500_000,
      "POR VENCER": 2_500_000,
    });
    expect(filas[0].sumaFamilia).toBe(4_000_000);
  });

  it("cuando el total y los baldes difieren, manda la suma de los baldes", () => {
    // Es el caso real de Ofimática: 0,50 de diferencia entre «Valor Total» y las edades.
    const h = hoja("CXC POR EDADES", [
      ["NIT", "Proveedor / Acreedor", "Valor Total", "0-30 días", "Más de 90 días"],
      ["890907106-5", "MUNICIPIO DE ENVIGADO", 1_000_000.5, 400_000, 600_000],
    ]);
    const fila = movimientos(transformarModulo(CAR, specDe(h), h))[0];
    expect(fila.valor).toBe(1_000_000);
    expect(fila.valorReportado).toBe(1_000_000.5);
    expect(fila.origenValor).toBe("columna_y_familia");
  });

  it("un balde ya contado en los demás no se suma (SAP: «Deuda dudosa»)", () => {
    const h = hoja("cartera", [
      ["Código de cliente", "Nombre del cliente", "Saldo vencido", "Sin vencer", "91 - 180", "Deuda dudosa"],
      ["C900123456", "CLIENTE UNO", null, 1_000_000, 300_000, 300_000],
    ]);
    const fila = movimientos(transformarModulo(CAR, specDe(h), h))[0];
    expect(fila.sumaFamilia).toBe(1_300_000);
    expect(fila.familias?.edades["Deuda dudosa"]).toBe(300_000); // se conserva, pero no suma
    expect(fila.valor).toBe(1_300_000);
  });

  it("un documento cuyo importe solo vive en el balde NO se pierde", () => {
    // SIESA Zarzal imprime «Total» en cero en las filas de documento: 7.908 de sus 10.131
    // documentos entran por aquí. Antes, «fila vacía» los descartaba.
    const h = hoja("Hoja 1", [
      ["Documento", "F.Vcto.", "Corriente", "De 1 a 30", "Total"],
      ["001-FVM-0001", 45_000, 2_500_000, 0, 0],
      ["001-FVM-0002", 45_010, 0, 1_200_000, 0],
    ]);
    const filas = movimientos(transformarModulo(CAR, specDe(h), h));
    expect(filas).toHaveLength(2);
    expect(filas.map((f) => f.valor)).toEqual([2_500_000, 1_200_000]);
  });

  it("una fila realmente vacía se sigue saltando", () => {
    const h = hoja("H", [
      ["CODIGO", "NOMBRE", "1 - 30 DIAS"],
      ["800197463", "UNO", 1_000],
      [null, null, null],
      ["", "", 0],
    ]);
    expect(transformarModulo(CAR, specDe(h), h).filas).toHaveLength(1);
  });
});

describe("edades como etiqueta (LIBRA, Plasmar): no hay familia que sumar", () => {
  const h = hoja("CARTERA", [
    ["CUENTA", "NIT", "IMPORTE", "DOCUMENTO", "EDAD"],
    ["130505", "800197463-7", 900_000, "FV-1", "De 1 a 30"],
  ]);

  it("el saldo sale de su columna y la edad queda como dato", () => {
    const spec = specDe(h);
    expect(spec.edadesModo).toBe("largo");
    const fila = movimientos(transformarModulo(CAR, spec, h))[0];
    expect(fila.valor).toBe(900_000);
    expect(fila.datos.edadEtiqueta).toBe("De 1 a 30");
    expect(fila.familias).toBeUndefined();
  });
});

describe("reporte jerárquico: el tercero arriba y sus documentos debajo", () => {
  // La forma de SAP y del detalle de SIESA: una fila con el tercero y su saldo, y debajo
  // sus documentos sin identificador.
  const h = hoja("cartera", [
    ["Código de cliente", "Nombre del cliente", "Nº documento", "Fecha de vencimiento", "Saldo vencido"],
    ["C900123456", "CLIENTE UNO", null, null, 3_000_000],
    [null, null, "FV-001", 45_000, 1_000_000],
    [null, null, "FV-002", 45_010, 2_000_000],
    ["C800987654", "CLIENTE DOS", null, null, 500_000],
    [null, null, "FV-003", 45_020, 500_000],
  ]);

  const resultado = () => {
    const spec = specDe(h);
    expect(spec.terceroModo).toBe("cabecera");
    return transformarModulo(CAR, spec, h);
  };

  it("la cabecera no imputa: su saldo queda como DECLARADO del bloque", () => {
    const r = resultado();
    const cabeceras = r.filas.filter((f) => f.motivo === "subtotal_tercero:cabecera");
    expect(cabeceras.map((f) => f.saldoDeclarado)).toEqual([3_000_000, 500_000]);
    expect(cabeceras.every((f) => f.valor === 0 && f.tipoFila === "agrupadora")).toBe(true);
  });

  it("los documentos heredan el tercero de su cabecera", () => {
    const filas = movimientos(resultado());
    expect(filas.map((f) => f.datos.nit)).toEqual(["C900123456", "C900123456", "C800987654"]);
    expect(filas.map((f) => f.datos.nombre)).toEqual(["CLIENTE UNO", "CLIENTE UNO", "CLIENTE DOS"]);
  });

  it("el total imputado es el de los documentos, sin contar la cabecera", () => {
    const total = movimientos(resultado()).reduce((s, f) => s + f.valor, 0);
    expect(total).toBe(3_500_000);
  });

  it("el saldo declarado cuadra contra la suma de sus documentos", () => {
    // Este contraste es el que certifica que el archivo se leyó bien.
    const r = resultado();
    const declarado = r.filas.filter((f) => f.saldoDeclarado != null).reduce((s, f) => s + (f.saldoDeclarado ?? 0), 0);
    const imputado = movimientos(r).reduce((s, f) => s + f.valor, 0);
    expect(declarado).toBe(imputado);
  });
});

describe("forward-fill: de dónde SÍ y de dónde NO se hereda", () => {
  it("no se siembra desde una fila rotulada «Total …»", () => {
    const h = hoja("Hoja1", [
      ["NIT", "NOMBRE", "COMPROBANTE", "SALDO"],
      ["811045607", "INVERSIONES UNO", "FV-1", 100_000],
      ["Total 811045607", null, null, 100_000],
      ["800987654", "DOS", "FV-2", 50_000],
    ]);
    const spec: SpecModulo = {
      ...specDe(h),
      terceroModo: "cabecera",
      arrastrarRoles: ["nit", "nombre"],
    };
    const filas = movimientos(transformarModulo(CAR, spec, h));
    // La fila «Total 811045607» no debe fijar el tercero de las siguientes.
    expect(filas.at(-1)?.datos.nit).toBe("800987654");
  });

  it("solo se arrastran los roles que el descriptor autoriza", () => {
    const h = hoja("Hoja1", [
      ["NIT", "NOMBRE", "COMPROBANTE", "SALDO"],
      ["811045607", "UNO", "FV-1", 100_000],
      [null, null, "FV-2", 50_000],
    ]);
    const spec: SpecModulo = { ...specDe(h), arrastrarRoles: ["nit", "documento"] };
    const filas = movimientos(transformarModulo(CAR, spec, h));
    expect(filas[1].datos.nit).toBe("811045607"); // `nit` es arrastrable
    expect(filas[1].datos.documento).toBe("FV-2"); // `documento` no: conserva el suyo
  });
});

describe("el encabezado se reconoce por su contenido, no por su número de fila", () => {
  // Un perfil memorizado puede apuntar a una fila que ya no es la del encabezado: el ERP
  // imprime una línea de banner de más o de menos entre un mes y otro sin cambiar la huella.
  const conBanner = (bannerExtra: boolean) => hoja("H", [
    ...(bannerExtra ? [["Reporte de cartera al 31-12-2025", null, null, null] as (string | null)[]] : []),
    ["NIT", "NOMBRE", "1 - 30 DIAS", "POR VENCER"],
    ["800197463", "UNO", 1_000_000, 2_000_000],
    ["890904478", "DOS", 0, 500_000],
  ]);

  it("no se traga la fila de encabezado aunque sus rótulos parezcan números", () => {
    // «1 - 30 DIAS» se parsea como 130: sin reconocer el encabezado, entraría como dato.
    const h = conBanner(false);
    const r = transformarModulo(CAR, specDe(h), h);
    expect(movimientos(r).map((f) => f.valor)).toEqual([3_000_000, 500_000]);
    expect(r.filasOmitidasArriba).toBe(0);
  });

  it("recupera los datos cuando el perfil apunta una fila MÁS ABAJO de la real", () => {
    // El spec dice que los datos empiezan en la 4, pero el archivo de este mes trae una
    // línea menos: la fila 3 es un dato real y no se puede perder.
    const h = conBanner(false);
    const spec: SpecModulo = { ...specDe(h), filaEncabezado: 2, primeraFilaDatos: 3 };
    const r = transformarModulo(CAR, spec, h);
    expect(movimientos(r)).toHaveLength(2);
    expect(r.filasOmitidasArriba).toBe(0);
  });

  it("el banner del ERP por encima del encabezado no se denuncia como dato perdido", () => {
    const h = conBanner(true);
    const r = transformarModulo(CAR, specDe(h), h);
    expect(movimientos(r)).toHaveLength(2);
    expect(r.filasOmitidasArriba).toBe(0);
  });
});

describe("filas que NO son cartera", () => {
  it("un pie del ERP con importe pero sin identidad no suma", () => {
    // Mismo defecto que la fila de «clase 0» del balance: plata que no es de nadie. Queda
    // visible como agrupadora para poder rescatarla si la detección se equivocó.
    const h = hoja("H", [
      ["NIT", "NOMBRE", "COMPROBANTE", "SALDO"],
      ["800197463", "UNO", "FV-1", 1_000_000],
      [null, null, null, 1],
    ]);
    const r = transformarModulo(CAR, specDe(h), h);
    expect(movimientos(r).map((f) => f.valor)).toEqual([1_000_000]);
    expect(r.filas.find((f) => f.motivo === "sin_identificador")?.valor).toBe(0);
  });

  it("el pie NO se salva por heredar el tercero de la fila anterior", () => {
    // Con el arrastre activo, la última fila heredaría el NIT del último tercero. Lo que la
    // delata es que no trae identidad PROPIA: ni identificador, ni nombre, ni documento.
    const h = hoja("H", [
      ["NIT", "NOMBRE", "COMPROBANTE", "SALDO"],
      ["800197463", "UNO", "FV-1", 1_000_000],
      [null, null, null, 1],
    ]);
    const spec: SpecModulo = { ...specDe(h), arrastrarRoles: ["nit", "nombre"] };
    const r = transformarModulo(CAR, spec, h);
    expect(movimientos(r).map((f) => f.valor)).toEqual([1_000_000]);
  });

  it("una fila con documento pero sin tercero SÍ es cartera (se hereda el tercero)", () => {
    const h = hoja("H", [
      ["NIT", "NOMBRE", "COMPROBANTE", "SALDO"],
      ["800197463", "UNO", "FV-1", 1_000_000],
      [null, null, "FV-2", 500_000],
    ]);
    expect(movimientos(transformarModulo(CAR, specDe(h), h))).toHaveLength(2);
  });

  it("los subtotales «Total <tercero>» no se imputan aunque el archivo no traiga cuenta", () => {
    // World Office: el subtotal lleva el nombre («Total ALMACAFÉ S.A») y deja vacías las
    // columnas de documento. Sin esto, la cartera del cliente se contaba DOS veces.
    const h = hoja("cxc a di 31 2025", [
      ["Nombres", "Identificacion", "Doc", "Num", "Fecha Vence", "Valor Total"],
      ["ALMACAFÉ S.A", "NIT 860010973 - 4", "FSC", "13750", 45_000, 98_000],
      ["Total ALMACAFÉ S.A", null, null, null, null, 98_000],
      ["ABELARDO YEPES S.A.S", "NIT 900404987 - 3", "FSC", "15656", 45_010, 225_000],
      ["Total ABELARDO YEPES S.A.S", null, null, null, null, 225_000],
    ]);
    const r = transformarModulo(CAR, specDe(h), h);
    expect(movimientos(r).map((f) => f.valor)).toEqual([98_000, 225_000]);
    expect(r.filas.filter((f) => f.tipoFila === "total")).toHaveLength(2);
  });
});

describe("regresión: un módulo sin familias se lee exactamente igual", () => {
  it("Inventarios ignora los campos nuevos", () => {
    const h = hoja("Hoja1", [
      ["Tipo", "Referencia", "Valor total"],
      ["MERCANCIA", "REF-1", 1_000],
      ["MERCANCIA", "REF-2", 2_000],
    ]);
    const r = transformarModulo(INV, sugerirSpec(INV, h), h);
    const filas = movimientos(r);
    expect(filas.map((f) => f.valor)).toEqual([1_000, 2_000]);
    expect(filas.every((f) => f.familias === undefined && f.origenValor === undefined)).toBe(true);
  });
});
