import { describe, expect, it } from "vitest";
import { TITULO_OTRAS_OBSERVACIONES, resolverResultadoLectura, type EstadoLecturaVisible } from "./resultado-lectura";
import { REGLA_ARCHIVO_NO_IMPORTABLE } from "./extraccion/causa-sin-cuentas";
import type { Excepcion } from "./extraccion/esquema";
import { MENSAJE_RECUPERAR_LECTURA } from "./recuperacion-red";

const otra: Excepcion = { hoja: "Sheet1", fila: 3, campo: "periodo", valor: null, regla: "Período no completo", accion: "Confirmar período" };
const delRechazo: Excepcion = {
  hoja: "Sheet1", fila: null, campo: null, valor: null, regla: REGLA_ARCHIVO_NO_IMPORTABLE, accion: "Solo trae saldo final.",
};

const RECHAZADO: EstadoLecturaVisible = {
  message: "No se cargó el archivo: le faltan las columnas Saldo inicial, Débitos y Créditos.",
  rechazoLectura: { motivo: "Solo trae saldo final.", columnasFaltantes: ["Saldo inicial", "Débitos", "Créditos"] },
  excepciones: [otra, delRechazo],
};

const BASE = { segundoPaso: false, desactualizado: false, enCurso: false, reintentoPendiente: false };

describe("resolverResultadoLectura · rechazo del archivo", () => {
  it.each([
    ["paso 1 (sin cliente elegido)", false],
    ["paso 2 (con cliente elegido)", true],
  ])("se ve en el %s, con el mensaje solo en el panel y la tabla sin la fila del rechazo", (_nombre, segundoPaso) => {
    const r = resolverResultadoLectura({ ...BASE, segundoPaso, estado: RECHAZADO });
    expect(r.rechazo).toEqual(RECHAZADO.rechazoLectura);
    expect(r.mensaje).toBe(false); // el panel ya lleva el mensaje: no se repite en rojo
    expect(r.excepciones).toEqual([otra]);
    expect(r.tituloExcepciones).toBe(TITULO_OTRAS_OBSERVACIONES);
  });

  it("sin otras observaciones no queda tabla", () => {
    const r = resolverResultadoLectura({ ...BASE, estado: { ...RECHAZADO, excepciones: [delRechazo] } });
    expect(r.rechazo).not.toBeNull();
    expect(r.excepciones).toEqual([]);
  });

  it.each([
    ["se elige otro archivo (o cambia hoja, proveedor o cliente)", { desactualizado: true }],
    ["se está subiendo o leyendo de nuevo", { enCurso: true }],
  ])("desaparece por completo cuando %s", (_motivo, cambio) => {
    for (const segundoPaso of [false, true]) {
      const r = resolverResultadoLectura({ ...BASE, segundoPaso, ...cambio, estado: RECHAZADO });
      expect(r).toEqual({ mensaje: false, rechazo: null, errores: false, excepciones: [], tituloExcepciones: undefined });
    }
  });

  it("un rechazo sin mensaje no abre el panel", () => {
    const r = resolverResultadoLectura({ ...BASE, estado: { rechazoLectura: RECHAZADO.rechazoLectura } });
    expect(r.rechazo).toBeNull();
  });
});

describe("resolverResultadoLectura · el error se ve en ambos pasos", () => {
  const fallo: EstadoLecturaVisible = { message: "No se leyó ninguna cuenta del archivo. Revisa las excepciones.", excepciones: [otra] };

  it.each([false, true])("lectura fallida sin rechazo (segundoPaso=%s): mensaje y excepciones visibles", (segundoPaso) => {
    const r = resolverResultadoLectura({ ...BASE, segundoPaso, estado: fallo });
    expect(r.mensaje).toBe(true);
    expect(r.rechazo).toBeNull();
    expect(r.excepciones).toEqual([otra]);
    expect(r.tituloExcepciones).toBeUndefined(); // título predeterminado de la tabla
  });

  it.each([false, true])("los errores del archivo se ven (segundoPaso=%s)", (segundoPaso) => {
    const r = resolverResultadoLectura({ ...BASE, segundoPaso, estado: { message: "2 problema(s) en el archivo. Nada se leyó.", errores: [{ fila: 1 }] } });
    expect(r.errores).toBe(true);
    expect(r.mensaje).toBe(true);
  });

  it("el aviso «elige un cliente» no reaparece como error en el paso 2", () => {
    const pendiente: EstadoLecturaVisible = { message: "No pudimos reconocer el NIT del archivo.", requiereCliente: true, excepciones: [otra] };
    const r = resolverResultadoLectura({ ...BASE, segundoPaso: true, estado: pendiente });
    expect(r).toEqual({ mensaje: false, rechazo: null, errores: false, excepciones: [], tituloExcepciones: undefined });
  });

  it("el aviso «elige un cliente» conserva su comportamiento anterior en el paso 1", () => {
    const pendiente: EstadoLecturaVisible = { message: "No pudimos reconocer el NIT del archivo.", requiereCliente: true, excepciones: [otra] };
    const r = resolverResultadoLectura({ ...BASE, segundoPaso: false, estado: pendiente });
    expect(r.mensaje).toBe(false); // el mensaje va en el recuadro del selector de cliente
    expect(r.excepciones).toEqual([otra]);
  });

  it.each([false, true])("el mensaje de «reintenta» solo se muestra cuando procede (segundoPaso=%s)", (segundoPaso) => {
    const estado: EstadoLecturaVisible = { message: MENSAJE_RECUPERAR_LECTURA };
    expect(resolverResultadoLectura({ ...BASE, segundoPaso, estado }).mensaje).toBe(false);
    expect(resolverResultadoLectura({ ...BASE, segundoPaso, estado, reintentoPendiente: true }).mensaje).toBe(true);
  });

  it("fuera de un rechazo, cambiar de archivo no oculta el mensaje (comportamiento previo)", () => {
    const r = resolverResultadoLectura({ ...BASE, desactualizado: true, enCurso: true, estado: fallo });
    expect(r.mensaje).toBe(true);
    expect(r.excepciones).toEqual([otra]);
  });

  it("estado inicial: no se muestra nada", () => {
    const r = resolverResultadoLectura({ ...BASE, estado: {} });
    expect(r).toEqual({ mensaje: false, rechazo: null, errores: false, excepciones: [], tituloExcepciones: undefined });
  });
});
