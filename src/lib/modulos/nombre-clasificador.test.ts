import { describe, expect, it } from "vitest";
import {
  grupoSinNombreDe,
  nombreParecido,
  normalizarNombreClasificador,
  opcionesNombreClasificador,
} from "./nombre-clasificador";

describe("nombre del agrupador del borrador", () => {
  it("los grupos que nombra el sistema: sin clasificador y GLOBAL", () => {
    expect(grupoSinNombreDe(null)).toBe("sin_clasificar");
    expect(grupoSinNombreDe("   ")).toBe("sin_clasificar");
    expect(grupoSinNombreDe("GLOBAL")).toBe("global");
    expect(grupoSinNombreDe("130505")).toBeNull();
    expect(grupoSinNombreDe("Global")).toBeNull(); // solo el nombre exacto que pone el modo global
  });

  it("acepta letras y números, limpia espacios y rechaza vacío, largo y el nombre reservado", () => {
    expect(normalizarNombreClasificador("  Cartera   USD ")).toEqual({ ok: true, nombre: "Cartera USD" });
    expect(normalizarNombreClasificador("130510")).toEqual({ ok: true, nombre: "130510" });
    expect(normalizarNombreClasificador("  ")).toMatchObject({ ok: false });
    expect(normalizarNombreClasificador("x".repeat(81))).toMatchObject({ ok: false });
    expect(normalizarNombreClasificador("(Sin Clasificar)")).toMatchObject({ ok: false });
  });

  it("ofrece primero los nombres del cargue destino, luego los de la memoria, sin repetir", () => {
    const opciones = opcionesNombreClasificador({
      destino: { version: 3, nombres: ["USD", null, "  "] },
      memoria: [
        { nombre: "USD", cuentas: ["130510"] },
        { nombre: "COP", cuentas: ["130505", "130505"] },
        { nombre: "(sin clasificar)", cuentas: ["130505"] },
        { nombre: "GLOBAL", cuentas: [] },
      ],
      delBorrador: [null, "COP"],
    });
    expect(opciones).toEqual([
      { nombre: "USD", detalle: "ya en la v3 · se junta con esas filas · usado antes · R-130510", enDestino: true },
      { nombre: "COP", detalle: "usado antes · R-130505 · en este borrador", enDestino: false },
      { nombre: "GLOBAL", detalle: "usado antes", enDestino: false },
    ]);
  });

  it("avisa cuando lo escrito difiere de una opción solo en mayúsculas, tildes o espacios", () => {
    const opciones = [{ nombre: "Mercancía" }, { nombre: "USD" }];
    expect(nombreParecido("MERCANCIA", opciones)).toBe("Mercancía");
    expect(nombreParecido("Mercancía", opciones)).toBeNull();
    expect(nombreParecido("EUR", opciones)).toBeNull();
  });
});
