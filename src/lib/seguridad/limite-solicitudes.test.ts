import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), cleanup: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { $transaction: mocks.transaction } }));
import { claveIdentidadCuota, consumirCuotaSolicitud, CUOTA_SOPORTE_PUBLICO } from "./limite-solicitudes";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SESSION_SECRET", "clave-solo-de-prueba-con-mas-de-treinta-y-dos-bytes");
  mocks.query.mockResolvedValue([{ clave: "aceptada" }]);
  mocks.cleanup.mockResolvedValue(0);
  mocks.transaction.mockImplementation((operacion: (tx: unknown) => unknown) => operacion({ $queryRaw: mocks.query, $executeRaw: mocks.cleanup }));
});
afterEach(() => vi.unstubAllEnvs());

it("no guarda IP en claro y normaliza representaciones equivalentes de IPv6", () => {
  const primera = claveIdentidadCuota("soporte-publico", "2001:db8::1");
  expect(primera).toBe(claveIdentidadCuota("soporte-publico", "2001:0DB8:0000:0000:0000:0000:0000:0001"));
  expect(primera).toMatch(/^soporte-publico:ip:[a-f0-9]{64}$/);
  expect(claveIdentidadCuota("soporte-publico", "cabecera no confiable")).toBe(claveIdentidadCuota("soporte-publico", "otra cabecera inválida"));
});

it("falla cerrado sin clave suficiente, antes de consultar BD", async () => {
  vi.stubEnv("SESSION_SECRET", "");
  await expect(consumirCuotaSolicitud(CUOTA_SOPORTE_PUBLICO, "192.0.2.1")).rejects.toThrow();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("consume global e individual en la misma transacción con SQL parametrizado y limpieza acotada", async () => {
  expect(await consumirCuotaSolicitud(CUOTA_SOPORTE_PUBLICO, "192.0.2.1")).toEqual({ permitida: true, reintentarEnSegundos: 0 });
  expect(mocks.transaction).toHaveBeenCalledOnce();
  expect(mocks.query).toHaveBeenCalledTimes(2);
  const [sql, clave, segundos, segundosRenovacion, limite] = mocks.query.mock.calls[0];
  expect(sql.join("?")).toContain('ON CONFLICT ("clave") DO UPDATE');
  expect(sql.join("?")).toContain('OR "limites_solicitud"."solicitudes" < ?');
  expect([clave, segundos, segundosRenovacion, limite]).toEqual(["soporte-publico:global", 900, 900, 50]);
  expect(mocks.query.mock.calls[1][1]).toMatch(/^soporte-publico:ip:/);
  expect(mocks.query.mock.calls[1][4]).toBe(5);
  expect(mocks.cleanup.mock.calls[0][0].join("?")).toContain("LIMIT 100 FOR UPDATE SKIP LOCKED");
});

it("no reserva identidad si se agotó la capacidad global", async () => {
  mocks.query.mockResolvedValue([]);
  expect(await consumirCuotaSolicitud(CUOTA_SOPORTE_PUBLICO, "192.0.2.1")).toEqual({ permitida: false, reintentarEnSegundos: 900 });
  expect(mocks.query).toHaveBeenCalledOnce();
  expect(mocks.cleanup).not.toHaveBeenCalled();
});

it("errores de infraestructura no se convierten en permiso para crear", async () => {
  mocks.transaction.mockRejectedValue(new Error("BD no disponible"));
  await expect(consumirCuotaSolicitud(CUOTA_SOPORTE_PUBLICO, "192.0.2.1")).rejects.toThrow("BD no disponible");
});

describe("llamadas concurrentes con un doble transaccional compartido", () => {
  // Verifica el contrato transaccional del helper (incluido rollback). No sustituye
  // una prueba de PostgreSQL; la exclusión real depende del UPSERT de la migración.
  function baseCompartida() {
    let filas = new Map<string, number>();
    let cola = Promise.resolve();
    mocks.transaction.mockImplementation((operacion: (tx: unknown) => Promise<unknown>) => {
      const trabajo = cola.then(async () => {
        const borrador = new Map(filas);
        const tx = {
          $queryRaw: async (_sql: unknown, clave: string, _ventana: number, _renovacion: number, limite: number) => {
            const numero = borrador.get(clave) ?? 0;
            if (numero >= limite) return [];
            borrador.set(clave, numero + 1);
            return [{ clave }];
          },
          $executeRaw: async () => 0,
        };
        const resultado = await operacion(tx);
        filas = borrador;
        return resultado;
      });
      cola = trabajo.then(() => undefined, () => undefined);
      return trabajo;
    });
    return { conteos: () => filas };
  }

  it("solo acepta cinco simultáneas por identidad y revierte el cupo global de las rechazadas", async () => {
    const db = baseCompartida();
    const resultados = await Promise.all(Array.from({ length: 20 }, () => consumirCuotaSolicitud(CUOTA_SOPORTE_PUBLICO, "192.0.2.1")));
    expect(resultados.filter((r) => r.permitida)).toHaveLength(5);
    expect(db.conteos().get("soporte-publico:global")).toBe(5);
    expect(db.conteos().size).toBe(2);
  });

  it("rotar identidades no evita la cuota global ni crea filas para rechazadas", async () => {
    const db = baseCompartida();
    const resultados = await Promise.all(Array.from({ length: 80 }, (_, i) => consumirCuotaSolicitud(CUOTA_SOPORTE_PUBLICO, `192.0.2.${i + 1}`)));
    expect(resultados.filter((r) => r.permitida)).toHaveLength(50);
    expect(db.conteos().get("soporte-publico:global")).toBe(50);
    expect(db.conteos().size).toBe(51);
  });
});
