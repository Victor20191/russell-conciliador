import { test, expect } from "vitest";
import { ModuleFieldSchema, ClientSchema, PasswordSchema } from "./definitions";

test("ModuleFieldSchema acepta un campo válido", () => {
  const r = ModuleFieldSchema.safeParse({
    moduleId: "INV",
    key: "codigo_item",
    label: "Código del ítem",
    type: "string",
    required: true,
    hint: "",
  });
  expect(r.success).toBe(true);
});

test("ModuleFieldSchema rechaza clave con mayúsculas o espacios", () => {
  const r = ModuleFieldSchema.safeParse({
    moduleId: "INV",
    key: "Codigo Item",
    label: "X",
    type: "string",
    required: false,
  });
  expect(r.success).toBe(false);
});

test("ModuleFieldSchema rechaza un tipo no permitido", () => {
  const r = ModuleFieldSchema.safeParse({
    moduleId: "INV",
    key: "x",
    label: "X",
    type: "boolean",
    required: false,
  });
  expect(r.success).toBe(false);
});

test("ClientSchema exige código, nombre, nit, erp y sector", () => {
  expect(
    ClientSchema.safeParse({
      id: "C-9001",
      name: "Demo S.A.S",
      nit: "900.000.000-1",
      erp: "SIESA",
      sector: "Comercio",
    }).success,
  ).toBe(true);
  expect(
    ClientSchema.safeParse({ id: "", name: "", nit: "", erp: "", sector: "" }).success,
  ).toBe(false);
});

test("PasswordSchema acepta una contraseña fuerte", () => {
  expect(PasswordSchema.safeParse("Russell2026").success).toBe(true);
});

test("PasswordSchema rechaza contraseñas cortas o sin letra/dígito", () => {
  expect(PasswordSchema.safeParse("corta1").success).toBe(false);       // < 10 chars
  expect(PasswordSchema.safeParse("sololetrasaqui").success).toBe(false); // sin dígito
  expect(PasswordSchema.safeParse("1234567890").success).toBe(false);     // sin letra
});
