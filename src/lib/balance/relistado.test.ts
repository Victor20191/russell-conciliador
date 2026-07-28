import { describe, it, expect } from "vitest";
import { esFilaGuionRedundante, marcarRelistadoGuiones, codigosPlanos } from "./relistado";
import { construirVistaBorrador } from "./borrador-vm";
import type { FilaBorrador } from "./borrador";

function fila(filaNum: number, codigo: string, nombre: string, saldoFinal: number, tipo: FilaBorrador["tipoFila"], extra: Partial<FilaBorrador> = {}): FilaBorrador {
  return { filaNum, codigo, codigoCrudo: codigo, nombre, nivel: codigo.length || null, tipoFila: tipo, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal, ...extra };
}
// Fila del re-listado con guiones: crudo "1105-05-04" pero código normalizado truncado a "1105".
const guion = (fn: number, crudo: string, nombre: string, saldo: number, tipo: FilaBorrador["tipoFila"]) =>
  fila(fn, "1105", nombre, saldo, tipo, { codigoCrudo: crudo });

describe("esFilaGuionRedundante", () => {
  const planos = codigosPlanos([{ codigoCrudo: "11050504" }, { codigoCrudo: "110505" }]);
  it("marca una fila con guiones cuyo equivalente plano YA existe", () => {
    expect(esFilaGuionRedundante({ codigoCrudo: "1105-05-04" }, planos)).toBe(true);
    expect(esFilaGuionRedundante({ codigoCrudo: "1105-05-04" }, codigosPlanos([]))).toBe(false); // sin plano gemelo
  });
  it("NO marca una fila plana, ni un «código-nombre», ni un código sin guiones", () => {
    expect(esFilaGuionRedundante({ codigoCrudo: "11050504" }, planos)).toBe(false); // plano
    expect(esFilaGuionRedundante({ codigoCrudo: "11050501-CAJA" }, planos)).toBe(false); // guion+nombre, no todo dígitos
    expect(esFilaGuionRedundante({ codigoCrudo: "1105" }, planos)).toBe(false);
  });
});

describe("marcarRelistadoGuiones", () => {
  it("MARCA como omitidas las redundantes; conserva planas y huérfanas sin plano; devuelve el conteo", () => {
    const filas: FilaBorrador[] = [
      fila(1, "11050504", "DOLARES", 60, "movimiento"), // plano
      guion(2, "1105-05-04", "DOLARES", 60, "agrupadora"), // redundante (tiene plano) → omitida
      guion(3, "1105-05-04", "*SIN NOMBRE*", -30, "movimiento"), // redundante → omitida
      guion(4, "1130-05-02", "OTRA", 5, "movimiento"), // SIN plano gemelo → intacta
    ];
    const n = marcarRelistadoGuiones(filas);
    expect(n).toBe(2);
    expect(filas.map((f) => f.omitida)).toEqual([undefined, true, true, undefined]);
    // No se pierde ninguna fila: siguen todas presentes (tachadas, no quitadas).
    expect(filas.length).toBe(4);
  });

  it("RESPETA el rescate del usuario: una redundante con omitida=false no se re-marca", () => {
    const filas: FilaBorrador[] = [
      fila(1, "11050504", "DOLARES", 60, "movimiento"),
      guion(2, "1105-05-04", "DOLARES", 60, "agrupadora", ), // se rescató a mano
    ];
    filas[1].omitida = false; // el usuario la incluyó con «Incluir»
    const n = marcarRelistadoGuiones(filas);
    expect(n).toBe(0);
    expect(filas[1].omitida).toBe(false); // sigue rescatada
  });
});

describe("marcarRelistadoGuiones + construirVistaBorrador", () => {
  it("marca el re-listado como omitido: sigue en el árbol tachado, no cuenta y el balance cuadra", () => {
    const filas: FilaBorrador[] = [
      fila(1, "1", "ACTIVO", 100, "agrupadora"),
      fila(2, "11", "DISPONIBLE", 100, "agrupadora"),
      fila(3, "1105", "CAJA", 100, "agrupadora"),
      fila(4, "110505", "CAJA", 100, "agrupadora"), // = 0 + 60 + 40
      fila(5, "11050501", "CAJA GENERAL", 0, "movimiento"),
      fila(6, "11050504", "DOLARES EN CAJA", 60, "movimiento"),
      fila(7, "11050508", "CAJA ECOMMERCE", 40, "movimiento"),
      // Re-listado con guiones (redundante): mismas cuentas, notación con guiones + *SIN NOMBRE*.
      guion(8, "1105-05-04", "DOLARES EN CAJA", 60, "agrupadora"),
      guion(9, "1105-05-04", "*SIN NOMBRE*", -30, "movimiento"),
    ];
    const vista = construirVistaBorrador(filas);
    expect(vista.relistadoGuiones).toBe(2); // se marcaron las 2 filas con guiones
    expect(vista.filasContabilizadas).toEqual([5, 6, 7]); // las filas tachadas no pueden justificar diferencias
    // Los nodos con guiones SIGUEN en el árbol pero marcados OMITIDOS (no se pierden).
    const conGuion: { crudo: string; omitida: boolean }[] = [];
    const rec = (n: { codigoCrudo?: string; omitida?: boolean; hijos: unknown[] }) => {
      if (/-/.test(n.codigoCrudo ?? "")) conGuion.push({ crudo: n.codigoCrudo!, omitida: !!n.omitida });
      (n.hijos as typeof n[]).forEach(rec);
    };
    vista.arbol.forEach((r) => rec(r as never));
    expect(conGuion.length).toBe(2);
    expect(conGuion.every((c) => c.omitida)).toBe(true);
    // 110505 cuadra con sus 3 hojas planas (0 + 60 + 40 = 100) → sin Δ; el re-listado no cuenta.
    const encontrar = (nodos: typeof vista.arbol, cod: string): (typeof vista.arbol)[number] | undefined => {
      for (const n of nodos) { if (n.codigo === cod) return n; const h = encontrar(n.hijos, cod); if (h) return h; }
      return undefined;
    };
    expect(encontrar(vista.arbol, "110505")?.descuadre).toBe(0);
    expect(Math.round(vista.validacion.activo)).toBe(100);
  });
});
