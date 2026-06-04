import { test, expect } from "vitest";
import { pct, fmtDate, timeAgo } from "./format";
import { fmtPct } from "./format";

test("pct redondea a porcentaje entero", () => {
  expect(pct(0.5)).toBe("50%");
  expect(pct(0.823)).toBe("82%");
});

test("fmtDate formatea como DD/MMM/AAAA en español", () => {
  expect(fmtDate(new Date(2026, 4, 3))).toBe("03/May/2026");
  expect(fmtDate(new Date(2026, 0, 31))).toBe("31/Ene/2026");
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
