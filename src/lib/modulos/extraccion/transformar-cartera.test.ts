import { describe, expect, it } from "vitest";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { descriptorModulo } from "../descriptores";
import type { SpecModulo } from "./esquema";
import { normalizarSpecModulo } from "../perfil-modulo";
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

  describe("«Anticipos» impreso como desglose de otro balde (CEMCO SAFIX, EQUIELECT)", () => {
    // El recibo RF y la nota crédito van en «no vencido» Y en «Anticipos»; el «Total» los cuenta
    // una vez. Sumar los dos baldes dejaba el auxiliar de EQUIELECT 364 M por debajo del archivo.
    const safix = hoja("CARTERA AL 31 DIC 2025", [
      ["Nit", "Nombre", "Documento", "Total", "Anticipos", "no vencido", "90-180"],
      ["900491846", "AZIMUT ENERGIA SAS", "AR 1353175", 4_196_772, 0, 4_196_772, 0],
      ["900491846", "AZIMUT ENERGIA SAS", "RF 452130", -39_623_194, -39_623_194, -39_623_194, 0],
      ["890900841", "COMFAMA", "NC 1", -50_176.35, -50_176.35, 0, -50_176.35],
    ]);
    /** Spec como el de los patrones v2/v3 aprobados: «Anticipos» como balde que suma. */
    const specPatron = (): SpecModulo => {
      const spec = specDe(safix);
      return { ...spec, familias: { edades: (spec.familias?.edades ?? []).map((c) => (c.etiqueta === "Anticipos" ? { ...c, clase: "saldo_favor" as const } : c)) } };
    };

    it("el transform no la suma aunque el patrón la declare saldo a favor", () => {
      const r = transformarModulo(CAR, specPatron(), safix);
      expect(r.edadesNoSumadas).toEqual(["Anticipos"]);
      expect(movimientos(r).map((f) => f.valor)).toEqual([4_196_772, -39_623_194, -50_176.35]);
      expect(movimientos(r)[1].familias?.edades.Anticipos).toBe(-39_623_194); // se conserva
    });

    it("el asistente la propone sin sumar", () => {
      expect(specDe(safix).familias?.edades.find((c) => c.etiqueta === "Anticipos")?.clase).toBe("excluir");
    });

    it("SIIGO Nube: si el total sí la incluye, sigue sumando", () => {
      const nube = hoja("cartera", [
        ["Nit", "Nombre", "Total", "Saldo a favor", "Vencido 1 a 30"],
        ["800197463", "CLIENTE UNO", 700_000, -300_000, 1_000_000],
        ["890904478", "CLIENTE DOS", -200_000, -200_000, 0],
      ]);
      const r = transformarModulo(CAR, specDe(nube), nube);
      expect(r.edadesNoSumadas).toBeUndefined();
      expect(movimientos(r).map((f) => f.valor)).toEqual([700_000, -200_000]);
    });
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

describe("el gran total en negrita entra al control del archivo", () => {
  // Ofimática imprime su total al pie EN NEGRITA. Si la negrita decidía «agrupadora» antes
  // de detectar subtotales, esa fila nunca llegaba al control: el panel «Validación del
  // archivo» quedaba mudo, y en el archivo real hay 0,50 de diferencia que nadie veía.
  const ofimatica = () => hoja(
    "CXC POR EDADES",
    [
      ["NIT", "Proveedor / Acreedor", "Valor Total", "0-30 días", "Más de 90 días"],
      ["890905211-1", "MUNICIPIO DE MEDELLIN", 4, 4, 0],
      ["890907106-5", "MUNICIPIO DE ENVIGADO", 1000, 400, 600],
      [null, "TOTAL CUENTAS POR COBRAR", 1004, 404, 600],
    ],
    [[], [false, false, false, false, false], [false, false, false, false, false], [true, true, true, true, true]],
  );

  it("la fila del total se reconoce como total, no como agrupadora", () => {
    const r = transformarModulo(CAR, specDe(ofimatica()), ofimatica());
    const pie = r.filas.find((f) => f.datos.nombre === "TOTAL CUENTAS POR COBRAR");
    expect(pie?.tipoFila).toBe("total");
    // Con un solo grupo, esa fila vale lo mismo como subtotal del bloque que como gran total,
    // y el motor la toma como subtotal. Lo que importa es que ENTRA al control: antes era
    // agrupadora y el panel no la veía.
    expect(pie?.motivo).toMatch(/^(gran_total|subtotal)/);
  });

  it("y sigue sin sumar: el total imputado son los dos terceros", () => {
    const r = transformarModulo(CAR, specDe(ofimatica()), ofimatica());
    expect(movimientos(r).map((f) => f.valor)).toEqual([4, 1000]);
    expect(r.filasLeidas).toBe(2);
  });

  it("una fila en negrita que NO es subtotal vuelve a agrupadora y no imputa", () => {
    const h = hoja(
      "H",
      [
        ["NIT", "NOMBRE", "Valor Total", "0-30 días"],
        ["800197463", "UNO", 100, 100],
        ["890904478", "DOS · SEÑALADO EN NEGRITA", 999, 999],
      ],
      [[], [false, false, false, false], [true, true, true, true]],
    );
    const r = transformarModulo(CAR, specDe(h), h);
    const negrita = r.filas.find((f) => f.datos.nit === "890904478");
    expect(negrita?.tipoFila).toBe("agrupadora");
    expect(movimientos(r).map((f) => f.valor)).toEqual([100]);
    expect(r.filasLeidas + r.filasExcluidas).toBe(2);
  });

  it("los módulos sin `usarNegritaComoEstructura` no cambian: la negrita sigue decidiendo al leer", () => {
    const rigido = { ...CAR, usarNegritaComoEstructura: undefined };
    const r = transformarModulo(rigido, specDe(ofimatica()), ofimatica());
    expect(r.filas.find((f) => f.datos.nombre === "TOTAL CUENTAS POR COBRAR")?.tipoFila).toBe("agrupadora");
  });
});

describe("reportes jerárquicos de SIESA: secciones de cuenta e identificador compartido", () => {
  // Cinco terceros con un documento cada uno bajo una sección de cuenta, con los valores y la
  // negrita de los archivos reales: la sección y las cabeceras de tercero van en negrita; los
  // documentos, en letra normal.
  const NITS = ["1000294846", "10078880", "0992796928001", "647406", "72771"];
  const NOMBRES = ["JUNIELES MARTINEZ CAROLAY", "JARAMILLO ECHEVERRI OVIDIO", "BIOMEDIZIN SA", "PAREJA GARCIA JUAN", "MOSTRADOR VENTAS"];
  const DOCS = ["001-FVM-00735278-000", "001-FVM-00737239-000", "001-NCM-00492829-000", "002-FVP-00012263-000", "003-FVU-00130626-000"];
  const SALDOS = [100, 200, 300, 400, 500];
  /** Negrita en toda la fila para las filas que cumplan el predicado (índice 0 = encabezado). */
  const negritaDe = (filas: unknown[][], enNegrita: (i: number) => boolean) =>
    filas.map((f, i) => (i === 0 ? [] : f.map(() => enNegrita(i))));
  // Sección (fila 1), cabeceras de tercero (filas pares hasta la 10) y total (fila 12).
  const negritaJerarquica = (i: number) => i === 1 || (i >= 2 && i <= 12 && i % 2 === 0);

  const esperarJerarquia = (r: ReturnType<typeof transformarModulo>, cuenta: string) => {
    const docs = movimientos(r);
    expect(docs.map((f) => f.valor)).toEqual(SALDOS);
    expect(docs.map((f) => f.datos.nit)).toEqual(NITS);
    expect(docs.map((f) => f.datos.nombre)).toEqual(NOMBRES);
    expect(docs.every((f) => f.clasificador === cuenta)).toBe(true);
    const cabeceras = r.filas.filter((f) => f.motivo === "subtotal_tercero:cabecera");
    expect(cabeceras.map((f) => f.datos.nit)).toEqual(NITS);
    expect(cabeceras.map((f) => f.saldoDeclarado)).toEqual(SALDOS);
    // La sección no inventa un tercero con el código de la cuenta, y no imputa.
    const secciones = r.filas.filter((f) => f.motivo === "seccion_cuenta");
    expect(secciones.map((f) => [f.clasificador, f.tipoFila, f.datos.nit])).toEqual([[cuenta, "agrupadora", null]]);
  };

  it("Zarzal: cuenta, tercero y documento en la MISMA columna, y el «Total» en otra", () => {
    const filas: (string | number | null)[][] = [
      [null, null, null, "Documento", "Fecha", "F.Vcto.", "#Ter.", "Corriente", "Total"],
      [null, null, null, "13050500", " NACIONALES", null, 5, 1500, 1500],
      ...NITS.flatMap((nit, i) => [
        [null, null, null, nit, "  " + NOMBRES[i], null, null, SALDOS[i], SALDOS[i]],
        [null, null, null, DOCS[i], 46009 + i, 46025 + i, null, SALDOS[i], 0],
      ]),
      [null, null, "Total", null, null, null, null, 1500, 1500],
      [null, null, "Siesa Enterprise Net 1.25.0", null, null, null, null, null, null],
    ];
    const h = hoja("Hoja 1", filas, negritaDe(filas, negritaJerarquica));
    const spec = specDe(h);
    expect(spec.columnas.nit).toBe(4);
    expect(spec.columnas.documento).toBe(4);
    expect(spec.terceroModo).toBe("cabecera");
    const r = transformarModulo(CAR, spec, h);
    esperarJerarquia(r, "13050500");
    // El nombre sale de la columna «Fecha» de la cabecera, que ahí no trae fecha.
    expect(r.filas.find((f) => f.motivo === "subtotal_tercero:cabecera")?.datos.fecha).toBeNull();
    // El «Total» de la columna 3 entra al control del archivo y no imputa.
    const pie = r.filas.find((f) => f.filaNum === 13);
    expect(pie?.tipoFila).toBe("total");
    expect(pie?.valor).toBe(1500);
  });

  it("detalle de Mineralin: identificador en una columna SIN encabezado y «*» en los documentos", () => {
    const filas: (string | number | null)[][] = [
      [null, "Documento", "Fecha", "F.Vcto.", "#Ter.", "Saldo"],
      ["13050505", null, "CLIENTES NACIONALES", null, 5, 1500],
      ...NITS.flatMap((nit, i) => [
        [nit, null, " " + NOMBRES[i], null, null, SALDOS[i]],
        [i % 2 === 0 ? "*" : null, DOCS[i], 45762 + i, 45763 + i, null, SALDOS[i]],
      ]),
      ["Total", null, null, null, null, 1500],
      ["SBS 1.25.0", null, null, null, null, "Pág."],
    ];
    const h = hoja("Hoja 1", filas, negritaDe(filas, negritaJerarquica));
    const spec = specDe(h);
    expect(spec.columnas.nit).toBe(1);
    expect(spec.terceroModo).toBe("cabecera");
    const r = transformarModulo(CAR, spec, h);
    esperarJerarquia(r, "13050505");
    expect(r.filas.find((f) => f.filaNum === 13)?.tipoFila).toBe("total");
    // El pie del ERP no se vuelve la cabecera de un tercero «SBS 1.25.0».
    expect(r.filas.some((f) => f.datos.nit === "SBS 1.25.0")).toBe(false);
  });

  it("resumen de Aceros Mapa (sin documentos): aquí la negrita marca la CUENTA y el tercero va en letra normal", () => {
    const filas: (string | number | null)[][] = [
      ["Código", null, "Descripción", "#Ter.", "Saldo"],
      ["2805", null, "  ANTICIPOS Y AVANCES RECIBIDOS", null, -300],
      ["280505", null, "     DE CLIENTES CREDITO", null, -300],
      ["800161633", null, "      CONSTRUCTORA LAS GALIAS", null, -100],
      ["800240559", null, "      H2O CONTROL INGENIERIA", null, -200],
      ["28", null, " OTROS PASIVOS NO FINANCIEROS", 2, -300],
      ["Total", null, null, null, -300],
    ];
    const h = hoja("Hoja 1", filas, negritaDe(filas, (i) => i === 1 || i === 2 || i === 5 || i === 6));
    const spec = specDe(h);
    expect(spec.terceroModo).not.toBe("cabecera");
    const r = transformarModulo(CAR, spec, h);
    expect(movimientos(r).map((f) => [f.datos.nit, f.datos.nombre, f.clasificador, f.valor])).toEqual([
      ["800161633", "CONSTRUCTORA LAS GALIAS", "280505", -100],
      ["800240559", "H2O CONTROL INGENIERIA", "280505", -200],
    ]);
    expect(r.filas.filter((f) => f.motivo === "seccion_cuenta").map((f) => f.clasificador)).toEqual(["2805", "280505", "28"]);
    expect(r.filas.find((f) => f.filaNum === 7)?.tipoFila).toBe("total");
  });

  it("fuera de SIESA, un «Total» sin identidad en una columna sin rol sigue siendo una fila sin dueño", () => {
    // En SIIGO y World Office esas filas son subtotales por tercero: tomarlas como candidatas
    // llenaba el panel de descuadres falsos. Solo el formato con «#Ter.» las rescata.
    const filas: (string | number | null)[][] = [
      ["NIT", "Nombre", "Saldo", null],
      ["800161633", "CONSTRUCTORA LAS GALIAS", 100, null],
      ["800240559", "H2O CONTROL INGENIERIA", 200, null],
      [null, null, 300, "Total"],
    ];
    const h = hoja("Hoja 1", filas);
    const r = transformarModulo(CAR, specDe(h), h);
    const pie = r.filas.find((f) => f.filaNum === 4);
    expect(pie?.tipoFila).toBe("agrupadora");
    expect(pie?.motivo).toBe("sin_identificador");
    expect(movimientos(r).map((f) => f.valor)).toEqual([100, 200]);
  });
});

describe("SIESA sin «#Ter.» (detalle de Mineralin, sep/2026): la cuenta va DEBAJO de su tercero", () => {
  // El export trae el tercero, debajo el renglón de su cuenta y debajo sus documentos; la columna
  // «#Ter.» existe pero no trae nada. El NIT y la cuenta comparten la columna C; el nombre, la
  // cuenta y el documento, la D. Los documentos traen el «Total» en 0: manda la suma de edades.
  const filas: (string | number | null)[][] = [
    [null, null, "Documento", null, "Fecha", "F.Vcto.", "Venc.", "#Ter.", "Corriente", "De 1 a 30", "Total"],
    [null, null, "1039886129", "CORREA ANDRES", null, null, null, null, 100, 200, 300],
    [null, null, "13050502", "CLIENTES NACIONALES PASAJEROS", null, null, null, null, 100, 200, 300],
    [null, null, null, "001-FNC-00002429-000", 45900, 45930, 0, null, 100, 0, 0],
    [null, null, null, "001-FNC-00002430-000", 45870, 45900, 20, null, 0, 200, 0],
    // Una cédula que empieza por 1305: va seguida de su renglón de cuenta, no de documentos.
    [null, null, "1305123456", "PEREZ GOMEZ LUIS", null, null, null, null, 50, 0, 50],
    [null, null, "13050501", "CLIENTES NACIONALES", null, null, null, null, 50, 0, 50],
    [null, null, null, "001-FVM-00735278-000", 45920, 45950, 0, null, 50, 0, 0],
    [null, null, "Total", null, null, null, null, null, 150, 200, 350],
  ];
  const specSinTer = (h: GridHoja): SpecModulo => {
    const base = sugerirSpec(CAR, h);
    const columnas = Object.fromEntries(CAR.columnas.map((c) => [c.nombre, 0])) as Record<string, number>;
    Object.assign(columnas, { nit: 3, documento: 4, fecha: 5, vencimiento: 6, diasVencidos: 7, marcaSeccion: 8, total: 11 });
    // Con el archivo real el wizard propone NIT y documento en la columna C, y por eso tercero en
    // cabecera con arrastre del NIT; mover el documento a la D conserva ambos.
    return normalizarSpecModulo(CAR, { ...base, columnas, terceroModo: "cabecera", arrastrarRoles: ["nit"], tipoFormato: "documento_edades", clasificadorModo: "columna" });
  };
  const esperar = (h: GridHoja) => {
    const r = transformarModulo(CAR, specSinTer(h), h);
    expect(movimientos(r).map((f) => [f.datos.documento, f.datos.nit, f.datos.nombre, f.clasificador, f.valor])).toEqual([
      ["001-FNC-00002429-000", "1039886129", "CORREA ANDRES", "13050502", 100],
      ["001-FNC-00002430-000", "1039886129", "CORREA ANDRES", "13050502", 200],
      ["001-FVM-00735278-000", "1305123456", "PEREZ GOMEZ LUIS", "13050501", 50],
    ]);
    // El renglón de cuenta es estructura: no imputa, no inventa un tercero con su código y sigue
    // siendo del tercero de encima (es su subtotal en esa cuenta).
    const secciones = r.filas.filter((f) => f.motivo === "seccion_cuenta");
    expect(secciones.map((f) => [f.clasificador, f.tipoFila, f.datos.nit])).toEqual([
      ["13050502", "agrupadora", "1039886129"],
      ["13050501", "agrupadora", "1305123456"],
    ]);
    // La cabecera del tercero declara su total para el control por cliente.
    const cabeceras = r.filas.filter((f) => f.motivo === "subtotal_tercero:cabecera");
    expect(cabeceras.map((f) => [f.datos.nit, f.saldoDeclarado])).toEqual([["1039886129", 300], ["1305123456", 50]]);
    expect(r.filas.find((f) => f.filaNum === 9)?.tipoFila).toBe("total");
  };

  it("con la negrita del archivo (tercero y cuenta en negrita)", () => {
    const negrita = filas.map((f, i) => (i === 0 ? [] : f.map(() => typeof f[2] === "string" && /^d+$/.test(f[2]))));
    esperar(hoja("Hoja 1", filas, negrita));
  });

  it("sin negrita: el tercero no depende de ella", () => {
    esperar(hoja("Hoja 1", filas));
  });
});

describe("por documento con «Total <cliente>» debajo de sus documentos", () => {
  const h = hoja("Cartera", [
    ["NIT", "Nombre", "Documento", "Saldo"],
    ["900123456", "ACME S.A.S.", "F-1", 100_000],
    ["900123456", "ACME S.A.S.", "F-2", 50_000],
    [null, "Total ACME S.A.S.", null, 150_000],
    ["800111222", "BETA LTDA", "F-9", 70_000],
    ["800111222", "BETA LTDA", "F-10", 30_000],
    ["800111222", "Total BETA LTDA", null, 90_000],
    [null, "Total general", null, 240_000],
  ]);
  const spec = (): SpecModulo => ({ ...specDe(h), tipoFormato: "documento" });

  it("el total de cada cliente queda como su saldo declarado, sin imputar", () => {
    const r = transformarModulo(CAR, spec(), h);
    expect(movimientos(r).map((f) => f.valor)).toEqual([100_000, 50_000, 70_000, 30_000]);
    const declarados = r.filas.filter((f) => f.saldoDeclarado != null);
    expect(declarados.map((f) => ({ fila: f.filaNum, tipo: f.tipoFila, saldo: f.saldoDeclarado, nit: f.datos.nit }))).toEqual([
      { fila: 4, tipo: "total", saldo: 150_000, nit: "900123456" },
      { fila: 7, tipo: "total", saldo: 90_000, nit: "800111222" },
    ]);
    // El rótulo del total se conserva; el gran total no declara el saldo de nadie.
    expect(r.filas.find((f) => f.filaNum === 4)?.datos.nombre).toBe("Total ACME S.A.S.");
    expect(r.filas.find((f) => f.filaNum === 8)?.saldoDeclarado).toBeUndefined();
  });

  it("un archivo por edades no usa sus totales como saldo de un cliente", () => {
    const r = transformarModulo(CAR, { ...specDe(h), tipoFormato: "edades" }, h);
    expect(r.filas.some((f) => f.saldoDeclarado != null)).toBe(false);
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

  it("el pie de página del ERP no suma aunque caiga en el identificador y el número de página en el saldo", () => {
    // CxP de Aceros Mapa y Mineralin: «Siesa Enterprise Net 1.25.0 · Pág. 1 / 1» sumaba $1 al módulo.
    const h = hoja("H", [
      ["NIT", "NOMBRE", "SALDO", null, null, null],
      ["800197463", "UNO", 1_000_000, null, null, null],
      ["Siesa Enterprise Net 1.25.0", null, 1, "Pág.", "/", 1],
      ["900123456", "DOS", 500, null, null, null],
      ["SBS 1.25.0", null, null, 1, "/", 1],
    ]);
    const r = transformarModulo(CAR, specDe(h), h);
    expect(movimientos(r).map((f) => [f.datos.nit, f.valor])).toEqual([["800197463", 1_000_000], ["900123456", 500]]);
    expect(r.filas.filter((f) => f.motivo === "sin_identificador").map((f) => [f.filaNum, f.valor])).toEqual([[3, 0], [5, 0]]);
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
