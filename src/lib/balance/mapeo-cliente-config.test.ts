import { describe, expect, it } from "vitest";
import {
  construirConfigMapeoCliente,
  resolverMapeoCliente,
  type FilaMapeoCliente,
} from "./mapeo-cliente-config";

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

  // Caso reportado por operación: la IA clasificaba `21052001 FIDUCIA` (pasivo) en
  // `124505` (activo). La corrección de UNA cuenta debe sobrevivir a la siguiente
  // carga SIN arrastrar al resto del grupo.
  it("memoriza la excepción por cuenta sin cambiar la regla del grupo", () => {
    const config = construirConfigMapeoCliente([
      { id: 1, code: "210520", cuenta6Russell: "124505", coincidencia: 90, origenMapeo: "automatico" },
      { id: 2, code: "21052001", cuenta6Russell: "210505", coincidencia: 100, origenMapeo: "manual_cuenta" },
      { id: 3, code: "21052002", cuenta6Russell: "124505", coincidencia: 90, origenMapeo: "automatico" },
    ]);

    expect(config.get("210520")?.std).toBe("124505");
    expect(resolverMapeoCliente(config, "21052001")?.std).toBe("210505");
    expect(resolverMapeoCliente(config, "21052002")?.std).toBe("124505");
    // Una cuenta nueva del grupo hereda la regla del grupo, no la excepción.
    expect(resolverMapeoCliente(config, "21052099")?.std).toBe("124505");
  });

  it("la excepción por cuenta no gana la elección del grupo aunque sea manual", () => {
    const config = construirConfigMapeoCliente([
      { id: 1, code: "51051801", cuenta6Russell: "510595", coincidencia: 100, origenMapeo: "manual_cuenta", actualizadoEn: "2026-08-05T12:00:00Z" },
      { id: 2, code: "510518", cuenta6Russell: "510505", coincidencia: 85, origenMapeo: "automatico", actualizadoEn: "2026-07-01T12:00:00Z" },
    ]);

    expect(config.get("510518")?.std).toBe("510505");
    expect(resolverMapeoCliente(config, "51051801")?.std).toBe("510595");
  });

  it("una regla de grupo posterior manda sobre la cuenta sin excepción propia", () => {
    const config = construirConfigMapeoCliente([
      { id: 1, code: "510518", cuenta6Russell: "510595", coincidencia: 100, origenMapeo: "manual" },
      { id: 2, code: "51051801", cuenta6Russell: "510595", coincidencia: 100, origenMapeo: "manual" },
    ]);

    expect(resolverMapeoCliente(config, "51051801")?.std).toBe("510595");
    expect(resolverMapeoCliente(config, "51051802")?.std).toBe("510595");
  });

  it("resolverMapeoCliente tolera memoria vacía", () => {
    expect(resolverMapeoCliente(undefined, "11050501")).toBeUndefined();
    expect(resolverMapeoCliente(new Map(), "11050501")).toBeUndefined();
  });
});
