import { describe, expect, it } from "vitest";
import {
  combinarRevisionesReubicacion,
  filtrarReubicacionesPendientes,
} from "./borrador-detail-client";
import type { RevisionReubicacionStaging } from "@/lib/balance/staging-borrador";

const revisionGuardada: RevisionReubicacionStaging = {
  filaNum: 737,
  justificacion: "Reubicación revisada por criterio contable.",
  revisadaPor: "Usuario de prueba",
  revisadaPorId: 10,
  revisadaEn: "2026-07-28T15:00:00.000Z",
};

describe("estado visual de las revisiones de reubicación", () => {
  it("mantiene la cuenta revisada con la confirmación de la acción mientras llega el refresh", () => {
    const riesgos = [{ filaNum: 737 }];
    const sinRevision = combinarRevisionesReubicacion([], []);
    expect(filtrarReubicacionesPendientes(riesgos, sinRevision, {})).toEqual(riesgos);

    const confirmada = combinarRevisionesReubicacion([], [revisionGuardada]);
    expect(filtrarReubicacionesPendientes(riesgos, confirmada, {})).toEqual([]);
    expect(confirmada.get(737)).toEqual(revisionGuardada);
  });

  it("prioriza la confirmación local más reciente hasta que las props se actualicen", () => {
    const anterior = {
      ...revisionGuardada,
      justificacion: "Justificación anterior conservada en las props.",
      revisadaEn: "2026-07-28T14:00:00.000Z",
    };
    const combinadas = combinarRevisionesReubicacion([anterior], [revisionGuardada]);

    expect(combinadas.get(737)).toEqual(revisionGuardada);
  });

  it("adopta una revisión posterior recibida por el refresh", () => {
    const posterior = {
      ...revisionGuardada,
      justificacion: "Justificación posterior recibida desde el servidor.",
      revisadaEn: "2026-07-28T16:00:00.000Z",
    };
    const combinadas = combinarRevisionesReubicacion([posterior], [revisionGuardada]);

    expect(combinadas.get(737)).toEqual(posterior);
  });

  it("la revisión pendiente en el navegador también evita un falso bloqueo antes de guardar", () => {
    const riesgos = [{ filaNum: 737 }];
    const pendientes = {
      737: {
        justificacion: "Reubicación lista para guardar por criterio contable.",
        memorizar: true,
      },
    };

    expect(filtrarReubicacionesPendientes(riesgos, new Map(), pendientes)).toEqual([]);
  });
});
