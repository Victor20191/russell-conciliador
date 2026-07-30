import { describe, expect, it, vi } from "vitest";
import {
  generarUuidV4Cliente,
  MENSAJE_UUID_CLIENTE_NO_DISPONIBLE,
  type FuenteUuidCliente,
} from "./uuid-cliente";

const UUID_NATIVO = "11111111-1111-4111-8111-111111111111";

describe("generarUuidV4Cliente", () => {
  it("prioriza randomUUID cuando el contexto seguro lo expone", () => {
    const randomUUID = vi.fn(() => UUID_NATIVO);
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes);

    expect(generarUuidV4Cliente({ randomUUID, getRandomValues })).toBe(UUID_NATIVO);
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it("construye un UUID v4 con getRandomValues cuando randomUUID no existe", () => {
    const fuente: FuenteUuidCliente = {
      getRandomValues(bytes) {
        bytes.set(Array.from({ length: 16 }, (_, indice) => indice));
        return bytes;
      },
    };

    expect(generarUuidV4Cliente(fuente)).toBe(
      "00010203-0405-4607-8809-0a0b0c0d0e0f",
    );
  });

  it("fija los bits de versión 4 y variante IETF en el fallback", () => {
    const uuid = generarUuidV4Cliente({
      getRandomValues(bytes) {
        bytes.fill(0xff);
        return bytes;
      },
    });
    const partes = uuid.split("-");

    expect(partes[2][0]).toBe("4");
    expect(["8", "9", "a", "b"]).toContain(partes[3][0]);
  });

  it("falla de forma explícita si no hay una fuente criptográfica", () => {
    expect(() => generarUuidV4Cliente(null)).toThrow(
      MENSAJE_UUID_CLIENTE_NO_DISPONIBLE,
    );
    expect(() => generarUuidV4Cliente({})).toThrow(
      MENSAJE_UUID_CLIENTE_NO_DISPONIBLE,
    );
  });
});
