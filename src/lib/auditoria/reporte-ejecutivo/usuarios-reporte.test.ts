import { describe, expect, it } from "vitest";
import {
  actorUnificado,
  aliasDeActores,
  correosDelReporte,
  cuentasSumadas,
  esCuentaDePrueba,
  esCuentaInterna,
  idsDelUso,
  nombresDelGastoIA,
  nombresDelReporte,
  normalizarNombre,
  unificarActores,
  usuariosDelComparativo,
  usuariosDelReporte,
  visitasDeCuentas,
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
  it("deja fuera a todo el equipo de Xentria y a las cuentas genéricas", () => {
    expect(usuariosDelReporte(usuarios).map((u) => u.name)).toEqual([
      "Camilo Perez Rojo",
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

  it("salen de todo el uso reportado, no solo del comparativo", () => {
    const conPruebas = [...usuarios, { name: "Camilo Perez Rojo Pruebas", email: "russell4@rbcol.co" }];
    expect(nombresDelReporte(conPruebas)).not.toContain("Administrador Russell");
    expect(nombresDelReporte(conPruebas)).not.toContain("Camilo Perez Rojo Pruebas");
    expect(correosDelReporte(conPruebas).has("Camilo Perez Rojo Pruebas")).toBe(false);
  });

  it("su consumo de IA sí entra en el gasto; el de Xentria no", () => {
    const conPruebas = [...usuarios, { name: "Camilo Perez Rojo Pruebas", email: "russell4@rbcol.co" }];
    const gasto = nombresDelGastoIA(conPruebas);
    expect(gasto).toContain("Administrador Russell");
    expect(gasto).toContain("Camilo Perez Rojo Pruebas");
    expect(gasto).not.toContain("Victor Rivera");
    expect(gasto).not.toContain("Luisa Martinez");
  });
});

describe("cuentas de prueba que se suman a una persona", () => {
  const equipo = [
    { name: "DUVAN CAMILO PÉREZ ROJO", email: "camiloperez@rbcol.co" },
    { name: "Camilo Perez Rojo Pruebas", email: "russell4@rbcol.co" },
    { name: "YULI ANDREA ATEHORTUA GIRALDO", email: "yuliatehortua@rbcol.co" },
    { name: "YULI ATEHORTUA GIRALDO Pruebas", email: "RUSSELL@russellbedford.com.co" },
    { name: "Ana Real", email: "ana@rbcol.co" },
  ];

  it("une la cuenta «Pruebas» de Camilo y la de Yuli con su cuenta personal, por correo", () => {
    expect(cuentasSumadas(equipo).map((s) => [s.cuenta.name, s.persona.name, s.nombres])).toEqual([
      ["Camilo Perez Rojo Pruebas", "DUVAN CAMILO PÉREZ ROJO", ["camilo perez rojo pruebas", "camilo perez rojo"]],
      ["YULI ATEHORTUA GIRALDO Pruebas", "YULI ANDREA ATEHORTUA GIRALDO", ["yuli atehortua giraldo pruebas", "yuli atehortua giraldo"]],
    ]);
  });

  it("pasa sus acciones e ingresos al nombre de la persona, que sí está en el reporte", () => {
    const alias = aliasDeActores(equipo);
    const eventos = unificarActores(
      [
        { user: "Camilo Perez Rojo Pruebas", action: "ASIGNÓ CUENTA ESTÁNDAR" },
        { user: "YULI ATEHORTUA GIRALDO", action: "CARGÓ BALANCE" }, // nombre anterior de la cuenta
        { user: "Ana Real", action: "CARGÓ BALANCE" },
      ],
      alias,
    );
    expect(eventos.map((e) => e.user)).toEqual(["DUVAN CAMILO PÉREZ ROJO", "YULI ANDREA ATEHORTUA GIRALDO", "Ana Real"]);
    expect(actorUnificado("camilo perez rojo pruebas", alias)).toBe("DUVAN CAMILO PÉREZ ROJO");
    const nombres = nombresDelReporte(equipo);
    expect(eventos.every((e) => nombres.includes(e.user))).toBe(true);
    // La cuenta de prueba en sí sigue fuera de la lista: no aparece como otra persona.
    expect(nombres).not.toContain("Camilo Perez Rojo Pruebas");
  });

  it("sin la cuenta personal no se suma nada, y el nombre anterior no se toma si es de otra cuenta", () => {
    expect(cuentasSumadas(equipo.filter((u) => u.email !== "camiloperez@rbcol.co")).map((s) => s.persona.name)).toEqual([
      "YULI ANDREA ATEHORTUA GIRALDO",
    ]);
    const conHomonimo = [...equipo, { name: "Camilo Perez Rojo", email: "otro@rbcol.co" }];
    expect(cuentasSumadas(conHomonimo)[0]?.nombres).toEqual(["camilo perez rojo pruebas"]);
  });
});

describe("visitas que cuentan en el uso", () => {
  const cuentas = [
    { id: 1, name: "Ana Real", email: "ana@rbcol.co" },
    { id: 2, name: "DUVAN CAMILO PÉREZ ROJO", email: "camiloperez@rbcol.co" },
    { id: 3, name: "Camilo Perez Rojo Pruebas", email: "russell4@rbcol.co" },
    { id: 4, name: "Russell 3", email: "russell3@russellbedford.com.co" },
    { id: 5, name: "Victor Rivera", email: "admin@xentria.co" },
  ];

  it("cuentan las del equipo y la de prueba que se suma a una persona; Xentria y las genéricas no", () => {
    expect([...idsDelUso(cuentas)].sort()).toEqual([1, 2, 3]);
  });

  it("suma por ruta solo las visitas de esas cuentas", () => {
    const visitas = visitasDeCuentas(
      [
        { ruta: "/modulos/car", userId: 1, total: 10 },
        { ruta: "/modulos/car", userId: 3, total: 5 }, // Camilo desde su cuenta «Pruebas»
        { ruta: "/modulos/car", userId: 5, total: 40 }, // Xentria
        { ruta: "/balance", userId: 4, total: 7 }, // genérica
        { ruta: "/balance", userId: null, total: 2 }, // sin cuenta
        { ruta: "/balance", userId: 2, total: 3 },
      ],
      idsDelUso(cuentas),
    );
    expect(visitas).toEqual([
      { ruta: "/modulos/car", total: 15 },
      { ruta: "/balance", total: 3 },
    ]);
  });
});

describe("cuentas del comparativo de uso", () => {
  it("son las del reporte sin las de prueba ni las genéricas", () => {
    // «Administrador Russell» sale; los nombres sin «Pruebas» (aquí, como eran antes) se quedan.
    expect(usuariosDelComparativo(usuarios).map((u) => u.name)).toEqual(["Camilo Perez Rojo", "YULI ATEHORTUA GIRALDO"]);
    expect(usuariosDelComparativo([...usuarios, { name: "Camilo Perez Rojo Pruebas", email: "russell4@rbcol.co" }]).map((u) => u.name)).not.toContain(
      "Camilo Perez Rojo Pruebas",
    );
  });

  it("conservan sus demás campos (el id sirve para acotar las visitas)", () => {
    const [persona] = usuariosDelComparativo([{ id: 9, name: "Ana Real", email: "ana@rbcol.co" }]);
    expect(persona).toEqual({ id: 9, name: "Ana Real", email: "ana@rbcol.co" });
  });
});
