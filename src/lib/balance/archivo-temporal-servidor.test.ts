import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(), create: vi.fn(), remove: vi.fn(), removeMany: vi.fn(), update: vi.fn(),
  upsert: vi.fn(), aggregate: vi.fn(), partes: vi.fn(), transaction: vi.fn(), query: vi.fn(), candado: vi.fn(),
}));
const modelos = vi.hoisted(() => ({
  balanceArchivoTemporal: { findUnique: mocks.find, create: mocks.create, delete: mocks.remove, deleteMany: mocks.removeMany, update: mocks.update },
  balanceArchivoTemporalParte: { upsert: mocks.upsert, aggregate: mocks.aggregate, findMany: mocks.partes },
  $queryRaw: mocks.query,
}));
vi.mock("@/lib/prisma", () => ({ default: { ...modelos, $transaction: mocks.transaction } }));
vi.mock("@/lib/candados", () => ({ tomarCandadoTransaccion: mocks.candado }));

import { iniciarArchivoBalanceTemporal, descartarArchivoBalanceTemporal, guardarParteArchivoBalance,
  completarArchivoBalanceTemporal, consumirArchivoBalanceTemporal } from "./archivo-temporal-servidor";

type Archivo = {
  loteId: string; usuarioId: number; nombreArchivo: string; tipoContenido: string; tamanoBytes: number;
  tamanoParte: number; totalPartes: number; completado: boolean; expiraEn: Date;
};
type Parte = { loteId: string; numero: number; tamanoBytes: number; contenido: Uint8Array };
let archivo: Archivo | null;
let partes: Parte[];
let pausaLectura: { iniciada: () => void; esperar: Promise<void> } | undefined;

function diferido() {
  let resolver!: () => void;
  const promesa = new Promise<void>((resolve) => { resolver = resolve; });
  return { promesa, resolver };
}
const loteId = "00000000-0000-4000-8000-000000000001";
const iniciar = (usuarioId: number) => iniciarArchivoBalanceTemporal({
  loteId, usuarioId, nombreArchivo: "balance.xlsx", tipoContenido: "application/octet-stream", tamanoBytes: 8,
});

beforeEach(() => {
  vi.resetAllMocks();
  archivo = null;
  partes = [];
  pausaLectura = undefined;
  // Doble transaccional serializado: prueba el orden/autorización del código;
  // no sustituye una prueba de candados contra PostgreSQL real.
  let cola = Promise.resolve();
  mocks.transaction.mockImplementation(async (fn) => {
    const anterior = cola;
    const libre = diferido();
    cola = libre.promesa;
    await anterior;
    try { return await fn(modelos); } finally { libre.resolver(); }
  });
  mocks.query.mockImplementation(async () => archivo ? [{ loteId: archivo.loteId }] : []);
  mocks.find.mockImplementation(async (args) => {
    const encontrada = archivo ? { ...archivo, ...(args.include ? { partes: [...partes] } : {}) } : null;
    if (pausaLectura) {
      const pausa = pausaLectura;
      pausaLectura = undefined;
      pausa.iniciada();
      await pausa.esperar;
    }
    return encontrada;
  });
  mocks.create.mockImplementation(async ({ data }) => {
    if (archivo) throw new Error("Identificador duplicado");
    archivo = { ...data };
    return archivo;
  });
  mocks.remove.mockImplementation(async () => { const anterior = archivo; archivo = null; partes = []; return anterior; });
  mocks.removeMany.mockImplementation(async ({ where }) => {
    if (archivo && (where.expiraEn ? archivo.expiraEn < where.expiraEn.lt : archivo.usuarioId === where.usuarioId)) {
      archivo = null; partes = []; return { count: 1 };
    }
    return { count: 0 };
  });
  mocks.update.mockImplementation(async ({ data }) => { archivo = { ...archivo!, ...data }; return archivo; });
  mocks.upsert.mockImplementation(async ({ create }) => {
    if (!archivo) throw new Error("FK inexistente");
    partes = partes.filter((parte) => parte.numero !== create.numero).concat([{ ...create }]);
    return create;
  });
  mocks.aggregate.mockImplementation(async () => ({ _count: { _all: partes.length }, _sum: { tamanoBytes: partes.reduce((sum, parte) => sum + parte.tamanoBytes, 0) } }));
  mocks.partes.mockImplementation(async () => [...partes].sort((a, b) => a.numero - b.numero));
});

describe("propiedad y ciclo de vida de archivos temporales", () => {
  it("una parte en vuelo del dueño anterior no termina en un lote recreado por otro usuario", async () => {
    expect(await iniciar(1)).toMatchObject({ ok: true });
    const leida = diferido();
    const continuar = diferido();
    pausaLectura = { iniciada: leida.resolver, esperar: continuar.promesa };
    const cargaAnterior = guardarParteArchivoBalance({ loteId, usuarioId: 1, numero: 1, contenido: new TextEncoder().encode("SECRETO!") });
    await leida.promesa;
    const reemplazo = (async () => {
      await descartarArchivoBalanceTemporal({ loteId, usuarioId: 1 });
      return iniciar(2);
    })();
    // Permite que el reemplazo avance cuando la operación anterior no conserva
    // una transacción; con el candado debe permanecer esperando.
    await new Promise<void>((resolve) => setImmediate(resolve));
    continuar.resolver();
    await cargaAnterior;
    expect(await reemplazo).toMatchObject({ ok: true });
    const completado = await completarArchivoBalanceTemporal({ loteId, usuarioId: 2 });
    const consumido = await consumirArchivoBalanceTemporal({ loteId, usuarioId: 2 });
    expect.soft(completado.ok).toBe(false);
    expect.soft(consumido.ok).toBe(false);
    if (consumido.ok) expect(new TextDecoder().decode(consumido.archivo.contenido)).not.toBe("SECRETO!");
  });

  it("rechaza al no dueño antes de cargar los bytes del archivo", async () => {
    await iniciar(1);
    await guardarParteArchivoBalance({ loteId, usuarioId: 1, numero: 1, contenido: new Uint8Array(8) });
    await completarArchivoBalanceTemporal({ loteId, usuarioId: 1 });
    mocks.find.mockClear();
    mocks.partes.mockClear();
    expect(await consumirArchivoBalanceTemporal({ loteId, usuarioId: 2 })).toMatchObject({ ok: false });
    expect(mocks.find.mock.calls.every(([args]) => !args.include?.partes)).toBe(true);
    expect(mocks.partes).not.toHaveBeenCalled();
    expect(archivo).not.toBeNull();
  });

  it.each(["completar", "consumir"] as const)("%s en vuelo no modifica ni borra el nuevo lote de otro dueño", async (operacion) => {
    await iniciar(1);
    await guardarParteArchivoBalance({ loteId, usuarioId: 1, numero: 1, contenido: new Uint8Array(8) });
    if (operacion === "consumir") await completarArchivoBalanceTemporal({ loteId, usuarioId: 1 });
    const leida = diferido();
    const continuar = diferido();
    pausaLectura = { iniciada: leida.resolver, esperar: continuar.promesa };
    const pendiente = operacion === "completar"
      ? completarArchivoBalanceTemporal({ loteId, usuarioId: 1 })
      : consumirArchivoBalanceTemporal({ loteId, usuarioId: 1 });
    await leida.promesa;
    const reemplazo = (async () => {
      await descartarArchivoBalanceTemporal({ loteId, usuarioId: 1 });
      await iniciar(2);
      return guardarParteArchivoBalance({ loteId, usuarioId: 2, numero: 1, contenido: new Uint8Array(8) });
    })();
    await new Promise<void>((resolve) => setImmediate(resolve));
    continuar.resolver();
    await pendiente;
    expect(await reemplazo).toMatchObject({ ok: true });
    expect(archivo).toMatchObject({ usuarioId: 2, completado: false });
    expect(mocks.query.mock.calls.every(([sql]) => sql.join("?").includes("FOR UPDATE"))).toBe(true);
    expect(mocks.candado).toHaveBeenCalledWith(modelos, `balance-archivo-temporal:${loteId}`);
  });

  it("conserva la carga normal y rechaza escrituras después de completar", async () => {
    await iniciar(1);
    const contenido = new TextEncoder().encode("SECRETO!");
    expect(await guardarParteArchivoBalance({ loteId, usuarioId: 1, numero: 1, contenido })).toMatchObject({ ok: true });
    expect(await completarArchivoBalanceTemporal({ loteId, usuarioId: 1 })).toMatchObject({ ok: true });
    expect(await guardarParteArchivoBalance({ loteId, usuarioId: 1, numero: 1, contenido: new Uint8Array(8) })).toMatchObject({ ok: false, status: 409 });
    const resultado = await consumirArchivoBalanceTemporal({ loteId, usuarioId: 1 });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(new TextDecoder().decode(resultado.archivo.contenido)).toBe("SECRETO!");
    expect(archivo).toBeNull();
    expect(partes).toEqual([]);
  });
});
