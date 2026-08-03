// Regresión: conversión manual movimiento→agrupadora con hijas asignadas por
// `padreManual` (modal «Convertir en agrupadora» del borrador). Las hijas típicas
// son HERMANAS de igual longitud de código, que NUNCA anidan solas — solo cuelgan
// por `padreManual`. La promoción a oficial (`cuentasDesdeStaging`) debe leer ese
// campo del staging Y pasar `preservarAgrupadorasForzadas`; si no, la agrupadora
// convertida queda "huérfana", se revierte a movimiento y su saldo se carga DOBLE.
import { describe, it, expect } from "vitest";
import { reclasificarHuerfanas, construirArbolBorrador, type FilaBorrador } from "@/lib/balance/borrador";

// Staging DESPUÉS de «Guardar cambios»: la 530515 quedó tipoFila=agrupadora +
// tipoFilaForzado=agrupadora, y sus hermanas con padreManual = filaNum de la 530515.
const staging = (): FilaBorrador[] => [
  { filaNum: 1, codigo: "5305", codigoCrudo: "5305", nombre: "FINANCIEROS", nivel: 4, tipoFila: "agrupadora", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 300 },
  { filaNum: 2, codigo: "530515", codigoCrudo: "530515", nombre: "COMISIONES", nivel: 6, tipoFila: "agrupadora", tipoFilaForzado: "agrupadora", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 100, padreManual: null },
  { filaNum: 3, codigo: "530520", codigoCrudo: "530520", nombre: "COMISIONES BANCARIAS", nivel: 6, tipoFila: "movimiento", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 60, padreManual: 2 },
  { filaNum: 4, codigo: "530525", codigoCrudo: "530525", nombre: "COMISIONES TARJETAS", nivel: 6, tipoFila: "movimiento", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 40, padreManual: 2 },
  { filaNum: 5, codigo: "530595", codigoCrudo: "530595", nombre: "OTROS", nivel: 6, tipoFila: "movimiento", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 200, padreManual: null },
];

function imputables(filas: FilaBorrador[]): { codigo: string; saldo: number }[] {
  return filas.filter((f) => f.tipoFila === "movimiento" && !f.omitida).map((f) => ({ codigo: f.codigo, saldo: f.saldoFinal }));
}

describe("agrupadora manual con hijas por padreManual (promoción a oficial)", () => {
  it("documenta el bug: sin padreManual ni preservar, la conversión se revierte y cuenta doble", () => {
    // Así leía la promoción el staging (perdía padreManual y no preservaba forzadas).
    const filas = staging().map((f) => ({ ...f, padreManual: null }));
    reclasificarHuerfanas(filas);
    const mov = imputables(filas);
    expect(mov.map((m) => m.codigo)).toContain("530515"); // se revirtió
    expect(mov.reduce((s, m) => s + m.saldo, 0)).toBe(400); // 100 DOBLE + 60 + 40 + 200
  });

  it("con padreManual + preservarAgrupadorasForzadas no hay doble conteo y las hijas cuelgan", () => {
    const filas = staging();
    reclasificarHuerfanas(filas, { preservarAgrupadorasForzadas: true });
    const mov = imputables(filas);
    expect(mov.map((m) => m.codigo)).not.toContain("530515");
    expect(mov.reduce((s, m) => s + m.saldo, 0)).toBe(300); // 60 + 40 + 200

    const arbol = construirArbolBorrador(staging().map((f) => ({ ...f })));
    const buscar = (ns: typeof arbol, c: string): (typeof arbol)[number] | null => {
      for (const n of ns) { if (n.codigo === c) return n; const h = buscar(n.hijos, c); if (h) return h; }
      return null;
    };
    const agr = buscar(arbol, "530515")!;
    expect(agr.hijos.map((h) => h.codigo).sort()).toEqual(["530520", "530525"]);
    expect(agr.descuadre).toBe(0);
  });

  it("una agrupadora forzada SIN hijas (0 movimientos elegidos) tampoco se revierte", () => {
    const filas = staging().map((f) => ({ ...f, padreManual: null }));
    reclasificarHuerfanas(filas, { preservarAgrupadorasForzadas: true });
    expect(imputables(filas).map((m) => m.codigo)).not.toContain("530515");
  });
});
