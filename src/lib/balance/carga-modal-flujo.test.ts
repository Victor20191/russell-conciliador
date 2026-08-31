import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modal = readFileSync(
  new URL("../../app/(app)/balance/cargar-balance-modal.tsx", import.meta.url),
  "utf8",
);

describe("flujo del modal estándar de carga de balances", () => {
  it("no mezcla la carga normal con el modo por tercero", () => {
    expect(modal).not.toContain("modoTercero");
    expect(modal).not.toContain("FormRevisarTercero");
    expect(modal).not.toContain("Abrir por tercero (CxC/CxP)");
    expect(modal).not.toContain("Cargar por tercero");
    expect(modal).not.toContain("cargarBalancePorTercero");
  });

  it("usa el índice liviano para archivos grandes y conserva la selección obligatoria", () => {
    expect(modal).toContain(
      "const soloNombres = debeLeerSoloNombresHojas(snapshot.contenido.byteLength)",
    );
    expect(modal).toContain("? await leerNombresHojas(archivoEstable)");
    expect(modal).toContain(": await leerHojasParaPreview(archivoEstable)");
    expect(modal).toContain("(requiereHoja && !hojaElegida)");
    expect(modal).toContain("activa?.vistaPreviaOmitida");
  });

  it("mantiene el editor histórico únicamente en la revisión normal", () => {
    const revisionNormal = modal.slice(
      modal.indexOf("function FormRevisar({"),
      modal.indexOf("function IdentificacionCliente({"),
    );

    expect(revisionNormal).toContain("<EditorEstructura");
    expect(revisionNormal).toContain("onReprocesar");
  });
});
