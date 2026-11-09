import { describe, expect, it } from "vitest";
import { claveTerceroDeCaptura, derivarStagingTercero, describirGruposTercero, gruposTerceroConservados, esTotalDeCuentaComoTercero, evaluarCoberturaTercero, exigeDetalleTercero, filasEfectivasTercero, PREFIJOS_TERCERO_CONSERVADOS, prepararCapturaTercero, repiteTotalDeCuenta, type FilaTerceroCruda } from "./staging-tercero";
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
    { filaNum: 2, codigo: "22050501", codigoCrudo: null, nombreCuenta: "PROVEEDORES", nitTercero: "890903938", nombreTercero: null, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 100 },
    { filaNum: 3, codigo: "22050501", codigoCrudo: null, nombreCuenta: "PROVEEDORES", nitTercero: "901427659", nombreTercero: "MELONN", saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 200 },
    { filaNum: 6, codigo: "13050501", codigoCrudo: null, nombreCuenta: "CLIENTES", nitTercero: "800011002", nombreTercero: null, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 500 },
  ];

  it("sintetiza la fila propia, copia la homologación y agrupa por cuenta", () => {
    const dets = [
      detalle({ cuenta8: "22050501", cuenta6Russell: "220505", coincidencia: 100, saldoFinal: 300 }),
      detalle({ cuenta8: "14350101", saldoFinal: 900 }),
    ];
    const r = prepararCapturaTercero(staging, dets, new Set());
    // propia 2205 + 2 terceros + propia 1435 (sin terceros pero presente)
    expect(r.filas).toHaveLength(4);
    expect(r.filas[0]).toMatchObject({ cuenta8: "22050501", nitTercero: null, nombreTercero: null, saldoFinal: 300, cuenta6Russell: "220505" });
    expect(r.filas[1]).toMatchObject({ nitTercero: "890903938", cuenta6Russell: "220505", coincidencia: 100 });
    expect(r.filas[3]).toMatchObject({ cuenta8: "14350101", nitTercero: null, saldoFinal: 900 });
    expect(r.terceros).toBe(2);
    expect(r.cuentasConDetalle).toBe(1);
  });

  it("firma los saldos de cada tercero con el factor de su cuenta; movimientos y fila propia intactos", () => {
    // Archivo en MAGNITUD: los terceros llegan +100/+200 y su cuenta quedó invertida (−300)
    // en el detalle oficial. Sin factor, la fila propia y sus terceros tendrían signos opuestos.
    const conMov: FilaTerceroCruda[] = staging.map((t) => ({ ...t, saldoInicial: 50, debitos: 30, creditos: 10 }));
    const dets = [
      detalle({ cuenta8: "22050501", cuenta6Russell: "220505", coincidencia: 100, saldoInicial: -50, saldoFinal: -300 }),
      detalle({ cuenta8: "13050501", saldoFinal: 500 }),
    ];
    const r = prepararCapturaTercero(conMov, dets, new Set(), new Map([["22050501", -1], ["13050501", 1]]));
    const t2205 = r.filas.filter((f) => f.cuenta8 === "22050501" && f.nitTercero !== null);
    expect(t2205.map((f) => [f.saldoInicial, f.saldoFinal])).toEqual([[-50, -100], [-50, -200]]);
    expect(t2205.every((f) => f.debitos === 30 && f.creditos === 10)).toBe(true); // movimientos: magnitud, sin factor
    expect(r.filas[0]).toMatchObject({ cuenta8: "22050501", nitTercero: null, saldoFinal: -300 }); // propia: ya firmada del detalle
    expect(r.filas.find((f) => f.cuenta8 === "13050501" && f.nitTercero !== null)?.saldoFinal).toBe(500); // factor +1: intacto
  });

  it("sin factores —cargues legados, archivo ya firmado— la captura es idéntica a la de antes", () => {
    const dets = [detalle({ cuenta8: "22050501" })];
    const sinFactor = prepararCapturaTercero(staging, dets, new Set());
    const conUnos = prepararCapturaTercero(staging, dets, new Set(), new Map([["22050501", 1]]));
    expect(conUnos).toEqual(sinFactor);
  });

  it("una cuenta que no quedó en el balance excluye a sus terceros", () => {
    const dets = [detalle({ cuenta8: "22050501" })];
    const r = prepararCapturaTercero(staging, dets, new Set());
    expect(r.filas.every((f) => f.cuenta8 === "22050501")).toBe(true);
    expect(r.filas).toHaveLength(3);
  });

  it("una fila tachada a mano (omitida por filaNum) no entra", () => {
    const dets = [detalle({ cuenta8: "22050501" })];
    const r = prepararCapturaTercero(staging, dets, new Set([3]));
    expect(r.filas.filter((f) => f.nitTercero !== null)).toHaveLength(1);
    expect(r.filas[1].nitTercero).toBe("890903938");
  });

  it("solo conserva los terceros de 13, 21, 22, 23, 24 y 28; 41 a 45 y el resto quedan con su fila propia", () => {
    const cuentas = ["11050501", "13050501", "14350101", "21050501", "23350501", "24360502", "28050501", "41350501", "42100501", "43120501", "44280501", "45300501", "46000501", "51050601"];
    const stg: FilaTerceroCruda[] = cuentas.map((codigo, i) => (
      { filaNum: i + 1, codigo, codigoCrudo: null, nombreCuenta: null, nitTercero: `90000000${i}`, nombreTercero: null, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 10 }
    ));
    const r = prepararCapturaTercero(stg, cuentas.map((cuenta8) => detalle({ cuenta8, saldoFinal: 10 })), new Set());
    const conTerceros = [...new Set(r.filas.filter((f) => f.nitTercero !== null).map((f) => f.cuenta8))];
    expect(conTerceros).toEqual(["13050501", "21050501", "23350501", "24360502", "28050501"]);
    // Toda cuenta conserva su fila propia con el saldo oficial.
    expect(r.filas.filter((f) => f.nitTercero === null).map((f) => f.cuenta8)).toEqual(cuentas);
    expect(r.cuentasConDetalle).toBe(5);
    expect(r.terceros).toBe(5);
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

  it("no suma el «tercero» que solo repite el total de su cuenta (Melonn 13050501)", () => {
    const filas = [
      fp("13050501", null, null, 300),        // propia
      fp("13050501", "13050501", null, 300),  // el total con el código de la cuenta como NIT
      fp("13050501", "901138039", "4 FOOTED SAS", 100),
      fp("13050501", "901218826", "7 TRILOGI SAS", 200),
    ];
    expect(filasEfectivasTercero(filas).map((f) => f.nitTercero)).toEqual(["901138039", "901218826"]);
    // Con los importes en Decimal, como llegan de Prisma.
    const decimal = (v: number) => ({ toString: () => String(v) });
    const conDecimal = filas.map((f) => ({ ...f, saldoFinal: decimal(f.saldoFinal) }));
    expect(filasEfectivasTercero(conDecimal)).toHaveLength(2);
  });

  it("si el total repetido era el único «tercero», la cuenta queda con su fila propia", () => {
    const filas = [fp("13659515", null, null, 2), fp("13659515", "13659515", null, 2)];
    expect(filasEfectivasTercero(filas)).toEqual([filas[0]]);
  });

  it("un saldo real con el código de la cuenta como tercero sí suma (Soluciones 21051129)", () => {
    const filas = [
      fp("21051129", null, null, 0),
      fp("21051129", "21051129", null, -244662190.21),
      fp("21051129", "860002964", "BANCO DE BOGOTA S.A", 244662190.21),
    ];
    expect(filasEfectivasTercero(filas)).toEqual(filas.slice(1));
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

describe("evaluarCoberturaTercero", () => {
  const f = (cuenta8: string, nitTercero: string | null, saldoFinal: number, debitos = 0) =>
    ({ cuenta8, nombreCuenta: "Cuenta", nitTercero, nombreTercero: nitTercero ? "Tercero" : null, saldoInicial: 0, debitos, creditos: 0, saldoFinal });

  it("detecta el detalle parcial y las cuentas de detalle obligatorio sin terceros", () => {
    const r = evaluarCoberturaTercero([
      f("23359501", null, -500), f("23359501", "830078512", 0), f("23359501", "901353526", 0), // bloque cortado
      f("13050501", null, 300), f("13050501", "900111222", 100), f("13050501", "900333444", 200), // completo
      f("22050501", null, 900), // obligatorio, sin terceros
      f("28050501", null, 0), // obligatorio pero sin saldo ni movimiento
      f("11050501", null, 50), // no obligatorio
    ]);
    expect(r.incompletas).toEqual([{ cuenta8: "23359501", nombreCuenta: "Cuenta", terceros: 2, diferenciaSaldoFinal: -500 }]);
    expect(r.clavesSinDetalle.map((c) => c.cuenta8)).toEqual(["22050501"]);
  });

  it("el grupo 24 avisa si llega sin terceros; 41 a 45 se guardan pero no avisan", () => {
    const r = evaluarCoberturaTercero([
      f("24360501", null, 900),
      f("41350505", null, 900),
      f("42100501", null, 900),
      f("45050501", null, 900),
    ]);
    expect(r.clavesSinDetalle.map((c) => c.cuenta8)).toEqual(["24360501"]);
  });

  it("no exige el grupo 24 en capturas de cuando se descartaban sus terceros", () => {
    expect(exigeDetalleTercero("24360501")).toBe(true);
    expect(exigeDetalleTercero("24360501", new Date("2026-11-01T23:59:59.000Z"))).toBe(false);
    expect(exigeDetalleTercero("24360501", new Date("2026-11-02T00:00:00.000Z"))).toBe(true);
    // Los demás grupos obligatorios no dependen de la fecha.
    expect(exigeDetalleTercero("13050501", new Date("2026-09-01T00:00:00.000Z"))).toBe(true);
    expect(exigeDetalleTercero("41350505")).toBe(false);
  });

  it("guarda los terceros de los mismos grupos obligatorios; ya no los de 41 a 45 (9/Nov/2026)", () => {
    expect(PREFIJOS_TERCERO_CONSERVADOS).toEqual(["13", "21", "22", "23", "24", "28"]);
  });

  it("mira los cuatro importes: el saldo puede cuadrar con débitos duplicados", () => {
    const r = evaluarCoberturaTercero([f("13300505", null, 100, 400), f("13300505", "800200000", 100, 800)]);
    expect(r.incompletas.map((c) => c.cuenta8)).toEqual(["13300505"]);
  });

  it("tolera el redondeo de miles de terceros e ignora cargues legados sin fila propia", () => {
    const muchos = Array.from({ length: 4000 }, (_, i) => f("41350505", String(900000000 + i), 1));
    expect(evaluarCoberturaTercero([f("41350505", null, 4005), ...muchos]).incompletas).toEqual([]);
    expect(evaluarCoberturaTercero([f("13050501", "900111222", 100)])).toEqual({ incompletas: [], clavesSinDetalle: [] });
  });
});

describe("esTotalDeCuentaComoTercero — el total de la cuenta leído como tercero", () => {
  it("el código de la cuenta como NIT y sin nombre es el total, no un tercero", () => {
    expect(esTotalDeCuentaComoTercero({ cuenta8: "23650501", nitTercero: "23650501", nombreTercero: null })).toBe(true);
    // El NIT se guarda como núcleo de 9 dígitos: una cuenta de 10 empieza por él.
    expect(esTotalDeCuentaComoTercero({ cuenta8: "2365050101", nitTercero: "236505010", nombreTercero: "" })).toBe(true);
  });

  it("un tercero con nombre, otro NIT, la fila propia o el «Genérico» no lo son", () => {
    expect(esTotalDeCuentaComoTercero({ cuenta8: "23650501", nitTercero: "23650501", nombreTercero: "PERSONA" })).toBe(false);
    expect(esTotalDeCuentaComoTercero({ cuenta8: "23650501", nitTercero: "800197268", nombreTercero: null })).toBe(false);
    expect(esTotalDeCuentaComoTercero({ cuenta8: "23650501", nitTercero: null, nombreTercero: null })).toBe(false);
    expect(esTotalDeCuentaComoTercero({ cuenta8: "23650501", nitTercero: null, nombreTercero: "Genérico" })).toBe(false);
    expect(esTotalDeCuentaComoTercero({ cuenta8: "23650501", nitTercero: "2365", nombreTercero: null })).toBe(false);
  });
});

describe("repiteTotalDeCuenta — el total de la cuenta repetido como tercero", () => {
  const propia = { saldoInicial: 6283358725.54, debitos: 37325513243.74, creditos: 39230514924.99, saldoFinal: 4378357044.29 };
  const fila = (over: Partial<Parameters<typeof repiteTotalDeCuenta>[0]> = {}) => ({ cuenta8: "13050501", nitTercero: "13050501", nombreTercero: null, ...propia, ...over });

  it("el código de la cuenta como NIT, sin nombre y con los importes de la fila propia (Melonn)", () => {
    expect(repiteTotalDeCuenta(fila(), propia)).toBe(true);
    // Compara solo los importes que traen las dos filas (el cruce por tercero no lee el saldo inicial).
    expect(repiteTotalDeCuenta(fila({ saldoInicial: undefined }), { ...propia, saldoInicial: 0 })).toBe(true);
  });

  it("un saldo real con el código de la cuenta como tercero no se toca (Soluciones 21051129)", () => {
    expect(repiteTotalDeCuenta(fila({ cuenta8: "21051129", nitTercero: "21051129", saldoInicial: -244662190.21, debitos: 0, creditos: 0, saldoFinal: -244662190.21 }),
      { saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0 })).toBe(false);
    expect(repiteTotalDeCuenta(fila({ nombreTercero: "PERSONA" }), propia)).toBe(false);
    expect(repiteTotalDeCuenta(fila({ nitTercero: "800197268" }), propia)).toBe(false);
  });

  it("sin importes que comparar no afirma nada", () => {
    expect(repiteTotalDeCuenta({ cuenta8: "13050501", nitTercero: "13050501", nombreTercero: null }, propia)).toBe(false);
  });
});

describe("prepararCapturaTercero — el total de la cuenta leído como tercero no se guarda", () => {
  it("descarta la fila que repite el total y conserva los terceros reales", () => {
    const stg: FilaTerceroCruda[] = [
      { filaNum: 2, codigo: "22050501", codigoCrudo: "22050501", nombreCuenta: "PROVEEDORES", nitTercero: "22050501", nombreTercero: null, saldoInicial: 50, debitos: 30, creditos: 10, saldoFinal: 300 },
      { filaNum: 3, codigo: "22050501", codigoCrudo: null, nombreCuenta: "PROVEEDORES", nitTercero: "890903938", nombreTercero: null, saldoInicial: 20, debitos: 10, creditos: 0, saldoFinal: 100 },
      { filaNum: 4, codigo: "22050501", codigoCrudo: null, nombreCuenta: "PROVEEDORES", nitTercero: "901427659", nombreTercero: "MELONN", saldoInicial: 30, debitos: 20, creditos: 10, saldoFinal: 200 },
    ];
    // Archivo en magnitud: la cuenta quedó firmada (−) y el total repetido se compara ya firmado.
    const dets = [detalle({ cuenta8: "22050501", saldoInicial: -50, debitos: 30, creditos: 10, saldoFinal: -300 })];
    const r = prepararCapturaTercero(stg, dets, new Set(), new Map([["22050501", -1]]));
    expect(r.filas.map((f) => [f.nitTercero, f.saldoFinal])).toEqual([[null, -300], ["890903938", -100], ["901427659", -200]]);
    expect(evaluarCoberturaTercero(r.filas).incompletas).toEqual([]);
  });

  it("si era el único «tercero», la cuenta queda con su fila propia y sin detalle", () => {
    const stg: FilaTerceroCruda[] = [
      { filaNum: 2, codigo: "13659515", codigoCrudo: "13659515", nombreCuenta: "OTROS", nitTercero: "13659515", nombreTercero: null, saldoInicial: 0, debitos: 2, creditos: 0, saldoFinal: 2 },
    ];
    const r = prepararCapturaTercero(stg, [detalle({ cuenta8: "13659515", debitos: 2, saldoFinal: 2 })], new Set());
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({ nitTercero: null, saldoFinal: 2 });
    expect(r.cuentasConDetalle).toBe(0);
  });
});

describe("gruposTerceroConservados / describirGruposTercero", () => {
  it("una carga nueva guarda los terceros de 13, 21 a 24 y 28", () => {
    const grupos = gruposTerceroConservados();
    expect(grupos).toEqual(PREFIJOS_TERCERO_CONSERVADOS);
    expect(describirGruposTercero(grupos!)).toBe("13, 21 a 24 y 28");
    expect(gruposTerceroConservados(new Date("2026-11-10T12:00:00Z"))).toEqual(["13", "21", "22", "23", "24", "28"]);
  });

  it("una captura del 2 al 9 de noviembre también guardó 41 a 45", () => {
    const grupos = gruposTerceroConservados(new Date("2026-11-05T12:00:00Z"));
    expect(grupos).toEqual(["13", "21", "22", "23", "24", "28", "41", "42", "43", "44", "45"]);
    expect(describirGruposTercero(grupos!)).toBe("13, 21 a 24, 28 y 41 a 45");
  });

  it("una captura posterior que igual trae terceros de ingresos (servidor sin el cambio) los nombra", () => {
    expect(gruposTerceroConservados(new Date("2026-11-12T12:00:00Z"), new Set(["13", "41", "42"]))).toEqual(["13", "21", "22", "23", "24", "28", "41", "42"]);
    // Otros grupos con filas (la fila propia de cada cuenta) no se suman.
    expect(gruposTerceroConservados(new Date("2026-11-12T12:00:00Z"), new Set(["11", "51"]))).toEqual(["13", "21", "22", "23", "24", "28"]);
  });

  it("una captura de octubre aún no guardaba el 24 ni 42 a 45", () => {
    const grupos = gruposTerceroConservados(new Date("2026-10-15T12:00:00Z"));
    expect(grupos).toEqual(["13", "21", "22", "23", "28", "41"]);
    expect(describirGruposTercero(grupos!)).toBe("13, 21 a 23, 28 y 41");
  });

  it("antes del 22/Sep se guardaban todas las cuentas", () => {
    expect(gruposTerceroConservados(new Date("2026-09-10T12:00:00Z"))).toBeNull();
  });

  it("dos grupos seguidos no se dicen como rango", () => {
    expect(describirGruposTercero(["13", "14"])).toBe("13 y 14");
    expect(describirGruposTercero(["41"])).toBe("41");
  });
});
