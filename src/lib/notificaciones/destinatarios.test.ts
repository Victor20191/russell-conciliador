import { describe, expect, it } from "vitest";
import { DestinatarioNotificacionSchema, ProgramacionNotificacionSchema } from "@/lib/definitions";
import {
  correosDeEnvio,
  destinatariosDeEnvio,
  etiquetaDestinatario,
  normalizarCorreo,
  puedeAgregarDestinatario,
  TOPE_DESTINATARIOS,
  tieneCaracteresDeControl,
} from "./destinatarios";

describe("destinatarios: validación y normalización", () => {
  it("acepta cualquier correo válido y lo guarda en minúsculas y sin espacios", () => {
    const r = DestinatarioNotificacionSchema.parse({ correo: "  Gerencia@Cliente.CO ", nombre: "  Ana Pérez  " });
    expect(r).toEqual({ correo: "gerencia@cliente.co", nombre: "Ana Pérez" });
  });

  it("el nombre es opcional: vacío o ausente queda en null", () => {
    expect(DestinatarioNotificacionSchema.parse({ correo: "a@b.co" }).nombre).toBeNull();
    expect(DestinatarioNotificacionSchema.parse({ correo: "a@b.co", nombre: "   " }).nombre).toBeNull();
  });

  it("rechaza correos inválidos, con espacios intermedios o con saltos de línea", () => {
    for (const correo of ["", "sin-arroba", "a@", "@b.co", "a b@c.co", "a@b.co\nbcc:x@y.co", "a@b.co, c@d.co"]) {
      expect(DestinatarioNotificacionSchema.safeParse({ correo }).success, correo).toBe(false);
    }
  });

  it("rechaza nombres con saltos de línea o demasiado largos", () => {
    expect(DestinatarioNotificacionSchema.safeParse({ correo: "a@b.co", nombre: "Ana\r\nCc: x@y.co" }).success).toBe(false);
    expect(DestinatarioNotificacionSchema.safeParse({ correo: "a@b.co", nombre: "x".repeat(101) }).success).toBe(false);
    expect(tieneCaracteresDeControl("Ana\tPérez")).toBe(true);
    expect(tieneCaracteresDeControl("Ana Pérez ñ")).toBe(false);
  });

  it("normalizarCorreo iguala mayúsculas y espacios", () => {
    expect(normalizarCorreo("  Ana@X.CO ")).toBe("ana@x.co");
  });
});

describe("destinatarios: lista de envío", () => {
  it("envía solo a los activos, sin repetir aunque difieran en mayúsculas, en el orden de la lista", () => {
    const lista = [
      { correo: "ana@x.co", activo: true },
      { correo: "luis@x.co", activo: false },
      { correo: "ANA@x.co", activo: true },
      { correo: "eva@x.co", nombre: "Eva", activo: true },
    ];
    expect(correosDeEnvio(lista)).toEqual(["ana@x.co", "eva@x.co"]);
    expect(destinatariosDeEnvio(lista)).toEqual([
      { correo: "ana@x.co", activo: true },
      { correo: "eva@x.co", nombre: "Eva", activo: true },
    ]);
  });

  it("una lista vacía o toda pausada no envía a nadie", () => {
    expect(correosDeEnvio([])).toEqual([]);
    expect(correosDeEnvio([{ correo: "a@b.co", activo: false }])).toEqual([]);
  });

  it("respeta el tope de destinatarios", () => {
    expect(puedeAgregarDestinatario(TOPE_DESTINATARIOS - 1)).toBe(true);
    expect(puedeAgregarDestinatario(TOPE_DESTINATARIOS)).toBe(false);
  });

  it("la etiqueta muestra el nombre cuando lo hay", () => {
    expect(etiquetaDestinatario({ correo: "a@b.co", nombre: "Ana" })).toBe("Ana <a@b.co>");
    expect(etiquetaDestinatario({ correo: "a@b.co", nombre: null })).toBe("a@b.co");
  });
});

describe("programación: validación", () => {
  it("acepta día 1 a 7 y hora HH:mm; sin período, el de siempre (desde el último reporte, 7 días)", () => {
    expect(ProgramacionNotificacionSchema.parse({ activa: true, diaSemana: "3", hora: " 08:30 " })).toEqual({
      activa: true,
      diaSemana: 3,
      hora: "08:30",
      modoPeriodo: "continua",
      diasPeriodo: 7,
      incluirDiaEnvio: false,
    });
  });

  it("acepta «los últimos N días» de 1 a 30 y rechaza otro modo u otros días", () => {
    expect(
      ProgramacionNotificacionSchema.parse({ activa: true, diaSemana: 3, hora: "07:00", modoPeriodo: "ultimos_dias", diasPeriodo: "14" }),
    ).toMatchObject({ modoPeriodo: "ultimos_dias", diasPeriodo: 14 });
    for (const periodo of [
      { modoPeriodo: "semanal", diasPeriodo: 7 },
      { modoPeriodo: "ultimos_dias", diasPeriodo: 0 },
      { modoPeriodo: "ultimos_dias", diasPeriodo: 31 },
      { modoPeriodo: "ultimos_dias", diasPeriodo: 6.5 },
      { modoPeriodo: "ultimos_dias", diasPeriodo: 7, incluirDiaEnvio: "si" },
    ]) {
      expect(ProgramacionNotificacionSchema.safeParse({ activa: true, diaSemana: 3, hora: "07:00", ...periodo }).success).toBe(false);
    }
  });

  it("rechaza día fuera de rango, hora mal formada y activa no booleana", () => {
    expect(ProgramacionNotificacionSchema.safeParse({ activa: true, diaSemana: 0, hora: "08:30" }).success).toBe(false);
    expect(ProgramacionNotificacionSchema.safeParse({ activa: true, diaSemana: 8, hora: "08:30" }).success).toBe(false);
    expect(ProgramacionNotificacionSchema.safeParse({ activa: true, diaSemana: 2.5, hora: "08:30" }).success).toBe(false);
    expect(ProgramacionNotificacionSchema.safeParse({ activa: true, diaSemana: 1, hora: "8:30" }).success).toBe(false);
    expect(ProgramacionNotificacionSchema.safeParse({ activa: true, diaSemana: 1, hora: "25:00" }).success).toBe(false);
    expect(ProgramacionNotificacionSchema.safeParse({ activa: "si", diaSemana: 1, hora: "08:30" }).success).toBe(false);
  });
});
