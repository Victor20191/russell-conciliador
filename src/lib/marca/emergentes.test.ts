import { describe, expect, it } from "vitest";
import { aIso, deIso, diasDelMes, fechaLegible, filtrarSugerencias, hoyIso, mensajeValidacion, paraBuscar, permitido, posicionAviso, posicionEmergente, semanasDelMes, sumarMeses } from "./emergentes";

const caja = (top: number, left: number, width: number, height: number) => ({ top, left, width, height, bottom: top + height, right: left + width });

describe("posición de las ventanas emergentes", () => {
  it("debajo del control si cabe; encima si no; nunca fuera de la ventana", () => {
    expect(posicionEmergente(caja(100, 50, 200, 30), { ancho: 220, alto: 150 }, { ancho: 1000, alto: 800 })).toEqual({ top: 134, left: 50, arriba: false });
    expect(posicionEmergente(caja(700, 50, 200, 30), { ancho: 220, alto: 150 }, { ancho: 1000, alto: 800 })).toEqual({ top: 546, left: 50, arriba: true });
    expect(posicionEmergente(caja(100, 900, 200, 30), { ancho: 220, alto: 150 }, { ancho: 1000, alto: 800 }).left).toBe(772);
  });

  it("el aviso va centrado bajo el control", () => {
    expect(posicionAviso(caja(100, 100, 40, 20), { ancho: 100, alto: 30 }, { ancho: 1000, alto: 800 })).toEqual({ top: 126, left: 70 });
  });
});

describe("sugerencias", () => {
  const opciones = [
    { valor: "130505", texto: "Clientes nacionales" },
    { valor: "220505", texto: "Proveedores nacionales" },
    { valor: "510506", texto: "Sueldos y salarios" },
  ];
  it("busca sin tildes ni mayúsculas, primero las que empiezan igual", () => {
    expect(paraBuscar("  Nómina  ÁRea ")).toBe("nomina area");
    expect(filtrarSugerencias(opciones, "nacion").map((o) => o.valor)).toEqual(["130505", "220505"]);
    expect(filtrarSugerencias(opciones, "5").map((o) => o.valor)).toEqual(["510506", "130505", "220505"]);
    expect(filtrarSugerencias(opciones, "").length).toBe(3);
  });
});

describe("calendario", () => {
  it("lee y escribe fechas ISO", () => {
    expect(deIso("2026-10-27")).toEqual({ anio: 2026, mes: 10, dia: 27 });
    expect(deIso("2026-10")).toEqual({ anio: 2026, mes: 10, dia: null });
    expect(deIso("2026-02-30")).toBeNull();
    expect(aIso(2026, 3, 5)).toBe("2026-03-05");
    expect(diasDelMes(2028, 2)).toBe(29);
    expect(sumarMeses(2026, 12, 1)).toEqual({ anio: 2027, mes: 1 });
    expect(sumarMeses(2026, 1, -1)).toEqual({ anio: 2025, mes: 12 });
    expect(fechaLegible("2026-10-27")).toBe("27 de octubre de 2026");
  });

  it("la cuadrícula del mes empieza en lunes y trae seis semanas", () => {
    const semanas = semanasDelMes(2026, 10); // 1 de octubre de 2026 es jueves
    expect(semanas).toHaveLength(6);
    expect(semanas[0][0]).toEqual({ iso: "2026-09-28", dia: 28, delMes: false });
    expect(semanas[0][3]).toEqual({ iso: "2026-10-01", dia: 1, delMes: true });
  });

  it("respeta los límites del campo", () => {
    expect(permitido("2026-10-27", null, "2026-10-27")).toBe(true);
    expect(permitido("2026-10-28", null, "2026-10-27")).toBe(false);
    expect(permitido("2026-09", "2026-10", null)).toBe(false);
    expect(hoyIso(new Date(2026, 9, 27, 23, 30))).toBe("2026-10-27");
  });
});

describe("mensajes de validación en español", () => {
  it("dice qué falta, sin depender del idioma del navegador", () => {
    expect(mensajeValidacion({ validez: { valueMissing: true }, etiqueta: "select", tipo: "" })).toBe("Elige una opción de la lista.");
    expect(mensajeValidacion({ validez: { valueMissing: true }, etiqueta: "input", tipo: "text" })).toBe("Completa este campo.");
    expect(mensajeValidacion({ validez: { typeMismatch: true }, etiqueta: "input", tipo: "email" })).toBe("Escribe un correo válido (nombre@dominio.com).");
    expect(mensajeValidacion({ validez: { rangeOverflow: true }, etiqueta: "input", tipo: "date", max: "2026-10-27" })).toBe("La fecha no puede ser posterior a 27 de octubre de 2026.");
    expect(mensajeValidacion({ validez: { tooShort: true }, etiqueta: "input", tipo: "password", minLength: 12, largo: 5 })).toBe("Escribe al menos 12 caracteres (llevas 5).");
    expect(mensajeValidacion({ validez: { customError: true }, etiqueta: "input", tipo: "text", mensajePropio: "Selecciona un cliente de la lista." })).toBe("Selecciona un cliente de la lista.");
  });
});
