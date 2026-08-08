import { describe, expect, it } from "vitest";
import {
  asignarVersionesBorrador,
  claveGrupoBorrador,
  type BorradorVersionable,
} from "./versiones-borrador";

function borrador(parcial: Partial<BorradorVersionable> & Pick<BorradorVersionable, "loteId">): BorradorVersionable {
  return {
    clienteId: 7,
    nitDetectado: "830515061-1",
    periodoInicio: "2026-05-01",
    periodoFin: "2026-05-31",
    creadoEn: "2026-06-01T12:00:00.000Z",
    ...parcial,
  };
}

describe("claveGrupoBorrador", () => {
  it("agrupa por cliente y período mensual (mismo mes, aunque el rango difiera)", () => {
    const a = claveGrupoBorrador(borrador({ loteId: "a" }));
    const b = claveGrupoBorrador(
      borrador({ loteId: "b", periodoInicio: "2026-05-01", periodoFin: "2026-05-30" }),
    );
    expect(a).toBe(b);
    expect(a).toContain("Mayo 2026");
  });

  it("separa períodos distintos y clientes distintos", () => {
    const mayo = claveGrupoBorrador(borrador({ loteId: "a" }));
    const junio = claveGrupoBorrador(
      borrador({ loteId: "b", periodoInicio: "2026-06-01", periodoFin: "2026-06-30" }),
    );
    const otroCliente = claveGrupoBorrador(borrador({ loteId: "c", clienteId: 8 }));
    expect(mayo).not.toBe(junio);
    expect(mayo).not.toBe(otroCliente);
  });

  it("cae al núcleo del NIT cuando el lote aún no tiene cliente (el DV no separa)", () => {
    const conDv = claveGrupoBorrador(borrador({ loteId: "a", clienteId: null }));
    const sinDv = claveGrupoBorrador(
      borrador({ loteId: "b", clienteId: null, nitDetectado: "830515061" }),
    );
    expect(conDv).toBe(sinDv);
    expect(conDv).toContain("n:830515061");
  });

  it("no agrupa sin cliente ni NIT utilizable, ni sin período", () => {
    expect(claveGrupoBorrador(borrador({ loteId: "a", clienteId: null, nitDetectado: null }))).toBeNull();
    expect(claveGrupoBorrador(borrador({ loteId: "b", clienteId: null, nitDetectado: "12" }))).toBeNull();
    expect(claveGrupoBorrador(borrador({ loteId: "c", periodoFin: null }))).toBeNull();
  });
});

describe("asignarVersionesBorrador", () => {
  it("numera cronológicamente: el cargue más antiguo es v1", () => {
    const versiones = asignarVersionesBorrador([
      borrador({ loteId: "tercero", creadoEn: "2026-06-03T12:00:00.000Z" }),
      borrador({ loteId: "primero", creadoEn: "2026-06-01T12:00:00.000Z" }),
      borrador({ loteId: "segundo", creadoEn: "2026-06-02T12:00:00.000Z" }),
    ]);
    expect(versiones.get("primero")?.version).toBe(1);
    expect(versiones.get("segundo")?.version).toBe(2);
    expect(versiones.get("tercero")?.version).toBe(3);
    expect(versiones.get("tercero")?.versionesGrupo).toBe(3);
  });

  it("numera cada (cliente, período) por separado", () => {
    const versiones = asignarVersionesBorrador([
      borrador({ loteId: "mayo-1", creadoEn: "2026-06-01T12:00:00.000Z" }),
      borrador({ loteId: "mayo-2", creadoEn: "2026-06-02T12:00:00.000Z" }),
      borrador({ loteId: "junio-1", periodoInicio: "2026-06-01", periodoFin: "2026-06-30", creadoEn: "2026-07-01T12:00:00.000Z" }),
      borrador({ loteId: "otro-cliente", clienteId: 8, creadoEn: "2026-06-05T12:00:00.000Z" }),
    ]);
    expect(versiones.get("mayo-2")?.version).toBe(2);
    expect(versiones.get("junio-1")).toMatchObject({ version: 1, versionesGrupo: 1 });
    expect(versiones.get("otro-cliente")).toMatchObject({ version: 1, versionesGrupo: 1 });
  });

  it("deja los no agrupables como v1 de 1 y sin clave", () => {
    const versiones = asignarVersionesBorrador([
      borrador({ loteId: "huerfano", clienteId: null, nitDetectado: null }),
    ]);
    expect(versiones.get("huerfano")).toEqual({ version: 1, versionesGrupo: 1, claveGrupo: null });
  });

  it("desempata por loteId cuando dos cargues comparten instante", () => {
    const versiones = asignarVersionesBorrador([
      borrador({ loteId: "b", creadoEn: "2026-06-01T12:00:00.000Z" }),
      borrador({ loteId: "a", creadoEn: "2026-06-01T12:00:00.000Z" }),
    ]);
    expect(versiones.get("a")?.version).toBe(1);
    expect(versiones.get("b")?.version).toBe(2);
  });
});
