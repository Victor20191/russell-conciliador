import { describe, expect, it } from "vitest";
import type { NodoBorrador } from "./borrador";
import {
  FILTROS_COLUMNAS_BORRADOR_INICIALES,
  filtrarArbolBorradorPorColumnas,
  type FiltrosColumnasBorrador,
} from "./filtros-borrador";

function nodo(
  filaNum: number,
  codigo: string,
  parcial: Partial<NodoBorrador> = {},
): NodoBorrador {
  return {
    filaNum,
    codigo,
    codigoCrudo: codigo,
    nombre: `Cuenta ${codigo}`,
    nivel: codigo.length,
    tipoFila: "movimiento",
    tipoFilaForzado: null,
    saldoInicial: 0,
    debitos: 0,
    creditos: 0,
    saldoFinal: 0,
    descuadre: null,
    subtotalDuplicado: false,
    hijos: [],
    ...parcial,
  };
}

function filtros(
  parcial: Partial<FiltrosColumnasBorrador>,
): FiltrosColumnasBorrador {
  return { ...FILTROS_COLUMNAS_BORRADOR_INICIALES, ...parcial };
}

const hojaCaja = nodo(3, "11050501", {
  nombre: "Caja general",
  saldoInicial: 1_000_000,
  debitos: 500_000,
  creditos: 100_000,
  saldoFinal: 1_400_000,
});
const hojaBanco = nodo(5, "11100501", {
  nombre: "Banco nacional",
  saldoInicial: 2_000_000,
  debitos: 250_000,
  creditos: 250_000,
  saldoFinal: 2_000_000,
});
const hojaDeudor = nodo(8, "13050501", {
  nombre: "Cliente varios",
  saldoInicial: 50_000,
  debitos: 0,
  creditos: 75_000,
  saldoFinal: -25_000,
});

const arbol: NodoBorrador[] = [
  nodo(1, "11", {
    nombre: "Disponible",
    tipoFila: "agrupadora",
    hijos: [
      nodo(2, "1105", {
        nombre: "Caja",
        tipoFila: "agrupadora",
        hijos: [hojaCaja],
      }),
      nodo(4, "1110", {
        nombre: "Bancos",
        tipoFila: "agrupadora",
        hijos: [hojaBanco],
      }),
    ],
  }),
  nodo(6, "13", {
    nombre: "Deudores",
    tipoFila: "agrupadora",
    hijos: [
      nodo(7, "1305", {
        nombre: "Clientes",
        tipoFila: "agrupadora",
        hijos: [hojaDeudor],
      }),
    ],
  }),
];

describe("filtrarArbolBorradorPorColumnas", () => {
  it("busca el código por prefijo y no por coincidencias internas", () => {
    const conCodigoInterno = [
      ...arbol,
      nodo(9, "21", {
        nombre: "Obligaciones",
        tipoFila: "agrupadora",
        hijos: [nodo(10, "211005", { nombre: "Cuenta por pagar" })],
      }),
    ];
    const resultado = filtrarArbolBorradorPorColumnas(
      conCodigoInterno,
      filtros({ codigo: "11" }),
    );

    expect(resultado.map((item) => item.codigo)).toEqual(["11"]);
    expect(resultado[0].hijos.map((hijo) => hijo.codigo)).toEqual(["1105", "1110"]);
  });

  it("combina columnas y conserva solo la coincidencia con sus ancestros", () => {
    const resultado = filtrarArbolBorradorPorColumnas(
      arbol,
      filtros({ cuenta: "caja", debito: "> 400000", saldo: "> 1000000" }),
    );

    expect(resultado).toHaveLength(1);
    expect(resultado[0].codigo).toBe("11");
    expect(resultado[0].hijos.map((hijo) => hijo.codigo)).toEqual(["1105"]);
    expect(resultado[0].hijos[0].hijos).toEqual([hojaCaja]);
  });

  it("filtra por código crudo o normalizado", () => {
    const conCrudo = [
      nodo(1, "1105", {
        codigoCrudo: "TOTAL 1105",
        nombre: "Caja subtotal",
        tipoFila: "agrupadora",
        hijos: [hojaCaja],
      }),
    ];
    const porCrudo = filtrarArbolBorradorPorColumnas(
      conCrudo,
      filtros({ codigo: "total" }),
    );
    expect(porCrudo).toHaveLength(1);
    expect(porCrudo[0].codigo).toBe("1105");
  });

  it("filtra saldos negativos y elimina ramas sin coincidencias", () => {
    const resultado = filtrarArbolBorradorPorColumnas(
      arbol,
      filtros({ saldo: "< 0" }),
    );

    expect(resultado.map((item) => item.codigo)).toEqual(["13"]);
    expect(resultado[0].hijos[0].hijos[0].codigo).toBe("13050501");
  });

  it("al filtrar por validación no arrastra agrupadoras de otro estado", () => {
    const conDescuadre = nodo(9, "14050501", {
      nombre: "Anticipo",
      tipoFila: "movimiento",
      descuadre: 80_000,
      saldoFinal: 80_000,
    });
    const rama = [
      nodo(1, "14", {
        nombre: "Deudores varios",
        tipoFila: "agrupadora",
        hijos: [conDescuadre, hojaCaja],
      }),
    ];

    const ok = filtrarArbolBorradorPorColumnas(rama, filtros({ validacion: "ok" }));
    expect(ok.map((item) => item.codigo)).toEqual(["11050501"]);

    const alertas = filtrarArbolBorradorPorColumnas(rama, filtros({ validacion: "alerta" }));
    expect(alertas.map((item) => item.codigo)).toEqual(["14050501"]);
  });

  it("no muta el árbol original y evita clonar cuando no hay filtros", () => {
    expect(filtrarArbolBorradorPorColumnas(arbol, filtros({}))).toBe(arbol);

    filtrarArbolBorradorPorColumnas(arbol, filtros({ codigo: "11050501" }));
    expect(arbol[0].hijos).toHaveLength(2);
  });
});
