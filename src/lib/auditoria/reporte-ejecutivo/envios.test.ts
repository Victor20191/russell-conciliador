import { describe, expect, test } from "vitest";
import {
  idsVersionesYaEnviadas,
  resumirPendienteDeEnvio,
  ultimoEnvio,
  versionesNoEnviadas,
  type EnvioReportePrevio,
} from "./envios";

function envio(parcial: Partial<EnvioReportePrevio> & { id: number }): EnvioReportePrevio {
  return {
    titulo: "Reporte de uso y avances",
    periodoDesde: "2026-07-01T00:00:00.000Z",
    periodoHasta: "2026-07-31T23:59:59.000Z",
    versionIds: [],
    totalNovedades: 0,
    totalAcciones: 0,
    canal: "correo",
    enviadoPor: "Ana",
    enviadoEn: "2026-08-01T10:00:00.000Z",
    ...parcial,
  };
}

const versiones = [
  { id: 9, changesCount: 3 },
  { id: 8, changesCount: 2 },
  { id: 7, changesCount: 4 },
];

describe("idsVersionesYaEnviadas", () => {
  test("une los ids de todos los envíos sin duplicar", () => {
    const ids = idsVersionesYaEnviadas([
      envio({ id: 1, versionIds: [7, 8] }),
      envio({ id: 2, versionIds: [8, 9] }),
    ]);
    expect(ids).toEqual([7, 8, 9]);
  });

  test("sin envíos no hay nada enviado", () => {
    expect(idsVersionesYaEnviadas([])).toEqual([]);
  });
});

describe("versionesNoEnviadas", () => {
  test("conserva el orden original y descarta las ya enviadas", () => {
    expect(versionesNoEnviadas(versiones, [7, 8])).toEqual([{ id: 9, changesCount: 3 }]);
  });
});

describe("resumirPendienteDeEnvio", () => {
  test("el primer reporte incluye todo lo publicado", () => {
    const resumen = resumirPendienteDeEnvio({ versiones, envios: [] });
    expect(resumen.versionIds).toEqual([9, 8, 7]);
    expect(resumen.totalVersiones).toBe(3);
    expect(resumen.totalCambios).toBe(9);
    expect(resumen.ultimoEnvioEn).toBeNull();
    expect(resumen.sinNovedadesNuevas).toBe(false);
  });

  test("solo propone lo que no se ha enviado", () => {
    const resumen = resumirPendienteDeEnvio({
      versiones,
      envios: [envio({ id: 1, versionIds: [7, 8], enviadoEn: "2026-08-05T09:00:00.000Z" })],
    });
    expect(resumen.versionIds).toEqual([9]);
    expect(resumen.totalCambios).toBe(3);
    expect(resumen.ultimoEnvioEn).toBe("2026-08-05T09:00:00.000Z");
    expect(resumen.sinNovedadesNuevas).toBe(false);
  });

  test("avisa cuando ya se envió todo lo publicado", () => {
    const resumen = resumirPendienteDeEnvio({
      versiones,
      envios: [envio({ id: 1, versionIds: [7, 8, 9] })],
    });
    expect(resumen.versionIds).toEqual([]);
    expect(resumen.totalCambios).toBe(0);
    expect(resumen.sinNovedadesNuevas).toBe(true);
  });

  test("sin versiones publicadas no marca «ya enviado todo»", () => {
    const resumen = resumirPendienteDeEnvio({ versiones: [], envios: [envio({ id: 1 })] });
    expect(resumen.sinNovedadesNuevas).toBe(false);
  });
});

describe("ultimoEnvio", () => {
  test("toma el más reciente y desempata por id", () => {
    const a = envio({ id: 1, enviadoEn: "2026-08-01T10:00:00.000Z" });
    const b = envio({ id: 2, enviadoEn: "2026-08-10T10:00:00.000Z" });
    const c = envio({ id: 3, enviadoEn: "2026-08-10T10:00:00.000Z" });
    expect(ultimoEnvio([a, b, c])?.id).toBe(3);
    expect(ultimoEnvio([])).toBeNull();
  });
});
