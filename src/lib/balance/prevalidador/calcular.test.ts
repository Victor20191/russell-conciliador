import { describe, expect, it } from "vitest";
import {
  construirPrevalidador,
  detectarAnidamientos,
  factorPresentacion,
  montoBase,
  resumenSinHomologar,
  type FilaPrevalidador,
  type ModuloPrevalidadorVM,
  type PrevalidadorVM,
} from "./calcular";
import { type BaseCalculo, type FilaCatalogoPrevalidador, ordenModulo } from "./catalogo";

// ---- helpers ----

/** Fila del detalle. Por defecto homologada a sí misma y sin movimientos. */
function fila(
  cuenta8: string,
  cuenta6Russell: string | null = cuenta8,
  montos: Partial<Pick<FilaPrevalidador, "saldoFinal" | "debitos" | "creditos">> = {},
): FilaPrevalidador {
  return {
    cuenta8,
    nombreCuenta: `Cuenta ${cuenta8}`,
    cuenta6Russell,
    saldoFinal: montos.saldoFinal ?? 0,
    debitos: montos.debitos ?? 0,
    creditos: montos.creditos ?? 0,
  };
}

let siguienteId = 1;

/** Fila del catálogo. Los ids se autoasignan para poder colgarles overrides. */
function cat(
  moduloCodigo: string,
  cuentaRussell: string,
  baseCalculo: BaseCalculo,
  opts: { orden?: number; activa?: boolean; id?: number } = {},
): FilaCatalogoPrevalidador {
  return {
    id: opts.id ?? siguienteId++,
    moduloCodigo,
    moduloNombre: moduloCodigo,
    moduloOrden: ordenModulo(moduloCodigo),
    cuentaRussell,
    etiqueta: null,
    baseCalculo,
    orden: opts.orden ?? 10,
    activa: opts.activa ?? true,
  };
}

/** Estrecha el VM a "listo" y falla con un mensaje útil si quedó bloqueado. */
function listo(vm: PrevalidadorVM) {
  if (vm.estado !== "listo") throw new Error(`Se esperaba "listo" y llegó "${vm.estado}"`);
  return vm;
}

const buscarFila = (m: ModuloPrevalidadorVM[], cuenta: string) =>
  m.flatMap((x) => x.filas).find((f) => f.cuentaRussell === cuenta)!;

const buscarModulo = (m: ModuloPrevalidadorVM[], codigo: string) => m.find((x) => x.codigo === codigo)!;

// ---- casos ----

describe("prevalidador · comparación de los dos lados", () => {
  it("con homologación 1:1 los dos lados coinciden", () => {
    const vm = listo(
      construirPrevalidador(
        [
          fila("130505", "130505", { saldoFinal: 1_000 }),
          fila("130510", "130510", { saldoFinal: 500 }),
          fila("140505", "140505", { saldoFinal: 300 }),
        ],
        [cat("CAR", "13", "saldo"), cat("INV", "14", "saldo")],
        [],
      ),
    );
    const cartera = buscarFila(vm.modulos, "13");
    expect(cartera.russell.saldoFinal).toBe(1_500);
    expect(cartera.cliente.saldoFinal).toBe(1_500);
    expect(cartera.diferencia).toBe(0);
    expect(cartera.coincide).toBe(true);
    expect(buscarFila(vm.modulos, "14").diferencia).toBe(0);
    expect(vm.filasConDiferencia).toBe(0);
  });

  it("destapa la homologación cruzada: un costo del cliente mandado a ingresos", () => {
    // El caso real de Medipiel: la 6105 «descuento en liquidación» quedó homologada
    // a la 4175 de Russell. El lado Russell la cuenta en el 41 y el del cliente no.
    const vm = listo(
      construirPrevalidador(
        [
          fila("410505", "410505", { creditos: 2_000 }),
          fila("610505", "417595", { creditos: 500 }),
        ],
        [cat("ING", "41", "movimiento")],
        [],
      ),
    );
    const ingresos = buscarFila(vm.modulos, "41");
    expect(ingresos.russell.saldoFinal).toBe(2_500);
    expect(ingresos.russell.cuentas).toBe(2);
    expect(ingresos.cliente.saldoFinal).toBe(2_000);
    expect(ingresos.cliente.cuentas).toBe(1);
    expect(ingresos.diferencia).toBe(-500);
    expect(ingresos.coincide).toBe(false);
    expect(vm.filasConDiferencia).toBe(1);
  });

  it("reproduce el signo y los importes exactos de la maqueta (cliente − Russell)", () => {
    const vm = listo(
      construirPrevalidador(
        [
          // Cuenta 13: cliente 67.466; una cuenta fuera del prefijo fue homologada
          // hacia 13 y eleva Russell hasta 6.746.647.
          fila("130505", "130505", { saldoFinal: 67_466 }),
          fila("610505", "130510", { saldoFinal: 6_679_181 }),
          // Cuenta 2805 (naturaleza crédito): cliente 3.557.456; Russell 35.574.567.
          fila("280505", "280505", { saldoFinal: -3_557_456 }),
          fila("620505", "280510", { saldoFinal: -32_017_111 }),
        ],
        [cat("CAR", "13", "saldo", { orden: 10 }), cat("CAR", "2805", "saldo", { orden: 20 })],
        [],
      ),
    );

    const cuenta13 = buscarFila(vm.modulos, "13");
    expect(cuenta13.russell.saldoFinal).toBe(6_746_647);
    expect(cuenta13.cliente.saldoFinal).toBe(67_466);
    expect(cuenta13.diferencia).toBe(-6_679_181);

    const cuenta2805 = buscarFila(vm.modulos, "2805");
    expect(cuenta2805.russell.saldoFinal).toBe(35_574_567);
    expect(cuenta2805.cliente.saldoFinal).toBe(3_557_456);
    expect(cuenta2805.diferencia).toBe(-32_017_111);

    const cartera = buscarModulo(vm.modulos, "CAR");
    expect(cartera.totalRussell).toBe(42_321_214);
    expect(cartera.totalCliente).toBe(3_624_922);
    expect(cartera.diferenciaTotal).toBe(-38_696_292);
  });
});

describe("prevalidador · base de cálculo", () => {
  it("la base «saldo» ignora los movimientos del período", () => {
    const vm = listo(
      construirPrevalidador(
        [fila("110505", "110505", { saldoFinal: 100, debitos: 999, creditos: 999 })],
        [cat("CAR", "11", "saldo")],
        [],
      ),
    );
    const f = buscarFila(vm.modulos, "11");
    expect(f.baseCalculo).toBe("saldo");
    expect(f.cliente.saldoFinal).toBe(100);
  });

  it("la base «movimiento» ignora el saldo acumulado", () => {
    const vm = listo(
      construirPrevalidador(
        [fila("410505", "410505", { saldoFinal: -7_000, debitos: 100, creditos: 900 })],
        [cat("ING", "41", "movimiento")],
        [],
      ),
    );
    const f = buscarFila(vm.modulos, "41");
    expect(f.baseCalculo).toBe("movimiento");
    expect(f.cliente.saldoFinal).toBe(800);
  });

  it("la base configurada en el catálogo manda sobre el defecto de la clase", () => {
    // Misma fila que el caso anterior, pero el catálogo pide saldo: cambiar el
    // criterio de Russell no debe exigir tocar código.
    const vm = listo(
      construirPrevalidador(
        [fila("410505", "410505", { saldoFinal: -7_000, debitos: 100, creditos: 900 })],
        [cat("ING", "41", "saldo")],
        [],
      ),
    );
    expect(buscarFila(vm.modulos, "41").cliente.saldoFinal).toBe(7_000);
  });

  it("montoBase devuelve el bruto firmado sin factor de presentación", () => {
    const f = fila("220505", "220505", { saldoFinal: -400, debitos: 10, creditos: 60 });
    expect(montoBase(f, "saldo")).toBe(-400);
    expect(montoBase(f, "movimiento")).toBe(-50);
  });
});

describe("prevalidador · convención de signo", () => {
  it("presenta pasivo, patrimonio e ingresos en positivo", () => {
    expect(factorPresentacion("13")).toBe(1);
    expect(factorPresentacion("22")).toBe(-1);
    expect(factorPresentacion("3105")).toBe(-1);
    expect(factorPresentacion("41")).toBe(-1);
    expect(factorPresentacion("5105")).toBe(1);
  });

  it("un pasivo mayor del lado Russell da diferencia negativa (cliente − Russell)", () => {
    const vm = listo(
      construirPrevalidador(
        [
          fila("220505", "220505", { saldoFinal: -800 }),
          fila("610505", "220595", { saldoFinal: -200 }),
        ],
        [cat("CXP", "22", "saldo")],
        [],
      ),
    );
    const f = buscarFila(vm.modulos, "22");
    expect(f.russell.saldoFinal).toBe(1_000);
    expect(f.cliente.saldoFinal).toBe(800);
    expect(f.diferencia).toBe(-200);
  });

  it("usa UN SOLO factor por fila aunque el override apunte a otra clase", () => {
    // Si el factor se derivara de cada lado por separado, la resta se convertiría en
    // una suma en cuanto el override cruzara la naturaleza (activo vs. pasivo).
    const catalogo = [cat("AFI", "15", "saldo", { id: 77 })];
    const filas = [
      fila("150505", "150505", { saldoFinal: 1_000 }),
      fila("270505", "150510", { saldoFinal: -300 }),
    ];
    const vm = listo(construirPrevalidador(filas, catalogo, [{ catalogoId: 77, cuentaCliente: "27" }]));
    const f = buscarFila(vm.modulos, "15");
    expect(f.russell.saldoFinal).toBe(700);
    expect(f.cliente.saldoFinal).toBe(-300);
    expect(f.diferencia).toBe(-1_000);
    expect(Math.abs(f.diferencia)).toBe(Math.abs(f.cliente.saldoFinal - f.russell.saldoFinal));
  });
});

describe("prevalidador · totales por módulo", () => {
  it("suma las filas del módulo aunque mezclen activo y pasivo", () => {
    // El total por módulo no existe en ningún balance: Russell lo pidió porque es la
    // cifra que va a conciliar contra el ERP.
    const vm = listo(
      construirPrevalidador(
        [
          fila("220505", "220505", { saldoFinal: -100 }),
          fila("133005", "133005", { saldoFinal: 50 }),
          fila("233505", "233505", { saldoFinal: -30 }),
        ],
        [
          cat("CXP", "22", "saldo", { orden: 10 }),
          cat("CXP", "1330", "saldo", { orden: 20 }),
          cat("CXP", "2335", "saldo", { orden: 30 }),
        ],
        [],
      ),
    );
    const cxp = buscarModulo(vm.modulos, "CXP");
    expect(cxp.filas.map((f) => f.cuentaRussell)).toEqual(["22", "1330", "2335"]);
    expect(cxp.totalRussell).toBe(180);
    expect(cxp.totalCliente).toBe(180);
    expect(cxp.diferenciaTotal).toBe(0);
    expect(cxp.coincide).toBe(true);
    // Los totales solo existen por módulo: un gran total cruzaría prefijos
    // solapados de módulos distintos (por ejemplo 13 y 1330).
    expect(vm).not.toHaveProperty("totalRussell");
    expect(vm).not.toHaveProperty("totalCliente");
    expect(vm).not.toHaveProperty("diferenciaTotal");
  });
});

describe("prevalidador · cuenta propia del cliente (override)", () => {
  const CATALOGO = [cat("AFI", "15", "saldo", { id: 42 })];
  const FILAS = [fila("170505", "150505", { saldoFinal: 2_000 })];

  it("sin override, el cliente no tiene nada en la 15 y todo es diferencia", () => {
    const f = buscarFila(listo(construirPrevalidador(FILAS, CATALOGO, [])).modulos, "15");
    expect(f.cuentaCliente).toBe("15");
    expect(f.personalizada).toBe(false);
    expect(f.cliente.saldoFinal).toBe(0);
    expect(f.diferencia).toBe(-2_000);
  });

  it("con override 15 → 17 los dos lados cuadran", () => {
    const vm = listo(construirPrevalidador(FILAS, CATALOGO, [{ catalogoId: 42, cuentaCliente: "17" }]));
    const f = buscarFila(vm.modulos, "15");
    expect(f.cuentaRussell).toBe("15");
    expect(f.cuentaCliente).toBe("17");
    expect(f.personalizada).toBe(true);
    expect(f.cliente.saldoFinal).toBe(2_000);
    expect(f.diferencia).toBe(0);
  });

  it("un override a un prefijo inexistente deja el lado cliente en cero, sin reventar", () => {
    const f = buscarFila(
      listo(construirPrevalidador(FILAS, CATALOGO, [{ catalogoId: 42, cuentaCliente: "99" }])).modulos,
      "15",
    );
    expect(f.cliente).toEqual({ prefijo: "99", encontrada: false, cuentas: 0, saldoFinal: 0 });
    expect(f.diferencia).toBe(-2_000);
    expect(f.coincide).toBe(false);
  });

  it("un override igual a la cuenta de Russell no cuenta como personalizado", () => {
    const f = buscarFila(
      listo(construirPrevalidador(FILAS, CATALOGO, [{ catalogoId: 42, cuentaCliente: "15" }])).modulos,
      "15",
    );
    expect(f.personalizada).toBe(false);
  });

  it("ignora overrides de filas de fábrica (id 0), que no existen en base de datos", () => {
    const f = buscarFila(
      listo(construirPrevalidador(FILAS, [cat("AFI", "15", "saldo", { id: 0 })], [{ catalogoId: 0, cuentaCliente: "17" }]))
        .modulos,
      "15",
    );
    expect(f.cuentaCliente).toBe("15");
  });

  it("falla cerrado si dos cuentas cliente se solapan dentro del mismo módulo", () => {
    const vm = construirPrevalidador(
      [
        fila("220505", "220505", { saldoFinal: -100 }),
        fila("133005", "133005", { saldoFinal: 50 }),
      ],
      [
        cat("CXP", "22", "saldo", { id: 71 }),
        cat("CXP", "1330", "saldo", { id: 72 }),
      ],
      [{ catalogoId: 72, cuentaCliente: "2205" }],
    );

    expect(vm).toEqual({
      estado: "no_disponible",
      mensaje: "Las cuentas cliente 22 y 2205 se solapan dentro de CXP.",
    });
  });
});

describe("prevalidador · presencia de cuenta y exactitud a centavos", () => {
  it("distingue una cuenta encontrada con saldo real cero", () => {
    const f = buscarFila(
      listo(
        construirPrevalidador(
          [fila("150505", "150505", { saldoFinal: 0 })],
          [cat("AFI", "15", "saldo")],
          [],
        ),
      ).modulos,
      "15",
    );

    expect(f.russell).toMatchObject({ encontrada: true, cuentas: 1, saldoFinal: 0 });
    expect(f.cliente).toMatchObject({ encontrada: true, cuentas: 1, saldoFinal: 0 });
    expect(f.coincide).toBe(true);
  });

  it("dos lados ausentes nunca producen un OK", () => {
    const vm = listo(construirPrevalidador([], [cat("AFI", "15", "saldo")], []));
    const f = buscarFila(vm.modulos, "15");

    expect(f.russell).toMatchObject({ encontrada: false, cuentas: 0, saldoFinal: 0 });
    expect(f.cliente).toMatchObject({ encontrada: false, cuentas: 0, saldoFinal: 0 });
    expect(f.diferencia).toBe(0);
    expect(f.coincide).toBe(false);
    expect(buscarModulo(vm.modulos, "AFI").coincide).toBe(false);
    expect(vm.filasConDiferencia).toBe(1);
  });

  it("un lado ausente tampoco cuadra aunque el lado encontrado valga cero", () => {
    const vm = listo(
      construirPrevalidador(
        [fila("170505", "150505", { saldoFinal: 0 })],
        [cat("AFI", "15", "saldo")],
        [],
      ),
    );
    const f = buscarFila(vm.modulos, "15");

    expect(f.russell.encontrada).toBe(true);
    expect(f.cliente.encontrada).toBe(false);
    expect(f.diferencia).toBe(0);
    expect(f.coincide).toBe(false);
  });

  it("considera diferencia un solo centavo", () => {
    const vm = listo(
      construirPrevalidador(
        [
          fila("130505", "130505", { saldoFinal: 100 }),
          fila("610505", "130510", { saldoFinal: 0.01 }),
        ],
        [cat("CAR", "13", "saldo")],
        [],
      ),
    );
    const f = buscarFila(vm.modulos, "13");

    expect(f.russell.saldoFinal).toBe(100.01);
    expect(f.cliente.saldoFinal).toBe(100);
    expect(f.diferencia).toBe(-0.01);
    expect(f.coincide).toBe(false);
  });
});

describe("prevalidador · compuerta de homologación", () => {
  it("se bloquea mientras queden cuentas sin homologar", () => {
    const vm = construirPrevalidador(
      [fila("130505", "130505", { saldoFinal: 1_000 }), fila("999999", null, { saldoFinal: -300 })],
      [cat("CAR", "13", "saldo")],
      [],
    );
    expect(vm.estado).toBe("bloqueado");
    if (vm.estado !== "bloqueado") throw new Error("inalcanzable");
    expect(vm.sinHomologar).toEqual({ cuentas: 1, monto: 300 });
    expect(vm).not.toHaveProperty("modulos");
  });

  it("mide en magnitud y cae al movimiento cuando el saldo final es cero", () => {
    expect(resumenSinHomologar([fila("410505", null, { debitos: 0, creditos: 900 })])).toEqual({
      cuentas: 1,
      monto: 900,
    });
    expect(resumenSinHomologar([fila("130505", "130505", { saldoFinal: 10 })])).toEqual({ cuentas: 0, monto: 0 });
  });
});

describe("prevalidador · exclusión de doble conteo", () => {
  it("señala y excluye la agrupadora cuando coexiste con su descendiente", () => {
    // El borrador dejó como movimiento la agrupadora 1105 y su hija 110505. El
    // prevalidador conserva solamente la hija para no duplicar el mismo importe.
    const filas = [
      fila("1105", "110505", { saldoFinal: 100 }),
      fila("110505", "110505", { saldoFinal: 100 }),
    ];
    const vm = listo(construirPrevalidador(filas, [cat("CAR", "11", "saldo")], []));
    expect(vm.anidamientos).toEqual([
      { cuenta8: "1105", nombreCuenta: "Cuenta 1105", cuenta6Russell: "110505", descendientes: 1 },
    ]);
    const f = buscarFila(vm.modulos, "11");
    expect(f.anidamientos).toEqual(["1105"]);
    expect(f.cliente.saldoFinal).toBe(100);
    expect(f.russell.saldoFinal).toBe(100);
    expect(f.cliente.cuentas).toBe(1);
    expect(f.russell.cuentas).toBe(1);
    expect(f.coincide).toBe(true);
  });

  it("una agrupadora excluida y sin homologar no bloquea a sus hijos homologados", () => {
    const vm = construirPrevalidador(
      [
        fila("1105", null, { saldoFinal: 100 }),
        fila("110505", "110505", { saldoFinal: 100 }),
      ],
      [cat("CAR", "11", "saldo")],
      [],
    );

    expect(vm.estado).toBe("listo");
    const listoVm = listo(vm);
    expect(listoVm.anidamientos.map((a) => a.cuenta8)).toEqual(["1105"]);
    expect(buscarFila(listoVm.modulos, "11").coincide).toBe(true);
  });

  it("detectarAnidamientos cuenta todos los descendientes de un mismo padre", () => {
    const anid = detectarAnidamientos([
      fila("1105"),
      fila("110505"),
      fila("11050501"),
      fila("140505"),
    ]);
    expect(anid.map((a) => [a.cuenta8, a.descendientes])).toEqual([
      ["1105", 2],
      ["110505", 1],
    ]);
  });

  it("un balance sin agrupadoras (tipo Medipiel) no reporta anidamientos", () => {
    // Todo el balance viene en cuentas de movimiento de 8 dígitos, sin filas de grupo
    // ni de subcuenta: la agregación por prefijo funciona igual.
    const vm = listo(
      construirPrevalidador(
        [
          fila("13050501", "130505", { saldoFinal: 100 }),
          fila("13050502", "130510", { saldoFinal: 200 }),
          fila("14100301", "141005", { saldoFinal: 300 }),
        ],
        [cat("CAR", "13", "saldo"), cat("INV", "14", "saldo")],
        [],
      ),
    );
    expect(vm.anidamientos).toEqual([]);
    expect(buscarFila(vm.modulos, "13").cliente.saldoFinal).toBe(300);
    expect(buscarFila(vm.modulos, "14").cliente.saldoFinal).toBe(300);
    expect(vm.filasConDiferencia).toBe(0);
  });
});

describe("prevalidador · agregación por prefijo", () => {
  it("la 1330 de cuentas por pagar también entra en el 13 de cartera", () => {
    // Solapamiento heredado de la plantilla de Russell: el grupo 13 CONTIENE la 1330.
    // Se congela el comportamiento para que cambiarlo sea una decisión de negocio.
    const vm = listo(
      construirPrevalidador(
        [fila("133005", "133005", { saldoFinal: 500 })],
        [cat("CAR", "13", "saldo"), cat("CXP", "1330", "saldo")],
        [],
      ),
    );
    expect(buscarModulo(vm.modulos, "CAR").totalCliente).toBe(500);
    expect(buscarModulo(vm.modulos, "CXP").totalCliente).toBe(500);
  });

  it("una cuenta corta que no comparte el prefijo no cae dentro de él", () => {
    const vm = listo(
      construirPrevalidador(
        [fila("12", "130505", { saldoFinal: 400 }), fila("133005", "133005", { saldoFinal: 100 })],
        [cat("CAR", "13", "saldo"), cat("CXP", "1330", "saldo")],
        [],
      ),
    );
    expect(buscarFila(vm.modulos, "13").cliente.saldoFinal).toBe(100);
    expect(buscarFila(vm.modulos, "1330").cliente.saldoFinal).toBe(100);
    expect(buscarFila(vm.modulos, "1330").cliente.cuentas).toBe(1);
  });

  it("no pinta ceros negativos en cuentas de naturaleza crédito", () => {
    // Un saldo que se anula en una clase crédito da -0 al aplicar el factor: se
    // normaliza para que la tabla no muestre «-0».
    const vm = listo(
      construirPrevalidador(
        [fila("280505", "280505", { saldoFinal: 0 })],
        [cat("CAR", "2805", "saldo")],
        [],
      ),
    );
    const f = buscarFila(vm.modulos, "2805");
    expect(Object.is(f.russell.saldoFinal, -0)).toBe(false);
    expect(Object.is(f.cliente.saldoFinal, -0)).toBe(false);
    expect(Object.is(f.diferencia, -0)).toBe(false);
    expect(Object.is(buscarModulo(vm.modulos, "CAR").totalRussell, -0)).toBe(false);
  });

  it("normaliza los prefijos con espacios y puntos", () => {
    const vm = listo(
      construirPrevalidador(
        [fila(" 110505 ", "110505", { saldoFinal: 70 }), fila("133005", "133005", { saldoFinal: 30 })],
        [cat("CAR", " 11 ", "saldo"), cat("CXP", "13.30", "saldo")],
        [],
      ),
    );
    expect(buscarFila(vm.modulos, "11").cliente.saldoFinal).toBe(70);
    expect(buscarFila(vm.modulos, "1330").cliente.saldoFinal).toBe(30);
  });
});

describe("prevalidador · opciones del selector de cuenta del cliente", () => {
  const FILAS = [
    fila("130505", "130505", { saldoFinal: 1_000 }),
    fila("130510", "130510", { saldoFinal: 500 }),
    fila("410505", "410505", { saldoFinal: -800, debitos: 0, creditos: 800 }),
  ];

  it("ofrece los prefijos de grupo y de cuenta que el balance tiene de verdad", () => {
    const vm = listo(construirPrevalidador(FILAS, [cat("CAR", "13", "saldo")], []));
    expect(vm.opcionesCliente.map((o) => `${o.prefijo}/${o.nivel}`)).toEqual([
      "13/2",
      "1305/4",
      "41/2",
      "4105/4",
    ]);
  });

  it("cada opción trae su saldo, su movimiento y cuántas cuentas agrupa", () => {
    const vm = listo(construirPrevalidador(FILAS, [cat("CAR", "13", "saldo")], []));
    const g13 = vm.opcionesCliente.find((o) => o.prefijo === "13")!;
    expect(g13).toMatchObject({ nivel: 2, cuentas: 2, saldo: 1_500, movimiento: 0 });
    const g41 = vm.opcionesCliente.find((o) => o.prefijo === "41")!;
    expect(g41).toMatchObject({ nivel: 2, cuentas: 1, saldo: -800, movimiento: -800 });
  });

  it("los saldos van en BRUTO: el factor de presentación lo aplica quien pinta", () => {
    // Si vinieran ya con factor, el selector no podría reutilizarlos para una fila
    // del catálogo cuya cuenta Russell sea de otra naturaleza.
    const vm = listo(construirPrevalidador(FILAS, [cat("ING", "41", "movimiento")], []));
    expect(vm.opcionesCliente.find((o) => o.prefijo === "41")!.saldo).toBe(-800);
    // …mientras que la fila del informe sí lo aplica.
    expect(buscarFila(vm.modulos, "41").cliente.saldoFinal).toBe(800);
  });

  it("rotula cada prefijo con la cuenta de mayor cuantía del grupo", () => {
    const vm = listo(
      construirPrevalidador(
        [
          { ...fila("130505", "130505", { saldoFinal: 10 }), nombreCuenta: "Clientes menores" },
          { ...fila("130510", "130510", { saldoFinal: 9_000 }), nombreCuenta: "Clientes nacionales" },
        ],
        [cat("CAR", "13", "saldo")],
        [],
      ),
    );
    expect(vm.opcionesCliente.find((o) => o.prefijo === "13")!.nombre).toBe("Clientes nacionales");
  });

  it("no ofrece como cuenta de 4 dígitos un código más corto que ese nivel", () => {
    // La cuenta "13" ya está en el nivel de grupo; repetirla como «cuenta» confunde.
    const vm = listo(construirPrevalidador([fila("13", "130505", { saldoFinal: 400 })], [cat("CAR", "13", "saldo")], []));
    expect(vm.opcionesCliente).toEqual([
      { prefijo: "13", nivel: 2, cuentas: 1, saldo: 400, movimiento: 0, nombre: "Cuenta 13" },
    ]);
  });
});

describe("prevalidador · catálogo", () => {
  it("sin filas activas no hay informe", () => {
    const filas = [fila("130505", "130505", { saldoFinal: 10 })];
    expect(construirPrevalidador(filas, [], []).estado).toBe("sin_catalogo");
    expect(construirPrevalidador(filas, [cat("CAR", "13", "saldo", { activa: false })], []).estado).toBe(
      "sin_catalogo",
    );
    expect(construirPrevalidador(filas, [cat("CAR", "  ", "saldo")], []).estado).toBe("sin_catalogo");
  });

  it("descarta las filas inactivas que llegaran mezcladas", () => {
    const vm = listo(
      construirPrevalidador(
        [fila("130505", "130505", { saldoFinal: 10 }), fila("140505", "140505", { saldoFinal: 20 })],
        [cat("CAR", "13", "saldo"), cat("INV", "14", "saldo", { activa: false })],
        [],
      ),
    );
    expect(vm.modulos.flatMap((m) => m.filas).map((f) => f.cuentaRussell)).toEqual(["13"]);
  });

  it("ordena los módulos como Russell y las filas por su orden, sin depender del input", () => {
    const vm = listo(
      construirPrevalidador(
        [fila("130505", "130505", { saldoFinal: 10 })],
        [
          cat("NOM", "5205", "movimiento", { orden: 20 }),
          cat("CXP", "2335", "saldo", { orden: 30 }),
          cat("ING", "41", "movimiento"),
          cat("NOM", "5105", "movimiento", { orden: 10 }),
          cat("CXP", "22", "saldo", { orden: 10 }),
          cat("CAR", "13", "saldo"),
        ],
        [],
      ),
    );
    expect(vm.modulos.map((m) => m.codigo)).toEqual(["ING", "CAR", "CXP", "NOM"]);
    expect(buscarModulo(vm.modulos, "CXP").filas.map((f) => f.cuentaRussell)).toEqual(["22", "2335"]);
    expect(buscarModulo(vm.modulos, "NOM").filas.map((f) => f.cuentaRussell)).toEqual(["5105", "5205"]);
  });
});
