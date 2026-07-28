import { describe, expect, it } from "vitest";
import type { ManipulacionRiesgosaBorrador } from "./borrador";
import {
  construirNotasAprobacionBalance,
  construirRevisionesReubicacionBalance,
  evaluarRevisionesReubicacionStaging,
  nombreClaseContable,
  parsearRevisionesReubicacionBalance,
} from "./revisiones-reubicacion-balance";
import type { FilaStagingCorreccion } from "./correcciones";

const riesgo: ManipulacionRiesgosaBorrador = {
  filaNum: 737,
  codigo: "28059501",
  codigoCrudo: "28059501",
  nombre: "CONSIGNACIONES SIN IDENTIFICAR",
  monto: -302_477_965.9,
  claseOrigen: "2",
  claseDestino: "1",
  destino: {
    filaNum: 60,
    codigo: "13170103",
    codigoCrudo: "13170103",
    nombre: "EDUCACION FORMAL-SUPERIOR",
  },
};

describe("revisiones de reubicación en el balance oficial", () => {
  it("une únicamente riesgos que tienen una revisión aprobada", () => {
    const revisiones = construirRevisionesReubicacionBalance(
      [riesgo, { ...riesgo, filaNum: 910 }],
      [{
        filaNum: 737,
        justificacion: "Movimiento validado por criterio contable.",
        revisadaPor: "Victor Rivera",
        revisadaEn: "2026-07-28T15:00:00.000Z",
      }],
    );

    expect(revisiones).toHaveLength(1);
    expect(revisiones[0]).toMatchObject({
      filaNum: 737,
      codigo: "28059501",
      claseOrigen: "2",
      claseDestino: "1",
      destinoCodigo: "13170103",
    });
  });

  it("conserva la nota adicional y la justificación como constancia de la versión", () => {
    const [revision] = construirRevisionesReubicacionBalance(
      [riesgo],
      [{
        filaNum: 737,
        justificacion: "Movimiento validado por criterio contable.",
        revisadaPor: "Victor Rivera",
        revisadaEn: "2026-07-28T15:00:00.000Z",
      }],
    );
    const nota = construirNotasAprobacionBalance(
      "Diferencia del archivo confirmada con el cliente.",
      [revision],
    );

    expect(nota).toContain("Nota aclaratoria adicional:");
    expect(nota).toContain("Reubicaciones contables aprobadas:");
    expect(nota).toContain("28059501 CONSIGNACIONES SIN IDENTIFICAR");
    expect(nota).toContain("Pasivo → Activo");
    expect(nota).toContain("justificación: Movimiento validado por criterio contable.");
    expect(nota).toContain("revisada por Victor Rivera");
  });

  it("conserva cada tipo de constancia aunque el otro no exista", () => {
    const [revision] = construirRevisionesReubicacionBalance(
      [riesgo],
      [{
        filaNum: 737,
        justificacion: "Movimiento validado por criterio contable.",
        revisadaPor: "Victor Rivera",
        revisadaEn: "2026-07-28T15:00:00.000Z",
      }],
    );
    expect(construirNotasAprobacionBalance(null, [revision])).toContain(
      "Reubicaciones contables aprobadas:",
    );
    expect(construirNotasAprobacionBalance("Nota de la fuente.", [])).toBe(
      "Nota aclaratoria adicional:\nNota de la fuente.",
    );
  });

  it("ordena y deduplica varias revisiones por fila", () => {
    const revisiones = construirRevisionesReubicacionBalance(
      [
        { ...riesgo, filaNum: 910 },
        riesgo,
        riesgo,
      ],
      [
        { filaNum: 910, justificacion: "Segunda revisión válida.", revisadaPor: null, revisadaEn: "2026-07-28T16:00:00.000Z" },
        { filaNum: 737, justificacion: "Primera revisión válida.", revisadaPor: null, revisadaEn: "2026-07-28T15:00:00.000Z" },
      ],
    );
    expect(revisiones.map((revision) => revision.filaNum)).toEqual([737, 910]);
  });

  it("bloquea el riesgo sin revisión y no transfiere una revisión cuyo riesgo ya no existe", () => {
    const filaBase: FilaStagingCorreccion = {
      filaNum: 737,
      codigo: "28059501",
      codigoCrudo: "28059501",
      nombre: "CONSIGNACIONES SIN IDENTIFICAR",
      tipoFila: "movimiento",
      tipoFilaForzado: null,
      saldoInicial: 0,
      debitos: 0,
      creditos: 0,
      saldoFinal: -302_477_965.9,
      desacoplada: false,
      omitida: null,
      padreManual: 60,
    };
    const destino: FilaStagingCorreccion = {
      ...filaBase,
      filaNum: 60,
      codigo: "13170103",
      codigoCrudo: "13170103",
      nombre: "EDUCACION FORMAL-SUPERIOR",
      tipoFila: "agrupadora",
      saldoFinal: 0,
      padreManual: null,
    };
    expect(evaluarRevisionesReubicacionStaging([destino, filaBase])).toMatchObject({
      riesgosPendientes: [{ filaNum: 737 }],
      revisionesAprobadas: [],
    });

    const revisionSinRiesgo = {
      ...filaBase,
      padreManual: null,
      justificacionReubicacion: "La revisión antigua no debe transferirse.",
      reubicacionRevisadaPor: "Victor Rivera",
      reubicacionRevisadaEn: new Date("2026-07-28T15:00:00.000Z"),
    };
    expect(evaluarRevisionesReubicacionStaging([destino, revisionSinRiesgo])).toEqual({
      riesgosPendientes: [],
      revisionesAprobadas: [],
    });
  });

  it("devuelve null cuando no hay ninguna constancia para transferir", () => {
    expect(construirNotasAprobacionBalance(null, [])).toBeNull();
  });
});

describe("constancia estructurada guardada en el balance oficial", () => {
  const revisiones = construirRevisionesReubicacionBalance(
    [riesgo],
    [{
      filaNum: 737,
      justificacion: "Movimiento validado por criterio contable.",
      revisadaPor: "Victor Rivera",
      revisadaEn: "2026-07-28T15:00:00.000Z",
    }],
  );

  it("reconstruye la ficha completa que mostró el borrador tras el viaje por JSON", () => {
    // El balance oficial se lee de la columna JSON: el staging ya no existe.
    const guardado = JSON.parse(JSON.stringify(revisiones));
    expect(parsearRevisionesReubicacionBalance(guardado)).toEqual(revisiones);
  });

  it("no tumba la pantalla con una constancia ausente o corrupta", () => {
    expect(parsearRevisionesReubicacionBalance(null)).toEqual([]);
    expect(parsearRevisionesReubicacionBalance(undefined)).toEqual([]);
    expect(parsearRevisionesReubicacionBalance("[]")).toEqual([]);
    expect(parsearRevisionesReubicacionBalance([{ filaNum: 1 }])).toEqual([]);
  });

  it("tolera una revisión sin revisor guardado", () => {
    const [sinRevisor] = parsearRevisionesReubicacionBalance([
      { ...revisiones[0], revisadaPor: null },
    ]);
    expect(sinRevisor.revisadaPor).toBeNull();
  });

  it("nombra las masas contables igual en el borrador y en el balance", () => {
    expect(nombreClaseContable("2")).toBe("Pasivo");
    expect(nombreClaseContable("7")).toBe("Costos");
    expect(nombreClaseContable("9")).toBe("Clase 9");
  });
});
