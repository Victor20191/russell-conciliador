import { test, expect, describe } from "vitest";
import {
  MATRIZ,
  matrizConLegado,
  MAPEO_LEGADO_PDF,
  PERMISOS_LECTURA_GENERAL,
  ROLES_LEGADO,
} from "./catalogo";
import { tienePermiso } from "./permisos";

const M = matrizConLegado();

describe("Mapeo legado→PDF (herencia de permisos)", () => {
  test("el mapeo cubre los 4 roles legado en uso", () => {
    const cubiertos = new Set(MAPEO_LEGADO_PDF.map((m) => m.legacy));
    for (const r of [...ROLES_LEGADO, "Administrador"]) {
      expect(cubiertos.has(r)).toBe(true);
    }
  });

  test("Auditor hereda exactamente los permisos de Staff (operativo)", () => {
    expect(M["Auditor"]).toEqual(MATRIZ["Staff"]);
    expect(tienePermiso(M, "Auditor", "conciliaciones:ejecutar")).toBe(true);
    expect(tienePermiso(M, "Auditor", "clientes:configurar")).toBe(false);
  });

  test("Líder hereda exactamente los permisos de Senior (revisión/config)", () => {
    expect(M["Líder"]).toEqual(MATRIZ["Senior"]);
    expect(tienePermiso(M, "Líder", "conciliaciones:revisar")).toBe(true);
    expect(tienePermiso(M, "Líder", "clientes:configurar")).toBe(true);
    expect(tienePermiso(M, "Líder", "clientes:editar")).toBe(true);
    expect(tienePermiso(M, "Líder", "conciliaciones:ejecutar")).toBe(false); // no es operativo
  });

  test("Administrador es identidad (mismos permisos de administración)", () => {
    expect(M["Administrador"]).toEqual(MATRIZ["Administrador"]);
    expect(tienePermiso(M, "Administrador", "usuarios:crear")).toBe(true);
    expect(tienePermiso(M, "Administrador", "modulos:configurar")).toBe(true);
  });

  test("Consulta queda como solo-lectura general (ni opera, ni configura, ni administra)", () => {
    expect(M["Consulta"]).toEqual(PERMISOS_LECTURA_GENERAL);
    expect(tienePermiso(M, "Consulta", "conciliaciones:ver")).toBe(true);
    expect(tienePermiso(M, "Consulta", "balance:ver")).toBe(true);
    expect(tienePermiso(M, "Consulta", "conciliaciones:ejecutar")).toBe(false);
    expect(tienePermiso(M, "Consulta", "clientes:configurar")).toBe(false);
    expect(tienePermiso(M, "Consulta", "usuarios:crear")).toBe(false);
    expect(tienePermiso(M, "Consulta", "auditoria:ver")).toBe(false); // no ve el registro de auditoría
  });

  test("ningún rol (PDF ni legado) queda sin permisos en la matriz completa", () => {
    for (const codes of Object.values(M)) {
      expect(codes.length).toBeGreaterThan(0);
    }
  });
});
