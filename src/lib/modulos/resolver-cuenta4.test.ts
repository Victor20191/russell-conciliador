import { describe, it, expect } from "vitest";
import { resolverCuenta4, resolverCuentaRussell, mensajeResolucion, type EntornoResolucion } from "./resolver-cuenta4";

// Subgrupos de Inventarios y homologaciones REALES tomadas de la plataforma: son los casos
// donde truncar a 4 dígitos daba una cuenta distinta de la homologada.
const ENTORNO: EntornoResolucion = {
  subgruposModulo: new Set(["1405", "1410", "1430", "1435", "1455", "1460", "1465", "1470", "1499"]),
  homologacionCliente: new Map([
    ["143505", { cuenta4: "1435", nombre: "MCIA NO FAB POR LA EMPRESA" }],
    ["143504", { cuenta4: "4175", nombre: "DEV,REBAJAS Y DESC.COMPRAS" }], // ACEROS MAPA: fuera del módulo
    ["14600201", { cuenta4: "1455", nombre: "REPUESTOS" }], // EL ZARZAL
    ["149005", { cuenta4: "1405", nombre: "Materias primas" }], // FAM
    ["14301001", { cuenta4: "1345", nombre: "SERVICIOS SPA" }], // FAM: fuera del módulo
    ["149505", { cuenta4: "1499", nombre: "Deterioro por diferencias de inventario" }], // VISDECOL
  ]),
};

describe("resolverCuenta4", () => {
  it("acepta la cuenta Russell de 4 dígitos tal cual", () => {
    expect(resolverCuenta4("1435", ENTORNO)).toEqual({ ok: true, cuenta4: "1435", via: "russell" });
  });

  it("resuelve la cuenta del cliente a su cuenta Russell homologada", () => {
    expect(resolverCuenta4("143505", ENTORNO)).toEqual({
      ok: true, cuenta4: "1435", via: "cliente", cuentaCliente: "143505", nombreCliente: "MCIA NO FAB POR LA EMPRESA",
    });
  });

  it("NO trunca: usa la homologación aunque difiera de los 4 primeros dígitos", () => {
    // Truncar daría 1460; su homologación real es 1455.
    const r = resolverCuenta4("14600201", ENTORNO);
    expect(r).toMatchObject({ ok: true, cuenta4: "1455", via: "cliente" });
    // Y al revés: truncar daría 1490, que ni siquiera es del módulo.
    expect(resolverCuenta4("149005", ENTORNO)).toMatchObject({ ok: true, cuenta4: "1405" });
  });

  it("rechaza, nombrando el destino real, la cuenta homologada FUERA del módulo", () => {
    // El caso grave: truncar daba 1435 (activo) cuando la homologación es 4175 (ingresos).
    expect(resolverCuenta4("143504", ENTORNO)).toEqual({
      ok: false, motivo: "fuera-del-modulo", entrada: "143504", cuenta4Real: "4175", nombreCliente: "DEV,REBAJAS Y DESC.COMPRAS",
    });
    expect(resolverCuenta4("14301001", ENTORNO)).toMatchObject({ motivo: "fuera-del-modulo", cuenta4Real: "1345" });
  });

  it("rechaza un código que no es del módulo ni está homologado, en vez de truncarlo", () => {
    expect(resolverCuenta4("99999999", ENTORNO)).toEqual({ ok: false, motivo: "no-encontrada", entrada: "99999999" });
  });

  it("rechaza 4 dígitos que no son subgrupo del módulo", () => {
    expect(resolverCuenta4("5105", ENTORNO)).toEqual({ ok: false, motivo: "no-encontrada", entrada: "5105" });
  });

  it("trata la entrada vacía o sin dígitos como vacía", () => {
    expect(resolverCuenta4("", ENTORNO)).toEqual({ ok: false, motivo: "vacia" });
    expect(resolverCuenta4("   ", ENTORNO)).toEqual({ ok: false, motivo: "vacia" });
    expect(resolverCuenta4("abc", ENTORNO)).toEqual({ ok: false, motivo: "vacia" });
  });

  it("limpia el ruido de copiar y pegar (puntos, guiones, espacios)", () => {
    expect(resolverCuenta4(" 14-35-05 ", ENTORNO)).toMatchObject({ ok: true, cuenta4: "1435", via: "cliente" });
    expect(resolverCuenta4("1435.", ENTORNO)).toMatchObject({ ok: true, cuenta4: "1435", via: "russell" });
  });

  it("una cuenta de cliente de 4 dígitos se resuelve por homologación, no por sí misma", () => {
    // Nivel 4 con movimiento propio: existen en la plataforma (ACEROS MAPA 1105, etc.).
    const entorno: EntornoResolucion = {
      subgruposModulo: new Set(["1405", "1435"]),
      homologacionCliente: new Map([["1490", { cuenta4: "1405", nombre: "Inventario en tránsito" }]]),
    };
    expect(resolverCuenta4("1490", entorno)).toMatchObject({ ok: true, cuenta4: "1405", via: "cliente" });
  });
});

describe("mensajeResolucion", () => {
  it("nombra el destino real cuando la homologación cae fuera del módulo", () => {
    const r = resolverCuenta4("143504", ENTORNO);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(mensajeResolucion(r, "Inventarios")).toContain("4175");
    expect(mensajeResolucion(r, "Inventarios")).toContain("no pertenece a Inventarios");
  });

  it("orienta a «Buscar…» cuando el código no existe", () => {
    const r = resolverCuenta4("99999999", ENTORNO);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(mensajeResolucion(r, "Inventarios")).toContain("Buscar");
  });
});

describe("resolverCuenta4 a 6 dígitos (Nómina)", () => {
  // Homologación real de Kakaraka: sus cuentas de gasto de personal van a las Russell de 6.
  const ENTORNO_NOM: EntornoResolucion = {
    nivel: 6,
    subgruposModulo: new Set(["510506", "510530", "520506", "720505", "730505"]),
    homologacionCliente: new Map([
      ["510506", { cuenta4: "5105", cuenta6: "510506", nombre: "SUELDOS" }],
      ["520518", { cuenta4: "5205", cuenta6: "520595", nombre: "COMISIONES" }], // homologada a «Otros», fuera de la lista
      ["510545", { cuenta4: "5105", cuenta6: null, nombre: "AUXILIOS" }], // homologada solo al subgrupo
      ["250505", { cuenta4: "2505", cuenta6: "250505", nombre: "SALARIOS POR PAGAR" }],
    ]),
  };

  it("acepta la cuenta Russell de 6 tal cual y rechaza el subgrupo de 4", () => {
    expect(resolverCuenta4("510506", ENTORNO_NOM)).toEqual({ ok: true, cuenta4: "510506", via: "russell" });
    expect(resolverCuenta4("5105", ENTORNO_NOM)).toEqual({ ok: false, motivo: "no-encontrada", entrada: "5105" });
  });

  it("resuelve la cuenta del cliente por su homologación de 6, nunca truncando", () => {
    expect(resolverCuenta4("510506", { ...ENTORNO_NOM, subgruposModulo: new Set(["510530"]) })).toMatchObject({
      ok: false, motivo: "fuera-del-modulo", cuenta4Real: "510506",
    });
    expect(resolverCuenta4("520518", ENTORNO_NOM)).toEqual({
      ok: false, motivo: "fuera-del-modulo", entrada: "520518", cuenta4Real: "520595", nombreCliente: "COMISIONES",
    });
    expect(resolverCuenta4("250505", ENTORNO_NOM)).toMatchObject({ motivo: "fuera-del-modulo", cuenta4Real: "250505" });
  });

  it("avisa cuando el cliente está homologado solo al subgrupo y el módulo cruza a 6", () => {
    const r = resolverCuenta4("510545", ENTORNO_NOM);
    expect(r).toEqual({ ok: false, motivo: "sin-nivel", entrada: "510545", cuenta4Real: "5105", nombreCliente: "AUXILIOS" });
    if (r.ok) return;
    expect(mensajeResolucion(r, "Nómina", 6)).toContain("solo al subgrupo 5105");
  });

  it("resolverCuentaRussell fija el nivel sin tocar el entorno", () => {
    const { nivel: _nivel, ...sinNivel } = ENTORNO_NOM;
    void _nivel;
    expect(resolverCuentaRussell("510506", sinNivel, 6)).toMatchObject({ ok: true, cuenta4: "510506" });
    expect(resolverCuentaRussell("510506", sinNivel, 4)).toMatchObject({ ok: false, motivo: "fuera-del-modulo" });
  });
});
