import { describe, expect, it } from "vitest";
import {
  agruparPorCorte,
  balancesVigentesDelCorte,
  claveCorte,
  estadoDelCorte,
  etiquetaCorte,
  fechaCorteISO,
  lineasDelCorte,
  motivoVersionSobreCerrada,
  nombreLinea,
  parOrdenado,
  paresEsperados,
  vigenteCerradaDeLaLinea,
  type EncabezadoCorte,
} from "./corte";

const DIC = new Date(Date.UTC(2025, 11, 31));
let siguienteId = 1;
const enc = (over: Partial<EncabezadoCorte> & { version?: string } = {}): EncabezadoCorte & { version: string } => ({
  id: siguienteId++, clienteId: 7, periodo: "Diciembre 2025", periodoFin: DIC, aperturaBalance: "cuenta",
  creadoEn: new Date(Date.UTC(2026, 0, siguienteId)), estaCongelado: false, version: "v1", ...over,
});

describe("clave y etiqueta del corte", () => {
  it("usa la fecha fin exacta, sin zona horaria", () => {
    expect(fechaCorteISO(DIC)).toBe("2025-12-31");
    expect(fechaCorteISO("2025-12-31")).toBe("2025-12-31");
    expect(claveCorte({ clienteId: 7, periodoFin: DIC })).toBe("7::2025-12-31");
    expect(etiquetaCorte(DIC)).toBe("Corte 31/12/2025");
  });

  it("agrupa el mensual, el anual y el por terceros que terminan el mismo día", () => {
    const mensual = enc();
    const anual = enc({ periodo: "Enero 2025 – Diciembre 2025" });
    const terceros = enc({ aperturaBalance: "tercero" });
    const otroCliente = enc({ clienteId: 8 });
    const noviembre = enc({ periodo: "Noviembre 2025", periodoFin: new Date(Date.UTC(2025, 10, 30)) });
    const grupos = agruparPorCorte([mensual, anual, terceros, otroCliente, noviembre]);
    expect(grupos.get("7::2025-12-31")).toEqual([mensual, anual, terceros]);
    expect(grupos.size).toBe(3);
  });
});

describe("líneas y vigentes del corte", () => {
  it("la vigente de cada línea es la versión más reciente", () => {
    const v1 = enc({ version: "v1", creadoEn: new Date(Date.UTC(2026, 0, 1)) });
    const v2 = enc({ version: "v2", creadoEn: new Date(Date.UTC(2026, 0, 5)) });
    const terceros = enc({ aperturaBalance: "tercero", version: "v3" });
    const lineas = lineasDelCorte([v1, v2, terceros]);
    expect(lineas).toHaveLength(2);
    const cuenta = lineas.find((l) => l.apertura === "cuenta")!;
    expect(cuenta.vigente).toBe(v2);
    expect(cuenta.versiones).toEqual([v2, v1]);
    expect(balancesVigentesDelCorte([v1, v2, terceros]).map((b) => b.id).sort()).toEqual([v2.id, terceros.id].sort());
  });

  it("el mensual y el anual del mismo corte son líneas distintas", () => {
    expect(lineasDelCorte([enc(), enc({ periodo: "Enero 2025 – Diciembre 2025" })])).toHaveLength(2);
  });

  it("pliega el cargue legado sobre la única apertura declarada de su período", () => {
    const legado = enc({ aperturaBalance: null, creadoEn: new Date(Date.UTC(2025, 0, 1)) });
    const declarado = enc({ aperturaBalance: "cuenta" });
    const lineas = lineasDelCorte([legado, declarado]);
    expect(lineas).toHaveLength(1);
    expect(lineas[0].vigente).toBe(declarado);
  });

  it("a igual fecha de carga gana el id mayor", () => {
    const fecha = new Date(Date.UTC(2026, 0, 1));
    const a = enc({ creadoEn: fecha });
    const b = enc({ creadoEn: fecha });
    expect(lineasDelCorte([a, b])[0].vigente).toBe(b);
  });

  it("nombra la línea con su apertura", () => {
    expect(nombreLinea({ periodo: "Diciembre 2025", aperturaBalance: "tercero" })).toBe("Diciembre 2025 · Por terceros");
    expect(nombreLinea({ periodo: "Diciembre 2025", apertura: null })).toBe("Diciembre 2025");
  });
});

describe("pares y estado del corte", () => {
  it("ordena el par y enumera todas las combinaciones", () => {
    expect(parOrdenado(9, 3)).toEqual({ balanceAId: 3, balanceBId: 9 });
    expect(paresEsperados([{ id: 5 }, { id: 2 }, { id: 9 }])).toEqual([
      { balanceAId: 2, balanceBId: 5 }, { balanceAId: 5, balanceBId: 9 }, { balanceAId: 2, balanceBId: 9 },
    ]);
  });

  it("un solo vigente es único", () => {
    expect(estadoDelCorte([{ id: 1 }], [])).toBe("unico");
  });

  it("consistente solo cuando todos los pares están comparados y coinciden", () => {
    const vigentes = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(estadoDelCorte(vigentes, [
      { balanceAId: 1, balanceBId: 2, inconsistente: false },
      { balanceAId: 1, balanceBId: 3, inconsistente: false },
    ])).toBe("sin_comparar");
    expect(estadoDelCorte(vigentes, [
      { balanceAId: 1, balanceBId: 2, inconsistente: false },
      { balanceAId: 1, balanceBId: 3, inconsistente: false },
      { balanceAId: 2, balanceBId: 3, inconsistente: false },
    ])).toBe("consistente");
  });

  it("una diferencia hace inconsistente al corte aunque falten pares", () => {
    expect(estadoDelCorte([{ id: 1 }, { id: 2 }, { id: 3 }], [{ balanceAId: 2, balanceBId: 3, inconsistente: true }])).toBe("inconsistente");
  });

  it("ignora pares de balances que ya no son vigentes", () => {
    expect(estadoDelCorte([{ id: 1 }, { id: 2 }], [
      { balanceAId: 1, balanceBId: 2, inconsistente: false },
      { balanceAId: 1, balanceBId: 99, inconsistente: true },
    ])).toBe("consistente");
  });
});

describe("versión nueva sobre una vigente cerrada", () => {
  it("bloquea cuando la vigente de la misma línea está cerrada", () => {
    const cerrada = enc({ version: "v3", estaCongelado: true });
    const hallada = vigenteCerradaDeLaLinea([cerrada], { clienteId: 7, periodo: "Diciembre 2025", periodoFin: DIC, aperturaBalance: "cuenta" });
    expect(hallada).toBe(cerrada);
    expect(motivoVersionSobreCerrada(cerrada)).toBe("La versión v3 de Diciembre 2025 · Por cuenta está cerrada: ábrela con «Abrir balance» antes de cargar una versión nueva.");
  });

  it("no bloquea si la cerrada es de otra línea del corte", () => {
    const cerradaTerceros = enc({ aperturaBalance: "tercero", estaCongelado: true });
    const cerradaAnual = enc({ periodo: "Enero 2025 – Diciembre 2025", estaCongelado: true });
    expect(vigenteCerradaDeLaLinea([cerradaTerceros, cerradaAnual], { clienteId: 7, periodo: "Diciembre 2025", periodoFin: DIC, aperturaBalance: "cuenta" })).toBeNull();
  });

  it("no bloquea si la vigente está abierta aunque una anterior siga cerrada", () => {
    const vieja = enc({ estaCongelado: true, creadoEn: new Date(Date.UTC(2025, 0, 1)) });
    const abierta = enc({ creadoEn: new Date(Date.UTC(2026, 0, 1)) });
    expect(vigenteCerradaDeLaLinea([vieja, abierta], { clienteId: 7, periodo: "Diciembre 2025", periodoFin: DIC, aperturaBalance: "cuenta" })).toBeNull();
  });

  it("un legado cerrado sin apertura es la misma línea que el nuevo cuando es la única", () => {
    const legado = enc({ aperturaBalance: null, estaCongelado: true });
    expect(vigenteCerradaDeLaLinea([legado], { clienteId: 7, periodo: "Diciembre 2025", periodoFin: DIC, aperturaBalance: "cuenta" })).toBe(legado);
  });
});
