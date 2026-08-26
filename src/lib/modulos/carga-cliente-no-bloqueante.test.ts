import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modal = readFileSync(
  new URL("../../app/(app)/modulos/[codigo]/cargar-modulo-modal.tsx", import.meta.url),
  "utf8",
);

describe("selección no bloqueante de archivos de módulos", () => {
  it("retiene el File sin leer ni descomprimir sus bytes en el navegador", () => {
    expect(modal).toContain("const archivoRef = useRef<File | null>(null)");
    expect(modal).not.toContain("arrayBuffer(");
    expect(modal).not.toContain("leerHojasParaPreview");
    expect(modal).not.toContain("exceljs");
  });

  it("envía el mismo File al servidor y conserva el cambio de hoja tras el análisis", () => {
    expect(modal.match(/fd\.set\("archivo", archivoRef\.current!\)/g)).toHaveLength(2);
    expect(modal).toContain("analisis?.hojas?.length");
    expect(modal).toContain("onChange={(e) => analizar(e.target.value)}");
  });
});
