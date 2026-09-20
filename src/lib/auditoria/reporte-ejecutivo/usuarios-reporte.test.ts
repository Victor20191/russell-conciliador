import { describe, expect, it } from "vitest";
import {
  correosDelReporte,
  esCuentaInterna,
  nombresDelReporte,
  usuariosDelReporte,
} from "@/lib/auditoria/reporte-ejecutivo/usuarios-reporte";

const usuarios = [
  { name: "Victor Rivera", email: "admin@xentria.co" },
  { name: "Luisa Martinez", email: "luisa@xentria.co" },
  { name: "Camilo Perez Rojo", email: "russell4@rbcol.co" },
  { name: "Administrador Russell", email: "admin@russellbedford.co" },
  { name: "YULI ATEHORTUA GIRALDO", email: "russell@russellbedford.com.co" },
];

describe("cuentas internas", () => {
  it("reconoce el dominio de Xentria sin confundirse con parecidos", () => {
    expect(esCuentaInterna("admin@xentria.co")).toBe(true);
    expect(esCuentaInterna("ADMIN@Xentria.CO")).toBe(true);
    // La arroba importa: sin ella, un dominio ajeno que termine igual colaría.
    expect(esCuentaInterna("alguien@noxentria.co")).toBe(false);
    expect(esCuentaInterna("xentria.co@gmail.com")).toBe(false);
    expect(esCuentaInterna(null)).toBe(false);
  });
});

describe("usuarios del reporte", () => {
  it("deja fuera a todo el equipo de Xentria", () => {
    expect(usuariosDelReporte(usuarios).map((u) => u.name)).toEqual([
      "Camilo Perez Rojo",
      "Administrador Russell",
      "YULI ATEHORTUA GIRALDO",
    ]);
  });

  it("los nombres son el filtro que usa la bitácora", () => {
    expect(nombresDelReporte(usuarios)).not.toContain("Victor Rivera");
    expect(nombresDelReporte(usuarios)).toContain("Camilo Perez Rojo");
  });

  it("el mapa de correos tampoco los conserva", () => {
    const correos = correosDelReporte(usuarios);
    expect(correos.has("Luisa Martinez")).toBe(false);
    expect(correos.get("Camilo Perez Rojo")).toBe("russell4@rbcol.co");
  });
});
