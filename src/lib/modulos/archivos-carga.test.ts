import { describe, expect, it } from "vitest";
import { archivosDeVersion, parsearAnexos } from "./archivos-carga";

describe("parsearAnexos", () => {
  it("sin observaciones o sin anexos devuelve lista vacía", () => {
    expect(parsearAnexos(null)).toEqual([]);
    expect(parsearAnexos("")).toEqual([]);
    expect(parsearAnexos("Nota libre sin ningún anexo.")).toEqual([]);
  });

  it("un anexo con hoja", () => {
    const obs = "Anexo: kardex-diciembre.xlsx · hoja: Kardex Dic (+120 ítems) · 2026-08-25 [lote:abc-123]";
    expect(parsearAnexos(obs)).toEqual([
      { archivo: "kardex-diciembre.xlsx", hoja: "Kardex Dic" },
    ]);
  });

  it("anexo viejo sin hoja (formato legado) resuelve hoja=null", () => {
    const obs = "Anexo: kardex-diciembre.xlsx (+120 ítems) · 2026-08-25 [lote:abc-123]";
    expect(parsearAnexos(obs)).toEqual([{ archivo: "kardex-diciembre.xlsx", hoja: null }]);
  });

  it("varios anexos, en orden", () => {
    const obs = [
      "Anexo: parte1.xlsx · hoja: Hoja1 (+10 ítems) · 2026-08-01 [lote:l1]",
      "Anexo: parte2.xlsx (+5 ítems) · 2026-08-02 [lote:l2]",
      "Anexo: parte3.xlsx · hoja: Hoja3 (+3 ítems) · 2026-08-03 [lote:l3]",
    ].join("\n");
    expect(parsearAnexos(obs)).toEqual([
      { archivo: "parte1.xlsx", hoja: "Hoja1" },
      { archivo: "parte2.xlsx", hoja: null },
      { archivo: "parte3.xlsx", hoja: "Hoja3" },
    ]);
  });

  it("observaciones con texto no-anexo mezclado ignora las demás líneas", () => {
    const obs = [
      "Cargue revisado con el cliente por correo.",
      "Anexo: extra.xlsx · hoja: Extra (+7 ítems) · 2026-08-10 — nota del usuario [lote:l9]",
      "Pendiente confirmar IVA del tercer trimestre.",
    ].join("\n");
    expect(parsearAnexos(obs)).toEqual([{ archivo: "extra.xlsx", hoja: "Extra" }]);
  });

  it("conserva la observación libre pegada a la línea sin romper el parseo", () => {
    const obs = "Anexo: kardex.xlsx · hoja: Kardex (+2 ítems) · 2026-08-25 — revisar con el cliente [lote:x]";
    expect(parsearAnexos(obs)).toEqual([{ archivo: "kardex.xlsx", hoja: "Kardex" }]);
  });
});

describe("archivosDeVersion", () => {
  it("solo el principal cuando no hay anexos", () => {
    expect(archivosDeVersion("balance.xlsx", "Hoja1", null)).toEqual([
      { archivo: "balance.xlsx", hoja: "Hoja1", esAnexo: false },
    ]);
  });

  it("principal + anexos, en orden, marcando esAnexo", () => {
    const obs = [
      "Anexo: parte1.xlsx · hoja: HojaA (+10 ítems) · 2026-08-01 [lote:l1]",
      "Anexo: parte2.xlsx (+5 ítems) · 2026-08-02 [lote:l2]",
    ].join("\n");
    expect(archivosDeVersion("principal.xlsx", "HojaP", obs)).toEqual([
      { archivo: "principal.xlsx", hoja: "HojaP", esAnexo: false },
      { archivo: "parte1.xlsx", hoja: "HojaA", esAnexo: true },
      { archivo: "parte2.xlsx", hoja: null, esAnexo: true },
    ]);
  });

  it("archivoNombre null (cargue histórico) devuelve solo los anexos, si los hay", () => {
    expect(archivosDeVersion(null, null, null)).toEqual([]);
    const obs = "Anexo: parte1.xlsx · hoja: HojaA (+10 ítems) · 2026-08-01 [lote:l1]";
    expect(archivosDeVersion(null, null, obs)).toEqual([
      { archivo: "parte1.xlsx", hoja: "HojaA", esAnexo: true },
    ]);
  });

  it("hoja del principal null cuando el dato es histórico (sin hoja registrada)", () => {
    expect(archivosDeVersion("legado.xlsx", null, null)).toEqual([
      { archivo: "legado.xlsx", hoja: null, esAnexo: false },
    ]);
  });
});
