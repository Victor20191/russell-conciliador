import { describe, expect, test } from "vitest";
import { parseId } from "./ids";

describe("parseId", () => {
  test("acepta enteros positivos", () => {
    expect(parseId(1)).toBe(1);
    expect(parseId("42")).toBe(42);
  });

  test("rechaza UUID, cero, negativos y decimales", () => {
    expect(parseId("adc70f1f-4738-4a99-8acf-5cf28be5b8a")).toBeNull();
    expect(parseId("0")).toBeNull();
    expect(parseId("-1")).toBeNull();
    expect(parseId("1.5")).toBeNull();
  });
});
