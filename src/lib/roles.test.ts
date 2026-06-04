import { test, expect } from "vitest";
import { can, roleRank, ROLE_RANK } from "./roles";

test("jerarquía Consulta < Auditor < Líder < Administrador", () => {
  expect(ROLE_RANK.Consulta).toBeLessThan(ROLE_RANK.Auditor);
  expect(ROLE_RANK.Auditor).toBeLessThan(ROLE_RANK["Líder"]);
  expect(ROLE_RANK["Líder"]).toBeLessThan(ROLE_RANK.Administrador);
});

test("can() respeta el rango mínimo", () => {
  expect(can("Administrador", "Líder")).toBe(true);
  expect(can("Líder", "Líder")).toBe(true);
  expect(can("Auditor", "Líder")).toBe(false);
  expect(can("Consulta", "Auditor")).toBe(false);
});

test("rol desconocido tiene rango 0 y no pasa ningún gate", () => {
  expect(roleRank("Hacker")).toBe(0);
  expect(can("Hacker", "Consulta")).toBe(false);
});
