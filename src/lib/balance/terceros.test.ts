import { describe, it, expect } from "vitest";
import { esFilaTercero, esFilaGenericoTercero, esBalancePorTercero, colapsarTerceros, esFilaTerceroSufijo, esBalancePorTerceroSufijo, consolidarTercerosPorSufijo, consolidarAuxiliaresRepetidos, marcarCuentaNit } from "./terceros";
import type { NodoBorrador } from "./borrador";
import { construirVistaBorrador } from "./borrador-vm";
import type { FilaBorrador } from "./borrador";

function fila(filaNum: number, codigo: string, nombre: string, saldoFinal: number, tipo: FilaBorrador["tipoFila"], extra: Partial<FilaBorrador> = {}): FilaBorrador {
  return { filaNum, codigo, codigoCrudo: codigo, nombre, nivel: codigo.length || null, tipoFila: tipo, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal, ...extra };
}
// Tercero: movimiento cuyo nombre === código (NIT/cédula).
const tercero = (fn: number, nit: string, saldo: number) => fila(fn, nit, nit, saldo, "movimiento");

describe("esFilaTercero", () => {
  it("detecta un movimiento cuyo nombre es su propio código (NIT/cédula) — forma limpia", () => {
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "901427659", nombre: "901427659", codigoCrudo: "901427659 MELONN S.A.S" })).toBe(true);
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "22586894", nombre: "22586894", codigoCrudo: "22586894 FLOREZ" })).toBe(true); // cédula 8 díg
  });
  it("detecta el tercero PEGADO (ID junto al nombre) por el crudo — NIT y RFC", () => {
    // NIT colombiano pegado con nombre que trae dígitos → código no numérico.
    expect(esFilaTercero({ tipoFila: "total", codigo: "", nombre: "901114801D2", codigoCrudo: "901114801 D2 WORK SAS" })).toBe(true);
    // RFC mexicano (empieza por letras): empresa y persona.
    expect(esFilaTercero({ tipoFila: "total", codigo: "", nombre: "AME880912189", codigoCrudo: "AME880912189 AEROMEXICO" })).toBe(true);
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "", nombre: "AAQA9401125U2Adriá", codigoCrudo: "AAQA9401125U2 Adrián Ayala Quintana" })).toBe(true);
  });
  it("NO marca cuentas reales, rótulos de sección (sin dígitos) ni agrupadoras", () => {
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "11051005", nombre: "CAJA MENOR ENVIGADO", codigoCrudo: "11051005" })).toBe(false);
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "22359501", nombre: "OTRAS CUENTAS POR PAGAR", codigoCrudo: "22359501" })).toBe(false);
    expect(esFilaTercero({ tipoFila: "agrupadora", codigo: "901427659", nombre: "901427659", codigoCrudo: "901427659" })).toBe(false);
    expect(esFilaTercero({ tipoFila: "total", codigo: "", nombre: "Total general", codigoCrudo: "Total general" })).toBe(false);
    // Rótulo de sección: crudo sin dígitos en el ID → no es un tercero.
    expect(esFilaTercero({ tipoFila: "movimiento", codigo: "", nombre: "NOMINASNOMINAS", codigoCrudo: "NOMINAS NOMINAS" })).toBe(false);
  });
});

describe("esFilaGenericoTercero", () => {
  it("detecta el placeholder «Generico Genérico» (con y sin acento), no una cuenta ni agrupadora", () => {
    expect(esFilaGenericoTercero({ tipoFila: "total", codigoCrudo: "Generico Genérico" })).toBe(true);
    expect(esFilaGenericoTercero({ tipoFila: "movimiento", codigoCrudo: "Generico Generico" })).toBe(true);
    expect(esFilaGenericoTercero({ tipoFila: "agrupadora", codigoCrudo: "Generico Genérico" })).toBe(false);
    expect(esFilaGenericoTercero({ tipoFila: "movimiento", codigoCrudo: "52201001" })).toBe(false); // cuenta real
    expect(esFilaGenericoTercero({ tipoFila: "total", codigoCrudo: "NOMINAS NOMINAS" })).toBe(false);
  });
});

describe("colapsarTerceros con el tercero genérico", () => {
  it("quita también las filas «Generico Genérico» (movimiento y total), deja la cuenta", () => {
    const filas: FilaBorrador[] = [
      fila(1, "5220", "ARRENDAMIENTOS", 100, "agrupadora"),
      { ...fila(2, "", "GenericoGené", 60, "movimiento"), codigoCrudo: "Generico Genérico" },
      { ...fila(3, "", "GenericoGené", 0, "total"), codigoCrudo: "Generico Genérico" },
      tercero(4, "901427659", 40),
    ];
    expect(colapsarTerceros(filas).map((f) => f.codigoCrudo)).toEqual(["5220"]);
  });
});

describe("esBalancePorTercero", () => {
  it("true cuando la mayoría de movimientos son terceros; false en un informe normal", () => {
    const conTercero = [
      fila(1, "1105", "CAJA", 0, "agrupadora"),
      ...Array.from({ length: 25 }, (_, i) => tercero(i + 2, `9014276${i}`, 1)),
    ];
    expect(esBalancePorTercero(conTercero)).toBe(true);
    const normal = Array.from({ length: 25 }, (_, i) => fila(i + 1, `1105050${i}`, `CUENTA ${i}`, 1, "movimiento"));
    expect(esBalancePorTercero(normal)).toBe(false);
  });
});

describe("colapsarTerceros + construirVistaBorrador (balance por tercero)", () => {
  it("colapsarTerceros quita solo las filas de tercero", () => {
    const filas = [fila(1, "110505", "CAJA", 100, "agrupadora"), tercero(2, "901427659", 60), tercero(3, "1015412825", 40)];
    expect(colapsarTerceros(filas).map((f) => f.codigo)).toEqual(["110505"]);
  });

  it("colapsa el detalle de tercero y concilia por CUENTA (la cuenta queda imputable)", () => {
    // 12 cuentas de caja (agrupadora) cada una con 2 terceros que suman su saldo.
    const filas: FilaBorrador[] = [
      fila(1, "1", "ACTIVO", 1200, "agrupadora"),
      fila(2, "11", "DISPONIBLE", 1200, "agrupadora"),
      fila(3, "1105", "CAJA", 1200, "agrupadora"),
    ];
    let fn = 4;
    for (let i = 0; i < 12; i++) {
      const cta = `1105${String(5 + i * 5).padStart(2, "0")}`; // 110505, 110510, … (6 díg)
      filas.push(fila(fn++, cta, `CAJA ${i}`, 100, "agrupadora")); // cuenta = 60 + 40
      filas.push(tercero(fn++, `9014276${i}`, 60));
      filas.push(tercero(fn++, `1015412${i}`, 40));
    }
    // Sin colapsar, los terceros (código NIT) se contarían en clase 9 y romperían todo.
    const vista = construirVistaBorrador(filas);
    expect(vista.porTercero).toBe(true);
    // El árbol NO contiene filas de tercero (se colapsaron).
    const codigos = new Set<string>();
    const rec = (n: { codigo: string; hijos: { codigo: string; hijos: unknown[] }[] }) => { codigos.add(n.codigo); n.hijos.forEach((h) => rec(h as never)); };
    vista.arbol.forEach((r) => rec(r as never));
    expect([...codigos].some((c) => c.startsWith("9014276"))).toBe(false); // ningún NIT
    expect(codigos.has("110505")).toBe(true); // sí las cuentas
    // El Activo calculado = Σ cuentas (12 × 100 = 1200), NO clase 9.
    expect(Math.round(vista.validacion.activo)).toBe(1200);
  });
});

describe("tercero con NIT en el sufijo del código (SAP/BO «por tercero»)", () => {
  it("esFilaTerceroSufijo: código-…-NIT sí; cuenta con sufijo corto o guiones no", () => {
    expect(esFilaTerceroSufijo({ tipoFila: "movimiento", codigoCrudo: "120520-0-00-800011002" })).toBe(true);
    expect(esFilaTerceroSufijo({ tipoFila: "movimiento", codigoCrudo: "122505-0-00-860034594" })).toBe(true);
    expect(esFilaTerceroSufijo({ tipoFila: "movimiento", codigoCrudo: "11100501-0-00" })).toBe(false); // banco, sufijo corto
    expect(esFilaTerceroSufijo({ tipoFila: "movimiento", codigoCrudo: "1105-05-04" })).toBe(false); // re-listado guiones
    expect(esFilaTerceroSufijo({ tipoFila: "movimiento", codigoCrudo: "901427659" })).toBe(false); // NIT plano (sin guion)
    expect(esFilaTerceroSufijo({ tipoFila: "agrupadora", codigoCrudo: "120520-0-00-800011002" })).toBe(false);
  });

  it("consolidarTercerosPorSufijo: deja SIEMPRE el código limpio y una fila por cuenta (suma TODO)", () => {
    const conCrudo = (fn: number, cod: string, crudo: string, sf: number): FilaBorrador => ({ ...fila(fn, cod, cod, sf, "movimiento"), codigoCrudo: crudo });
    const filas: FilaBorrador[] = [
      fila(1, "1105", "CAJA", 0, "agrupadora"), // agrupadora → pasa igual
      // A) Banco: solo el tercero genérico `-0-00` (sin NIT) → se limpia a "11100501".
      conCrudo(2, "11100501", "11100501-0-00", 100),
      // B) Cuenta con genérico `-0-00` + detalle NIT → SUMA todos (el `-0-00` es un tercero más).
      conCrudo(3, "135515", "135515-0-00", 300),
      conCrudo(4, "135515", "135515-0-00-800180687", 100),
      conCrudo(5, "135515", "135515-0-00-890903938", 200),
      // C) Cuenta con SOLO detalle NIT → suma.
      conCrudo(6, "120520", "120520-0-00-800011002", 473),
      conCrudo(7, "120520", "120520-0-00-800027374", 41),
    ];
    const out = consolidarTercerosPorSufijo(filas);
    // Una fila por cuenta, todas con el código limpio (sin sufijo).
    expect(out.map((f) => f.codigoCrudo)).toEqual(["1105", "11100501", "135515", "120520"]);
    expect(out.find((f) => f.codigo === "11100501")!.saldoFinal).toBe(100);
    expect(out.find((f) => f.codigo === "135515")!.saldoFinal).toBe(300 + 100 + 200); // Σ de TODOS los terceros
    expect(out.find((f) => f.codigo === "120520")!.saldoFinal).toBe(473 + 41); // suma de NIT
  });

  it("esBalancePorTerceroSufijo: true cuando la mayoría de movimientos traen NIT en sufijo", () => {
    const conSufijo: FilaBorrador[] = Array.from({ length: 25 }, (_, i) => ({
      ...fila(i + 1, "120520", "CTA", 1, "movimiento"), codigoCrudo: `120520-0-00-${800000000 + i}`,
    }));
    expect(esBalancePorTerceroSufijo(conSufijo)).toBe(true);
    const normal = Array.from({ length: 25 }, (_, i) => fila(i + 1, `1105050${i}`, `CTA ${i}`, 1, "movimiento"));
    expect(esBalancePorTerceroSufijo(normal)).toBe(false);
  });
});

describe("SIIGO «por cuenta»: fila NIT que repite su cuenta (marcarCuentaNit)", () => {
  it("tacha las filas cuyo código repite el de la anterior; conserva la «Cuenta»", () => {
    // Bloque: Cta Nivel 4 (agrupadora) → Cuenta (total) → NIT ×2 (repiten el código).
    const filas: FilaBorrador[] = [
      fila(1, "110505", "CAJA GENERAL", 100, "agrupadora"), // Cta Nivel 4
      fila(2, "11050505", "CAJA GENERAL", 120, "movimiento", { saldoInicial: 50, debitos: 100, creditos: 30 }), // Cuenta (total)
      fila(3, "11050505", "CAJA GENERAL", 70, "movimiento", { saldoInicial: 20, debitos: 60, creditos: 10 }), // NIT 1 → tachar
      fila(4, "11050505", "CAJA GENERAL", 50, "movimiento", { saldoInicial: 30, debitos: 40, creditos: 20 }), // NIT 2 → tachar
      fila(5, "11050510", "CAJA MENOR", 0, "movimiento"), // otra Cuenta
    ];
    const n = marcarCuentaNit(filas);
    expect(n).toBe(2);
    expect(filas[1].omitida).toBeUndefined(); // la «Cuenta» se conserva
    expect(filas[2].omitida).toBe(true); // NIT tachado
    expect(filas[3].omitida).toBe(true);
    expect(filas[4].omitida).toBeUndefined(); // otra cuenta intacta
  });

  it("NO toca multi-sucursal: la agrupadora de clase entre sucursales resetea el rastreo", () => {
    // 1 ACTIVO A → 1105 (mov) … 1 ACTIVO B → 1105 (mov): mismo código pero con la
    // agrupadora «1» en medio, que resetea → no se tacha ninguno.
    const filas: FilaBorrador[] = [
      fila(1, "1", "ACTIVO A", 100, "agrupadora"),
      fila(2, "1105", "CAJA", 100, "movimiento"),
      fila(3, "1", "ACTIVO B", 50, "agrupadora"),
      fila(4, "1105", "CAJA", 50, "movimiento"),
    ];
    expect(marcarCuentaNit(filas)).toBe(0);
  });

  it("NO tacha variantes INAC/'A' (mismo código tras quitar sufijo, valores DISTINTOS)", () => {
    // `11100502` y `11100502INAC` colapsan al mismo código pero son cuentas independientes:
    // la primera NO es el total de la segunda → ambas deben contar.
    const filas: FilaBorrador[] = [
      { ...fila(1, "11100502", "BANCOLOMBIA", -118, "movimiento"), codigoCrudo: "11100502" },
      { ...fila(2, "11100502", "BANCOLOMBIA", -414, "movimiento"), codigoCrudo: "11100502INAC" },
      { ...fila(3, "23703021", "COMPENSAR", 5, "movimiento"), codigoCrudo: "23703021" },
      { ...fila(4, "23703021", "COMPENSAR", 32, "movimiento"), codigoCrudo: "23703021A" },
    ];
    expect(marcarCuentaNit(filas)).toBe(0);
    expect(filas.every((f) => f.omitida === undefined)).toBe(true);
  });

  it("NO tacha movimientos independientes con saldo final cero y débitos/créditos reales", () => {
    const filas: FilaBorrador[] = [
      fila(1, "589723", "SERVICIOS", 0, "movimiento", { debitos: 20, creditos: 20 }),
      fila(2, "589723", "SERVICIOS", 0, "movimiento", { debitos: 60, creditos: 60 }),
      fila(3, "589723", "SERVICIOS", 0, "movimiento", { debitos: 40, creditos: 40 }),
    ];

    expect(marcarCuentaNit(filas)).toBe(0);
    expect(filas.every((f) => f.omitida === undefined)).toBe(true);
  });

  it("SÍ tacha un duplicado real con saldo final cero cuando las cuatro columnas concilian", () => {
    const filas: FilaBorrador[] = [
      fila(1, "25050501", "PROVEEDORES", 0, "movimiento", { debitos: 100, creditos: 100 }),
      fila(2, "25050501", "PROVEEDORES", 0, "movimiento", { debitos: 60, creditos: 60 }),
      fila(3, "25050501", "PROVEEDORES", 0, "movimiento", { debitos: 40, creditos: 40 }),
    ];

    expect(marcarCuentaNit(filas)).toBe(2);
    expect(filas[0].omitida).toBeUndefined();
    expect(filas[1].omitida).toBe(true);
    expect(filas[2].omitida).toBe(true);
  });

  it("respeta el tri-estado: un NIT rescatado (omitida=false) no se re-tacha", () => {
    const filas: FilaBorrador[] = [
      fila(1, "11050505", "CAJA", 100, "movimiento"),
      { ...fila(2, "11050505", "CAJA", 100, "movimiento"), omitida: false }, // rescatado
    ];
    expect(marcarCuentaNit(filas)).toBe(0);
    expect(filas[1].omitida).toBe(false);
  });
});

const aplanarNodos = (ns: NodoBorrador[]): NodoBorrador[] => ns.flatMap((n) => [n, ...aplanarNodos(n.hijos)]);

describe("consolidarAuxiliaresRepetidos (balance por tercero por auxiliar)", () => {
  it("consolida N movimientos del MISMO código en UNA fila sumada (conserva la primera)", () => {
    const filas = [
      fila(1, "130505", "Clientes nacionales", 0, "agrupadora"),
      fila(2, "13050501", "Clientes nacionales", 100, "movimiento", { saldoInicial: 20, debitos: 80 }),
      fila(3, "13050501", "Clientes nacionales", 50, "movimiento", { debitos: 50 }),
      fila(4, "13050501", "Clientes nacionales", 30, "movimiento", { creditos: 30 }),
    ];
    const { filas: out, consolidados } = consolidarAuxiliaresRepetidos(filas);
    expect(consolidados).toBe(1);
    expect(out).toHaveLength(2); // agrupadora + 1 auxiliar consolidado
    const aux = out.find((f) => f.codigo === "13050501")!;
    expect(aux).toMatchObject({ saldoInicial: 20, debitos: 130, creditos: 30, saldoFinal: 180 });
  });

  it("NO consolida un bloque «Cuenta + NIT» donde la primera YA es el total", () => {
    const filas = [
      fila(1, "110505", "Caja", 120, "movimiento", { saldoInicial: 50, debitos: 100, creditos: 30 }), // total
      fila(2, "110505", "Caja", 70, "movimiento", { saldoInicial: 20, debitos: 60, creditos: 10 }), // NIT
      fila(3, "110505", "Caja", 50, "movimiento", { saldoInicial: 30, debitos: 40, creditos: 20 }), // NIT
    ];
    const { consolidados, filas: out } = consolidarAuxiliaresRepetidos(filas);
    expect(consolidados).toBe(0);
    expect(out).toHaveLength(3); // intacto (lo maneja marcarCuentaNit)
  });

  it("ignora movimientos omitidos y códigos únicos", () => {
    const filas = [
      fila(1, "13050501", "Clientes", 100, "movimiento", { omitida: true }),
      fila(2, "13050501", "Clientes", 50, "movimiento"),
      fila(3, "13050502", "Otros", 20, "movimiento"),
    ];
    expect(consolidarAuxiliaresRepetidos(filas).consolidados).toBe(0);
  });

  it("consolida movimientos independientes con saldo final cero sin perder su rotación", () => {
    const filas = [
      fila(1, "589723", "Servicios", 0, "movimiento", { debitos: 20, creditos: 20 }),
      fila(2, "589723", "Servicios", 0, "movimiento", { debitos: 60, creditos: 60 }),
      fila(3, "589723", "Servicios", 0, "movimiento", { debitos: 40, creditos: 40 }),
    ];
    const { consolidados, filas: out } = consolidarAuxiliaresRepetidos(filas);

    expect(consolidados).toBe(1);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ saldoInicial: 0, debitos: 120, creditos: 120, saldoFinal: 0 });
  });

  it("duplicado EXACTO (filas idénticas en las 4 columnas) SÍ se suma", () => {
    // El ERP repite el MISMO NIT+cuenta+valor (mismas 4 columnas). Aunque la primera
    // «totaliza» al resto por ser iguales, NO es un «Cuenta+NIT»: se colapsan en UNA
    // fila SUMADA (mantiene el total del informe, solo junta las filas visualmente).
    const filas = [
      fila(1, "73230204", "MANTENIMIENTO Y REPARACIONES", 575622, "movimiento", { saldoInicial: 287811, debitos: 287811 }),
      fila(2, "73230204", "MANTENIMIENTO Y REPARACIONES", 575622, "movimiento", { saldoInicial: 287811, debitos: 287811 }),
    ];
    const { consolidados, filas: out } = consolidarAuxiliaresRepetidos(filas);
    expect(consolidados).toBe(1);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ saldoInicial: 575622, debitos: 575622, creditos: 0, saldoFinal: 1151244 });
  });
});

describe("construirVistaBorrador · consolidarAuxiliares (opción SOLO de vista)", () => {
  const base = () => [
    fila(1, "13", "Deudores", 0, "agrupadora"),
    fila(2, "1305", "Clientes", 0, "agrupadora"),
    fila(3, "130505", "Clientes nacionales", 0, "agrupadora"),
    fila(4, "13050501", "Clientes nacionales", 100, "movimiento"),
    fila(5, "13050501", "Clientes nacionales", 50, "movimiento"),
    fila(6, "13050501", "Clientes nacionales", 30, "movimiento"),
  ];
  it("CON la opción → un auxiliar por código (agrupado por auxiliar) + porTercero", () => {
    const v = construirVistaBorrador(base().map((f) => ({ ...f })), { consolidarAuxiliares: true });
    const aux = aplanarNodos(v.arbol).filter((n) => n.codigo === "13050501" && n.tipoFila === "movimiento");
    expect(aux).toHaveLength(1);
    expect(aux[0].saldoFinal).toBe(180);
    expect(v.porTercero).toBe(true);
  });
  it("SIN la opción (export/métricas) → conserva los N renglones por NIT", () => {
    const v = construirVistaBorrador(base().map((f) => ({ ...f })));
    const aux = aplanarNodos(v.arbol).filter((n) => n.codigo === "13050501" && n.tipoFila === "movimiento");
    expect(aux.length).toBeGreaterThan(1);
  });

  it("conserva la partida doble de auxiliares con saldo final cero", () => {
    const filas = [
      fila(1, "5", "GASTOS", 0, "agrupadora"),
      fila(2, "58", "OTROS GASTOS", 0, "agrupadora"),
      fila(3, "5897", "COSTOS Y GASTOS POR DISTRIBUIR", 0, "agrupadora"),
      fila(4, "589723", "SERVICIOS", 0, "movimiento", { debitos: 20, creditos: 20 }),
      fila(5, "589723", "SERVICIOS", 0, "movimiento", { debitos: 60, creditos: 60 }),
      fila(6, "589723", "SERVICIOS", 0, "movimiento", { debitos: 40, creditos: 40 }),
    ];

    const v = construirVistaBorrador(filas, { consolidarAuxiliares: true });
    const aux = aplanarNodos(v.arbol).filter((n) => n.codigo === "589723" && n.tipoFila === "movimiento");

    expect(v.nitTachados).toBe(0);
    expect(aux).toHaveLength(1);
    expect(v.partidaDoble).toMatchObject({ debitos: 120, creditos: 120, diff: 0, cuadra: true });
  });
});
