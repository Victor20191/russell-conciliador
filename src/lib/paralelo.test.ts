import { describe, it, expect } from "vitest";
import { conConcurrencia } from "./paralelo";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("conConcurrencia", () => {
  it("devuelve los resultados en el orden de entrada", async () => {
    // Los primeros tardan más: si el orden dependiera de la finalización, saldría invertido.
    const res = await conConcurrencia([30, 20, 10, 0], 4, async (ms, i) => {
      await espera(ms);
      return `item-${i}`;
    });
    expect(res).toEqual(["item-0", "item-1", "item-2", "item-3"]);
  });

  it("nunca supera el límite de concurrencia", async () => {
    let enVuelo = 0;
    let maxEnVuelo = 0;
    await conConcurrencia(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      enVuelo += 1;
      maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
      await espera(5);
      enVuelo -= 1;
    });
    expect(maxEnVuelo).toBeLessThanOrEqual(3);
    expect(maxEnVuelo).toBeGreaterThan(1);
  });

  it("procesa todos los items aunque haya más que workers", async () => {
    const vistos: number[] = [];
    await conConcurrencia([1, 2, 3, 4, 5], 2, async (n) => {
      vistos.push(n);
    });
    expect(vistos.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("lista vacía ⇒ []", async () => {
    expect(await conConcurrencia([], 4, async () => 1)).toEqual([]);
  });

  it("un error en fn se propaga", async () => {
    await expect(
      conConcurrencia([1, 2], 2, async (n) => {
        if (n === 2) throw new Error("falló el lote");
        return n;
      }),
    ).rejects.toThrow("falló el lote");
  });
});
