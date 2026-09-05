import { describe, expect, it, vi } from "vitest";
import { crearEstadoGuardado } from "./estado-guardado";

const mensajes = { exito: "Dato guardado.", error: "No se pudo guardar." };
function diferida() {
  let resolver!: (resultado: { ok?: boolean; message?: string }) => void;
  const promesa = new Promise<{ ok?: boolean; message?: string }>((resolve) => { resolver = resolve; });
  return { promesa, resolver };
}

describe("estado de guardado", () => {
  it("confirma únicamente después de recibir ok true", async () => {
    const c = crearEstadoGuardado();
    const d = diferida();
    expect(c.obtenerSnapshot().estado).toBe("inactivo");
    const envio = c.ejecutar(() => d.promesa, mensajes);
    expect(c.obtenerSnapshot().estado).toBe("guardando");
    d.resolver({ ok: true });
    expect(await envio).toEqual({ ok: true });
    expect(c.obtenerSnapshot()).toEqual({ estado: "guardado", mensaje: mensajes.exito });
  });

  it.each([{ ok: false }, {}, { ok: false, message: "Sin permiso." }])("expone resultados fallidos %o", async (resultado) => {
    const c = crearEstadoGuardado();
    expect(await c.ejecutar(async () => resultado, mensajes)).toEqual(resultado);
    expect(c.obtenerSnapshot()).toEqual({ estado: "error", mensaje: resultado.message || mensajes.error });
  });

  it("contiene fallos de transporte y permite reintentar", async () => {
    const c = crearEstadoGuardado();
    expect(await c.ejecutar(async () => { throw new Error("red"); }, mensajes)).toBeNull();
    expect(c.obtenerSnapshot()).toEqual({ estado: "error", mensaje: mensajes.error });
    await c.ejecutar(async () => ({ ok: true }), mensajes);
    expect(c.obtenerSnapshot().estado).toBe("guardado");
  });

  it("espera todos los envíos concurrentes antes de confirmar", async () => {
    const c = crearEstadoGuardado();
    const a = diferida(); const b = diferida();
    const uno = c.ejecutar(() => a.promesa, mensajes);
    const dos = c.ejecutar(() => b.promesa, mensajes);
    a.resolver({ ok: true }); await uno;
    expect(c.obtenerSnapshot().estado).toBe("guardando");
    b.resolver({ ok: true }); await dos;
    expect(c.obtenerSnapshot().estado).toBe("guardado");
  });

  it.each([true, false])("no oculta errores con éxitos concurrentes (error primero %s)", async (errorPrimero) => {
    const c = crearEstadoGuardado();
    const a = diferida(); const b = diferida();
    const uno = c.ejecutar(() => a.promesa, mensajes);
    const dos = c.ejecutar(() => b.promesa, mensajes);
    a.resolver({ ok: !errorPrimero }); await uno;
    b.resolver({ ok: errorPrimero }); await dos;
    expect(c.obtenerSnapshot().estado).toBe("error");
  });

  it("una edición nueva invalida la confirmación del envío anterior", async () => {
    const c = crearEstadoGuardado();
    const d = diferida();
    const envio = c.ejecutar(() => d.promesa, mensajes);
    c.descartar();
    d.resolver({ ok: true }); await envio;
    expect(c.obtenerSnapshot().estado).toBe("pendiente");
    await c.ejecutar(async () => ({ ok: true }), mensajes);
    expect(c.obtenerSnapshot().estado).toBe("guardado");
    c.descartar();
    expect(c.obtenerSnapshot().estado).toBe("pendiente");
  });

  it("una respuesta antigua no reemplaza la confirmación de la edición vigente", async () => {
    const c = crearEstadoGuardado();
    const d = diferida();
    const envio = c.ejecutar(() => d.promesa, mensajes);
    c.descartar();
    await c.ejecutar(async () => ({ ok: true }), { ...mensajes, exito: "Edición nueva guardada." });
    d.resolver({ ok: true }); await envio;
    expect(c.obtenerSnapshot()).toEqual({ estado: "guardado", mensaje: "Edición nueva guardada." });
  });

  it("conserva el error al editar y deja de notificar después de desuscribirse", async () => {
    const c = crearEstadoGuardado();
    const oyente = vi.fn();
    const cancelar = c.suscribir(oyente);
    const inicial = c.obtenerSnapshot();
    expect(c.obtenerSnapshot()).toBe(inicial);
    await c.ejecutar(async () => ({ ok: false }), mensajes);
    c.descartar();
    expect(c.obtenerSnapshot().estado).toBe("error");
    cancelar();
    const llamadas = oyente.mock.calls.length;
    c.descartar();
    expect(oyente).toHaveBeenCalledTimes(llamadas);
  });
});
