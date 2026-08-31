import { describe, expect, it } from "vitest";
import {
  codigoPadre,
  codigosDesplegables,
  construirArbolTercero,
  contarNodosArbolTercero,
  esFilaPropiaDeCuenta,
  filtrarArbolTercero,
  FILTROS_COLUMNAS_TERCERO_INICIALES,
  nivelDeCodigo,
  resumirArbolTercero,
  type NodoArbolTercero,
} from "./arbol-tercero";
import type { FilaBalanceTercero } from "./tercero-vista";

let secuencia = 0;
function fila(parcial: Partial<FilaBalanceTercero> & { cuenta8: string }): FilaBalanceTercero {
  secuencia += 1;
  const c = parcial.cuenta8;
  return {
    id: secuencia,
    cuenta2: c.slice(0, 2),
    cuenta4: c.slice(0, 4),
    cuenta6: c.slice(0, 6),
    nombreCuenta: `Cuenta ${c}`,
    cuenta6Russell: null,
    nitTercero: null,
    nombreTercero: null,
    saldoInicial: 0,
    debitos: 0,
    creditos: 0,
    saldoFinal: 0,
    ...parcial,
  };
}

/** Cargue típico (SIIGO): agrupadoras 4/6 con fila propia, imputable con fila propia + terceros. */
function cargueTipico(): FilaBalanceTercero[] {
  return [
    fila({ cuenta8: "1305", nombreCuenta: "CLIENTES", saldoFinal: 150 }),
    fila({ cuenta8: "130505", nombreCuenta: "NACIONALES", saldoFinal: 100 }),
    fila({ cuenta8: "13050501", nombreCuenta: "Nacionales", cuenta6Russell: "130505", saldoFinal: 100 }), // fila propia
    fila({ cuenta8: "13050501", nombreCuenta: "Nacionales", cuenta6Russell: "130505", nitTercero: "900111", nombreTercero: "ACME", saldoFinal: 60 }),
    fila({ cuenta8: "13050501", nombreCuenta: "Nacionales", nitTercero: "900222", nombreTercero: "BETA", saldoFinal: 40 }),
    fila({ cuenta8: "130510", nombreCuenta: "EXTERIOR", saldoFinal: 50 }),
    fila({ cuenta8: "13051001", nombreCuenta: "Clientes del exterior", saldoFinal: 50 }), // fila propia
    fila({ cuenta8: "13051001", nombreCuenta: "Clientes del exterior", nitTercero: null, nombreTercero: "FMI220315FX3", saldoFinal: 30 }), // tercero sin NIT
    fila({ cuenta8: "13051001", nombreCuenta: "Clientes del exterior", nitTercero: "900111", nombreTercero: "ACME", saldoFinal: 20 }),
  ];
}

function buscar(arbol: NodoArbolTercero[], codigo: string): NodoArbolTercero | undefined {
  for (const n of arbol) {
    if (n.codigo === codigo) return n;
    const hallado = buscar(n.hijos, codigo);
    if (hallado) return hallado;
  }
  return undefined;
}

describe("nivelDeCodigo / codigoPadre", () => {
  it("clasifica por dígitos y deriva el padre por prefijo", () => {
    expect(nivelDeCodigo("13")).toBe(2);
    expect(nivelDeCodigo("1305")).toBe(4);
    expect(nivelDeCodigo("130505")).toBe(6);
    expect(nivelDeCodigo("13050501")).toBe(8);
    expect(nivelDeCodigo("1305050199")).toBe(8);
    expect(codigoPadre("13")).toBeNull();
    expect(codigoPadre("1305")).toBe("13");
    expect(codigoPadre("13050501")).toBe("130505");
    expect(codigoPadre("1305050199")).toBe("130505");
  });
});

describe("esFilaPropiaDeCuenta", () => {
  it("es propia solo sin NIT y sin nombre de tercero", () => {
    expect(esFilaPropiaDeCuenta({ nitTercero: null, nombreTercero: null })).toBe(true);
    expect(esFilaPropiaDeCuenta({ nitTercero: "  ", nombreTercero: "" })).toBe(true);
    expect(esFilaPropiaDeCuenta({ nitTercero: null, nombreTercero: "FMI220315FX3" })).toBe(false);
    expect(esFilaPropiaDeCuenta({ nitTercero: "900111", nombreTercero: null })).toBe(false);
  });
});

describe("construirArbolTercero", () => {
  it("arma grupo → cuenta → subcuenta → imputable y cuelga los terceros de la imputable", () => {
    const arbol = construirArbolTercero(cargueTipico());
    expect(arbol.map((n) => n.codigo)).toEqual(["13"]);
    const grupo = arbol[0];
    expect(grupo.nivel).toBe(2);
    expect(grupo.nombre).toBe("Deudores"); // derivado del PUC
    expect(grupo.declarado).toBe(false);
    expect(grupo.hijos.map((n) => n.codigo)).toEqual(["1305"]);
    const cuenta = grupo.hijos[0];
    expect(cuenta.nombre).toBe("CLIENTES");
    expect(cuenta.hijos.map((n) => n.codigo)).toEqual(["130505", "130510"]);
    const imputable = buscar(arbol, "13050501")!;
    expect(imputable.tipoFila).toBe("movimiento");
    expect(imputable.hijos).toEqual([]);
    expect(imputable.detalleTerceros.map((t) => t.nit)).toEqual(["900111", "900222"]);
    expect(imputable.cuenta6Russell).toBe("130505");
  });

  it("la fila propia de la imputable es su total declarado, NO un tercero (sin doble conteo)", () => {
    const arbol = construirArbolTercero(cargueTipico());
    const imputable = buscar(arbol, "13050501")!;
    expect(imputable.declarado).toBe(true);
    expect(imputable.saldoFinal).toBe(100);
    expect(imputable.descuadre).toBe(0);
    expect(imputable.terceros).toBe(2);
  });

  it("sin fila propia, la imputable vale la suma de sus terceros", () => {
    const arbol = construirArbolTercero([
      fila({ cuenta8: "13050501", nitTercero: "1", nombreTercero: "A", saldoFinal: 7, debitos: 10, creditos: 3 }),
      fila({ cuenta8: "13050501", nitTercero: "2", nombreTercero: "B", saldoFinal: 5, debitos: 5 }),
    ]);
    const imputable = buscar(arbol, "13050501")!;
    expect(imputable.declarado).toBe(false);
    expect(imputable.saldoFinal).toBe(12);
    expect(imputable.debitos).toBe(15);
    expect(imputable.creditos).toBe(3);
    expect(imputable.descuadre).toBeNull();
    // Los niveles derivados suman hacia arriba.
    expect(buscar(arbol, "130505")!.saldoFinal).toBe(12);
    expect(buscar(arbol, "1305")!.saldoFinal).toBe(12);
    expect(arbol[0].saldoFinal).toBe(12);
    expect(buscar(arbol, "130505")!.nombre).toBeNull();
  });

  it("las agrupadoras declaradas exponen el descuadre contra sus hijas", () => {
    const filas = cargueTipico();
    // 130505 declara 100 y su única imputable vale 100 → cuadra; 1305 declara 150 = 100 + 50.
    let arbol = construirArbolTercero(filas);
    expect(buscar(arbol, "130505")!.descuadre).toBe(0);
    expect(buscar(arbol, "1305")!.descuadre).toBe(0);
    // Si el archivo declara otro total, el Δ aparece en la agrupadora.
    filas[0] = { ...filas[0], saldoFinal: 170 };
    arbol = construirArbolTercero(filas);
    expect(buscar(arbol, "1305")!.saldoFinal).toBe(170);
    expect(buscar(arbol, "1305")!.descuadre).toBe(20);
  });

  it("cuenta NITs únicos y filas sin NIT hacia arriba", () => {
    const arbol = construirArbolTercero(cargueTipico());
    // 900111 aparece en dos cuentas: es UN tercero para el grupo.
    expect(arbol[0].terceros).toBe(2);
    expect(arbol[0].filasSinNit).toBe(1);
    expect(buscar(arbol, "13051001")!.filasSinNit).toBe(1);
    expect(buscar(arbol, "13051001")!.detalleTerceros[0].nombre).toBe("FMI220315FX3");
  });

  it("ordena hermanas por código y terceros por orden del archivo aunque las filas lleguen desordenadas", () => {
    const filas = cargueTipico().reverse();
    const arbol = construirArbolTercero(filas);
    expect(buscar(arbol, "1305")!.hijos.map((n) => n.codigo)).toEqual(["130505", "130510"]);
    expect(buscar(arbol, "13050501")!.detalleTerceros.map((t) => t.nit)).toEqual(["900111", "900222"]);
  });
});

describe("resumirArbolTercero", () => {
  it("totaliza desde las raíces, sin doble conteo, y cuenta imputables/homologación", () => {
    const r = resumirArbolTercero(construirArbolTercero(cargueTipico()));
    expect(r.saldoFinal).toBe(150);
    expect(r.cuentas).toBe(2);
    expect(r.homologadas).toBe(1);
    expect(r.sinHomologar).toBe(1);
    expect(r.terceros).toBe(2);
    expect(r.filasSinNit).toBe(1);
    expect(r.saldoSinNit).toBe(30);
    expect(r.descuadres).toBe(0);
  });
});

describe("filtrarArbolTercero", () => {
  const arbol = construirArbolTercero(cargueTipico());

  it("sin criterios devuelve el árbol tal cual", () => {
    const r = filtrarArbolTercero(arbol, {});
    expect(r).toHaveLength(1);
    expect(contarNodosArbolTercero(r)).toBe(contarNodosArbolTercero(arbol));
  });

  it("la búsqueda por código conserva la rama con sus terceros", () => {
    const r = filtrarArbolTercero(arbol, { busqueda: "130505" });
    expect(buscar(r, "130510")).toBeUndefined();
    const imputable = buscar(r, "13050501")!;
    expect(imputable.detalleTerceros).toHaveLength(2);
    expect(imputable.abrirTerceros).toBeUndefined();
    // Los ancestros se conservan sin terceros propios.
    expect(buscar(r, "1305")).toBeDefined();
  });

  it("la búsqueda por NIT o nombre de tercero llega hasta el tercero y marca la cuenta para abrirse", () => {
    const r = filtrarArbolTercero(arbol, { busqueda: "beta" });
    const imputable = buscar(r, "13050501")!;
    expect(imputable.detalleTerceros.map((t) => t.nit)).toEqual(["900222"]);
    expect(imputable.abrirTerceros).toBe(true);
    expect(buscar(r, "13051001")).toBeUndefined();

    const porNit = filtrarArbolTercero(arbol, { busqueda: "900.111" });
    expect(buscar(porNit, "13050501")!.detalleTerceros).toHaveLength(1);
    expect(buscar(porNit, "13051001")!.detalleTerceros).toHaveLength(1);
  });

  it("el filtro de columna Tercero exige una coincidencia dentro de la cuenta", () => {
    const r = filtrarArbolTercero(arbol, {
      filtros: { ...FILTROS_COLUMNAS_TERCERO_INICIALES, tercero: "fmi" },
    });
    expect(buscar(r, "13050501")).toBeUndefined();
    const exterior = buscar(r, "13051001")!;
    expect(exterior.detalleTerceros.map((t) => t.nombre)).toEqual(["FMI220315FX3"]);
    expect(exterior.abrirTerceros).toBe(true);
  });

  it("Homologada filtra imputables y deja las agrupadoras solo como ancestros", () => {
    const sin = filtrarArbolTercero(arbol, {
      filtros: { ...FILTROS_COLUMNAS_TERCERO_INICIALES, homologada: "no" },
    });
    expect(buscar(sin, "13050501")).toBeUndefined();
    expect(buscar(sin, "13051001")).toBeDefined();
    expect(buscar(sin, "130505")).toBeUndefined();
    expect(buscar(sin, "1305")).toBeDefined();

    const solo = filtrarArbolTercero(arbol, { soloSinHomologar: true });
    expect(buscar(solo, "13050501")).toBeUndefined();
    expect(buscar(solo, "13051001")).toBeDefined();
  });

  it("los filtros numéricos aplican a las cuentas y no podan sus terceros", () => {
    const r = filtrarArbolTercero(arbol, {
      filtros: { ...FILTROS_COLUMNAS_TERCERO_INICIALES, saldo: "> 45" },
    });
    // 13051001 vale 50 (> 45) pero ninguno de sus terceros supera 45.
    const exterior = buscar(r, "13051001")!;
    expect(exterior).toBeDefined();
    expect(exterior.detalleTerceros).toHaveLength(2); // los terceros no se podan por montos de la cuenta
    const nacionales = buscar(r, "13050501")!;
    expect(nacionales.saldoFinal).toBe(100);
  });

  it("nivelMax poda lo más profundo", () => {
    const r = filtrarArbolTercero(arbol, { nivelMax: 4 });
    expect(buscar(r, "1305")).toBeDefined();
    expect(buscar(r, "130505")).toBeUndefined();
  });

  it("codigosDesplegables incluye agrupadoras con hijas e imputables con terceros", () => {
    const s = codigosDesplegables(arbol);
    expect(s.has("13")).toBe(true);
    expect(s.has("13050501")).toBe(true);
  });
});
