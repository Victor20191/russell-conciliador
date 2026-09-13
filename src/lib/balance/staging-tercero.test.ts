import { describe, expect, it } from "vitest";
import { claveTerceroDeCaptura, derivarStagingTercero, filasEfectivasTercero, prepararCapturaTercero, type FilaTerceroCruda } from "./staging-tercero";
import { dvNit } from "@/lib/nit";
import type { IdentidadTercero } from "./identidad-tercero";
import type { FilaDetalle } from "./calcular";

type Entrada = Parameters<typeof derivarStagingTercero>[0][number];

let seq = 0;
function fila(p: Partial<Entrada>): Entrada {
  seq++;
  return {
    filaNum: p.filaNum ?? seq,
    codigo: p.codigo ?? "",
    codigoCrudo: p.codigoCrudo ?? p.codigo ?? "",
    nombre: p.nombre ?? "",
    tipoFila: p.tipoFila ?? "movimiento",
    saldoInicial: p.saldoInicial ?? 0,
    debitos: p.debitos ?? 0,
    creditos: p.creditos ?? 0,
    saldoFinal: p.saldoFinal ?? 100,
  };
}

/** Bloques cuenta + fila NIT «limpia» suficientes para superar el gate (≥20 mov, >20%). */
function balanceFormatoA(): Entrada[] {
  seq = 0;
  const filas: Entrada[] = [];
  for (let i = 0; i < 12; i++) {
    const cuenta = `1105050${i % 10}`;
    filas.push(fila({ codigo: cuenta, codigoCrudo: cuenta, nombre: `CAJA ${i}`, saldoFinal: 300 }));
    filas.push(fila({ codigo: "890903938", codigoCrudo: "890903938", nombre: "890903938", saldoFinal: 100 }));
    filas.push(fila({ codigo: "901427659", codigoCrudo: "901427659 MELONN S.A.S", nombre: "901427659", saldoFinal: 200 }));
  }
  return filas;
}

function detalle(p: Partial<FilaDetalle> & { cuenta8: string }): FilaDetalle {
  return {
    cuenta2: p.cuenta8.slice(0, 2),
    cuenta4: p.cuenta8.slice(0, 4),
    cuenta6: p.cuenta8.slice(0, 6),
    cuenta8: p.cuenta8,
    nombreCuenta: p.nombreCuenta ?? `Cuenta ${p.cuenta8}`,
    cuenta6Russell: p.cuenta6Russell ?? null,
    coincidencia: p.coincidencia ?? null,
    saldoInicial: p.saldoInicial ?? 0,
    debitos: p.debitos ?? 0,
    creditos: p.creditos ?? 0,
    saldoFinal: p.saldoFinal ?? 300,
  };
}

describe("derivarStagingTercero — camino spec (columna tercero mapeada)", () => {
  it("las filas del spec mandan y no se corre la heurística", () => {
    const spec: FilaTerceroCruda[] = [{
      filaNum: 4, codigo: "13050501", codigoCrudo: "13050501", nombreCuenta: "Clientes",
      nitTercero: "800011002", nombreTercero: "ACME SAS",
      saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 50,
    }];
    const out = derivarStagingTercero(balanceFormatoA(), spec);
    expect(out).toEqual(spec);
  });
});

describe("derivarStagingTercero — formato A (fila NIT aparte)", () => {
  it("ancla cada tercero a su cuenta previa y extrae NIT/nombre", () => {
    const out = derivarStagingTercero(balanceFormatoA(), []);
    expect(out).toHaveLength(24);
    expect(out[0]).toMatchObject({ codigo: "11050500", nitTercero: "890903938", nombreTercero: null, saldoFinal: 100 });
    expect(out[1]).toMatchObject({ codigo: "11050500", nitTercero: "901427659", nombreTercero: "MELONN S.A.S", saldoFinal: 200 });
    expect(out[2].codigo).toBe("11050501");
  });

  it("la forma PEGADA (crudo «NIT nombre», código no numérico) también extrae", () => {
    const filas = balanceFormatoA();
    filas.push(fila({ codigo: "", codigoCrudo: "901114801 D2 WORK SAS", nombre: "901114801D2", saldoFinal: 70 }));
    const out = derivarStagingTercero(filas, []);
    const ultimo = out[out.length - 1];
    expect(ultimo).toMatchObject({ nitTercero: "901114801", nombreTercero: "D2 WORK SAS", codigo: "11050501" });
  });

  it("el tercero GENÉRICO queda sin NIT con rótulo «Genérico»", () => {
    const filas = balanceFormatoA();
    filas.push(fila({ codigo: "", codigoCrudo: "Generico Genérico", nombre: "Generico Genérico", saldoFinal: 5 }));
    const out = derivarStagingTercero(filas, []);
    const ultimo = out[out.length - 1];
    expect(ultimo).toMatchObject({ nitTercero: null, nombreTercero: "Genérico" });
  });

  it("un tercero sin cuenta previa se descarta (sin ancla)", () => {
    const filas = [fila({ codigo: "890903938", codigoCrudo: "890903938", nombre: "890903938" }), ...balanceFormatoA()];
    const out = derivarStagingTercero(filas, []);
    expect(out).toHaveLength(24);
  });
});

describe("derivarStagingTercero — formato B (NIT en el sufijo)", () => {
  function balanceFormatoB(): Entrada[] {
    seq = 0;
    const filas: Entrada[] = [];
    for (let i = 0; i < 12; i++) {
      const cuenta = `12052${i % 10}`;
      filas.push(fila({ codigo: cuenta, codigoCrudo: `${cuenta}-0-00`, nombre: `CARTERA ${i}`, saldoFinal: 10 }));
      filas.push(fila({ codigo: cuenta, codigoCrudo: `${cuenta}-0-00-800011002`, nombre: `CARTERA ${i}`, saldoFinal: 40 }));
    }
    return filas;
  }

  it("extrae el NIT del último tramo y trata `-0-00` como genérico", () => {
    const out = derivarStagingTercero(balanceFormatoB(), []);
    expect(out).toHaveLength(24);
    expect(out[0]).toMatchObject({ codigo: "120520", nitTercero: null, nombreTercero: "Genérico", saldoFinal: 10 });
    expect(out[1]).toMatchObject({ codigo: "120520", nitTercero: "800011002", nombreTercero: null, saldoFinal: 40 });
  });
});

describe("derivarStagingTercero — sin detalle por tercero", () => {
  it("informe normal por cuenta → []", () => {
    seq = 0;
    const filas = Array.from({ length: 30 }, (_, i) =>
      fila({ codigo: `110505${String(i).padStart(2, "0")}`, nombre: `Cuenta ${i}` }));
    expect(derivarStagingTercero(filas, [])).toEqual([]);
  });

  it("formato C (código repetido, NIT solo en columna no mapeada) → []", () => {
    seq = 0;
    const filas: Entrada[] = [];
    for (let i = 0; i < 15; i++) {
      const cuenta = `1305050${i % 10}`;
      filas.push(fila({ codigo: cuenta, nombre: "Clientes", saldoFinal: 100 }));
      filas.push(fila({ codigo: cuenta, nombre: "Clientes", saldoFinal: 60 }));
      filas.push(fila({ codigo: cuenta, nombre: "Clientes", saldoFinal: 40 }));
    }
    expect(derivarStagingTercero(filas, [])).toEqual([]);
  });
});

describe("prepararCapturaTercero — herencia de ajustes y fila propia", () => {
  const staging: FilaTerceroCruda[] = [
    { filaNum: 2, codigo: "11050501", codigoCrudo: null, nombreCuenta: "CAJA", nitTercero: "890903938", nombreTercero: null, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 100 },
    { filaNum: 3, codigo: "11050501", codigoCrudo: null, nombreCuenta: "CAJA", nitTercero: "901427659", nombreTercero: "MELONN", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 200 },
    { filaNum: 6, codigo: "13050501", codigoCrudo: null, nombreCuenta: "CLIENTES", nitTercero: "800011002", nombreTercero: null, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 500 },
  ];

  it("sintetiza la fila propia, copia la homologación y agrupa por cuenta", () => {
    const dets = [
      detalle({ cuenta8: "11050501", cuenta6Russell: "110505", coincidencia: 100, saldoFinal: 300 }),
      detalle({ cuenta8: "14350101", saldoFinal: 900 }),
    ];
    const r = prepararCapturaTercero(staging, dets, new Set());
    // propia 1105 + 2 terceros + propia 1435 (sin terceros pero presente)
    expect(r.filas).toHaveLength(4);
    expect(r.filas[0]).toMatchObject({ cuenta8: "11050501", nitTercero: null, nombreTercero: null, saldoFinal: 300, cuenta6Russell: "110505" });
    expect(r.filas[1]).toMatchObject({ nitTercero: "890903938", cuenta6Russell: "110505", coincidencia: 100 });
    expect(r.filas[3]).toMatchObject({ cuenta8: "14350101", nitTercero: null, saldoFinal: 900 });
    expect(r.terceros).toBe(2);
    expect(r.cuentasConDetalle).toBe(1);
  });

  it("firma los saldos de cada tercero con el factor de su cuenta; movimientos y fila propia intactos", () => {
    // Archivo en MAGNITUD: los terceros llegan +100/+200 y su cuenta quedó invertida (−300)
    // en el detalle oficial. Sin factor, la fila propia y sus terceros tendrían signos opuestos.
    const conMov: FilaTerceroCruda[] = staging.map((t) => ({ ...t, saldoInicial: 50, debitos: 30, creditos: 10 }));
    const dets = [
      detalle({ cuenta8: "11050501", cuenta6Russell: "110505", coincidencia: 100, saldoInicial: -50, saldoFinal: -300 }),
      detalle({ cuenta8: "13050501", saldoFinal: 500 }),
    ];
    const r = prepararCapturaTercero(conMov, dets, new Set(), new Map([["11050501", -1], ["13050501", 1]]));
    const t1105 = r.filas.filter((f) => f.cuenta8 === "11050501" && f.nitTercero !== null);
    expect(t1105.map((f) => [f.saldoInicial, f.saldoFinal])).toEqual([[-50, -100], [-50, -200]]);
    expect(t1105.every((f) => f.debitos === 30 && f.creditos === 10)).toBe(true); // movimientos: magnitud, sin factor
    expect(r.filas[0]).toMatchObject({ cuenta8: "11050501", nitTercero: null, saldoFinal: -300 }); // propia: ya firmada del detalle
    expect(r.filas.find((f) => f.cuenta8 === "13050501" && f.nitTercero !== null)?.saldoFinal).toBe(500); // factor +1: intacto
  });

  it("sin factores —cargues legados, archivo ya firmado— la captura es idéntica a la de antes", () => {
    const dets = [detalle({ cuenta8: "11050501" })];
    const sinFactor = prepararCapturaTercero(staging, dets, new Set());
    const conUnos = prepararCapturaTercero(staging, dets, new Set(), new Map([["11050501", 1]]));
    expect(conUnos).toEqual(sinFactor);
  });

  it("una cuenta que no quedó en el balance excluye a sus terceros", () => {
    const dets = [detalle({ cuenta8: "11050501" })];
    const r = prepararCapturaTercero(staging, dets, new Set());
    expect(r.filas.every((f) => f.cuenta8 === "11050501")).toBe(true);
    expect(r.filas).toHaveLength(3);
  });

  it("una fila tachada a mano (omitida por filaNum) no entra", () => {
    const dets = [detalle({ cuenta8: "11050501" })];
    const r = prepararCapturaTercero(staging, dets, new Set([3]));
    expect(r.filas.filter((f) => f.nitTercero !== null)).toHaveLength(1);
    expect(r.filas[1].nitTercero).toBe("890903938");
  });
});

describe("filasEfectivasTercero — dedup de la fila propia", () => {
  const fp = (cuenta8: string, nit: string | null, nombre: string | null, saldo = 0) =>
    ({ cuenta8, nitTercero: nit, nombreTercero: nombre, saldoFinal: saldo });

  it("una cuenta con detalle usa solo sus terceros; una sin detalle conserva la propia", () => {
    const filas = [
      fp("11050501", null, null, 300),        // propia con detalle → fuera
      fp("11050501", "890903938", null, 100),
      fp("11050501", null, "Genérico", 200),  // genérico NO es propia → queda
      fp("14350101", null, null, 900),        // propia sin detalle → queda
    ];
    const out = filasEfectivasTercero(filas);
    expect(out.map((f) => f.saldoFinal)).toEqual([100, 200, 900]);
  });

  it("un cargue legado sin filas propias pasa intacto", () => {
    const filas = [fp("13050501", "800011002", "ACME", 10), fp("13050501", null, "Genérico", 5)];
    expect(filasEfectivasTercero(filas)).toEqual(filas);
  });
});

describe("claveTerceroDeCaptura", () => {
  const identidad = (numeroDocumento: string | null): IdentidadTercero => ({
    version: 1, documentoOriginal: numeroDocumento ?? "", tipoOriginal: "", dvOriginal: "", tipoDocumento: null,
    numeroDocumento, digitoVerificacion: null, nombre: null, origen: "archivo", observaciones: [],
  });

  it("toma el documento completo de la identidad: una cédula de 10 dígitos no se trunca", () => {
    const base = "112838597";
    const cedula = `${base}${((dvNit(base) ?? 0) + 1) % 10}`;
    expect(claveTerceroDeCaptura({ identidadTercero: identidad(cedula), nitTercero: base })).toBe(cedula);
  });

  it("retira el dígito de verificación solo cuando lo es", () => {
    const base = "900123456";
    expect(claveTerceroDeCaptura({ identidadTercero: identidad(`${base}${dvNit(base)}`), nitTercero: base })).toBe(base);
  });

  it("sin identidad usa el NIT guardado; la fila propia de la cuenta no tiene clave", () => {
    expect(claveTerceroDeCaptura({ nitTercero: "900123456" })).toBe("900123456");
    expect(claveTerceroDeCaptura({ nitTercero: null })).toBeNull();
  });
});
