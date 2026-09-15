import { describe, expect, it } from "vitest";
import type { FilaBorrador } from "./borrador";
import {
  desplazarFilas,
  detectarCuentasRepetidasEntrePartes,
  leerPartesArchivo,
  nombreArchivosCargue,
  pareceArchivoRepetido,
  parteDeFila,
  partesDelLote,
  tamanoArchivosCargue,
  validarCoherenciaParte,
  type ParteArchivoBalance,
} from "./partes-archivo";

function parte(numero: number, filaDesde: number, filaHasta: number, nombre = `P${numero}.xls`): ParteArchivoBalance {
  return {
    numero, solicitudId: numero === 1 ? null : `sol-${numero}`, archivoNombre: nombre, archivoTam: `${numero} MB`,
    filaDesde, filaHasta, filas: filaHasta - filaDesde + 1, agregadoPor: "Ana", agregadoEn: "2026-09-15T10:00:00.000Z",
  };
}

function fila(filaNum: number, codigo: string, extra: Partial<FilaBorrador> = {}): FilaBorrador {
  return {
    filaNum, codigo, codigoCrudo: codigo, nombre: `Cuenta ${codigo}`, nivel: codigo.length, tipoFila: "movimiento",
    saldoInicial: 0, debitos: 100, creditos: 40, saldoFinal: 60, ...extra,
  };
}

describe("leerPartesArchivo", () => {
  it("ordena por número y descarta entradas inválidas", () => {
    const partes = leerPartesArchivo([
      parte(2, 11, 20),
      { numero: "x", filaDesde: 1, filaHasta: 2, archivoNombre: "a" },
      null,
      parte(1, 1, 10),
    ]);
    expect(partes.map((p) => p.numero)).toEqual([1, 2]);
  });

  it("un valor que no es arreglo es un borrador sin registro", () => {
    expect(leerPartesArchivo(null)).toEqual([]);
    expect(leerPartesArchivo({ numero: 1 })).toEqual([]);
  });
});

describe("partesDelLote", () => {
  it("sin registro, el lote es una sola parte que cubre todo el staging", () => {
    const partes = partesDelLote(null, {
      archivoNombre: "ESF.xls", archivoTam: "6,4 MB", cargadoPor: "Ana", creadoEn: new Date("2026-09-15T08:00:00Z"),
    }, { maxFilaNum: 50_444, filas: 506 });
    expect(partes).toEqual([{
      numero: 1, solicitudId: null, archivoNombre: "ESF.xls", archivoTam: "6,4 MB", filaDesde: 1, filaHasta: 50_444,
      filas: 506, agregadoPor: "Ana", agregadoEn: "2026-09-15T08:00:00.000Z",
    }]);
  });

  it("con registro, lo respeta", () => {
    const registro = [parte(1, 1, 10), parte(2, 11, 30)];
    expect(partesDelLote(registro, { archivoNombre: "x", archivoTam: null, cargadoPor: null, creadoEn: null }, { maxFilaNum: 30, filas: 25 }))
      .toHaveLength(2);
  });
});

describe("desplazarFilas", () => {
  it("corre filaNum y el re-parentado manual, sin mutar la entrada", () => {
    const originales = [fila(1, "11"), fila(2, "1105", { padreManual: 1 }), fila(3, "110505", { padreManual: null })];
    const desplazadas = desplazarFilas(originales, 50_444);
    expect(desplazadas.map((f) => [f.filaNum, f.padreManual ?? null])).toEqual([
      [50_445, null], [50_446, 50_445], [50_447, null],
    ]);
    expect(originales[1].filaNum).toBe(2);
    expect(originales[1].padreManual).toBe(1);
  });
});

describe("nombres y rangos", () => {
  const partes = [parte(1, 1, 50_444, "ESF.xls"), parte(2, 50_445, 101_717, "ER.xls")];

  it("compone nombre y tamaño del cargue", () => {
    expect(nombreArchivosCargue(partes)).toBe("ESF.xls + ER.xls");
    expect(tamanoArchivosCargue(partes)).toBe("1 MB + 2 MB");
    expect(tamanoArchivosCargue([{ archivoTam: null }])).toBeNull();
  });

  it("ubica la parte de cada fila", () => {
    expect(parteDeFila(partes, 1)).toBe(1);
    expect(parteDeFila(partes, 50_444)).toBe(1);
    expect(parteDeFila(partes, 50_445)).toBe(2);
    expect(parteDeFila(partes, 200_000)).toBeNull();
  });
});

describe("validarCoherenciaParte", () => {
  const base = { nit: "890920001-4", periodoInicial: "2025-01-01", periodoFinal: "2025-12-31" };

  it("acepta el mismo NIT con o sin dígito de verificación", () => {
    expect(validarCoherenciaParte(base, { ...base, nit: "890920001" })).toBeNull();
  });

  it("rechaza otro NIT", () => {
    expect(validarCoherenciaParte(base, { ...base, nit: "900123456" })).toMatch(/mismo cliente/);
  });

  it("rechaza otra fecha de corte o de inicio", () => {
    expect(validarCoherenciaParte(base, { ...base, periodoFinal: "2025-11-30" })).toMatch(/mismo período/);
    expect(validarCoherenciaParte(base, { ...base, periodoInicial: "2025-12-01" })).toMatch(/mismo período/);
  });

  it("no rechaza lo que un lado no detectó", () => {
    expect(validarCoherenciaParte(base, { nit: null, periodoInicial: null, periodoFinal: null })).toBeNull();
    expect(validarCoherenciaParte({ nit: null, periodoInicial: null, periodoFinal: null }, base)).toBeNull();
  });
});

describe("pareceArchivoRepetido", () => {
  const mov = (codigo: string, saldoFinal: number) => ({ codigo, debitos: 10, creditos: 5, saldoFinal });

  it("detecta el mismo archivo subido otra vez", () => {
    const existentes = [mov("11050501", 60), mov("11100502", 70), mov("13050501", 80)];
    expect(pareceArchivoRepetido(existentes, [...existentes])).toBe(true);
  });

  it("una parte distinta con una cuenta en común no es repetida", () => {
    const existentes = [mov("11050501", 60), mov("11100502", 70)];
    expect(pareceArchivoRepetido(existentes, [mov("11050501", 60), mov("41200506", 1), mov("51050601", 2)])).toBe(false);
  });

  it("los mismos códigos con otros importes no son el mismo archivo", () => {
    expect(pareceArchivoRepetido([mov("11050501", 60)], [mov("11050501", 61)])).toBe(false);
  });

  it("sin cuentas numéricas no concluye nada", () => {
    expect(pareceArchivoRepetido([mov("", 1)], [mov("", 1)])).toBe(false);
  });
});

describe("detectarCuentasRepetidasEntrePartes", () => {
  const partes = [parte(1, 1, 100), parte(2, 101, 200)];

  it("con una sola parte no informa nada", () => {
    expect(detectarCuentasRepetidasEntrePartes([fila(1, "110505"), fila(2, "110505")], [parte(1, 1, 100)])).toEqual([]);
  });

  it("ignora agrupadoras repetidas: cada archivo trae su subtotal parcial", () => {
    const filas = [
      fila(1, "2", { tipoFila: "agrupadora", saldoFinal: -10 }),
      fila(101, "2", { tipoFila: "agrupadora", saldoFinal: 0 }),
    ];
    expect(detectarCuentasRepetidasEntrePartes(filas, partes)).toEqual([]);
  });

  it("marca importes idénticos como probable duplicado", () => {
    const [r] = detectarCuentasRepetidasEntrePartes([fila(5, "11050501"), fila(105, "11050501")], partes);
    expect(r.codigo).toBe("11050501");
    expect(r.importesIguales).toBe(true);
    expect(r.ocurrencias.map((o) => [o.parte, o.filaNum])).toEqual([[1, 5], [2, 105]]);
  });

  it("importes distintos: se informa como suma, no como duplicado", () => {
    const [r] = detectarCuentasRepetidasEntrePartes([fila(5, "41200506"), fila(105, "41200506", { creditos: 90 })], partes);
    expect(r.importesIguales).toBe(false);
  });

  it("una omisión resuelve el aviso y una repetición dentro de la misma parte no cuenta", () => {
    expect(detectarCuentasRepetidasEntrePartes([fila(5, "11050501"), fila(105, "11050501", { omitida: true })], partes)).toEqual([]);
    expect(detectarCuentasRepetidasEntrePartes([fila(5, "11050501"), fila(6, "11050501")], partes)).toEqual([]);
  });

  it("respeta la clasificación forzada por el auditor", () => {
    const filas = [fila(5, "1105"), fila(105, "1105", { tipoFilaForzado: "agrupadora" })];
    expect(detectarCuentasRepetidasEntrePartes(filas, partes)).toEqual([]);
  });
});
