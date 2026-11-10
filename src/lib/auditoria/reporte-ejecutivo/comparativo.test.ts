import { describe, expect, it } from "vitest";
import {
  alertaComparativo,
  alertaUsuarios,
  alertasComparativo,
  baseOperacionesPequena,
  basePersonasPequena,
  compararUso,
  concentracionOperaciones,
  diasDePeriodo,
  NOTA_SIN_CUENTAS_DE_PRUEBA,
  textoConcentracion,
  titularComparativo,
  variacion,
  soloFecha,
  UMBRAL_ALERTA_USO_PCT,
} from "@/lib/auditoria/reporte-ejecutivo/comparativo";
import { calcularResumenUso, type ResumenUsoFactual } from "@/lib/auditoria/reporte-ejecutivo/metricas";
import { usuariosDelComparativo } from "@/lib/auditoria/reporte-ejecutivo/usuarios-reporte";

function resumen(p: Partial<ResumenUsoFactual> & { periodoDesde: string; periodoHasta: string }): ResumenUsoFactual {
  return {
    totalAcciones: 0,
    totalNavegaciones: 0,
    totalConexiones: 0,
    totalUsuarios: 0,
    totalClientes: 0,
    primeraAccion: null,
    ultimaAccion: null,
    porFamilia: [],
    navegacionesPorFamilia: [],
    topAcciones: [],
    topUsuarios: [],
    detalleUsuarios: [],
    topClientes: [],
    serieDiaria: [],
    evidencia: [],
    ...p,
  };
}

const previo = resumen({
  periodoDesde: "2026-07-22T00:00:00.000Z",
  periodoHasta: "2026-08-20T23:59:59.999Z",
  totalAcciones: 1000,
  totalUsuarios: 10,
  totalConexiones: 80,
  totalClientes: 20,
  porFamilia: [
    { nombre: "Balance de comprobación", total: 600 },
    { nombre: "Inventarios", total: 400 },
  ],
  topUsuarios: [
    { usuario: "Luisa", correo: null, total: 600, porFamilia: [] },
    { usuario: "Camilo", correo: null, total: 400, porFamilia: [] },
  ],
});

const actual = resumen({
  periodoDesde: "2026-08-22T00:00:00.000Z",
  periodoHasta: "2026-09-20T23:59:59.999Z",
  totalAcciones: 1200,
  totalUsuarios: 9,
  totalConexiones: 80,
  totalClientes: 25,
  porFamilia: [
    { nombre: "Balance de comprobación", total: 900 },
    { nombre: "Mapeo de cuentas", total: 300 },
  ],
  topUsuarios: [
    { usuario: "Luisa", correo: null, total: 900, porFamilia: [] },
    { usuario: "Camilo", correo: null, total: 300, porFamilia: [] },
  ],
});

describe("diasDePeriodo", () => {
  it("cuenta ambos extremos", () => {
    expect(diasDePeriodo("2026-09-01T00:00:00Z", "2026-09-30T23:59:59Z")).toBe(30);
    expect(diasDePeriodo("2026-09-01T00:00:00Z", "2026-09-01T10:00:00Z")).toBe(1);
  });
});

describe("variacion", () => {
  it("calcula diferencia, porcentaje y dirección", () => {
    expect(variacion("x", 120, 100)).toEqual({
      etiqueta: "x",
      actual: 120,
      previo: 100,
      diferencia: 20,
      variacionPct: 20,
      direccion: "subio",
    });
  });

  it("deja el porcentaje en null cuando el período previo estaba en cero", () => {
    expect(variacion("x", 5, 0).variacionPct).toBeNull();
    expect(variacion("x", 5, 0).direccion).toBe("subio");
  });

  it("marca «igual» sin variación", () => {
    expect(variacion("x", 7, 7).direccion).toBe("igual");
  });
});

describe("compararUso", () => {
  const c = compararUso({ actual, previo, base: "reporte_anterior", generadoEn: "2026-08-21T10:00:00.000Z" });

  it("compara los totales del período", () => {
    expect(c.totales[0]).toMatchObject({ etiqueta: "Operaciones registradas", previo: 1000, actual: 1200, variacionPct: 20 });
    expect(c.totales[1]).toMatchObject({ etiqueta: "Usuarios que operaron", direccion: "bajo", diferencia: -1 });
  });

  it("marca comparables dos períodos de igual duración", () => {
    expect(c.comparable).toBe(true);
    expect(c.actual.dias).toBe(30);
    expect(c.previo.dias).toBe(30);
  });

  it("incluye las familias de ambos períodos, aunque una desaparezca", () => {
    const familias = Object.fromEntries(c.porFamilia.map((f) => [f.etiqueta, f]));
    expect(familias["Balance de comprobación"]).toMatchObject({ previo: 600, actual: 900 });
    expect(familias["Inventarios"]).toMatchObject({ previo: 400, actual: 0, direccion: "bajo" });
    expect(familias["Mapeo de cuentas"]).toMatchObject({ previo: 0, actual: 300, variacionPct: null });
  });

  it("compara a los usuarios más activos", () => {
    expect(c.porUsuario.find((u) => u.etiqueta === "Camilo")).toMatchObject({ previo: 400, actual: 300, direccion: "bajo" });
  });

  it("señala los períodos de distinta duración y calcula el promedio diario", () => {
    const corto = compararUso({
      actual: resumen({ periodoDesde: "2026-09-01T00:00:00Z", periodoHasta: "2026-09-10T23:59:59Z", totalAcciones: 500 }),
      previo,
      base: "reporte_anterior",
    });
    expect(corto.comparable).toBe(false);
    // 500/10 = 50 por día contra 1000/30 = 33,33 → sube aunque el total baje.
    expect(corto.totales[0].direccion).toBe("bajo");
    expect(corto.promedioDiario.direccion).toBe("subio");
  });
});

describe("alertaComparativo", () => {
  it("alerta en alza cuando el uso sube por encima del umbral", () => {
    const a = alertaComparativo(compararUso({ actual, previo, base: "reporte_anterior" }));
    expect(a.nivel).toBe("alza");
    expect(a.titulo).toContain("subió");
    expect(a.mensaje).toContain("reporte anterior");
  });

  it("alerta en baja cuando el uso cae", () => {
    const a = alertaComparativo(compararUso({ actual: previo, previo: actual, base: "reporte_anterior" }));
    expect(a.nivel).toBe("baja");
    expect(a.titulo).toContain("bajó");
  });

  it("no alerta por variaciones menores al umbral de materialidad", () => {
    const casiIgual = resumen({ ...actual, totalAcciones: 1020 } as Partial<ResumenUsoFactual> & { periodoDesde: string; periodoHasta: string });
    const a = alertaComparativo(compararUso({ actual: casiIgual, previo, base: "reporte_anterior" }));
    expect(a.nivel).toBe("estable");
    expect(a.mensaje).toContain(`${UMBRAL_ALERTA_USO_PCT} %`);
  });

  it("con períodos de distinta duración se apoya en el promedio diario", () => {
    const corto = compararUso({
      actual: resumen({ periodoDesde: "2026-09-01T00:00:00Z", periodoHasta: "2026-09-10T23:59:59Z", totalAcciones: 500 }),
      previo,
      base: "periodo_anterior",
    });
    const a = alertaComparativo(corto);
    expect(a.nivel).toBe("alza");
    expect(a.mensaje).toContain("por día");
    expect(a.mensaje).toContain("período anterior");
  });
});

describe("soloFecha", () => {
  it("lee tal cual una fecha de calendario declarada en UTC", () => {
    expect(soloFecha("2026-09-01T00:00:00.000Z")).toBe("2026-09-01");
    expect(soloFecha("2026-09-20T23:59:59.999Z")).toBe("2026-09-20");
  });

  it("traduce a la zona de la operación una ventana armada en hora local", () => {
    // 2026-09-20 23:59:59 en Colombia = 2026-09-21T04:59:59Z: la etiqueta sigue siendo el día 20.
    expect(soloFecha("2026-09-21T04:59:59.999Z")).toBe("2026-09-20");
    expect(soloFecha("2026-08-22T05:00:00.000Z")).toBe("2026-08-22");
  });
});

describe("cuántos usuarios operaron", () => {
  const conDetalle = (periodo: { desde: string; hasta: string }, usuarios: Array<[string, number]>) =>
    resumen({
      periodoDesde: periodo.desde,
      periodoHasta: periodo.hasta,
      totalAcciones: usuarios.reduce((s, [, n]) => s + n, 0),
      totalUsuarios: usuarios.filter(([, n]) => n > 0).length,
      detalleUsuarios: usuarios.map(([usuario, total]) => ({
        usuario,
        correo: null,
        conexiones: 1,
        totalAcciones: total,
        accionesPrincipales: [],
        porFamilia: [],
      })),
    });

  const antes = conDetalle({ desde: "2026-08-01T00:00:00Z", hasta: "2026-08-31T23:59:59Z" }, [
    ["Ana", 100],
    ["Luis", 100],
    ["Sara", 100],
    ["Solo entró", 0], // inició sesión pero no operó: no cuenta como operador
  ]);
  const ahora = conDetalle({ desde: "2026-09-01T00:00:00Z", hasta: "2026-09-30T23:59:59Z" }, [
    ["Ana", 400],
    ["Nuevo", 50],
  ]);
  const c = compararUso({ actual: ahora, previo: antes, base: "reporte_anterior" });

  it("nombra quién entró, quién dejó de operar y cuántos siguieron", () => {
    expect(c.usuarios).toEqual({
      activosActual: 2,
      activosPrevio: 3,
      nuevos: ["Nuevo"],
      salieron: ["Luis", "Sara"],
      continuaron: 1,
    });
  });

  it("compara las operaciones por usuario, no solo el total", () => {
    const porUsuario = c.totales.find((t) => t.etiqueta === "Operaciones por usuario");
    expect(porUsuario).toMatchObject({ previo: 100, actual: 225, direccion: "subio" });
  });

  it("alerta en baja cuando opera menos gente, aunque el volumen suba", () => {
    const operaciones = alertaComparativo(c);
    const usuarios = alertaUsuarios(c);
    expect(operaciones.nivel).toBe("alza"); // 300 → 450 operaciones
    expect(usuarios.nivel).toBe("baja"); // 3 → 2 personas
    expect(usuarios.titulo).toContain("menos usuarios");
    expect(usuarios.mensaje).toContain("Entraron 1 y dejaron de operar 2");
  });

  it("las dos alertas viajan juntas y etiquetadas", () => {
    expect(alertasComparativo(c).map((a) => a.clave)).toEqual(["operaciones", "usuarios"]);
  });

  it("sin rotación lo dice explícitamente", () => {
    const igual = compararUso({ actual: ahora, previo: { ...ahora, periodoDesde: "2026-08-01T00:00:00Z", periodoHasta: "2026-08-31T23:59:59Z" }, base: "reporte_anterior" });
    expect(igual.usuarios).toMatchObject({ nuevos: [], salieron: [], continuaron: 2 });
    expect(alertaUsuarios(igual).nivel).toBe("estable");
  });
});

/**
 * Caso real: el reporte del 30-oct → 10-nov contra el del 14 → 27-oct. Con las
 * cuentas de prueba dentro anunciaba «El uso subió 674,33 %» y «Operaron 75 % más
 * usuarios: de 4 a 7»; sin ellas, el equipo pasó de 4 a 565 operaciones.
 */
describe("comparativo sin cuentas de prueba, base pequeña y concentración", () => {
  const cuentas = [
    { name: "LUISA FERNANDA CHAVARRIA CARMONA", email: "luisachavarria@rbcol.co" },
    { name: "SINDY KATERINE ECHEVERRI RAMÍREZ", email: "katerineecheverri@rbcol.co" },
    { name: "YULI ALEJANDRA VILLA HIGUITA", email: "alejandravilla@rbcol.co" },
    { name: "DARWIN GUZMAN MENA", email: "darwinguzman@rbcol.co" },
    { name: "ERICA MARIA VERGARA SALAZAR", email: "ericavergara@rbcol.co" },
    { name: "Camilo Perez Rojo Pruebas", email: "russell4@rbcol.co" },
    { name: "YULI ATEHORTUA GIRALDO Pruebas", email: "russell@russellbedford.com.co" },
    { name: "Administrador Russell", email: "admin@russellbedford.co" },
    { name: "Russell 3", email: "russell3@russellbedford.com.co" },
    { name: "Victor Rivera", email: "admin@xentria.co" },
  ];
  const eventosDe = (user: string, n: number, dia: string) =>
    Array.from({ length: n }, () => ({
      user, action: "CARGÓ BALANCE", entity: "", detail: "", clientId: 1, createdAt: `${dia}T15:00:00Z`,
    }));
  const resumir = (periodo: { desde: string; hasta: string }, conteos: Array<[string, number]>, sinPrueba: boolean) => {
    const permitidas = sinPrueba ? usuariosDelComparativo(cuentas) : cuentas.filter((c) => !c.email.endsWith("@xentria.co"));
    return calcularResumenUso({
      eventos: conteos.flatMap(([user, n]) => eventosDe(user, n, periodo.desde.slice(0, 10))),
      periodoDesde: periodo.desde,
      periodoHasta: periodo.hasta,
      usuariosRegistrados: permitidas.map((c) => c.name),
    });
  };
  const ventanaActual = { desde: "2026-10-30T00:00:00.000Z", hasta: "2026-11-10T23:59:59.999Z" }; // 12 días
  const ventanaPrevia = { desde: "2026-10-14T00:00:00.000Z", hasta: "2026-10-27T23:59:59.999Z" }; // 14 días
  const conteosActual: Array<[string, number]> = [
    ["LUISA FERNANDA CHAVARRIA CARMONA", 482],
    ["YULI ATEHORTUA GIRALDO Pruebas", 134],
    ["Camilo Perez Rojo Pruebas", 122],
    ["SINDY KATERINE ECHEVERRI RAMÍREZ", 53],
    ["YULI ALEJANDRA VILLA HIGUITA", 27],
    ["DARWIN GUZMAN MENA", 3],
    ["Administrador Russell", 2],
  ];
  const conteosPrevio: Array<[string, number]> = [
    ["Camilo Perez Rojo Pruebas", 110],
    ["Administrador Russell", 9],
    ["ERICA MARIA VERGARA SALAZAR", 4],
    ["Russell 3", 1],
  ];

  const sin = compararUso({
    actual: resumir(ventanaActual, conteosActual, true),
    previo: resumir(ventanaPrevia, conteosPrevio, true),
    base: "reporte_anterior",
  });
  const con = compararUso({
    actual: resumir(ventanaActual, conteosActual, false),
    previo: resumir(ventanaPrevia, conteosPrevio, false),
    base: "reporte_anterior",
  });

  it("con las cuentas de prueba reproduce el titular engañoso: base de 124 operaciones, casi todas de una cuenta", () => {
    expect(con.totales[0]).toMatchObject({ previo: 124, actual: 823 });
    expect(con.totales[1]).toMatchObject({ previo: 4, actual: 7 });
    expect(con.promedioDiario.variacionPct).toBeGreaterThan(600);
  });

  it("sin ellas las cifras de control son 565 operaciones y 4 personas contra 4 operaciones y 1 persona", () => {
    expect(sin.totales[0]).toMatchObject({ etiqueta: "Operaciones registradas", previo: 4, actual: 565 });
    expect(sin.totales[1]).toMatchObject({ etiqueta: "Usuarios que operaron", previo: 1, actual: 4 });
    expect(sin.usuarios.nuevos).toEqual([
      "DARWIN GUZMAN MENA",
      "LUISA FERNANDA CHAVARRIA CARMONA",
      "SINDY KATERINE ECHEVERRI RAMÍREZ",
      "YULI ALEJANDRA VILLA HIGUITA",
    ]);
    expect(sin.usuarios.salieron).toEqual(["ERICA MARIA VERGARA SALAZAR"]);
    expect(sin.porUsuario.map((u) => [u.etiqueta, u.actual])).toEqual([
      ["LUISA FERNANDA CHAVARRIA CARMONA", 482],
      ["SINDY KATERINE ECHEVERRI RAMÍREZ", 53],
      ["YULI ALEJANDRA VILLA HIGUITA", 27],
      ["DARWIN GUZMAN MENA", 3],
      ["ERICA MARIA VERGARA SALAZAR", 0],
    ]);
    // 12 días contra 14: no son comparables en total, y el promedio diario es 47,1 contra 0,3.
    expect(sin.comparable).toBe(false);
    expect(sin.promedioDiario).toMatchObject({ previo: 0.29, actual: 47.08 });
  });

  it("la base previa es pequeña y el titular dice las cifras, no el porcentaje", () => {
    expect(baseOperacionesPequena(sin)).toBe(true);
    const a = alertaComparativo(sin);
    expect(a.nivel).toBe("alza");
    expect(a.titulo).toBe("El uso subió: de 4 a 565 operaciones (0,3 → 47,1 por día)");
    expect(a.titulo).not.toContain("%");
    expect(a.mensaje).toContain("reporte anterior");
    expect(a.avisos[0]).toBe(
      "La base anterior es pequeña (4 operaciones y 1 persona): un porcentaje exageraría la variación, por eso se muestran las cifras.",
    );
  });

  it("dice cuando una sola persona concentra más de la mitad de las operaciones", () => {
    expect(concentracionOperaciones(sin)).toEqual({
      persona: "LUISA FERNANDA CHAVARRIA CARMONA",
      operaciones: 482,
      porcentaje: 85,
    });
    expect(textoConcentracion(sin)).toBe("El 85 % de las operaciones lo hizo una sola persona: LUISA FERNANDA CHAVARRIA CARMONA.");
    expect(alertaComparativo(sin).avisos).toContain(textoConcentracion(sin));
  });

  it("la alerta de personas también habla en cifras: de 1 a 4, no «300 % más»", () => {
    expect(basePersonasPequena(sin)).toBe(true);
    const u = alertaUsuarios(sin);
    expect(u.nivel).toBe("alza");
    expect(u.titulo).toBe("Operaron más usuarios: de 1 a 4");
    expect(u.titulo).not.toContain("%");
    expect(u.avisos).toEqual([
      "En el período anterior operó 1 persona: un porcentaje exageraría la variación, por eso se muestran las cifras.",
    ]);
    expect(u.mensaje).toContain("Entraron 4 y dejaron de operar 1");
  });

  it("el titular suelto sigue la misma lectura honesta", () => {
    expect(titularComparativo(sin)).toBe(
      "El uso subió: de 4 a 565 operaciones (0,3 → 47,1 por día) frente al reporte anterior.",
    );
  });

  it("la frase fija aclara que se compara sin cuentas de prueba ni genéricas", () => {
    expect(NOTA_SIN_CUENTAS_DE_PRUEBA).toContain("sin las cuentas de prueba ni las genéricas");
  });

  describe("umbrales de base pequeña", () => {
    const con = (ops: number, personas: number) => {
      const nombres = Array.from({ length: personas }, (_, i) => `Persona ${i + 1}`);
      const previo = calcularResumenUso({
        eventos: nombres.flatMap((n, i) => eventosDe(n, i === 0 ? ops - (personas - 1) : 1, "2026-09-02")),
        periodoDesde: "2026-09-01T00:00:00Z", periodoHasta: "2026-09-30T23:59:59Z",
      });
      const actual = calcularResumenUso({
        eventos: Array.from({ length: 5 }, (_, i) => eventosDe(`Persona ${i + 1}`, 400, "2026-10-02")).flat(),
        periodoDesde: "2026-10-01T00:00:00Z", periodoHasta: "2026-10-30T23:59:59Z",
      });
      return compararUso({ actual, previo, base: "reporte_anterior" });
    };

    it("menos de 100 operaciones o menos de 3 personas es base pequeña; 100 y 3 ya no", () => {
      expect(baseOperacionesPequena(con(99, 5))).toBe(true);
      expect(baseOperacionesPequena(con(100, 5))).toBe(false);
      expect(baseOperacionesPequena(con(500, 2))).toBe(true);
      expect(baseOperacionesPequena(con(500, 3))).toBe(false);
      expect(basePersonasPequena(con(500, 2))).toBe(true);
      expect(basePersonasPequena(con(99, 3))).toBe(false);
    });

    it("con una base sólida el titular conserva el porcentaje y no agrega el aviso de base", () => {
      const a = alertaComparativo(con(500, 5));
      expect(a.titulo).toBe("El uso subió 300 %");
      expect(a.avisos.some((x) => x.includes("base anterior"))).toBe(false);
      expect(alertaUsuarios(con(500, 5)).avisos).toEqual([]);
    });

    it("una base pequeña que no cambia se lee estable, también en cifras", () => {
      const previo = resumen({ periodoDesde: "2026-09-01T00:00:00Z", periodoHasta: "2026-09-30T23:59:59Z", totalAcciones: 50, totalUsuarios: 2 });
      const igual = resumen({ periodoDesde: "2026-10-01T00:00:00Z", periodoHasta: "2026-10-30T23:59:59Z", totalAcciones: 51, totalUsuarios: 2 });
      const a = alertaComparativo(compararUso({ actual: igual, previo, base: "reporte_anterior" }));
      expect(a.nivel).toBe("estable");
      expect(a.titulo).toBe("El uso se mantuvo estable");
      expect(a.mensaje).toContain("de 50 a 51 operaciones");
      expect(a.mensaje).toContain(`${UMBRAL_ALERTA_USO_PCT} %`);
    });

    it("una caída desde una base pequeña también dice las cifras", () => {
      const previo = resumen({ periodoDesde: "2026-09-01T00:00:00Z", periodoHasta: "2026-09-30T23:59:59Z", totalAcciones: 80, totalUsuarios: 2 });
      const hoy = resumen({ periodoDesde: "2026-10-01T00:00:00Z", periodoHasta: "2026-10-30T23:59:59Z", totalAcciones: 20, totalUsuarios: 1 });
      const c = compararUso({ actual: hoy, previo, base: "periodo_anterior" });
      expect(alertaComparativo(c).titulo).toBe("El uso bajó: de 80 a 20 operaciones (2,7 → 0,7 por día)");
      expect(alertaUsuarios(c).titulo).toBe("Operaron menos usuarios: de 2 a 1");
    });

    it("sin operaciones previas dice «de 0 a N» en vez de inventar un porcentaje", () => {
      const previo = resumen({ periodoDesde: "2026-09-01T00:00:00Z", periodoHasta: "2026-09-30T23:59:59Z" });
      const hoy = resumen({ periodoDesde: "2026-10-01T00:00:00Z", periodoHasta: "2026-10-30T23:59:59Z", totalAcciones: 30, totalUsuarios: 2 });
      const c = compararUso({ actual: hoy, previo, base: "periodo_anterior" });
      expect(alertaComparativo(c).titulo).toBe("El uso subió: de 0 a 30 operaciones (0 → 1 por día)");
      expect(alertaComparativo(c).avisos[0]).toContain("0 operaciones y 0 personas");
    });
  });

  describe("concentración", () => {
    const reparto = (conteos: Array<[string, number]>) =>
      compararUso({
        actual: calcularResumenUso({
          eventos: conteos.flatMap(([n, k]) => eventosDe(n, k, "2026-10-02")),
          periodoDesde: "2026-10-01T00:00:00Z", periodoHasta: "2026-10-30T23:59:59Z",
        }),
        previo: resumen({ periodoDesde: "2026-09-01T00:00:00Z", periodoHasta: "2026-09-30T23:59:59Z", totalAcciones: 300, totalUsuarios: 5 }),
        base: "reporte_anterior",
      });

    it("exactamente la mitad no es concentración; un poco más, sí", () => {
      expect(concentracionOperaciones(reparto([["A", 50], ["B", 50]]))).toBeNull();
      expect(concentracionOperaciones(reparto([["A", 51], ["B", 49]]))).toMatchObject({ persona: "A", porcentaje: 51 });
    });

    it("una sola persona operando es el 100 %", () => {
      expect(textoConcentracion(reparto([["Ana", 40]]))).toBe("El 100 % de las operaciones lo hizo una sola persona: Ana.");
    });

    it("sin operaciones no hay nada que decir", () => {
      expect(concentracionOperaciones(reparto([]))).toBeNull();
    });
  });
});
