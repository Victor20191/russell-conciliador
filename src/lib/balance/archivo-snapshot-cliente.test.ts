import { describe, expect, it, vi } from "vitest";
import {
  capturarArchivoSnapshotCliente,
  reconstruirArchivoDesdeSnapshot,
} from "./archivo-snapshot-cliente";

describe("snapshot estable de archivo en el cliente", () => {
  it("conserva contenido y metadatos aunque el File original deje de ser legible", async () => {
    const original = new File(
      [new Uint8Array([0, 1, 2, 250, 255])],
      "balance prueba.xlsx",
      {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        lastModified: 1_725_000_000_000,
      },
    );
    const snapshot = await capturarArchivoSnapshotCliente(original);
    Object.defineProperty(original, "arrayBuffer", {
      value: vi.fn(async () => {
        throw new Error("File consumido");
      }),
    });

    const reconstruido = reconstruirArchivoDesdeSnapshot(snapshot);

    expect(reconstruido).not.toBe(original);
    expect(reconstruido.name).toBe(original.name);
    expect(reconstruido.type).toBe(original.type);
    expect(reconstruido.lastModified).toBe(original.lastModified);
    expect([...new Uint8Array(await reconstruido.arrayBuffer())]).toEqual([
      0, 1, 2, 250, 255,
    ]);
  });

  it("reconstruye un File independiente y completo para cada envío", async () => {
    const snapshot = await capturarArchivoSnapshotCliente(
      new File(["cuenta;saldo\n110505;123"], "balance.csv", {
        type: "text/csv",
        lastModified: 123,
      }),
    );

    const primerEnvio = reconstruirArchivoDesdeSnapshot(snapshot);
    const segundoEnvio = reconstruirArchivoDesdeSnapshot(snapshot);

    expect(primerEnvio).not.toBe(segundoEnvio);
    expect(await primerEnvio.text()).toBe("cuenta;saldo\n110505;123");
    expect(await segundoEnvio.text()).toBe("cuenta;saldo\n110505;123");
    expect(primerEnvio.size).toBe(snapshot.contenido.byteLength);
    expect(segundoEnvio.size).toBe(snapshot.contenido.byteLength);
  });

  it("no comparte el buffer retenido con archivos ya reconstruidos", async () => {
    const snapshot = await capturarArchivoSnapshotCliente(
      new File([new Uint8Array([10, 20, 30])], "balance.bin"),
    );
    const reconstruido = reconstruirArchivoDesdeSnapshot(snapshot);

    snapshot.contenido.fill(99);

    expect([...new Uint8Array(await reconstruido.arrayBuffer())]).toEqual([
      10, 20, 30,
    ]);
    expect([
      ...new Uint8Array(
        await reconstruirArchivoDesdeSnapshot(snapshot).arrayBuffer(),
      ),
    ]).toEqual([99, 99, 99]);
  });
});
