import { test, expect } from "vitest";
import { pct, fmtCalendarDate, fmtContable, fmtDate, fmtDateTime, fmtDateTimeSeconds, fmtHora12, timeAgo } from "./format";
import { fmtPct } from "./format";

test("pct redondea a porcentaje entero", () => {
  expect(pct(0.5)).toBe("50%");
  expect(pct(0.823)).toBe("82%");
});

test("fmtContable alinea importes con dos decimales fijos", () => {
  expect(fmtContable(603353317.11)).toBe("$ 603.353.317,11");
  expect(fmtContable(32202023)).toBe("$ 32.202.023,00");
  expect(fmtContable(830396846)).toBe("$ 830.396.846,00");
  expect(fmtContable(-1000.5)).toBe("-$ 1.000,50");
  expect(fmtContable(null)).toBe("—");
});

test("fmtDate formatea como DD/MMM/AAAA en español", () => {
  expect(fmtDate(new Date("2026-05-03T12:00:00Z"))).toBe("03/May/2026");
  expect(fmtDate(new Date("2026-01-31T12:00:00Z"))).toBe("31/Ene/2026");
  expect(fmtDate(new Date("2026-07-17T04:30:00Z"))).toBe("16/Jul/2026");
});

test("fmtDateTime siempre muestra el reloj de Colombia en 12 horas", () => {
  const instante = new Date("2026-07-17T04:30:45Z");
  expect(fmtDateTime(instante)).toBe("16/Jul/2026 11:30 p. m.");
  expect(fmtDateTimeSeconds(instante)).toBe("16/Jul/2026 11:30:45 p. m.");
});

test("fmtDateTime maneja medianoche y mediodía como 12 a. m./p. m.", () => {
  // 05:15Z = 00:15 en Colombia; 17:00Z = 12:00 del mediodía.
  expect(fmtDateTime(new Date("2026-07-17T05:15:00Z"))).toBe("17/Jul/2026 12:15 a. m.");
  expect(fmtDateTime(new Date("2026-07-17T17:00:00Z"))).toBe("17/Jul/2026 12:00 p. m.");
  expect(fmtDateTime(new Date("2026-07-17T22:07:00Z"))).toBe("17/Jul/2026 5:07 p. m.");
});

test("fmtHora12 muestra solo la hora de Colombia en 12 horas", () => {
  expect(fmtHora12(new Date("2026-07-17T04:30:45Z"))).toBe("11:30 p. m.");
  expect(fmtHora12(new Date("2026-07-17T05:15:00Z"))).toBe("12:15 a. m.");
  expect(fmtHora12(new Date("2026-07-17T17:00:00Z"))).toBe("12:00 p. m.");
  expect(fmtHora12(new Date("2026-07-17T13:05:00Z"))).toBe("8:05 a. m.");
  expect(fmtHora12(null)).toBe("—");
});

test("fmtCalendarDate conserva una fecha PostgreSQL DATE", () => {
  expect(fmtCalendarDate(new Date("2026-07-16T00:00:00Z"))).toBe("16/Jul/2026");
  expect(fmtCalendarDate("2026-01-31")).toBe("31/Ene/2026");
});

test("fmtDate devuelve guion para entradas nulas o inválidas", () => {
  expect(fmtDate(null)).toBe("—");
  expect(fmtDate("no-es-fecha")).toBe("—");
});

test("timeAgo expresa la diferencia relativa con un ahora fijo", () => {
  const now = new Date(2026, 0, 1, 12, 30, 0);
  expect(timeAgo(new Date(2026, 0, 1, 12, 0, 0), now)).toBe("hace 30 min");
  expect(timeAgo(new Date(2026, 0, 1, 10, 30, 0), now)).toBe("hace 2 h");
  expect(timeAgo(new Date(2025, 11, 30, 12, 30, 0), now)).toBe("hace 2 días");
  expect(timeAgo(new Date(2026, 0, 1, 12, 29, 30), now)).toBe("hace un momento");
});

test("fmtPct formatea con signo y 1 decimal", () => {
  expect(fmtPct(26.49)).toBe("+26,5%");
  expect(fmtPct(-18.1)).toBe("-18,1%");
  expect(fmtPct(0)).toBe("+0,0%");
});

test("fmtPct devuelve guion para null", () => {
  expect(fmtPct(null)).toBe("—");
});
