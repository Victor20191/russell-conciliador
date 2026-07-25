import { describe, expect, it } from "vitest";
import { construirConfigMapeoCliente, type FilaMapeoCliente } from "./mapeo-cliente-config";

describe("construirConfigMapeoCliente", () => {
  it("elige el manual sin depender del orden de entrada", () => {
    const filas: FilaMapeoCliente[] = [
      { id: 1, code: "110505", cuenta6Russell: "110501", coincidencia: 100, origenMapeo: "automatico" },
      { id: 2, code: "11050501", cuenta6Russell: "110599", coincidencia: 100, origenMapeo: "manual" },
    ];

    expect(construirConfigMapeoCliente(filas).get("110505")?.std).toBe("110599");
    expect(construirConfigMapeoCliente([...filas].reverse()).get("110505")?.std).toBe("110599");
  });

  it("entre manuales conflictivos prioriza la regla exacta del grupo", () => {
    const config = construirConfigMapeoCliente([
      { id: 5, code: "13050501", cuenta6Russell: "130599", coincidencia: 100, origenMapeo: "manual", actualizadoEn: "2026-07-24T12:00:00Z" },
      { id: 4, code: "130505", cuenta6Russell: "130501", coincidencia: 100, origenMapeo: "manual", actualizadoEn: "2026-07-20T12:00:00Z" },
    ]);

    expect(config.get("130505")?.std).toBe("130501");
  });

  it("entre automáticos equivalentes usa la edición más reciente", () => {
    const config = construirConfigMapeoCliente([
      { id: 1, code: "22050501", cuenta6Russell: "220501", coincidencia: 90, origenMapeo: "automatico", actualizadoEn: "2026-07-20T12:00:00Z" },
      { id: 2, code: "22050502", cuenta6Russell: "220599", coincidencia: 80, origenMapeo: "automatico", actualizadoEn: "2026-07-24T12:00:00Z" },
    ]);

    expect(config.get("220505")?.std).toBe("220599");
  });
});
