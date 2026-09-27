import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogoPrevalidadorDeFabrica } from "@/lib/balance/prevalidador/catalogo";
import { MODULOS_IMPORT, descriptorModulo } from "./descriptores";
import {
  aplicarCuentasConciliacion,
  cuentasConciliacionDe,
  leerCuentasConciliacionGuardadas,
  moduloConCuentasConciliacion,
  moduloConOrigenPorCuenta,
  normalizarCuentaConciliacion,
  type CuentaConciliacion,
} from "./cuentas-conciliacion";
import {
  cedulaModulo,
  cuentaAsignableCedula,
  cuentasCedula6,
  fueraDeListaCedula,
  prefijosCuentaModulo,
} from "./cuentas-modulo";

const catalogo = catalogoPrevalidadorDeFabrica();
const prefijos = (codigo: string) => prefijosCuentaModulo(codigo, catalogo);
const d = (codigo: string) => {
  const descriptor = descriptorModulo(codigo);
  if (!descriptor) throw new Error(`sin descriptor ${codigo}`);
  return descriptor;
};

/** Lo que siembra la migración, leído del propio SQL: el código y la BD no pueden divergir. */
function siembraMigracion(): Record<string, CuentaConciliacion[]> {
  const sql = readFileSync(join(process.cwd(), "prisma/migrations/20260927120000_cuentas_conciliacion_modulo/migration.sql"), "utf8");
  const porModulo: Record<string, CuentaConciliacion[]> = {};
  for (const m of sql.matchAll(/\('([A-Z]{3})', '(\d{6})', (NULL|'nacional'|'exterior')\)/g)) {
    const origen = m[3] === "NULL" ? null : (m[3].replace(/'/g, "") as CuentaConciliacion["origen"]);
    (porModulo[m[1]] ??= []).push({ cuenta: m[2], origen });
  }
  return porModulo;
}

const porCuenta = (lista: readonly CuentaConciliacion[] | null) => [...(lista ?? [])].sort((a, b) => a.cuenta.localeCompare(b.cuenta));

describe("cuentas de conciliación por módulo", () => {
  it("solo los módulos que cruzan a 6 dígitos tienen lista; el origen es de Cartera y CxP", () => {
    const con = Object.keys(MODULOS_IMPORT).filter((c) => moduloConCuentasConciliacion(d(c))).sort();
    expect(con).toEqual(["CAR", "CXP", "ING", "NOM"]);
    expect(Object.keys(MODULOS_IMPORT).filter((c) => moduloConOrigenPorCuenta(d(c))).sort()).toEqual(["CAR", "CXP"]);
    expect(cuentasConciliacionDe(d("INV"))).toBeNull();
    expect(cuentasConciliacionDe(d("AFI"))).toBeNull();
  });

  it("la siembra de la migración es exactamente la lista de fábrica de cada módulo", () => {
    const siembra = siembraMigracion();
    expect(Object.keys(siembra).sort()).toEqual(["CAR", "CXP", "ING", "NOM"]);
    for (const codigo of Object.keys(siembra)) {
      expect(porCuenta(siembra[codigo]), codigo).toEqual(porCuenta(cuentasConciliacionDe(d(codigo))));
    }
    expect(siembra.NOM).toHaveLength(29);
    expect(siembra.CXP).toHaveLength(13);
    expect(siembra.CAR).toContainEqual({ cuenta: "130510", origen: "exterior" });
  });

  it("con la lista de fábrica, la cédula y el cruce por tercero quedan igual que con el descriptor fijo", () => {
    for (const codigo of ["ING", "CAR", "CXP", "NOM"]) {
      const fijo = d(codigo);
      const resuelto = aplicarCuentasConciliacion(fijo, cuentasConciliacionDe(fijo));
      const antes = cedulaModulo(fijo, prefijos(codigo));
      const despues = cedulaModulo(resuelto, prefijos(codigo));
      expect([...despues.adicionales].sort(), codigo).toEqual([...antes.adicionales].sort());
      expect(new Set(cuentasCedula6(resuelto)), codigo).toEqual(new Set(cuentasCedula6(fijo)));
      expect(resuelto.crucePorTercero.cuentasNacional ?? [], codigo).toEqual(fijo.crucePorTercero.cuentasNacional ?? []);
      expect(resuelto.crucePorTercero.cuentasExterior ?? [], codigo).toEqual(fijo.crucePorTercero.cuentasExterior ?? []);
      for (const cuenta of ["130505", "130515", "280505", "220505", "233505", "410505", "422005", "422010", "510506", "510548", "251010"]) {
        expect(cuentaAsignableCedula(despues, cuenta), `${codigo} ${cuenta}`).toBe(cuentaAsignableCedula(antes, cuenta));
        expect(fueraDeListaCedula(despues, cuenta), `${codigo} ${cuenta}`).toBe(fueraDeListaCedula(antes, cuenta));
      }
    }
    // Ingresos no acotaba el cruce por tercero: sigue sin lista ahí.
    expect(aplicarCuentasConciliacion(d("ING"), cuentasConciliacionDe(d("ING"))).crucePorTercero.cuentasRussell6).toBeUndefined();
  });

  it("agregar y quitar cuentas cambia lo que concilia el módulo", () => {
    const cxp = d("CXP");
    const lista = [...(cuentasConciliacionDe(cxp) ?? []).filter((c) => c.cuenta !== "233595"), { cuenta: "238030", origen: null }];
    const resuelto = aplicarCuentasConciliacion(cxp, lista);
    const cedula = cedulaModulo(resuelto, prefijos("CXP"));
    // Quitada: su saldo pasa a «fuera del módulo» y ya no se puede asignar.
    expect(fueraDeListaCedula(cedula, "233595")).toBe(true);
    expect(cuentaAsignableCedula(cedula, "233595")).toBe(false);
    // Agregada fuera de los prefijos (2380): entra como adicional.
    expect(cedula.adicionales.has("238030")).toBe(true);
    expect(cuentaAsignableCedula(cedula, "238030")).toBe(true);
    expect(resuelto.crucePorTercero.cuentasRussell6).toContain("238030");
    expect(resuelto.crucePorTercero.cuentasRussell6).not.toContain("233595");
  });

  it("el origen de cada cuenta reemplaza nacional/exterior en Cartera", () => {
    const car = d("CAR");
    const resuelto = aplicarCuentasConciliacion(car, [
      { cuenta: "130505", origen: "nacional" },
      { cuenta: "130510", origen: null },
      { cuenta: "130515", origen: "exterior" },
    ]);
    expect(resuelto.crucePorTercero.cuentasNacional).toEqual(["130505"]);
    expect(resuelto.crucePorTercero.cuentasExterior).toEqual(["130515"]);
  });

  it("un módulo a 4 dígitos o sin configuración no cambia", () => {
    expect(aplicarCuentasConciliacion(d("INV"), [{ cuenta: "143505", origen: null }])).toBe(d("INV"));
    expect(aplicarCuentasConciliacion(d("NOM"), null)).toBe(d("NOM"));
    // El descriptor estático no se muta.
    aplicarCuentasConciliacion(d("NOM"), [{ cuenta: "510506", origen: null }]);
    expect(d("NOM").crucePorTercero.cuentasRussell6).toHaveLength(25);
  });

  it("lee la copia del cierre y rechaza una mal formada", () => {
    expect(leerCuentasConciliacionGuardadas([{ cuenta: "130505", origen: "nacional" }, { cuenta: "280505", origen: null }])).toEqual([
      { cuenta: "130505", origen: "nacional" },
      { cuenta: "280505", origen: null },
    ]);
    expect(leerCuentasConciliacionGuardadas(null)).toBeNull();
    expect(leerCuentasConciliacionGuardadas([{ cuenta: "1305" }])).toBeNull();
    expect(leerCuentasConciliacionGuardadas([{ cuenta: "130505", origen: "otro" }])).toEqual([{ cuenta: "130505", origen: null }]);
    expect(normalizarCuentaConciliacion("13.05.05")).toBe("130505");
    expect(normalizarCuentaConciliacion("1305")).toBeNull();
  });
});
