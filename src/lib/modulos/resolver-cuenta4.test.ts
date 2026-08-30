import { describe, it, expect } from "vitest";
import { resolverCuenta4, mensajeResolucion, type EntornoResolucion } from "./resolver-cuenta4";

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
