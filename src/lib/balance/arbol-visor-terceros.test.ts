import { describe, expect, it } from "vitest";
import { agruparJerarquia, type CuentaEstandar } from "./calcular";
import { FILTROS_COLUMNAS_DETALLE_INICIALES } from "./filtros-detalle";
import { construirComparacionCuentasTerceros, type FilaCuentaBalanceVisor, type FilaDetalleTerceroVisor } from "./visor-terceros";
import { construirArbolVisorTerceros, filtrarArbolVisorTerceros, agruparMovimientosTercero, clavesDesplegablesTerceros, type NodoVisorTerceros } from "./arbol-visor-terceros";
import { reconocerIdentidadTercero } from "./identidad-tercero";

const estandar: CuentaEstandar[] = [{ code: "130505", name: "Clientes", nature: "D", critical: false }];
const nombres = { nombre2: new Map([["13", "Deudores"]]), nombre4: new Map([["1305", "Nacionales"]]) };
const cuenta = (extra: Partial<FilaCuentaBalanceVisor> = {}): FilaCuentaBalanceVisor => ({ cuenta8: "13050501010101", nombreCuenta: "Cartera nacional", cuenta6Russell: "130505", saldoInicial: 30, debitos: 80, creditos: 10, saldoFinal: 100, ...extra });
const tercero = (extra: Partial<FilaDetalleTerceroVisor> = {}): FilaDetalleTerceroVisor => ({ ...cuenta(), nitTercero: "900111222", nombreTercero: "Álvarez SAS", ...extra });
const propia = (): FilaDetalleTerceroVisor => tercero({ nitTercero: null, nombreTercero: null });
const plana = (nodos: NodoVisorTerceros[]): NodoVisorTerceros[] => nodos.flatMap((n) => [n, ...plana(n.hijos)]);
function crear(balance = [cuenta()], terceros = [propia(), tercero()]) {
  return construirArbolVisorTerceros(construirComparacionCuentasTerceros(balance, terceros), estandar, nombres);
}
const filtro = { q: "", clase: "todo" as const, nivel: 0, soloDiferencias: false, columnas: { ...FILTROS_COLUMNAS_DETALLE_INICIALES } };

describe("árbol de terceros coherente con balance", () => {
  it("conserva exactamente la jerarquía Russell y los cuatro importes de los nodos oficiales", () => {
    const balance = [cuenta(), cuenta({ cuenta8: "13999999", saldoInicial: 20, debitos: 60, creditos: 5, saldoFinal: 75 })];
    const arbol = crear(balance, [tercero(), tercero({ cuenta8: "13999999", saldoInicial: 20, debitos: 60, creditos: 5, saldoFinal: 75 })]);
    const oficial = agruparJerarquia(balance, estandar, new Map([["130505", "Clientes"]]), nombres);
    const comparar = (actuales: NodoVisorTerceros[], esperados: typeof oficial) => {
      expect(actuales).toHaveLength(esperados.length);
      actuales.forEach((actual, i) => {
        const { hijos, ...camposOficiales } = esperados[i];
        expect(actual).toMatchObject(camposOficiales);
        comparar(actual.hijos.filter((h) => h.tipo === "cuenta"), hijos);
      });
    };
    comparar(arbol, oficial);
    expect(plana(arbol).find((n) => n.nivel === 8 && n.tipo === "cuenta")?.code).toBe("13050501010101");
  });

  it("excluye la fila propia y agrupa el mismo NIT sumando las cuatro columnas sin doble conteo", () => {
    const a = tercero({ saldoInicial: 10, debitos: 40, creditos: 5, saldoFinal: 45 });
    const b = tercero({ nombreTercero: "ALVAREZ S.A.S.", saldoInicial: 20, debitos: 40, creditos: 5, saldoFinal: 55 });
    const arbol = crear([cuenta()], [propia(), a, b]);
    const grupos = plana(arbol).filter((n) => n.tipo === "tercero");
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ prevBalance: 30, debe: 80, haber: 10, balance: 100, movimientos: 2 });
    expect(grupos[0].hijos).toHaveLength(2);
    expect(arbol[0]).toMatchObject({ prevBalance: 30, debe: 80, haber: 10, balance: 100, diferencias: 0 });
  });

  it("no pierde rotación de débito y crédito cuando los movimientos netean a cero", () => {
    const balance = cuenta({ saldoInicial: 0, debitos: 100, creditos: 100, saldoFinal: 0 });
    const arbol = crear([balance], [tercero({ saldoInicial: 0, debitos: 100, creditos: 0, saldoFinal: 100 }), tercero({ saldoInicial: 0, debitos: 0, creditos: 100, saldoFinal: -100 })]);
    expect(plana(arbol).find((n) => n.tipo === "tercero")).toMatchObject({ debe: 100, haber: 100, balance: 0, variation: null, movimientos: 2 });
  });

  it("conserva una cuenta sin desagregar sin inventar un NIT ni un tercero real", () => {
    const arbol = crear([cuenta()], [propia()]);
    expect(plana(arbol).find((n) => n.tipo === "tercero")).toMatchObject({ code: "Sin documento", name: "Sin desagregar por tercero", esFilaPropia: true, balance: 100 });
    expect(plana(arbol).find((n) => n.comparacion)?.esFilaPropia).toBe(true);
  });

  it("sin NIT agrupa por nombre y mantiene separados los nombres distintos", () => {
    const filas = [tercero({ nitTercero: null }), tercero({ nitTercero: null, nombreTercero: "alvarez sas" }), tercero({ nitTercero: null, nombreTercero: "Otros" })];
    const [c] = construirComparacionCuentasTerceros([cuenta()], filas);
    expect(agruparMovimientosTercero(c)).toHaveLength(2);
  });

  it("un NIT sin nombre sigue siendo un tercero real y se identifica sin inventar su nombre", () => {
    const arbol = crear([cuenta()], [tercero({ nombreTercero: null })]);
    expect(plana(arbol).find((n) => n.tipo === "tercero")).toMatchObject({ code: "900111222", name: "Nombre no disponible", esFilaPropia: false });
  });

  it("conserva diferencias e inconsistencias de mapeo dentro del mismo NIT", () => {
    const arbol = crear([cuenta()], [tercero({ saldoFinal: 40 }), tercero({ cuenta6Russell: "130510", saldoFinal: 60 })]);
    const grupo = plana(arbol).find((n) => n.tipo === "tercero")!;
    expect(grupo).toMatchObject({ mapeoInconsistente: true, std: null, diferencias: 1 });
    expect(arbol[0].diferencias).toBe(1);
    expect(plana(arbol).find((n) => n.comparacion)?.comparacion).toMatchObject({ diferenciaHomologacion: true, diferenciaSaldo: false });
  });

  it("cuentas exclusivas de terceros permanecen visibles sin aumentar los totales oficiales", () => {
    const arbol = crear([cuenta()], [tercero(), tercero({ cuenta8: "13050599", saldoFinal: 900 })]);
    expect(arbol[0].balance).toBe(100);
    expect(arbol[0].incompletas).toBe(1);
    const cuentaHuerfana = plana(arbol).find((n) => n.code === "13050599")!;
    expect(cuentaHuerfana.comparacion?.enBalance).toBe(false);
    expect(cuentaHuerfana.hijos[0].balance).toBe(900);
  });

  it("una cuenta sin detalle sigue como incompleta y no inventa hijos", () => {
    const arbol = crear([cuenta()], []);
    expect(arbol[0].incompletas).toBe(1);
    expect(plana(arbol).find((n) => n.nivel === 8)).toMatchObject({ hijos: [], comparacion: { enTercero: false } });
  });

  it("consolida códigos repetidos del balance una vez y mantiene claves únicas", () => {
    const arbol = crear([cuenta({ saldoFinal: 40 }), cuenta({ saldoFinal: 60 })], [tercero()]);
    expect(arbol[0].balance).toBe(100);
    const nodos = plana(arbol);
    expect(new Set(nodos.map((n) => n.key)).size).toBe(nodos.length);
    expect(nodos.filter((n) => n.comparacion)).toHaveLength(1);
    expect(clavesDesplegablesTerceros(arbol)).toHaveLength(4);
  });
});

describe("filtros del árbol de terceros", () => {
  const arbol = crear([cuenta()], [tercero({ saldoFinal: 60 }), tercero({ nitTercero: "800999888", nombreTercero: "Otro cliente", saldoFinal: 40 })]);
  it("buscar NIT conserva toda la ruta y los totales oficiales, sin arrastrar otro tercero", () => {
    const filtrado = filtrarArbolVisorTerceros(arbol, { ...filtro, q: "900111" });
    expect(plana(filtrado).map((n) => n.code)).toEqual(["13", "1305", "130505", "13050501010101", "900111222"]);
    expect(filtrado[0].balance).toBe(100);
    expect(plana(arbol).filter((n) => n.tipo === "tercero")).toHaveLength(2);
  });
  it("buscar nombre admite tildes y buscar la cuenta permite desplegar todos sus terceros", () => {
    expect(plana(filtrarArbolVisorTerceros(arbol, { ...filtro, q: "alvarez" })).filter((n) => n.tipo === "tercero")).toHaveLength(1);
    expect(plana(filtrarArbolVisorTerceros(arbol, { ...filtro, q: "13050501010101" })).filter((n) => n.tipo === "tercero")).toHaveLength(2);
  });
  it("combina código de cuenta, débito y saldo sin modificar los agregados", () => {
    const filtrado = filtrarArbolVisorTerceros(arbol, { ...filtro, columnas: { ...filtro.columnas, codigo: "13050501010101", debito: "> 0", saldo: ">= 50" } });
    expect(plana(filtrado).filter((n) => n.tipo === "tercero").map((n) => n.code)).toEqual(["900111222"]);
    expect(filtrado[0].balance).toBe(100);
  });
  it("aplica clase y profundidad conservando solo las cuentas hasta N6", () => {
    expect(filtrarArbolVisorTerceros(arbol, { ...filtro, clase: "er" })).toEqual([]);
    expect(plana(filtrarArbolVisorTerceros(arbol, { ...filtro, nivel: 6 })).map((n) => n.nivel)).toEqual([2, 4, 6]);
    expect(plana(filtrarArbolVisorTerceros(arbol, { ...filtro, nivel: 8 })).some((n) => n.tipo === "tercero")).toBe(false);
  });
  it("solo diferencias conserva la cuenta afectada y sus ancestros", () => {
    const base = crear([cuenta(), cuenta({ cuenta8: "13050502" })], [tercero(), tercero({ cuenta8: "13050502", saldoFinal: 90 })]);
    const filtrado = filtrarArbolVisorTerceros(base, { ...filtro, soloDiferencias: true });
    expect(plana(filtrado).filter((n) => n.comparacion).map((n) => n.code)).toEqual(["13050502"]);
  });
  it("filtra incompletas y valores numéricos inválidos sin fabricar resultados", () => {
    expect(filtrarArbolVisorTerceros(arbol, { ...filtro, columnas: { ...filtro.columnas, validacion: "incompleta" } })).toEqual([]);
    expect(filtrarArbolVisorTerceros(arbol, { ...filtro, columnas: { ...filtro.columnas, saldo: "> texto" } })).toEqual([]);
  });

  it("oculta únicamente terceros con las cuatro columnas en cero", () => {
    const base = crear([cuenta()], [
      tercero({ nitTercero: "111111111", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0 }),
      tercero({ nitTercero: "222222222", saldoInicial: 0, debitos: 100, creditos: 100, saldoFinal: 0 }),
    ]);
    const filtrado = filtrarArbolVisorTerceros(base, { ...filtro, ocultarSinMovimiento: true });
    expect(plana(filtrado).filter((n) => n.tipo === "tercero").map((n) => n.code)).toEqual(["222222222"]);
    expect(filtrado[0].balance).toBe(100);
  });

  it("filtra por estado de identidad usando el documento completo", () => {
    const base = crear([cuenta()], [
      tercero({
        nitTercero: "001234567",
        nombreTercero: "Ana Pérez",
        identidadTercero: reconocerIdentidadTercero({ documento: "0012345678", tipo: "CC", nombre: "Ana Pérez" }),
      }),
      tercero({
        nitTercero: "900123456",
        nombreTercero: null,
        identidadTercero: reconocerIdentidadTercero({ documento: "900123456", tipo: "NIT" }),
      }),
    ]);
    const identificados = filtrarArbolVisorTerceros(base, { ...filtro, identidad: "identificado" });
    expect(plana(identificados).filter((n) => n.tipo === "tercero").map((n) => n.code)).toEqual(["0012345678"]);
    const sinNombre = filtrarArbolVisorTerceros(base, { ...filtro, identidad: "sin_nombre" });
    expect(plana(sinNombre).filter((n) => n.tipo === "tercero").map((n) => n.code)).toEqual(["900123456"]);
  });
});
