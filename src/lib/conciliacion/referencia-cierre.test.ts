import { describe, expect, it } from "vitest";
import { referenciaCierre } from "./referencia-cierre";
import { mensajeConciliacionEnFirme, mensajePeriodoEnFirme } from "./cuentas-bloqueo";

describe("referenciaCierre — el origen de un cierre en firme", () => {
  it("un módulo cierra un cargue; Retención en la fuente, una revisión", () => {
    expect(referenciaCierre({ moduloCodigo: "CAR", moduloDatoEncabezadoId: 12 })).toEqual({ modulo: "CAR", etiqueta: "cargue #12", ruta: "/modulos/car/12" });
    expect(referenciaCierre({ moduloCodigo: "RET", moduloDatoEncabezadoId: 3 })).toEqual({ modulo: "Retención en la fuente", etiqueta: "revisión #3", ruta: "/impuestos/retencion/3" });
  });

  it("los mensajes del bloqueo nombran la revisión", () => {
    const cierre = { moduloCodigo: "RET", periodo: "2026-08", cerradoPor: "Senior", moduloDatoEncabezadoId: 3 };
    expect(mensajePeriodoEnFirme(cierre, "cambiar la homologación")).toContain("Retención en la fuente · 2026-08 está en firme (revisión #3, cerró Senior)");
    expect(mensajeConciliacionEnFirme([cierre])).toContain("Retención en la fuente · 2026-08 (revisión #3, cerró Senior)");
  });
});
