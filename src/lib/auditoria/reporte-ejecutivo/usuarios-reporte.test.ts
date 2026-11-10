import { describe, expect, it } from "vitest";
import {
  correosDelReporte,
  esCuentaDePrueba,
  esCuentaInterna,
  nombresDelReporte,
  normalizarNombre,
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

describe("nombres comparables", () => {
  it("no distingue mayúsculas, acentos ni espacios dobles", () => {
    expect(normalizarNombre("  WENDY  MENA   MORENO ")).toBe("wendy mena moreno");
    expect(normalizarNombre("JOSÉ DAVID MONTOYA")).toBe(normalizarNombre("José David Montoya"));
    expect(normalizarNombre(null)).toBe("");
  });
});

describe("cuentas de prueba o genéricas", () => {
  it("reconoce las seis cuentas conocidas del equipo", () => {
    for (const nombre of [
      "YULI ATEHORTUA GIRALDO Pruebas",
      "Camilo Perez Rojo Pruebas",
      "Russell 1",
      "Russell 2",
      "Russell 3",
      "Administrador Russell",
    ]) {
      expect(esCuentaDePrueba(nombre), nombre).toBe(true);
    }
  });

  it("«prueba» y «pruebas» valen sin importar mayúsculas ni acentos", () => {
    expect(esCuentaDePrueba("Usuario de PRUEBA")).toBe(true);
    expect(esCuentaDePrueba("usuario pruebas")).toBe(true);
    expect(esCuentaDePrueba("Prueba 3")).toBe(true);
    expect(esCuentaDePrueba("PRUÉBAS Contabilidad")).toBe(true);
  });

  it("«Russell <número>» y «Administrador Russell» solo valen exactos", () => {
    expect(esCuentaDePrueba("RUSSELL 12")).toBe(true);
    expect(esCuentaDePrueba("  russell   7 ")).toBe(true);
    expect(esCuentaDePrueba("administrador russell")).toBe(true);
    // Una persona real cuyo nombre solo contiene esas palabras NO es una cuenta de prueba.
    expect(esCuentaDePrueba("Russell")).toBe(false);
    expect(esCuentaDePrueba("Russell Gómez")).toBe(false);
    expect(esCuentaDePrueba("Russell 1 Gómez")).toBe(false);
    expect(esCuentaDePrueba("Administrador Russell Bedford")).toBe(false);
    expect(esCuentaDePrueba("Administrador")).toBe(false);
  });

  it("no se confunde con nombres de personas, ni siquiera con letras parecidas", () => {
    expect(esCuentaDePrueba("LUISA FERNANDA CHAVARRIA CARMONA")).toBe(false);
    expect(esCuentaDePrueba("Comprueba Pérez")).toBe(false);
    expect(esCuentaDePrueba("")).toBe(false);
    expect(esCuentaDePrueba(undefined)).toBe(false);
  });

  it("no cambia a quién cuenta el resto del reporte como usuario", () => {
    // Las cuentas de prueba siguen dentro del reporte: la exclusión es solo del indicador.
    expect(usuariosDelReporte(usuarios).map((u) => u.name)).toContain("Administrador Russell");
    expect(nombresDelReporte(usuarios)).toContain("Administrador Russell");
  });
});
