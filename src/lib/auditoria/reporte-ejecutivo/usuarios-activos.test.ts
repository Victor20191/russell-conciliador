import { describe, expect, it } from "vitest";
import {
  calcularUsuariosActivos,
  clasificarCuentas,
  cuentasMedidas,
  leerUsuariosActivos,
  NOTA_USUARIOS_ACTIVOS,
  textoFraccionUsuariosActivos,
  textoNuncaIngresaron,
  textoUsuariosActivos,
  type CuentaUsuario,
} from "./usuarios-activos";

const CREADAS = "2026-06-22T15:00:00.000Z";
const russell = (id: number, name: string, extra: Partial<CuentaUsuario> = {}): CuentaUsuario => ({
  id,
  name,
  email: `persona${id}@rbcol.co`,
  active: true,
  lastLoginAt: null,
  createdAt: CREADAS,
  ...extra,
});
const acceso = (userId: number, ultimoEn = "2026-11-05T12:00:00.000Z") => ({ userId, ultimoEn });
const accion = (nombre: string, ultimaEn = "2026-11-05T12:00:00.000Z") => ({ nombre, ultimaEn });

/**
 * Réplica con datos ficticios de las cifras de control de producción
 * (2026-10-31 → 2026-11-10): 74 cuentas habilitadas que no son de Xentria, 6 de
 * ellas de prueba o genéricas → Y = 68; 4 activas → X = 4 (5,9 %); 59 nunca han
 * ingresado.
 *
 * Incluye el caso real que un cruce solo por `userId` contaba mal: «Persona 68»
 * se creó en octubre, pero tres accesos de agosto —de otra persona que tuvo ese
 * mismo id antes de re-sembrar la base— quedaron pegados a su id. Sin descartarlos
 * se contaban 58 en vez de 59.
 */
function datosDeControl() {
  const personas = Array.from({ length: 68 }, (_, i) => russell(i + 1, `Persona ${String(i + 1).padStart(2, "0")}`));
  personas[67] = { ...personas[67], createdAt: "2026-10-19T21:20:00.000Z" }; // Persona 68
  personas[6] = { ...personas[6], lastLoginAt: "2026-10-01T10:00:00Z" }; // Persona 07
  personas[7] = { ...personas[7], lastLoginAt: "2026-10-02T10:00:00Z" }; // Persona 08
  personas[8] = { ...personas[8], lastLoginAt: "2026-10-03T10:00:00Z" }; // Persona 09
  const pruebas: CuentaUsuario[] = [
    "YULI ATEHORTUA GIRALDO Pruebas",
    "Camilo Perez Rojo Pruebas",
    "Russell 1",
    "Russell 2",
    "Russell 3",
    "Administrador Russell",
  ].map((name, i) => russell(101 + i, name, { lastLoginAt: "2026-11-05T22:00:00Z" }));
  const xentria: CuentaUsuario[] = [
    { id: 201, name: "Victor Rivera", email: "admin@xentria.co", active: true, lastLoginAt: "2026-11-09T10:00:00Z", createdAt: CREADAS },
    { id: 202, name: "Victor Rivera", email: "victor@xentria.co", active: true, lastLoginAt: "2026-11-09T10:00:00Z", createdAt: CREADAS },
  ];
  const deshabilitada = russell(301, "Exempleado Retirado", { active: false });

  return {
    cuentas: [...personas, ...pruebas, ...xentria, deshabilitada],
    // Cuatro personas activas en el período: tres por accesos y una solo por una acción auditada.
    accesosEnPeriodo: [1, 2, 4, 101, 102, 103, 106, 201, 202, 301].map((id) => acceso(id)),
    accionesEnPeriodo: ["Persona 03", "Victor Rivera", "Administrador Russell"].map((n) => accion(n)),
    // Entraron alguna vez: las tres con acceso en el período, dos con accesos antiguos
    // y tres que solo conservan el último inicio de sesión de su cuenta. «Persona 68»
    // trae los accesos de agosto del id reutilizado, anteriores a su cuenta.
    accesosHistoricos: [1, 2, 4, 5, 6, 101, 102, 103, 106, 201, 202]
      .map((id) => acceso(id))
      .concat([acceso(68, "2026-08-24T22:35:03.585Z")]),
  };
}

describe("usuarios activos: cifras de control", () => {
  it("reproduce Y = 68, X = 4 (5,9 %) y N = 59", () => {
    const entrada = datosDeControl();
    // 68 personas + 6 de prueba = 74 habilitadas que no son de Xentria.
    expect(entrada.cuentas.filter((c) => c.active && !c.email.endsWith("@xentria.co"))).toHaveLength(74);

    const resultado = calcularUsuariosActivos(entrada);
    expect(resultado).toEqual({ total: 68, activos: 4, porcentaje: 5.9, nuncaIngresaron: 59 });
    expect(textoUsuariosActivos(resultado)).toBe("Usuarios activos: 4 de 68 (5,9 %)");
    expect(textoNuncaIngresaron(resultado)).toBe("Nunca han ingresado: 59");
  });

  it("la actividad de las cuentas de prueba o de Xentria no mueve las cifras", () => {
    const entrada = datosDeControl();
    const sinRuido = calcularUsuariosActivos({
      ...entrada,
      accesosEnPeriodo: [1, 2, 4].map((id) => acceso(id)),
      accionesEnPeriodo: [accion("Persona 03")],
    });
    expect(calcularUsuariosActivos(entrada)).toEqual(sinRuido);
  });

  it("sin descartar los accesos anteriores a la cuenta, «Persona 68» contaría como si hubiera ingresado", () => {
    const entrada = datosDeControl();
    const sinCreacion = calcularUsuariosActivos({
      ...entrada,
      cuentas: entrada.cuentas.map((c) => ({ ...c, createdAt: null })),
    });
    expect(sinCreacion.nuncaIngresaron).toBe(58);
  });
});

describe("quién entra en el total", () => {
  it("cuentan solo las habilitadas, del equipo de Russell y que no son de prueba", () => {
    const medidas = cuentasMedidas([
      russell(1, "Ana Real"),
      russell(2, "Beto Retirado", { active: false }),
      { id: 3, name: "Luisa", email: "luisa@xentria.co", active: true },
      russell(4, "Cuenta Pruebas"),
      russell(5, "Russell 9"),
    ]);
    expect(medidas.map((c) => c.name)).toEqual(["Ana Real"]);
  });
});

describe("quién está activo", () => {
  const base = { accesosEnPeriodo: [], accionesEnPeriodo: [], accesosHistoricos: [] };
  const estados = (entrada: Parameters<typeof clasificarCuentas>[0]) =>
    Object.fromEntries(clasificarCuentas(entrada).map((c) => [c.cuenta.name, c.estado]));

  it("navegar o iniciar sesión en el período basta, sin necesidad de dejar acciones", () => {
    const e = estados({
      ...base,
      cuentas: [russell(1, "Ana"), russell(2, "Beto"), russell(3, "Carla")],
      accesosEnPeriodo: [acceso(1), acceso(3)],
    });
    expect(e).toEqual({ Ana: "activa", Beto: "nunca", Carla: "activa" });
  });

  it("una acción de la bitácora basta aunque no haya accesos, y el nombre se compara sin acentos ni mayúsculas", () => {
    const e = estados({
      ...base,
      cuentas: [russell(1, "José Pérez"), russell(2, "Beto")],
      accionesEnPeriodo: [accion("JOSE PEREZ")],
    });
    expect(e["José Pérez"]).toBe("activa");
    expect(e.Beto).toBe("nunca");
  });

  it("con un nombre repetido, la acción de la bitácora no se le atribuye a nadie; los accesos sí, por userId", () => {
    const cuentas = [russell(1, "Victor Rivera"), russell(2, "Victor Rivera"), russell(3, "Ana")];
    // Solo la bitácora, que guarda el nombre: no se puede saber de cuál de los dos es.
    expect(
      clasificarCuentas({ ...base, cuentas, accionesEnPeriodo: [accion("Victor Rivera")] }).filter(
        (c) => c.estado === "activa",
      ),
    ).toHaveLength(0);
    // Con accesos, se distingue por id: solo el 2 está activo.
    const porAcceso = clasificarCuentas({ ...base, cuentas, accesosEnPeriodo: [acceso(2)] });
    expect(porAcceso.filter((c) => c.estado === "activa").map((c) => c.cuenta.id)).toEqual([2]);
  });

  it("el nombre repetido con una cuenta de Xentria tampoco se atribuye al equipo de Russell", () => {
    const cuentas = [
      russell(1, "Victor Rivera"),
      { id: 2, name: "Victor Rivera", email: "v@xentria.co", active: true },
    ];
    expect(calcularUsuariosActivos({ ...base, cuentas, accionesEnPeriodo: [accion("Victor Rivera")] }).activos).toBe(0);
  });

  it("quien tuvo acceso antes, o conserva un último inicio de sesión, no es «nunca» aunque hoy esté inactivo", () => {
    const e = estados({
      ...base,
      cuentas: [
        russell(1, "Con accesos viejos"),
        russell(2, "Con último inicio", { lastLoginAt: "2026-09-01T00:00:00Z" }),
        russell(3, "Jamás"),
      ],
      accesosHistoricos: [acceso(1, "2026-07-01T00:00:00Z")],
    });
    expect(e).toEqual({ "Con accesos viejos": "inactiva", "Con último inicio": "inactiva", Jamás: "nunca" });
  });

  it("un registro anterior a la creación de la cuenta no es suyo: el id se reutilizó", () => {
    const cuentas = [russell(99, "Brahian", { createdAt: "2026-10-19T21:20:42Z" })];
    // Tres accesos del 24/Ago de otra persona que tuvo el id 99 antes de re-sembrar la base.
    const antiguos = { ...base, cuentas, accesosHistoricos: [acceso(99, "2026-08-24T22:35:03Z")] };
    expect(estados(antiguos)).toEqual({ Brahian: "nunca" });
    // También para el período: un acceso de una ventana anterior a la cuenta no la activa.
    expect(
      calcularUsuariosActivos({ ...antiguos, accesosEnPeriodo: [acceso(99, "2026-08-24T22:35:03Z")] }).activos,
    ).toBe(0);
    // Y lo mismo para una acción de bitácora con su nombre.
    expect(
      calcularUsuariosActivos({ ...base, cuentas, accionesEnPeriodo: [accion("Brahian", "2026-08-24T22:35:03Z")] })
        .activos,
    ).toBe(0);
    // En cuanto hay un registro posterior a la creación, sí es suyo.
    expect(
      estados({ ...base, cuentas, accesosHistoricos: [acceso(99, "2026-10-20T10:00:00Z")] }),
    ).toEqual({ Brahian: "inactiva" });
  });

  it("de un mismo id cuenta el registro más reciente, no el primero que llegue", () => {
    const cuentas = [russell(7, "Ana", { createdAt: "2026-10-19T00:00:00Z" })];
    const r = calcularUsuariosActivos({
      ...base,
      cuentas,
      accesosEnPeriodo: [acceso(7, "2026-11-04T10:00:00Z"), acceso(7, "2026-08-24T10:00:00Z")],
    });
    expect(r.activos).toBe(1);
  });

  it("sin fecha de creación conocida no se descarta nada", () => {
    const cuentas = [russell(7, "Ana", { createdAt: null })];
    expect(calcularUsuariosActivos({ ...base, cuentas, accesosEnPeriodo: [acceso(7, "2020-01-01T00:00:00Z")] }).activos).toBe(1);
  });

  it("quien está activo en el período nunca cuenta como «nunca han ingresado»", () => {
    // Activo solo por una acción auditada: sin accesos ni último inicio de sesión guardados.
    const r = calcularUsuariosActivos({
      ...base,
      cuentas: [russell(1, "Ana")],
      accionesEnPeriodo: [accion("Ana")],
    });
    expect(r).toMatchObject({ total: 1, activos: 1, nuncaIngresaron: 0 });
  });
});

describe("sin cuentas que medir", () => {
  it("no divide por cero: el porcentaje queda en null", () => {
    const r = calcularUsuariosActivos({
      cuentas: [{ id: 1, name: "Luisa", email: "luisa@xentria.co", active: true }],
      accesosEnPeriodo: [acceso(1)],
      accionesEnPeriodo: [],
      accesosHistoricos: [acceso(1)],
    });
    expect(r).toEqual({ total: 0, activos: 0, porcentaje: null, nuncaIngresaron: 0 });
    expect(textoUsuariosActivos(r)).toBe("Usuarios activos: 0 de 0");
  });
});

describe("texto del indicador", () => {
  it("escribe el porcentaje con coma decimal y sin decimales sobrantes", () => {
    expect(textoFraccionUsuariosActivos({ total: 68, activos: 4, porcentaje: 5.9, nuncaIngresaron: 0 })).toBe("4 de 68 (5,9 %)");
    expect(textoFraccionUsuariosActivos({ total: 4, activos: 4, porcentaje: 100, nuncaIngresaron: 0 })).toBe("4 de 4 (100 %)");
    expect(textoFraccionUsuariosActivos({ total: 4, activos: 0, porcentaje: 0, nuncaIngresaron: 4 })).toBe("0 de 4 (0 %)");
  });

  it("la nota explica qué cuenta como activo y de qué cuentas es el total", () => {
    expect(NOTA_USUARIOS_ACTIVOS).toContain("entró, navegó o hizo alguna operación en el período");
    expect(NOTA_USUARIOS_ACTIVOS).toContain("cuentas habilitadas del equipo, sin las de Xentria ni las de prueba");
  });
});

describe("lectura de una instantánea guardada", () => {
  it("las anteriores al indicador no lo traen: devuelve null", () => {
    expect(leerUsuariosActivos(undefined)).toBeNull();
    expect(leerUsuariosActivos(null)).toBeNull();
    expect(leerUsuariosActivos({})).toBeNull();
    expect(leerUsuariosActivos("4 de 68")).toBeNull();
  });

  it("rechaza cifras incoherentes en vez de mostrarlas", () => {
    expect(leerUsuariosActivos({ total: 5, activos: 6, nuncaIngresaron: 0 })).toBeNull();
    expect(leerUsuariosActivos({ total: 5, activos: 1, nuncaIngresaron: 9 })).toBeNull();
    expect(leerUsuariosActivos({ total: -1, activos: 0, nuncaIngresaron: 0 })).toBeNull();
    expect(leerUsuariosActivos({ total: 5, activos: 1.5, nuncaIngresaron: 0 })).toBeNull();
  });

  it("lee el indicador completo y recalcula el porcentaje", () => {
    expect(leerUsuariosActivos({ total: 68, activos: 4, porcentaje: 99, nuncaIngresaron: 59 })).toEqual({
      total: 68,
      activos: 4,
      porcentaje: 5.9,
      nuncaIngresaron: 59,
    });
  });
});
