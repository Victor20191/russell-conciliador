import { afterEach, describe, expect, it, vi } from "vitest";
import { BALANCE_UPLOAD_CHUNK_BYTES } from "./limites-archivo";
import { cargarArchivoBalanceTemporal } from "./carga-archivo-cliente";

function respuestaOk(data: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("cargarArchivoBalanceTemporal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("transfiere un balance grande en fragmentos y confirma la carga", async () => {
    const loteId = "2ee5f4f7-f887-41e9-a928-70377671c37e";
    const tamano = BALANCE_UPLOAD_CHUNK_BYTES * 2 + 17;
    const archivo = new File([new Uint8Array(tamano)], "balance-grande.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const tamanosSubidos: number[] = [];
    const operaciones: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PUT") {
        tamanosSubidos.push((init.body as Blob).size);
        operaciones.push("parte");
        return respuestaOk();
      }
      const cuerpo = JSON.parse(String(init?.body)) as { operacion: string };
      operaciones.push(cuerpo.operacion);
      if (cuerpo.operacion === "iniciar") {
        return respuestaOk({ tamanoParte: BALANCE_UPLOAD_CHUNK_BYTES, totalPartes: 3 });
      }
      expect(url).toBe("/api/balance/archivo-temporal");
      return respuestaOk();
    });
    vi.stubGlobal("fetch", fetchMock);
    const progreso: number[] = [];

    await cargarArchivoBalanceTemporal(archivo, loteId, (valor) => progreso.push(valor));

    expect(tamanosSubidos.sort((a, b) => a - b)).toEqual([
      17,
      BALANCE_UPLOAD_CHUNK_BYTES,
      BALANCE_UPLOAD_CHUNK_BYTES,
    ]);
    expect(operaciones[0]).toBe("iniciar");
    expect(operaciones.at(-1)).toBe("completar");
    expect(progreso.at(-1)).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
