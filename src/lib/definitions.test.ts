import { test, expect } from "vitest";
import { ModuleFieldSchema, ClientSchema, PasswordSchema, UserUpdateSchema } from "./definitions";

test("ModuleFieldSchema acepta un campo válido", () => {
  const r = ModuleFieldSchema.safeParse({
    moduleId: 1,
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
    moduleId: 1,
    key: "Codigo Item",
    label: "X",
    type: "string",
    required: false,
  });
  expect(r.success).toBe(false);
});

test("ModuleFieldSchema rechaza un tipo no permitido", () => {
  const r = ModuleFieldSchema.safeParse({
    moduleId: 1,
    key: "x",
    label: "X",
    type: "boolean",
    required: false,
  });
  expect(r.success).toBe(false);
});

test("ClientSchema exige código, nombre, nit, tipo y socio (erpId y sectorId opcionales)", () => {
  expect(
    ClientSchema.safeParse({
      code: "C-9001",
      name: "Demo S.A.S",
      nit: "900.000.000-1",
      tipo: "A",
      erpId: 1,
      sectorId: 2,
      socioId: 3,
    }).success,
  ).toBe(true);
  // El sector es opcional: sin sectorId sigue siendo válido.
  expect(
    ClientSchema.safeParse({
      code: "C-9001",
      name: "Demo S.A.S",
      nit: "900.000.000-1",
      tipo: "A",
      erpId: 1,
      socioId: 3,
    }).success,
  ).toBe(true);
  // Tipo fuera de A/B/C es inválido.
  expect(
    ClientSchema.safeParse({
      code: "C-9001",
      name: "Demo S.A.S",
      nit: "900.000.000-1",
      tipo: "D",
      erpId: 1,
      sectorId: 2,
      socioId: 3,
    }).success,
  ).toBe(false);
  // El ERP es OPCIONAL (se exige al iniciar una operación, no al validar el
  // formulario): sin erpId sigue siendo válido.
  expect(
    ClientSchema.safeParse({
      code: "C-9001",
      name: "Demo S.A.S",
      nit: "900.000.000-1",
      tipo: "A",
      socioId: 3,
    }).success,
  ).toBe(true);
  // Sin socio (informativo pero obligatorio) es inválido.
  expect(
    ClientSchema.safeParse({
      code: "C-9001",
      name: "Demo S.A.S",
      nit: "900.000.000-1",
      tipo: "A",
      erpId: 1,
      sectorId: 2,
    }).success,
  ).toBe(false);
  expect(
    ClientSchema.safeParse({ code: "", name: "", nit: "" }).success,
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

test("UserUpdateSchema exige un correo válido al editar usuarios", () => {
  const base = {
    id: 1,
    email: "usuario@russellbedford.co",
    name: "Usuario Demo",
    role: "Senior",
    active: true,
  };

  expect(UserUpdateSchema.safeParse(base).success).toBe(true);
  expect(UserUpdateSchema.safeParse({ ...base, email: "correo-invalido" }).success).toBe(false);
});
