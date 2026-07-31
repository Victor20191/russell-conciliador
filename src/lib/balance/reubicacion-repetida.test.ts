import { describe, expect, it } from "vitest";
import { construirArbolBorrador, type FilaBorrador } from "@/lib/balance/borrador";
import {
  contarPendientes,
  destinoDelBloque,
  detectarPropagacionesReubicacion,
  padresEfectivos,
} from "@/lib/balance/reubicacion-repetida";

function fila(
  filaNum: number,
  codigo: string,
  nombre: string,
  tipoFila: FilaBorrador["tipoFila"],
  saldo: number,
  extra: Partial<FilaBorrador> = {},
): FilaBorrador {
  return {
    filaNum,
    codigo,
    codigoCrudo: codigo,
    nombre,
    nivel: codigo.length,
    tipoFila,
    saldoInicial: 0,
    debitos: 0,
    creditos: 0,
    saldoFinal: saldo,
    ...extra,
  };
}

/**
 * Caso real (ACEROS MAPA): el bloque 22/2205/220501/220505 se repite por tercero.
 * `220501 PROVEEDORES` es un encabezado que el ERP repite con el mismo saldo que su
 * detalle `220505 PROVEEDORES NACIONALES`; por código son HERMANAS (ambas de 6 díg),
 * así que la anidación automática nunca cuelga una de la otra.
 */
function bloques(): FilaBorrador[] {
  const out: FilaBorrador[] = [];
  const montos = [-100, -200, -300];
  montos.forEach((monto, i) => {
    const base = 100 + i * 10;
    out.push(fila(base, "22", "PROVEEDORES", "agrupadora", monto));
    out.push(fila(base + 1, "2205", "NACIONALES", "agrupadora", monto));
    out.push(fila(base + 2, "220501", "PROVEEDORES", "agrupadora", monto, { tipoFilaForzado: "agrupadora" }));
    out.push(fila(base + 3, "220505", "PROVEEDORES NACIONALES", "movimiento", monto));
  });
  return out;
}

const arbolDe = (filas: FilaBorrador[]) => padresEfectivos(construirArbolBorrador(filas.map((f) => ({ ...f }))));

describe("destinoDelBloque", () => {
  it("prefiere la ocurrencia más cercana ANTERIOR", () => {
    expect(destinoDelBloque(113, [102, 112, 122])).toBe(112);
  });

  it("cae a la más cercana posterior si el subtotal va después del detalle", () => {
    expect(destinoDelBloque(101, [112, 122])).toBe(112);
  });

  it("ignora la propia fila y devuelve null sin candidatos", () => {
    expect(destinoDelBloque(112, [112])).toBeNull();
    expect(destinoDelBloque(112, [])).toBeNull();
  });
});

describe("detectarPropagacionesReubicacion", () => {
  it("propone el par resuelto en un bloque para los bloques restantes, cada uno con SU agrupadora", () => {
    const filas = bloques();
    // El usuario anidó 220505 bajo 220501 solo en el primer bloque.
    const vigentes = new Map<number, number | null>([[103, 102]]);
    const props = detectarPropagacionesReubicacion(filas, arbolDe(filas), vigentes);

    expect(props).toHaveLength(1);
    expect(props[0].codigoHija).toBe("220505");
    expect(props[0].codigoPadre).toBe("220501");
    expect(props[0].pendientes).toEqual([
      { filaNum: 113, destino: 112 },
      { filaNum: 123, destino: 122 },
    ]);
    expect(contarPendientes(props)).toBe(2);
  });

  it("lee el re-parentado ya PERSISTIDO en la fila (sin cambios en memoria)", () => {
    const filas = bloques();
    filas[3].padreManual = 102; // fila 103 guardada bajo 102
    const props = detectarPropagacionesReubicacion(filas, arbolDe(filas), new Map());
    expect(contarPendientes(props)).toBe(2);
  });

  it("no propone nada cuando todos los bloques ya están anidados", () => {
    const filas = bloques();
    const vigentes = new Map<number, number | null>([[103, 102], [113, 112], [123, 122]]);
    expect(detectarPropagacionesReubicacion(filas, arbolDe(filas), vigentes)).toEqual([]);
  });

  it("respeta una decisión manual distinta en otro bloque", () => {
    const filas = bloques();
    const vigentes = new Map<number, number | null>([[103, 102], [113, 111]]); // 113 colgada a mano de 2205
    const props = detectarPropagacionesReubicacion(filas, arbolDe(filas), vigentes);
    expect(props[0].pendientes).toEqual([{ filaNum: 123, destino: 122 }]);
  });

  it("ignora la fila cuyo padre efectivo YA es una ocurrencia de esa agrupadora", () => {
    // 220505 de 8 díg cuelga por prefijo de 2205 05… — aquí el segundo bloque anida solo.
    const filas = [
      fila(1, "2205", "NACIONALES", "agrupadora", -100),
      fila(2, "220501", "PROVEEDORES", "agrupadora", -100, { tipoFilaForzado: "agrupadora" }),
      fila(3, "220505", "PROVEEDORES NACIONALES", "movimiento", -100),
      fila(4, "2205", "NACIONALES", "agrupadora", -50),
      fila(5, "220501", "PROVEEDORES", "agrupadora", -50, { tipoFilaForzado: "agrupadora" }),
      fila(6, "22050105", "PROVEEDORES NACIONALES", "movimiento", -50),
    ];
    const props = detectarPropagacionesReubicacion(filas, arbolDe(filas), new Map([[3, 2]]));
    expect(props).toEqual([]); // el otro bloque usa otro código de hija: nada que propagar
  });

  it("descarta pares con código no numérico (pies/totales del ERP)", () => {
    const filas = [
      fila(1, "", "TOTAL GENERAL", "total", -100, { codigoCrudo: "Total general" }),
      fila(2, "2205", "NACIONALES", "agrupadora", -100),
      fila(3, "", "PROCESADO EN", "movimiento", 0, { codigoCrudo: "Procesado en:" }),
    ];
    const props = detectarPropagacionesReubicacion(filas, arbolDe(filas), new Map([[3, 2]]));
    expect(props).toEqual([]);
  });

  it("quitar el re-parentado (null vigente) no propone propagación", () => {
    const filas = bloques();
    filas[3].padreManual = 102;
    const props = detectarPropagacionesReubicacion(filas, arbolDe(filas), new Map([[103, null]]));
    expect(props).toEqual([]);
  });
});
