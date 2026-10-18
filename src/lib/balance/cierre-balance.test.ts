import { describe, expect, it } from "vitest";
import { accionParaResolver, evaluarCierreBalance, mensajeCierreBloqueado, mensajePrevalidadorParaCerrar, type OtroBalanceCierre } from "./cierre-balance";

const otro = (over: Partial<OtroBalanceCierre> = {}): OtroBalanceCierre => ({
  id: 2, version: "v1", nombre: "Enero 2025 – Diciembre 2025 · Por terceros", estaCongelado: false, enFirme: false,
  comparacion: { inconsistente: false, cuentas: 0 }, ...over,
});
const base = { balanceId: 1, vigenteDeMiLinea: { id: 1, version: "v2" }, anterioresCerradas: [], otros: [otro()], mensajePrevalidador: null };

describe("evaluarCierreBalance", () => {
  it("cierra cuando es la vigente, los demás coinciden y el prevalidador está aprobado", () => {
    expect(evaluarCierreBalance(base)).toEqual({ ok: true });
    expect(evaluarCierreBalance({ ...base, otros: [] })).toEqual({ ok: true });
  });

  it("solo la versión vigente de la línea se cierra", () => {
    const r = evaluarCierreBalance({ ...base, vigenteDeMiLinea: { id: 9, version: "v3" } });
    expect(r).toEqual({ ok: false, bloqueo: { tipo: "no_vigente", vigente: { id: 9, version: "v3" } } });
    if (!r.ok) expect(mensajeCierreBloqueado(r.bloqueo)).toContain("la vigente es la v3");
  });

  it("no cierra mientras una versión anterior de la línea siga cerrada", () => {
    const r = evaluarCierreBalance({ ...base, anterioresCerradas: [{ id: 7, version: "v1" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(mensajeCierreBloqueado(r.bloqueo)).toBe("La versión anterior v1 de esta línea sigue cerrada: ábrela antes de cerrar esta.");
  });

  it("un par sin comparar bloquea la acción pero no el botón de la pantalla", () => {
    const sinComparar = { ...base, otros: [otro({ comparacion: null })] };
    expect(evaluarCierreBalance(sinComparar)).toMatchObject({ ok: false, bloqueo: { tipo: "sin_comparar" } });
    expect(evaluarCierreBalance({ ...sinComparar, ignorarSinComparar: true })).toEqual({ ok: true });
  });

  it("con diferencias dice con qué balances y cómo resolver cada uno", () => {
    const r = evaluarCierreBalance({
      ...base,
      otros: [
        otro({ id: 2, comparacion: { inconsistente: true, cuentas: 3 } }),
        otro({ id: 3, version: "v4", nombre: "Diciembre 2025 · Por cuenta", estaCongelado: true, comparacion: { inconsistente: true, cuentas: 1 } }),
        otro({ id: 4, version: "v2", nombre: "Diciembre 2025 · Por terceros", estaCongelado: true, enFirme: true, comparacion: { inconsistente: true, cuentas: 5 } }),
      ],
    });
    expect(r.ok).toBe(false);
    if (r.ok || r.bloqueo.tipo !== "inconsistente") throw new Error("esperaba inconsistente");
    expect(r.bloqueo.balances.map((b) => b.accion)).toEqual(["eliminar", "abrir_y_eliminar", "reemplazar"]);
    const mensaje = mensajeCierreBloqueado(r.bloqueo);
    expect(mensaje).toContain("los saldos finales difieren de Enero 2025 – Diciembre 2025 · Por terceros v1 (3 cuenta(s))");
    expect(mensaje).toContain("Si sobra Diciembre 2025 · Por cuenta v4, ábrelo y elimínalo.");
    expect(mensaje).toContain("reemplázalo por este con «Reemplazar el balance conciliado»");
  });

  it("el prevalidador va después de la comparación", () => {
    expect(evaluarCierreBalance({ ...base, mensajePrevalidador: "No se puede cerrar el balance: el prevalidador todavía no ha sido aprobado." }))
      .toEqual({ ok: false, bloqueo: { tipo: "prevalidador", mensaje: "No se puede cerrar el balance: el prevalidador todavía no ha sido aprobado." } });
  });

  it("accionParaResolver: en firme se reemplaza, cerrado se abre y se elimina", () => {
    expect(accionParaResolver({ estaCongelado: false, enFirme: false })).toBe("eliminar");
    expect(accionParaResolver({ estaCongelado: true, enFirme: false })).toBe("abrir_y_eliminar");
    expect(accionParaResolver({ estaCongelado: true, enFirme: true })).toBe("reemplazar");
  });
});

describe("mensajePrevalidadorParaCerrar", () => {
  const listo = { estado: "listo" };
  it("null con el prevalidador listo y aprobado", () => {
    expect(mensajePrevalidadorParaCerrar({ prevalidador: listo, revision: { vigente: true, estado: "aprobada" } })).toBeNull();
  });
  it.each([
    [{ estado: "sin_catalogo" }, { vigente: false, estado: "pendiente" }, "no tiene cuentas activas"],
    [{ estado: "bloqueado", sinHomologar: { cuentas: 4 } }, { vigente: false, estado: "pendiente" }, "quedan 4 cuenta(s) sin homologar"],
    [{ estado: "no_disponible", mensaje: "falló la lectura." }, { vigente: false, estado: "pendiente" }, "falló la lectura."],
    [listo, { vigente: false, estado: "pendiente" }, "todavía no ha sido aprobado"],
    [listo, { vigente: false, estado: "revocada" }, "fue revocada"],
    [listo, { vigente: false, estado: "desactualizada" }, "está desactualizada"],
  ])("explica %o", (prevalidador, revision, texto) => {
    expect(mensajePrevalidadorParaCerrar({ prevalidador, revision })).toContain(texto);
  });
});
