import { describe, expect, it } from "vitest";
import { compactarFilas, expandirFilas } from "./filas-compactas";
import type { FilaBorrador } from "./borrador";

const fila = (sobrescribir: Partial<FilaBorrador> & { filaNum: number }): FilaBorrador => ({
  codigo: "110505",
  codigoCrudo: "110505",
  nombre: "Caja general",
  nivel: 3,
  tipoFila: "movimiento",
  tipoFilaForzado: null,
  desacoplada: false,
  omitida: undefined,
  padreManual: null,
  saldoInicial: 100.5,
  debitos: 20,
  creditos: -5.25,
  saldoFinal: 125.75,
  ...sobrescribir,
});

describe("filas-compactas (ida y vuelta sin pérdida)", () => {
  it("reproduce exactamente todas las combinaciones de campos", () => {
    const filas: FilaBorrador[] = [
      fila({ filaNum: 1, codigo: "1", codigoCrudo: "1", nombre: "Activo", nivel: 1, tipoFila: "agrupadora" }),
      // Tri-estado de `omitida`: sin tocar / omitida / rescatada a mano.
      fila({ filaNum: 2, omitida: undefined }),
      fila({ filaNum: 3, omitida: true, tipoFila: "total", nivel: null }),
      fila({ filaNum: 4, omitida: false, tipoFila: "descuadre" }),
      // Overrides manuales y montos con signo/decimales.
      fila({ filaNum: 5, tipoFilaForzado: "agrupadora", desacoplada: true, padreManual: 2 }),
      fila({ filaNum: 6, tipoFilaForzado: "movimiento", saldoInicial: -0.004388, saldoFinal: 21051833734.96 }),
      // Textos repetidos (diccionario) y unicode.
      fila({ filaNum: 7, nombre: "Caja general" }),
      fila({ filaNum: 8, codigo: "", codigoCrudo: "Señal · año", nombre: "Señal · año" }),
    ];
    const compactas = compactarFilas(filas);
    expect(expandirFilas(compactas)).toEqual(filas);
    // El diccionario deduplica: "Caja general" y "110505" aparecen UNA vez.
    expect(compactas.textos.filter((t) => t === "Caja general")).toHaveLength(1);
    expect(compactas.textos.filter((t) => t === "110505")).toHaveLength(1);
  });

  it("conserva el tri-estado de omitida tras serializar a JSON (Data Cache / RSC)", () => {
    const filas = [fila({ filaNum: 1, omitida: undefined }), fila({ filaNum: 2, omitida: true }), fila({ filaNum: 3, omitida: false })];
    const viajadas = JSON.parse(JSON.stringify(compactarFilas(filas)));
    expect(expandirFilas(viajadas).map((f) => f.omitida)).toEqual([undefined, true, false]);
  });

  it("compacta de verdad: una fila repetida n veces no repite sus textos", () => {
    const filas = Array.from({ length: 500 }, (_, i) => fila({ filaNum: i + 1 }));
    const compactas = compactarFilas(filas);
    expect(compactas.textos).toHaveLength(2); // "110505" + "Caja general"
    const pesoCompacto = JSON.stringify(compactas).length;
    const pesoObjetos = JSON.stringify(filas).length;
    expect(pesoCompacto).toBeLessThan(pesoObjetos / 2);
  });
});
