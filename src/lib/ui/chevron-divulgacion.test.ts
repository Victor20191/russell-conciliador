import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chevronAccionMasiva,
  chevronDivulgacion,
} from "./chevron-divulgacion";

describe("chevronDivulgacion", () => {
  it("abierto/expandido → chev-d (abajo)", () => {
    expect(chevronDivulgacion(true)).toBe("chev-d");
  });

  it("cerrado/contraído → chev-r (derecha)", () => {
    expect(chevronDivulgacion(false)).toBe("chev-r");
  });
});

describe("chevronAccionMasiva", () => {
  it("Expandir → chev-r (mismo icono que filas cerradas)", () => {
    expect(chevronAccionMasiva("expandir")).toBe("chev-r");
    expect(chevronAccionMasiva("expandir")).toBe(chevronDivulgacion(false));
  });

  it("Contraer/Colapsar → chev-d (mismo icono que filas abiertas)", () => {
    expect(chevronAccionMasiva("contraer")).toBe("chev-d");
    expect(chevronAccionMasiva("contraer")).toBe(chevronDivulgacion(true));
  });
});

/**
 * Prueba estructural: los puntos de uso reales del producto importan el helper
 * y no hardcodean el mapeo invertido en los botones masivos / toggles de estado.
 */
describe("convención cableada en UI de expandir/contraer", () => {
  const root = join(process.cwd(), "src");

  const archivosConToggles = [
    "app/(app)/balance/borradores/[loteId]/borrador-detail-client.tsx",
    "app/(app)/balance/[id]/balance-detail-client.tsx",
    "app/(app)/auditoria/ia/consumo-tabla.tsx",
    "app/(app)/config/usuarios/usuarios-client.tsx",
    "app/(app)/config/maestros/maestros-client.tsx",
    "app/(app)/config/permisos/permisos-client.tsx",
  ];

  it("los clientes de divulgación importan chevron-divulgacion", () => {
    for (const rel of archivosConToggles) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src, rel).toMatch(/chevron-divulgacion/);
      expect(src, rel).toMatch(/chevronDivulgacion|chevronAccionMasiva/);
    }
  });

  it("botones masivos usan chevronAccionMasiva (no hardcodean chev-d/chev-r)", () => {
    const conMasivos = [
      "app/(app)/balance/borradores/[loteId]/borrador-detail-client.tsx",
      "app/(app)/balance/[id]/balance-detail-client.tsx",
      "app/(app)/auditoria/ia/consumo-tabla.tsx",
    ];
    for (const rel of conMasivos) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src, rel).toMatch(/chevronAccionMasiva\(\s*["']expandir["']\s*\)/);
      expect(src, rel).toMatch(/chevronAccionMasiva\(\s*["']contraer["']\s*\)/);
      // No deben quedar Icon name="chev-d|r" pegados a Expandir/Contraer/Colapsar
      const lineasMasivas = src
        .split("\n")
        .filter((l) => /Expandir todo|Colapsar todo|Contraer todo|title="Expandir|title="Contraer|>Expandir<|>Contraer</.test(l));
      for (const linea of lineasMasivas) {
        expect(linea, `${rel}: ${linea.trim()}`).not.toMatch(/name=["']chev-[dr]["']/);
      }
    }
  });
});
