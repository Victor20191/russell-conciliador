import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { chevronDivulgacion } from "./chevron-divulgacion";

describe("chevronDivulgacion", () => {
  it("abierto/expandido → chev-d (abajo)", () => {
    expect(chevronDivulgacion(true)).toBe("chev-d");
  });

  it("cerrado/contraído → chev-r (derecha)", () => {
    expect(chevronDivulgacion(false)).toBe("chev-r");
  });
});

/**
 * Prueba estructural: los puntos de uso reales del producto importan el helper
 * y los botones masivos se alimentan del estado actual compartido.
 */
describe("convención cableada en UI de expandir/contraer", () => {
  const root = join(process.cwd(), "src");

  const archivosConToggles = [
    "app/(app)/auditoria/ia/consumo-tabla.tsx",
    "app/(app)/balance/cargar-balance-modal.tsx",
    "app/(app)/balance/borradores/[loteId]/borrador-detail-client.tsx",
    "app/(app)/balance/[id]/balance-detail-client.tsx",
    "app/(app)/config/maestros/maestros-client.tsx",
    "app/(app)/config/permisos/permisos-client.tsx",
    "app/(app)/config/usuarios/usuarios-client.tsx",
    "components/sidebar.tsx",
  ].sort();

  const listarTsx = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) return listarTsx(ruta);
      return entrada.isFile() && entrada.name.endsWith(".tsx")
        ? [relative(root, ruta)]
        : [];
    });

  const archivosUi = [
    ...listarTsx(join(root, "app")),
    ...listarTsx(join(root, "components")),
  ];

  it("los clientes de divulgación importan chevron-divulgacion", () => {
    for (const rel of archivosConToggles) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src, rel).toMatch(/chevron-divulgacion/);
      expect(src, rel).toMatch(/chevronDivulgacion/);
    }
  });

  it("el inventario cubre todos los consumidores del helper en componentes y páginas", () => {
    const consumidores = archivosUi
      .filter((rel) => readFileSync(join(root, rel), "utf8").includes("chevron-divulgacion"))
      .sort();

    expect(consumidores).toEqual(archivosConToggles);
  });

  it("las divulgaciones del editor de estructura no usan triángulos de texto", () => {
    const rel = "app/(app)/balance/cargar-balance-modal.tsx";
    const src = readFileSync(join(root, rel), "utf8");
    expect(src).toContain("chevronDivulgacion(abierto)");
    expect(src).toContain("chevronDivulgacion(ayudaAbierta)");
    expect(src).not.toMatch(/[▲▼]/);
  });

  it("los botones masivos usan el mismo estado real de su sección", () => {
    const conMasivos = archivosUi.filter((rel) =>
      /Expandir todo|Colapsar todo|Contraer todo/.test(
        readFileSync(join(root, rel), "utf8"),
      ),
    );

    for (const rel of conMasivos) {
      const src = readFileSync(join(root, rel), "utf8");
      const botonesMasivos = src
        .match(/<button\b[\s\S]*?<\/button>/g)
        ?.filter((boton) => /Expandir todo|Colapsar todo|Contraer todo/.test(boton)) ?? [];

      expect(botonesMasivos.length, rel).toBeGreaterThan(0);
      for (const boton of botonesMasivos) {
        expect(boton, `${rel}: ${boton}`).toContain(
          "chevronDivulgacion(hayContenidoExpandido)",
        );
      }
    }
  });

  it("no conserva un helper de iconos fijos por acción", () => {
    const helper = readFileSync(join(root, "lib/ui/chevron-divulgacion.ts"), "utf8");
    expect(helper).not.toContain("chevronAccionMasiva");
    for (const rel of archivosUi) {
      expect(readFileSync(join(root, rel), "utf8"), rel).not.toContain(
        "chevronAccionMasiva",
      );
    }
  });
});
