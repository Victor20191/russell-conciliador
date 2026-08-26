import { describe, expect, it } from "vitest";
import type { NodoBalance } from "./calcular";
import {
  FILTROS_COLUMNAS_DETALLE_INICIALES,
  coincideFiltroNumerico,
  filtrarArbolDetallePorColumnas,
  type FiltrosColumnasDetalle,
} from "./filtros-detalle";
import { UMBRALES_ALERTAS_DEFECTO } from "./umbrales-alertas";

function nodo(
  code: string,
  nivel: NodoBalance["nivel"],
  parcial: Partial<NodoBalance> = {},
): NodoBalance {
  return {
    key: `${nivel}:${code}`,
    nivel,
    code,
    name: `Cuenta ${code}`,
    prevBalance: 0,
    balance: 0,
    debe: 0,
    haber: 0,
    variation: null,
    mapped: true,
    saldoOk: true,
    nature: "D",
    critical: false,
    clase: code.charAt(0),
    detalleId: nivel === 8 ? Number(code.slice(-2)) : null,
    std: nivel === 8 ? code.slice(0, 6) : null,
    coincidencia: null,
    pendiente: false,
    hijos: [],
    ...parcial,
  };
}

function filtros(
  parcial: Partial<FiltrosColumnasDetalle>,
): FiltrosColumnasDetalle {
  return { ...FILTROS_COLUMNAS_DETALLE_INICIALES, ...parcial };
}

const hojaCaja = nodo("11050501", 8, {
  name: "Caja general",
  prevBalance: 1_000_000,
  debe: 500_000,
  haber: 100_000,
  balance: 1_400_000,
  variation: 40,
  std: "110505",
});
const hojaBanco = nodo("11100501", 8, {
  name: "Banco nacional",
  prevBalance: 2_000_000,
  debe: 250_000,
  haber: 250_000,
  balance: 2_000_000,
  variation: 0,
  std: "111005",
});
const hojaSinMapeo = nodo("13050599", 8, {
  name: "Cliente sin homologar",
  mapped: false,
  std: null,
  saldoOk: false,
  balance: -75_000,
});
const arbol = [
  nodo("11", 2, {
    name: "Disponible",
    hijos: [
      nodo("1105", 4, {
        hijos: [nodo("110505", 6, { name: "Caja", hijos: [hojaCaja] })],
      }),
      nodo("1110", 4, {
        hijos: [nodo("111005", 6, { name: "Bancos", hijos: [hojaBanco] })],
      }),
    ],
  }),
  nodo("13", 2, {
    name: "Deudores",
    mapped: false,
    hijos: [
      nodo("1305", 4, {
        mapped: false,
        hijos: [nodo("1305-SIN", 6, { mapped: false, hijos: [hojaSinMapeo] })],
      }),
    ],
  }),
];

describe("coincideFiltroNumerico", () => {
  it("admite igualdad y operadores con formato monetario colombiano", () => {
    expect(coincideFiltroNumerico(1_400_000, "$ 1.400.000")).toBe(true);
    expect(coincideFiltroNumerico(1_400_000, ">= 1.000.000")).toBe(true);
    expect(coincideFiltroNumerico(40, "> 25,5")).toBe(true);
    expect(coincideFiltroNumerico(0, "< 0")).toBe(false);
  });

  it("excluye variaciones nulas cuando hay un filtro numérico", () => {
    expect(coincideFiltroNumerico(null, "> 0")).toBe(false);
  });
});

describe("filtrarArbolDetallePorColumnas", () => {
  it("busca el código por prefijo y no por coincidencias internas", () => {
    const conCodigoInterno = [
      ...arbol,
      nodo("21", 2, {
        name: "Obligaciones",
        hijos: [nodo("211005", 6, { name: "Cuenta por pagar" })],
      }),
    ];
    const resultado = filtrarArbolDetallePorColumnas(
      conCodigoInterno,
      filtros({ codigo: "11" }),
      new Set(),
      UMBRALES_ALERTAS_DEFECTO,
    );

    expect(resultado.map((item) => item.code)).toEqual(["11"]);
    expect(resultado[0].hijos.map((hijo) => hijo.code)).toEqual(["1105", "1110"]);
  });

  it("combina columnas y conserva solo la coincidencia con sus ancestros", () => {
    const resultado = filtrarArbolDetallePorColumnas(
      arbol,
      filtros({ cuenta: "caja", debito: "> 400000", variacion: "> 25" }),
      new Set(),
      UMBRALES_ALERTAS_DEFECTO,
    );

    expect(resultado).toHaveLength(1);
    expect(resultado[0].code).toBe("11");
    expect(resultado[0].hijos.map((hijo) => hijo.code)).toEqual(["1105"]);
    expect(resultado[0].hijos[0].hijos[0].hijos).toEqual([hojaCaja]);
  });

  it("filtra el texto visible de mapeo y elimina grupos sin coincidencias", () => {
    const resultado = filtrarArbolDetallePorColumnas(
      arbol,
      filtros({ mapeo: "sin mapeo" }),
      new Set(),
      UMBRALES_ALERTAS_DEFECTO,
    );

    expect(resultado.map((item) => item.code)).toEqual(["13"]);
    expect(resultado[0].hijos[0].hijos[0].hijos[0].code).toBe("13050599");
  });

  it("el filtro de mapeo distingue «pendiente por asignar» de un «sin mapeo» normal", () => {
    const hojaPendiente = nodo("13050598", 8, {
      name: "Cliente pendiente por asignar",
      mapped: false,
      std: null,
      pendiente: true,
      saldoOk: false,
      balance: -1_000,
    });
    const arbolConPendiente = [
      ...arbol,
      nodo("14", 2, {
        name: "Otros deudores",
        mapped: false,
        hijos: [
          nodo("1405", 4, {
            mapped: false,
            hijos: [nodo("1405-SIN", 6, { mapped: false, hijos: [hojaPendiente] })],
          }),
        ],
      }),
    ];

    // «pendiente por asignar» solo aparece en el texto de la hoja marcada: el
    // «sin mapeo» normal (13050599, nunca marcado) queda fuera del resultado.
    const soloPendientes = filtrarArbolDetallePorColumnas(
      arbolConPendiente,
      filtros({ mapeo: "pendiente por asignar" }),
      new Set(),
      UMBRALES_ALERTAS_DEFECTO,
    );
    expect(soloPendientes.map((item) => item.code)).toEqual(["14"]);
    expect(soloPendientes[0].hijos[0].hijos[0].hijos[0].code).toBe("13050598");
  });

  it("distingue alertas y OK, y deja los informativos fuera de ambos", () => {
    const alertas = filtrarArbolDetallePorColumnas(
      arbol,
      filtros({ validacion: "alerta" }),
      new Set(),
      UMBRALES_ALERTAS_DEFECTO,
    );
    expect(alertas.map((item) => item.code)).toEqual(["13050599"]);

    const conOkManual = filtrarArbolDetallePorColumnas(
      arbol,
      filtros({ validacion: "ok" }),
      new Set(["13050599"]),
      UMBRALES_ALERTAS_DEFECTO,
    );
    expect(conOkManual.map((item) => item.code)).toEqual(["110505", "111005", "13050599"]);

    const informativa = nodo("13050598", 8, {
      saldoOk: false,
      balance: -25_000,
      std: null,
      mapped: false,
    });
    expect(filtrarArbolDetallePorColumnas(
      [informativa],
      filtros({ validacion: "alerta" }),
      new Set(),
      UMBRALES_ALERTAS_DEFECTO,
    )).toHaveLength(0);
    expect(filtrarArbolDetallePorColumnas(
      [informativa],
      filtros({ validacion: "ok" }),
      new Set(),
      UMBRALES_ALERTAS_DEFECTO,
    )).toHaveLength(0);
  });

  it("al filtrar por OK no arrastra grupos ni filas de otro estado", () => {
    const resultado = filtrarArbolDetallePorColumnas(
      arbol,
      filtros({ validacion: "ok" }),
      new Set(),
      UMBRALES_ALERTAS_DEFECTO,
    );

    expect(resultado.map((item) => item.code)).toEqual(["110505", "111005"]);
    expect(resultado.every((item) => item.nivel === 6 && item.mapped && item.saldoOk)).toBe(true);
    expect(resultado.flatMap((item) => item.hijos)).toEqual([]);
    expect(resultado.some((item) => item.code === "13" || item.code === "13050599")).toBe(false);
  });

  it("no muta el árbol original y evita clonar cuando no hay filtros", () => {
    expect(filtrarArbolDetallePorColumnas(
      arbol,
      filtros({}),
      new Set(),
      UMBRALES_ALERTAS_DEFECTO,
    )).toBe(arbol);

    filtrarArbolDetallePorColumnas(
      arbol,
      filtros({ codigo: "11050501" }),
      new Set(),
      UMBRALES_ALERTAS_DEFECTO,
    );
    expect(arbol[0].hijos).toHaveLength(2);
  });
});
