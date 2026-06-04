import { test, expect } from "vitest";
import { pct } from "./format";

test("pct redondea a porcentaje entero", () => {
  expect(pct(0.5)).toBe("50%");
  expect(pct(0.823)).toBe("82%");
});
