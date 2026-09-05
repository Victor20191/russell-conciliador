import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  crearAutoguardadoConsolidacion,
  type FilaConsolidacion,
  type ResultadoGuardarLoteConsolidacion,
} from "./autoguardado-consolidacion";

const DEBOUNCE = 1000;

// Los callbacks del controlador (`.then`/`.catch`) son síncronos y no usan temporizadores,
// así que basta con dejar correr unas vueltas de la cola de microtareas — sin depender de
// `vi.waitFor` (que internamente sondea con `setTimeout` y se estanca bajo fake timers).
async function avanzarMicrotareas(vueltas = 4) {
  for (let i = 0; i < vueltas; i++) await Promise.resolve();
}

function crearGuardarLoteMock() {
  const llamadas: FilaConsolidacion[][] = [];
  let resolver: ((r: ResultadoGuardarLoteConsolidacion) => void) | null = null;
  let promesaActual: Promise<ResultadoGuardarLoteConsolidacion> | null = null;
  const guardarLote = vi.fn((filas: FilaConsolidacion[]) => {
    llamadas.push(filas);
    promesaActual = new Promise<ResultadoGuardarLoteConsolidacion>((resolve) => { resolver = resolve; });
    return promesaActual;
  });
  return {
    guardarLote,
    llamadas,
    resolverUltima: (r: ResultadoGuardarLoteConsolidacion) => { resolver?.(r); },
  };
}

describe("autoguardado del consolidado (controlador puro)", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("no envía nada antes de que venza la pausa", () => {
    const m = crearGuardarLoteMock();
    const c = crearAutoguardadoConsolidacion({ guardarLote: m.guardarLote, debounceMs: DEBOUNCE });
    c.programar("MERCANCIA A", ["1435"]);
    vi.advanceTimersByTime(DEBOUNCE - 1);
    expect(m.guardarLote).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(m.guardarLote).toHaveBeenCalledTimes(1);
    expect(m.llamadas[0]).toEqual([{ clasificador: "MERCANCIA A", cuentas4: ["1435"] }]);
  });

  it("agrupa varias ediciones dentro de la pausa en UNA sola solicitud LOTE", () => {
    const m = crearGuardarLoteMock();
    const c = crearAutoguardadoConsolidacion({ guardarLote: m.guardarLote, debounceMs: DEBOUNCE });
    c.programar("A", ["1435"]);
    vi.advanceTimersByTime(300);
    c.programar("B", ["1405"]);
    vi.advanceTimersByTime(DEBOUNCE);
    expect(m.guardarLote).toHaveBeenCalledTimes(1);
    expect(m.llamadas[0]).toEqual(
      expect.arrayContaining([
        { clasificador: "A", cuentas4: ["1435"] },
        { clasificador: "B", cuentas4: ["1405"] },
      ]),
    );
    expect(m.llamadas[0]).toHaveLength(2);
  });

  it("cada edición nueva reinicia la pausa (no dispara antes de tiempo)", () => {
    const m = crearGuardarLoteMock();
    const c = crearAutoguardadoConsolidacion({ guardarLote: m.guardarLote, debounceMs: DEBOUNCE });
    c.programar("A", ["1435"]);
    vi.advanceTimersByTime(DEBOUNCE - 1);
    c.programar("A", ["1435", "1455"]); // reinicia el reloj
    vi.advanceTimersByTime(DEBOUNCE - 1);
    expect(m.guardarLote).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(m.guardarLote).toHaveBeenCalledTimes(1);
    expect(m.llamadas[0]).toEqual([{ clasificador: "A", cuentas4: ["1435", "1455"] }]);
  });

  it("una sola solicitud en vuelo: lo editado durante el envío no se pierde y sale después, sin esperar otra pausa", async () => {
    const m = crearGuardarLoteMock();
    const c = crearAutoguardadoConsolidacion({ guardarLote: m.guardarLote, debounceMs: DEBOUNCE });
    c.programar("A", ["1435"]);
    vi.advanceTimersByTime(DEBOUNCE);
    expect(m.guardarLote).toHaveBeenCalledTimes(1);

    // Llega una edición de OTRO clasificador mientras la primera solicitud sigue en vuelo.
    c.programar("B", ["1405"]);
    vi.advanceTimersByTime(DEBOUNCE * 5); // aunque pase tiempo, no debe salir una 2ª solicitud todavía
    expect(m.guardarLote).toHaveBeenCalledTimes(1);

    m.resolverUltima({ ok: true });
    await avanzarMicrotareas();
    expect(m.guardarLote).toHaveBeenCalledTimes(2);
    expect(m.llamadas[1]).toEqual([{ clasificador: "B", cuentas4: ["1405"] }]);
  });

  it("si el MISMO clasificador se reedita durante el envío, se conserva y reenvía el valor más reciente", async () => {
    const m = crearGuardarLoteMock();
    const c = crearAutoguardadoConsolidacion({ guardarLote: m.guardarLote, debounceMs: DEBOUNCE });
    c.programar("A", ["1435"]);
    vi.advanceTimersByTime(DEBOUNCE);
    expect(m.llamadas[0]).toEqual([{ clasificador: "A", cuentas4: ["1435"] }]);

    c.programar("A", ["1455"]); // el usuario cambió de opinión mientras viajaba la primera
    m.resolverUltima({ ok: true }); // confirma la solicitud vieja (valor ["1435"], ya obsoleto)

    await avanzarMicrotareas();
    expect(m.guardarLote).toHaveBeenCalledTimes(2);
    expect(m.llamadas[1]).toEqual([{ clasificador: "A", cuentas4: ["1455"] }]);
  });

  it("en error conserva las ediciones pendientes, expone el mensaje y NO reintenta solo", async () => {
    const m = crearGuardarLoteMock();
    const c = crearAutoguardadoConsolidacion({ guardarLote: m.guardarLote, debounceMs: DEBOUNCE });
    c.programar("A", ["1435"]);
    vi.advanceTimersByTime(DEBOUNCE);
    m.resolverUltima({ ok: false, message: "Cuenta inválida." });
    await avanzarMicrotareas();
    expect(c.obtenerSnapshot().estado).toBe("error");
    expect(c.obtenerSnapshot().mensaje).toBe("Cuenta inválida.");
    expect(c.obtenerSnapshot().pendientes).toBe(1); // la edición NO se descarta

    vi.advanceTimersByTime(DEBOUNCE * 10);
    expect(m.guardarLote).toHaveBeenCalledTimes(1); // sin reintento automático por solo tiempo
  });

  it("«intentarAhora» reintenta de inmediato lo que falló", async () => {
    const m = crearGuardarLoteMock();
    const c = crearAutoguardadoConsolidacion({ guardarLote: m.guardarLote, debounceMs: DEBOUNCE });
    c.programar("A", ["1435"]);
    vi.advanceTimersByTime(DEBOUNCE);
    m.resolverUltima({ ok: false, message: "Falla de red." });
    await avanzarMicrotareas();
    expect(c.obtenerSnapshot().estado).toBe("error");

    c.intentarAhora();
    expect(m.guardarLote).toHaveBeenCalledTimes(2);
    expect(m.llamadas[1]).toEqual([{ clasificador: "A", cuentas4: ["1435"] }]);
    m.resolverUltima({ ok: true });
    await avanzarMicrotareas();
    expect(c.obtenerSnapshot().estado).toBe("guardado");
    expect(c.obtenerSnapshot().pendientes).toBe(0);
  });

  it("tras un error, la siguiente edición combina sola lo fallido con lo nuevo", async () => {
    const m = crearGuardarLoteMock();
    const c = crearAutoguardadoConsolidacion({ guardarLote: m.guardarLote, debounceMs: DEBOUNCE });
    c.programar("A", ["1435"]);
    vi.advanceTimersByTime(DEBOUNCE);
    m.resolverUltima({ ok: false, message: "Error." });
    await avanzarMicrotareas();
    expect(c.obtenerSnapshot().estado).toBe("error");

    c.programar("B", ["1405"]);
    vi.advanceTimersByTime(DEBOUNCE);
    expect(m.guardarLote).toHaveBeenCalledTimes(2);
    expect(m.llamadas[1]).toEqual(
      expect.arrayContaining([
        { clasificador: "A", cuentas4: ["1435"] },
        { clasificador: "B", cuentas4: ["1405"] },
      ]),
    );
  });

  it("no envía una solicitud vacía", () => {
    const m = crearGuardarLoteMock();
    const c = crearAutoguardadoConsolidacion({ guardarLote: m.guardarLote, debounceMs: DEBOUNCE });
    c.intentarAhora();
    vi.advanceTimersByTime(DEBOUNCE * 3);
    expect(m.guardarLote).not.toHaveBeenCalled();
  });

  it("destruir cancela la pausa pendiente y no reporta más cambios de estado", () => {
    const m = crearGuardarLoteMock();
    const c = crearAutoguardadoConsolidacion({ guardarLote: m.guardarLote, debounceMs: DEBOUNCE });
    const oyente = vi.fn();
    c.suscribir(oyente);
    c.programar("A", ["1435"]);
    const llamadasAntes = oyente.mock.calls.length;
    c.destruir();
    vi.advanceTimersByTime(DEBOUNCE * 3);
    expect(m.guardarLote).not.toHaveBeenCalled();
    expect(oyente.mock.calls.length).toBe(llamadasAntes); // no vuelve a notificar tras destruir
  });

  it("un oyente dado de baja deja de recibir notificaciones", () => {
    const m = crearGuardarLoteMock();
    const c = crearAutoguardadoConsolidacion({ guardarLote: m.guardarLote, debounceMs: DEBOUNCE });
    const oyente = vi.fn();
    const darDeBaja = c.suscribir(oyente);
    c.programar("A", ["1435"]);
    expect(oyente).toHaveBeenCalledTimes(1);
    darDeBaja();
    c.programar("B", ["1405"]);
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it("mantiene la referencia del snapshot mientras no cambia el estado (React)", () => {
    const m = crearGuardarLoteMock();
    const c = crearAutoguardadoConsolidacion({ guardarLote: m.guardarLote });
    const inicial = c.obtenerSnapshot();
    expect(c.obtenerSnapshot()).toBe(inicial);
    c.programar("A", ["1435"]);
    const siguiente = c.obtenerSnapshot();
    expect(siguiente).not.toBe(inicial);
    expect(c.obtenerSnapshot()).toBe(siguiente);
  });

  it("un flush vacío de Strict Mode no desactiva las ediciones posteriores", () => {
    const m = crearGuardarLoteMock();
    const c = crearAutoguardadoConsolidacion({ guardarLote: m.guardarLote });
    c.intentarAhora();
    c.programar("A", ["1435"]);
    c.intentarAhora();
    expect(m.llamadas).toEqual([[{ clasificador: "A", cuentas4: ["1435"] }]]);
  });

  it("obtenerSnapshot arranca inactivo, sin mensaje y sin pendientes", () => {
    const m = crearGuardarLoteMock();
    const c = crearAutoguardadoConsolidacion({ guardarLote: m.guardarLote, debounceMs: DEBOUNCE });
    expect(c.obtenerSnapshot()).toEqual({ estado: "inactivo", mensaje: null, pendientes: 0 });
  });
});
