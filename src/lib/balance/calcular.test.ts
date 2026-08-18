import { describe, it, expect } from "vitest";
import {
  calcularBalance,
  construirValidacionContable,
  claseNatura,
  MARGEN_CUADRE,
  aplanarBreakdown,
  compararBalances,
  consolidarPorCodigo,
  conForzarHoja,
  quitarPadresRedundantes,
  descomponerCuenta,
  aFilasDetalle,
  reconstruirBalance,
  mapearCuenta,
  agruparJerarquia,
  type CuentaCruda,
  type CuentaEstandar,
  type NodoBalance,
} from "./calcular";

// Plan de cuentas estándar sintético (6 dígitos, como el real).
const STD: CuentaEstandar[] = [
  { code: "110505", nature: "D", critical: false }, // Caja
  { code: "111005", nature: "D", critical: false }, // Bancos
  { code: "130505", nature: "D", critical: true }, // Clientes (crítica)
  { code: "220505", nature: "C", critical: false }, // Proveedores
  { code: "240805", nature: "C", critical: true }, // IVA (crítica)
  { code: "310505", nature: "C", critical: false }, // Capital
  { code: "413505", nature: "C", critical: false }, // Ventas
  { code: "510505", nature: "D", critical: false }, // Gastos admin
];

// Balance cuadrado en convención FIRMADA (débito +, crédito −).
// Débitos: 1000+5000+4000+6000 = 16000. Créditos: 3000+1000+4000+8000 = 16000.
const FIRMADO: CuentaCruda[] = [
  { code: "110505", name: "Caja", prevBalance: 800, balance: 1000 },
  { code: "111005", name: "Bancos", prevBalance: 5000, balance: 5000 },
  { code: "130505", name: "Clientes", prevBalance: 3000, balance: 4000 },
  { code: "220505", name: "Proveedores", prevBalance: -2500, balance: -3000 },
  { code: "240805", name: "IVA", prevBalance: -900, balance: -1000 },
  { code: "310505", name: "Capital", prevBalance: -4000, balance: -4000 },
  { code: "413505", name: "Ventas", prevBalance: -7000, balance: -8000 },
  { code: "510505", name: "Gastos admin", prevBalance: 5400, balance: 6000 },
];

describe("claseNatura", () => {
  it("clasifica débito y crédito por clase", () => {
    expect(claseNatura("110505")).toBe("D"); // activo
    expect(claseNatura("510505")).toBe("D"); // gasto
    expect(claseNatura("220505")).toBe("C"); // pasivo
    expect(claseNatura("413505")).toBe("C"); // ingreso
    expect(claseNatura("810505")).toBe("D"); // orden deudoras
    expect(claseNatura("910505")).toBe("C"); // orden acreedoras
  });
});

describe("calcularBalance — convención firmada y cuadre", () => {
  const r = calcularBalance(FIRMADO, STD);

  it("calcula las sumas por clase como magnitudes naturales", () => {
    expect(r.sums.activo).toBe(10000);
    expect(r.sums.pasivo).toBe(4000);
    expect(r.sums.patrimonio).toBe(4000);
    expect(r.sums.ingresos).toBe(8000);
    expect(r.sums.gastos).toBe(6000);
    expect(r.sums.costos).toBe(0);
    expect(r.sums.utilidad).toBe(2000); // 8000 - 6000
  });

  it("detecta el cuadre por partida doble", () => {
    expect(r.balanced).toBe(true);
    expect(r.diffCuadre).toBe(0);
    const v1 = r.validations.find((v) => v.id === "V1");
    expect(v1?.status).toBe("ok");
    expect(v1?.rule).toBe("Cuadre de saldos finales");
    expect(v1?.detail).toContain("Activo = Pasivo + Patrimonio + Resultado · diferencia:");
  });

  it("cuenta mapeo y criticidad", () => {
    expect(r.totalRows).toBe(8);
    expect(r.mapped).toBe(8);
    expect(r.unmapped).toBe(0);
    expect(r.critical).toBe(2); // Clientes + IVA
    expect(r.validations.find((v) => v.id === "V3")?.status).toBe("ok");
  });

  it("agrupa por grupo PUC de 2 dígitos", () => {
    const g11 = r.breakdown.find((g) => g.code === "11");
    expect(g11?.name).toBe("Disponible");
    expect(g11?.items).toHaveLength(2); // Caja + Bancos
    expect(g11?.balance).toBe(6000);
    expect(r.breakdown.find((g) => g.code === "24")?.name).toBe("Impuestos, gravámenes y tasas");
  });
});

describe("calcularBalance — convención por magnitudes (todo positivo)", () => {
  // Mismos saldos pero con los créditos en positivo (export sin signo).
  const MAGNITUD: CuentaCruda[] = FIRMADO.map((c) => ({ ...c, prevBalance: Math.abs(c.prevBalance), balance: Math.abs(c.balance) }));
  const r = calcularBalance(MAGNITUD, STD);

  it("normaliza signos y cuadra igual que la versión firmada", () => {
    expect(r.balanced).toBe(true);
    expect(r.sums.activo).toBe(10000);
    expect(r.sums.pasivo).toBe(4000);
    expect(r.sums.patrimonio).toBe(4000);
    // Tras normalizar, los pasivos quedan negativos en el desglose.
    expect(r.breakdown.find((g) => g.code === "22")?.balance).toBe(-3000);
    expect(r.validations.find((v) => v.id === "V2")?.status).toBe("ok"); // sin contrarios
  });
});

describe("calcularBalance — sin mapeo, saldo contrario y variación", () => {
  const CUENTAS: CuentaCruda[] = [
    { code: "110505", name: "Caja", prevBalance: 1000, balance: 1500 }, // +50% var
    { code: "220505", name: "Proveedores", prevBalance: -2000, balance: -2000 }, // crédito normal
    { code: "240805", name: "IVA (contrario)", prevBalance: -500, balance: 800 }, // crédito en débito → contrario
    { code: "189965", name: "Diversos nuevo", prevBalance: 0, balance: 700 }, // sin mapeo (no en STD)
  ];
  const r = calcularBalance(CUENTAS, STD);

  it("no invierte signos cuando los créditos están mayormente negativos", () => {
    // creditosNeg(Proveedores)=1 vs creditosPos(IVA)=1 → no hay flip.
    const iva = r.breakdown.find((g) => g.code === "24")?.items[0];
    expect(iva?.balance).toBe(800);
    expect(iva?.saldoOk).toBe(false); // saldo contrario a su naturaleza
    expect(r.validations.find((v) => v.id === "V2")?.status).toBe("ok"); // informativo: no supera $50.000
    expect(r.validations.find((v) => v.id === "V2")?.count).toBeUndefined();
  });

  it("detecta cuentas sin mapeo al estándar", () => {
    expect(r.unmapped).toBe(1);
    const v3 = r.validations.find((v) => v.id === "V3");
    expect(v3?.status).toBe("warn");
    expect(v3?.count).toBe(1);
    const diversos = r.breakdown.find((g) => g.code === "18")?.items[0];
    expect(diversos?.std).toBeNull();
    expect(diversos?.mapped).toBe(false);
  });

  it("calcula variación porcentual y la marca cuando supera 25%", () => {
    const caja = r.breakdown.find((g) => g.code === "11")?.items[0];
    expect(caja?.variation).toBe(50);
    expect(r.validations.find((v) => v.id === "V4")?.status).toBe("warn");
  });

  it("a $1000 exactos, el cuadre por partida doble entra en el margen (cuadra)", () => {
    // Σ firmado = 1500 - 2000 + 800 + 700 = 1000 = MARGEN_CUADRE ⇒ dentro del margen.
    expect(r.diffCuadre).toBe(1000);
    expect(r.balanced).toBe(true); // |1000| ≤ 1000
    expect(r.validations.find((v) => v.id === "V1")?.status).toBe("ok");
  });
});

// Caso reportado por operación (IVANAGRO/REDPLAS): la cascada clasificaba
// `21052001 FIDUCIA` (pasivo) contra `110505`. Corregir SOLO esa cuenta debe
// sobrevivir a la siguiente carga sin arrastrar a sus hermanas del grupo.
describe("calcularBalance — memoria de mapeo del cliente (grupo y excepción por cuenta)", () => {
  const CUENTAS: CuentaCruda[] = [
    { code: "21052001", name: "FIDUCIA", prevBalance: 0, balance: -4000 },
    { code: "21052002", name: "ACEPTACIONES", prevBalance: 0, balance: -1000 },
    { code: "110505", name: "Caja", prevBalance: 0, balance: 5000 },
  ];
  const itemsPorCodigo = (r: ReturnType<typeof calcularBalance>) =>
    new Map(r.breakdown.flatMap((g) => g.items).map((i) => [i.code, i]));

  it("la excepción por cuenta gana a la regla de su grupo y no toca a las hermanas", () => {
    const items = itemsPorCodigo(
      calcularBalance(CUENTAS, STD, undefined, undefined, new Map([
        ["210520", { std: "110505", coincidencia: 90 }],
        ["21052001", { std: "220505", coincidencia: 100 }],
      ])),
    );

    expect(items.get("21052001")?.std).toBe("220505");
    expect(items.get("21052001")?.coincidencia).toBe(100);
    expect(items.get("21052002")?.std).toBe("110505");
  });

  it("sin excepción, toda la cuenta imputable sigue la regla del grupo", () => {
    const items = itemsPorCodigo(
      calcularBalance(CUENTAS, STD, undefined, undefined, new Map([
        ["210520", { std: "220505", coincidencia: 100 }],
      ])),
    );

    expect(items.get("21052001")?.std).toBe("220505");
    expect(items.get("21052002")?.std).toBe("220505");
  });
});

describe("calcularBalance — gates con margen ±$1000 (A−P=Patrimonio+Resultado)", () => {
  it("descuadre de $500 → cuadra (dentro del margen)", () => {
    const r = calcularBalance(
      [
        { code: "110505", name: "Caja", prevBalance: 0, balance: 1000, debitos: 1000, creditos: 0 },
        { code: "220505", name: "Proveedores", prevBalance: 0, balance: -500, debitos: 0, creditos: 500 },
      ],
      STD,
    );
    expect(r.diffCuadre).toBe(500); // 1000 + (−500)
    expect(r.balanced).toBe(true);
    expect(r.movimientosCuadran).toBe(true); // Σdéb 1000 − Σcré 500 = 500 ≤ 1000
  });

  it("descuadre de $2000 → NO cuadra (fuera del margen) y V1 alerta", () => {
    const r = calcularBalance(
      [
        { code: "110505", name: "Caja", prevBalance: 0, balance: 3000, debitos: 3000, creditos: 0 },
        { code: "220505", name: "Proveedores", prevBalance: 0, balance: -1000, debitos: 0, creditos: 1000 },
      ],
      STD,
    );
    expect(r.diffCuadre).toBe(2000); // 3000 + (−1000)
    expect(r.balanced).toBe(false);
    expect(r.validations.find((v) => v.id === "V1")?.status).toBe("warn");
  });
});

describe("calcularBalance — saldo contrario en archivo de magnitud (SIGN-1)", () => {
  // Archivo en MAGNITUD (créditos en positivo) con UNA cuenta de crédito de saldo
  // contrario (deudor → llega negativa). El flip NO debe "corregirla" al signo de
  // su clase: debe preservar la anomalía y que V2 la detecte.
  // Montos escalados (vs. la versión original con montos pequeños) para que la
  // detección por PARTIDA DOBLE (nivel 1 del fix del flip) sea decisiva: con
  // valores de magnitud comparable entre todas las cuentas, la cuenta contraria
  // (-50.001) deja de ser un valor atípico que por sí solo domine la suma total,
  // igual que en un balance real donde una anomalía puntual es pequeña frente al
  // total de cuentas correctamente firmadas.
  const CUENTAS: CuentaCruda[] = [
    { code: "110505", name: "Caja", prevBalance: 200_000, balance: 200_000 }, // D normal +
    { code: "111005", name: "Bancos", prevBalance: 300_000, balance: 300_000 }, // D normal +
    { code: "220505", name: "Proveedores", prevBalance: 150_000, balance: 150_000 }, // C normal + (magnitud)
    { code: "240805", name: "IVA", prevBalance: 50_000, balance: 50_000 }, // C normal +
    { code: "310505", name: "Capital", prevBalance: 350_000, balance: 350_000 }, // C normal +
    { code: "413505", name: "Ventas (saldo deudor)", prevBalance: 0, balance: -50_001 }, // C contrario → negativo
  ];
  const r = calcularBalance(CUENTAS, STD);

  it("detecta la convención magnitud y voltea los créditos normales", () => {
    expect(r.breakdown.find((g) => g.code === "22")?.balance).toBe(-150_000);
  });

  it("preserva el saldo contrario (no lo fuerza a -|v|) y V2 alerta si supera $50.000", () => {
    const ventas = r.breakdown.find((g) => g.code === "41")?.items[0];
    expect(ventas?.balance).toBe(50_001); // el crédito en deudor queda POSITIVO tras el flip
    expect(ventas?.saldoOk).toBe(false); // contrario a su naturaleza → detectado
    const v2 = r.validations.find((v) => v.id === "V2");
    expect(v2?.status).toBe("warn");
    expect(v2?.count).toBe(1);
  });
});

// ------------------------------------------------------------------
// Regresión del bug de producción (lote CIB, "Balance por tercero"): la
// convención de signos se decidía CONTANDO filas de crédito positivas vs
// negativas. En un balance por tercero, muchas cuentas pequeñas con saldo
// contrario legítimo (p. ej. grupo 28) le "ganan la votación" a pocas cuentas
// grandes correctamente firmadas, y el archivo terminaba invertido aunque ya
// cuadraba a $0 exacto. El fix decide por PARTIDA DOBLE (Σ balance firmado de
// clases 1–7 sin flip vs con flip, la de menor |Σ| gana) y solo cae a un
// respaldo por MAGNITUD ACUMULADA (no por conteo) cuando esa suma empata.
// ------------------------------------------------------------------
describe("calcularBalance — convención de signos: partida doble vs. conteo (CIB)", () => {
  it("archivo YA firmado que cuadra a 0, con MUCHAS cuentas crédito pequeñas en saldo contrario vs POCAS grandes correctas: el flip NO se activa", () => {
    // Pasivo: 2 cuentas grandes correctamente firmadas (−700.000 y −100.000) +
    // 10 cuentas pequeñas del grupo 28 en saldo contrario (+2.000 c/u, +20.000
    // en total) → por CONTEO, positivas (10) > negativas (2): el bug antiguo
    // volteaba. Por SUMA, el archivo ya cuadra (Σ = 0) sin flip.
    const grandes: CuentaCruda[] = [
      { code: "220505", name: "Proveedores", prevBalance: -700_000, balance: -700_000 },
      { code: "230505", name: "Cuentas por pagar", prevBalance: -100_000, balance: -100_000 },
    ];
    const pequenas: CuentaCruda[] = Array.from({ length: 10 }, (_, i) => {
      const code = `280${String(i + 1).padStart(3, "0")}`;
      return { code, name: `Saldo contrario tercero ${i + 1}`, prevBalance: 2_000, balance: 2_000 };
    });
    const CUENTAS: CuentaCruda[] = [
      { code: "110505", name: "Caja", prevBalance: 980_000, balance: 980_000 }, // Activo
      { code: "413505", name: "Ventas", prevBalance: -200_000, balance: -200_000 }, // Ingresos, ya firmado
      ...grandes,
      ...pequenas,
    ];
    const r = calcularBalance(CUENTAS, STD);

    // El archivo YA cuadraba a 0 sin flip: se conserva tal cual.
    expect(r.balanced).toBe(true);
    expect(r.diffCuadre).toBe(0);
    // Ingresos debe salir POSITIVO (antes del fix salía negativo por el flip indebido).
    expect(r.sums.ingresos).toBe(200_000);
    expect(r.sums.utilidad).toBe(200_000); // ingresos − gastos(0) − costos(0)
    // Las cuentas grandes conservan su signo crudo (no se invirtieron).
    const proveedores = r.breakdown.find((g) => g.code === "22")?.items[0];
    expect(proveedores?.balance).toBe(-700_000);
    // Los saldos contrarios pequeños se preservan tal cual vienen (no se "corrigen").
    const contrario = r.breakdown.find((g) => g.code === "28")?.items[0];
    expect(contrario?.balance).toBe(2_000);
    expect(contrario?.saldoOk).toBe(false);
  });

  it("archivo en magnitud (todo positivo) que cuadra bajo flip: el flip SÍ se activa (preserva el comportamiento actual)", () => {
    // Mismo patrón que arriba pero exportado en magnitud (créditos en positivo):
    // aquí la partida doble YA es decisiva a favor del flip (no hace falta el
    // respaldo por conteo ni por magnitud).
    const CUENTAS: CuentaCruda[] = [
      { code: "110505", name: "Caja", prevBalance: 1_000_000, balance: 1_000_000 }, // Activo
      { code: "413505", name: "Ventas", prevBalance: 200_000, balance: 200_000 }, // Ingresos en magnitud
      { code: "220505", name: "Proveedores", prevBalance: 700_000, balance: 700_000 },
      { code: "230505", name: "Cuentas por pagar", prevBalance: 100_000, balance: 100_000 },
    ];
    const r = calcularBalance(CUENTAS, STD);
    expect(r.balanced).toBe(true);
    expect(r.diffCuadre).toBe(0);
    expect(r.sums.ingresos).toBe(200_000);
    expect(r.breakdown.find((g) => g.code === "22")?.items[0]?.balance).toBe(-700_000);
  });

  it("archivo en magnitud genuinamente DESCUADRADO (solo cuentas crédito, nivel 1 empata): el respaldo por magnitud acumulada decide el flip", () => {
    // Sin ninguna cuenta débito, la suma con y sin flip SIEMPRE empata en valor
    // absoluto (Σ = C y Σ = −C respectivamente) — nivel 1 no aporta información
    // y se cae al respaldo por magnitud: 8.000 en créditos positivos (magnitud)
    // vs 1.000 en créditos negativos → flip.
    const CUENTAS: CuentaCruda[] = [
      { code: "220505", name: "Proveedores", prevBalance: 0, balance: 5_000 },
      { code: "230505", name: "Cuentas por pagar", prevBalance: 0, balance: 3_000 },
      { code: "250505", name: "Obligaciones laborales", prevBalance: 0, balance: -1_000 },
    ];
    const r = calcularBalance(CUENTAS, STD);
    const proveedores = r.breakdown.find((g) => g.code === "22")?.items[0];
    expect(proveedores?.balance).toBe(-5_000); // flip aplicado
    const obligaciones = r.breakdown.find((g) => g.code === "25")?.items[0];
    expect(obligaciones?.balance).toBe(1_000); // saldo contrario preservado tras el flip
    expect(obligaciones?.saldoOk).toBe(false);
    // Descuadre genuino: no hay corrección posible, queda fuera de margen.
    expect(r.balanced).toBe(false);
    expect(Math.abs(r.diffCuadre)).toBeGreaterThan(MARGEN_CUADRE);
  });
});

describe("calcularBalance — umbral de naturaleza contraria", () => {
  it("$50.000 exactos permanece informativo y no cuenta en V2", () => {
    const r = calcularBalance(
      [
        { code: "110505", name: "Caja", prevBalance: 0, balance: 100_000 },
        { code: "220505", name: "Proveedores", prevBalance: 0, balance: -150_000 },
        { code: "240805", name: "IVA contrario", prevBalance: 0, balance: 50_000 },
      ],
      STD,
    );
    const iva = r.breakdown.find((g) => g.code === "24")?.items[0];
    const v2 = r.validations.find((v) => v.id === "V2");
    expect(iva?.saldoOk).toBe(false);
    expect(v2?.status).toBe("ok");
    expect(v2?.count).toBeUndefined();
    expect(v2?.detail).toContain("informativos");
  });
});

describe("calcularBalance — V5 movimientos del período (COH-2)", () => {
  it("no incluye V5 si el archivo solo trae saldos (sin movimientos)", () => {
    const r = calcularBalance(FIRMADO, STD);
    expect(r.validations.find((v) => v.id === "V5")).toBeUndefined();
  });

  it("ok cuando Σdébitos = Σcréditos del período", () => {
    const r = calcularBalance(
      [
        { code: "110505", name: "Caja", prevBalance: 0, balance: 500, debitos: 500, creditos: 0 },
        { code: "220505", name: "Proveedores", prevBalance: 0, balance: -500, debitos: 0, creditos: 500 },
      ],
      STD,
    );
    const v5 = r.validations.find((v) => v.id === "V5");
    expect(v5?.status).toBe("ok");
    expect(v5?.rule).toBe("Cuadre de movimientos del período");
    expect(v5?.detail).toContain("Total débitos = total créditos · diferencia:");
    expect(r.validations.map((v) => v.id).slice(0, 2)).toEqual(["V1", "V5"]);
  });

  it("ok dentro del margen ±$1000 aunque Σdébitos ≠ Σcréditos exacto", () => {
    const r = calcularBalance(
      [
        { code: "110505", name: "Caja", prevBalance: 0, balance: 600, debitos: 600, creditos: 0 },
        { code: "220505", name: "Proveedores", prevBalance: 0, balance: -300, debitos: 0, creditos: 300 },
      ],
      STD,
    );
    // Σdéb 600 − Σcré 300 = 300 ≤ 1000 ⇒ el gate del cargue lo da por cuadrado.
    expect(r.validations.find((v) => v.id === "V5")?.status).toBe("ok");
    expect(r.movimientosCuadran).toBe(true);
  });

  it("presenta como $ 0 los residuales menores a medio centavo", () => {
    const r = calcularBalance(
      [
        { code: "110505", name: "Caja", prevBalance: 0, balance: 999.998, debitos: 999.998, creditos: 0 },
        { code: "220505", name: "Proveedores", prevBalance: 0, balance: -1000, debitos: 0, creditos: 1000 },
      ],
      STD,
    );
    expect(r.validations.find((v) => v.id === "V1")?.detail).toContain("diferencia: $ 0");
    expect(r.validations.find((v) => v.id === "V5")?.detail).toContain("diferencia: $ 0");
  });

  it("warn cuando los movimientos descuadran por más de $1000", () => {
    const r = calcularBalance(
      [
        { code: "110505", name: "Caja", prevBalance: 0, balance: 2000, debitos: 2000, creditos: 0 },
        { code: "220505", name: "Proveedores", prevBalance: 0, balance: -500, debitos: 0, creditos: 500 },
      ],
      STD,
    );
    // Σdéb 2000 − Σcré 500 = 1500 > 1000 ⇒ alerta.
    const v5 = r.validations.find((v) => v.id === "V5");
    expect(v5?.status).toBe("warn");
    expect(v5?.detail).toContain("fuera del margen");
    expect(r.movimientosCuadran).toBe(false);
  });
});

describe("calcularBalance — hojas (evita doble conteo de resúmenes)", () => {
  const CON_RESUMEN: CuentaCruda[] = [
    { code: "11", name: "Disponible (grupo)", prevBalance: 0, balance: 6000 },
    { code: "1105", name: "Caja (cuenta)", prevBalance: 0, balance: 1000 },
    { code: "110505", name: "Caja general", prevBalance: 0, balance: 1000 },
    { code: "111005", name: "Bancos", prevBalance: 0, balance: 5000 },
  ];
  const r = calcularBalance(CON_RESUMEN, STD);

  it("solo suma las cuentas hoja", () => {
    expect(r.totalRows).toBe(2); // 110505 y 111005 (11 y 1105 son ancestros)
    expect(r.sums.activo).toBe(6000); // no 12000
  });
});

describe("consolidarPorCodigo — fusiona cuentas repetidas", () => {
  it("suma saldos y movimientos del mismo código, conservando el primer nombre", () => {
    const DUP: CuentaCruda[] = [
      { code: "110505", name: "Caja general", prevBalance: 800, balance: 1000, debitos: 600, creditos: 400 },
      { code: " 110505 ", name: "Caja menor", prevBalance: 200, balance: 500, debitos: 300, creditos: 100 },
      { code: "111005", name: "Bancos", prevBalance: 5000, balance: 5000 },
    ];
    const out = consolidarPorCodigo(DUP);
    expect(out).toHaveLength(2);
    const caja = out.find((c) => c.code === "110505")!;
    expect(caja.name).toBe("Caja general"); // primer nombre
    expect(caja.prevBalance).toBe(1000); // 800 + 200
    expect(caja.balance).toBe(1500); // 1000 + 500
    expect(caja.debitos).toBe(900); // 600 + 300
    expect(caja.creditos).toBe(500); // 400 + 100
  });

  it("calcularBalance deduplica antes de mapear y agregar", () => {
    const r = calcularBalance(
      [
        { code: "110505", name: "Caja general", prevBalance: 0, balance: 1000 },
        { code: "110505", name: "Caja menor", prevBalance: 0, balance: 1000 },
      ],
      STD,
    );
    expect(r.totalRows).toBe(1); // una sola fila tras consolidar
    expect(r.sums.activo).toBe(2000); // 1000 + 1000
  });
});

describe("compararBalances", () => {
  it("detecta agregadas, removidas y cambiadas, ordenadas por impacto", () => {
    const r1 = calcularBalance(
      [
        { code: "110505", name: "Caja", prevBalance: 0, balance: 1000 },
        { code: "111005", name: "Bancos", prevBalance: 0, balance: 5000 },
      ],
      STD,
    );
    const r2 = calcularBalance(
      [
        { code: "110505", name: "Caja", prevBalance: 0, balance: 1500 }, // cambia +500
        { code: "130505", name: "Clientes", prevBalance: 0, balance: 9000 }, // agregada
      ],
      STD,
    );
    const diff = compararBalances(aplanarBreakdown(r1.breakdown), aplanarBreakdown(r2.breakdown));
    expect(diff.summary.added).toBe(1); // Clientes
    expect(diff.summary.removed).toBe(1); // Bancos
    expect(diff.summary.changed).toBe(1); // Caja
    expect(diff.rows[0].code).toBe("130505"); // mayor |delta| primero
    expect(diff.summary.totalAffected).toBe(9000 + 5000 + 500);
  });
});

describe("mapearCuenta — cascada de barridos", () => {
  const STD_RICO: CuentaEstandar[] = [
    { code: "110505", nature: "D", critical: false, name: "Caja general", russellAccount: "Caja", possibleAccounts: "Caja general, caja principal, efectivo en caja, caja recaudo" },
    { code: "111005", nature: "D", critical: false, name: "Bancos moneda nacional", russellAccount: "Bancos", possibleAccounts: "Banco, cuenta corriente, cuenta de ahorros, bancos nacionales" },
  ];
  const idx = new Map(STD_RICO.map((s) => [s.code, s]));

  it("barrido 1: exacto por prefijo de 6 dígitos → coincidencia 100", () => {
    expect(mapearCuenta("11050501", "CAJA GENERAL", idx, STD_RICO, true)).toMatchObject({ std: "110505", coincidencia: 100, mapped: true });
  });

  it("barrido 2: sin prefijo pero el nombre coincide con un sinónimo → mapea con %", () => {
    const r = mapearCuenta("11999901", "Caja principal", idx, STD_RICO, true); // 119999 no está en el plan
    expect(r.std).toBe("110505");
    expect(r.mapped).toBe(true);
    expect(r.coincidencia).toBeGreaterThanOrEqual(55);
  });

  it("nombre sin relación → sin mapeo (queda para el barrido IA)", () => {
    expect(mapearCuenta("11999902", "Maquinaria pesada", idx, STD_RICO, true).mapped).toBe(false);
  });

  it("respeta la clase: una cuenta clase 1 no mapea a una clase 4 aunque el texto se parezca", () => {
    const r = mapearCuenta("41999901", "Caja general", idx, STD_RICO, true); // clase 4 ≠ clase 1 del plan
    expect(r.mapped).toBe(false);
  });
});

describe("calcularBalance — config de mapeo guardada del cliente", () => {
  it("la config del cliente (por cuenta 6) tiene prioridad sobre el mapeo exacto", () => {
    // 110505 mapearía exacto a 110505; la config del cliente lo fuerza a 130505.
    const cfg = new Map([["110505", { std: "130505", coincidencia: 100 }]]);
    const r = calcularBalance(FIRMADO, STD, undefined, undefined, cfg);
    const item = r.breakdown.flatMap((g) => g.items).find((i) => i.code === "110505");
    expect(item?.std).toBe("130505");
    expect(item?.mapped).toBe(true);
  });
});

describe("limpiarCodigo — sufijo alfabético (INAC/A/AS) se omite", () => {
  it("descomponerCuenta quita el sufijo y normaliza el código", () => {
    expect(descomponerCuenta("236550INAC")).toEqual({ cuenta2: "23", cuenta4: "2365", cuenta6: "236550", cuenta8: "236550" });
    expect(descomponerCuenta("23680503A").cuenta8).toBe("23680503");
    expect(descomponerCuenta("23680523INAC").cuenta8).toBe("23680523");
    // Código numérico puro no cambia.
    expect(descomponerCuenta("110505").cuenta8).toBe("110505");
  });

  it("consolidarPorCodigo fusiona la cuenta con sufijo con su base (suma saldos)", () => {
    const r = consolidarPorCodigo([
      { code: "236550", name: "RTE FTE 10%", prevBalance: 0, balance: -1715696, debitos: 0, creditos: 1715696 },
      { code: "236550INAC", name: "RTE FTE 20%", prevBalance: 0, balance: -16585270, debitos: 0, creditos: 16585270 },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].code).toBe("236550");
    expect(r[0].balance).toBe(-18300966); // -1.715.696 + -16.585.270
  });
});

describe("construirValidacionContable — borrador A/P/Patrimonio (archivo vs calculado + ecuación)", () => {
  // Activo 1000, Pasivo 600 (crédito), Patrimonio 400 (crédito), sin resultado.
  const CUENTAS: CuentaCruda[] = [
    { code: "110505", name: "Caja", prevBalance: 0, balance: 1000 },
    { code: "220505", name: "Proveedores", prevBalance: 0, balance: -600 },
    { code: "310505", name: "Capital", prevBalance: 0, balance: -400 },
  ];
  const calc = calcularBalance(CUENTAS, STD);

  it("cruza cuando los totales del archivo coinciden con el detalle y la ecuación cuadra", () => {
    // El archivo trae clase 2/3 firmadas en negativo (convención firmado).
    const v = construirValidacionContable(calc, { activo: 1000, pasivo: -600, patrimonio: -400 });
    expect(v.activo).toBe(1000);
    expect(v.pasivo).toBe(600); // magnitud
    expect(v.patrimonio).toBe(400);
    expect(v.activoArchivo).toBe(1000); // |archivo|
    expect(v.activoCuadra).toBe(true);
    expect(v.pasivoCuadra).toBe(true);
    expect(v.patrimonioCuadra).toBe(true);
    expect(v.ecuacionDiff).toBe(0); // 1000 − 600 − 400 − 0
    expect(v.ecuacionCuadra).toBe(true);
  });

  it("marca la clase como NO cruzada cuando el total del archivo difiere por > $1000", () => {
    const v = construirValidacionContable(calc, { activo: 3000, pasivo: -600, patrimonio: -400 });
    expect(v.activoCuadra).toBe(false);
    expect(v.activoDiff).toBe(2000); // |3000| − 1000
  });

  it("deja null la clase cuando el archivo no trae ese total (solo calculado)", () => {
    const v = construirValidacionContable(calc, { activo: null, pasivo: null, patrimonio: null });
    expect(v.activoArchivo).toBeNull();
    expect(v.activoCuadra).toBeNull();
    expect(v.activo).toBe(1000); // el calculado siempre está
  });

  it("compara Ingresos/Gastos/Costos/Resultado del archivo con el calculado", () => {
    const pyg: CuentaCruda[] = [
      { code: "413505", name: "Ventas", prevBalance: 0, balance: -1000 }, // ingreso (crédito)
      { code: "513505", name: "Gastos admin", prevBalance: 0, balance: 300 }, // gasto (débito)
      { code: "613505", name: "Costo de ventas", prevBalance: 0, balance: 200 }, // costo (débito)
    ];
    const c = calcularBalance(pyg, STD);
    // Archivo firmado: clase 4 en negativo, 5/6 en positivo.
    const v = construirValidacionContable(c, { activo: null, pasivo: null, patrimonio: null, ingresos: -1000, gastos: 300, costos: 200 });
    expect(v.ingresos).toBe(1000);
    expect(v.ingresosArchivo).toBe(1000); // |archivo|
    expect(v.ingresosCuadra).toBe(true);
    expect(v.gastosCuadra).toBe(true);
    expect(v.costosCuadra).toBe(true);
    expect(v.resultado).toBe(500); // 1000 − 300 − 200
    expect(v.resultadoArchivo).toBe(500);
    expect(v.resultadoCuadra).toBe(true);
  });

  it("deja null el resultado del archivo si falta alguna clase de P&L", () => {
    const v = construirValidacionContable(calc, { activo: null, pasivo: null, patrimonio: null, ingresos: -1000 });
    expect(v.ingresosArchivo).toBe(1000);
    expect(v.costosArchivo).toBeNull();
    expect(v.resultadoArchivo).toBeNull(); // faltan gastos/costos
  });

  it("patrimonio NEGATIVO (déficit) cruza con el archivo cuando las magnitudes coinciden", () => {
    // Capital (crédito, −100) + pérdidas acumuladas (débito, +180) → patrimonio neto −80 (déficit).
    // Se agregan Caja (débito) y Proveedores (crédito, ya firmado) para que la
    // detección de flip por partida doble tenga clases débito Y crédito y sea
    // DECISIVA (Σ = 0 sin flip): con solo cuentas de clase 3 (todas de la misma
    // naturaleza), el nivel 1 empataría estructuralmente por construcción — el
    // empate no dice nada sobre esta cuenta en particular, así que se completa el
    // archivo para que se parezca a uno real y quede fuera de ambigüedad.
    const c = calcularBalance([
      { code: "110505", name: "Caja", prevBalance: 0, balance: 620 },
      { code: "220505", name: "Proveedores", prevBalance: 0, balance: -700 },
      { code: "310505", name: "Capital", prevBalance: 0, balance: -100 },
      { code: "360505", name: "Pérdidas acumuladas", prevBalance: 0, balance: 180 },
    ], STD);
    expect(c.sums.patrimonio).toBe(-80);
    const v = construirValidacionContable(c, { activo: null, pasivo: null, patrimonio: 80 });
    expect(v.patrimonioDiff).toBe(0); // magnitudes iguales, aunque el signo difiera
    expect(v.patrimonioCuadra).toBe(true);
  });
});

describe("quitarPadresRedundantes — jerarquía de código hermano (no anida por prefijo)", () => {
  it("descarta el encabezado padre cuando el hijo tiene mismo saldo y nombre más específico", () => {
    const cuentas: CuentaCruda[] = [
      { code: "221005", name: "PROVEEDORES INTERNACIONALES", prevBalance: 0, balance: -30454318366, debitos: 0, creditos: 30454318366 },
      { code: "221006", name: "PROVEEDORES INTERNACIONALES USD", prevBalance: 0, balance: -30454318366, debitos: 0, creditos: 30454318366 },
      { code: "220501", name: "PROVEEDORES", prevBalance: 0, balance: -11388561892, debitos: 0, creditos: 11388561892 },
      { code: "220505", name: "PROVEEDORES NACIONALES", prevBalance: 0, balance: -11388561892, debitos: 0, creditos: 11388561892 },
    ];
    const r = quitarPadresRedundantes(cuentas);
    const codigos = r.map((c) => c.code).sort();
    // Se conservan los detalles (221006/220505), se descartan los encabezados (221005/220501).
    expect(codigos).toEqual(["220505", "221006"]);
  });

  it("NO toca cuentas con mismo saldo si NO hay relación de nombre (cuentas distintas)", () => {
    const cuentas: CuentaCruda[] = [
      { code: "221005", name: "CUENTA A", prevBalance: 0, balance: -1000, debitos: 0, creditos: 1000 },
      { code: "221006", name: "CUENTA B", prevBalance: 0, balance: -1000, debitos: 0, creditos: 1000 },
    ];
    expect(quitarPadresRedundantes(cuentas)).toHaveLength(2);
  });

  it("NO deduplica saldos en cero (evita falsos positivos masivos)", () => {
    const cuentas: CuentaCruda[] = [
      { code: "221005", name: "PROVEEDORES", prevBalance: 0, balance: 0, debitos: 0, creditos: 0 },
      { code: "221006", name: "PROVEEDORES USD", prevBalance: 0, balance: 0, debitos: 0, creditos: 0 },
    ];
    expect(quitarPadresRedundantes(cuentas)).toHaveLength(2);
  });

  it("NO deduplica HERMANAS enumeradas con mismo saldo (caso COMESTIBLES 11050502/03)", () => {
    // Dos cajas distintas con saldo 100.000 idéntico por coincidencia; el sufijo
    // que las distingue es un número (" 2"), no un descriptor → NO son encabezado/detalle.
    const cuentas: CuentaCruda[] = [
      { code: "11050502", name: "CAJA GENERAL BASE RAPIDAN", prevBalance: 100000, balance: 100000, debitos: 0, creditos: 0 },
      { code: "11050503", name: "CAJA GENERAL BASE RAPIDAN 2", prevBalance: 100000, balance: 100000, debitos: 0, creditos: 0 },
    ];
    expect(quitarPadresRedundantes(cuentas).map((c) => c.code).sort()).toEqual(["11050502", "11050503"]);
  });
});

describe("descomponerCuenta", () => {
  it("parte el código imputable en prefijos PUC 2/4/6/8", () => {
    expect(descomponerCuenta("11100501")).toEqual({ cuenta2: "11", cuenta4: "1110", cuenta6: "111005", cuenta8: "11100501" });
  });
  it("no inventa dígitos cuando el código es más corto", () => {
    expect(descomponerCuenta("1105")).toEqual({ cuenta2: "11", cuenta4: "1105", cuenta6: "1105", cuenta8: "1105" });
  });
});

describe("aFilasDetalle + reconstruirBalance (ida y vuelta)", () => {
  it("reconstruye los mismos agregados desde las filas persistidas", () => {
    const calc = calcularBalance(FIRMADO, STD);
    const filas = aFilasDetalle(calc.breakdown).map((f) => ({
      cuenta8: f.cuenta8, nombreCuenta: f.nombreCuenta, cuenta6Russell: f.cuenta6Russell,
      saldoInicial: f.saldoInicial, debitos: f.debitos, creditos: f.creditos, saldoFinal: f.saldoFinal,
    }));
    const recon = reconstruirBalance(filas, STD);

    expect(recon.sums).toEqual(calc.sums);
    expect(recon.balanced).toBe(calc.balanced);
    expect(recon.totalRows).toBe(calc.totalRows);
    expect(recon.mapped).toBe(calc.mapped);
    expect(recon.unmapped).toBe(calc.unmapped);
    // El desglose por grupo coincide en código y saldo.
    expect(recon.breakdown.map((g) => [g.code, g.balance])).toEqual(calc.breakdown.map((g) => [g.code, g.balance]));
  });

  it("aFilasDetalle mapea saldo_inicial/saldo_final/debe/haber correctamente", () => {
    const calc = calcularBalance(FIRMADO, STD);
    const filas = aFilasDetalle(calc.breakdown);
    const caja = filas.find((f) => f.cuenta8 === "110505");
    expect(caja).toMatchObject({ cuenta6Russell: "110505", saldoInicial: 800, saldoFinal: 1000, coincidencia: 100 });
  });
});

describe("conForzarHoja — imputable de nivel alto que es prefijo de sus hermanas", () => {
  it("una cuenta de 4 díg marcada NO se descarta por ser prefijo (caso CAJA GENERAL 1105)", () => {
    const cuentas = conForzarHoja([
      { code: "1105", name: "CAJA GENERAL", prevBalance: 0, balance: 13282874 },
      { code: "110505", name: "BASE", prevBalance: 0, balance: 200000 },
      { code: "110510", name: "CAJAS", prevBalance: 0, balance: 0 },
    ]);
    expect(cuentas.find((c) => c.code === "1105")?.forzarHoja).toBe(true);
    // Activo = 13.282.874 (1105) + 200.000 (110505) + 0 → 1105 NO se descarta.
    expect(calcularBalance(cuentas, []).sums.activo).toBe(13482874);
  });

  it("SIN el flag, el filtro por prefijo descarta el padre (comportamiento por defecto)", () => {
    const r = calcularBalance([
      { code: "110505", name: "Caja padre", prevBalance: 0, balance: 1000 },
      { code: "11050501", name: "Aux A", prevBalance: 0, balance: 600 },
      { code: "11050502", name: "Aux B", prevBalance: 0, balance: 400 },
    ], []);
    expect(r.sums.activo).toBe(1000); // 600 + 400; el padre 110505 se descarta (no dobla a 2000)
  });
});

describe("agruparJerarquia · naturaleza HEREDADA en agrupadoras (cuenta contra-naturaleza)", () => {
  // «Pérdidas acumuladas» (371005): clase 3 (patrimonio → clase = crédito) pero el plan
  // estándar la declara DÉBITO (contra-patrimonio). «Utilidades acumuladas» (370505): clase 3, crédito.
  const STD_CN: CuentaEstandar[] = [
    { code: "371005", nature: "D", critical: false, name: "Pérdidas acumuladas" },
    { code: "370505", nature: "C", critical: false, name: "Utilidades acumuladas" },
  ];
  const NOM_CN = new Map(STD_CN.map((s) => [s.code, s.name!]));
  const FILAS_CN = [
    // Pérdidas: auxiliar con saldo POSITIVO → correcto para naturaleza DÉBITO.
    { cuenta8: "37100505", nombreCuenta: "PERDIDAS ACUMULADAS", cuenta6Russell: "371005", coincidencia: 100, saldoInicial: 21_000_000, debitos: 0, creditos: 0, saldoFinal: 21_589_276 },
    // Utilidades: auxiliar con saldo NEGATIVO → correcto para naturaleza CRÉDITO.
    { cuenta8: "37050505", nombreCuenta: "UTILIDADES ACUMULADAS", cuenta6Russell: "370505", coincidencia: 100, saldoInicial: -35_000_000, debitos: 0, creditos: 0, saldoFinal: -35_118_745 },
  ];
  const arbol = agruparJerarquia(FILAS_CN, STD_CN, NOM_CN);
  const buscar = (nodos: NodoBalance[], code: string): NodoBalance | undefined => {
    for (const n of nodos) { if (n.code === code) return n; const h = buscar(n.hijos, code); if (h) return h; }
    return undefined;
  };

  it("las agrupadoras de «Pérdidas» (saldo +) NO se marcan: heredan la naturaleza DÉBITO del plan, no la de la clase", () => {
    expect(buscar(arbol, "37100505")?.saldoOk).toBe(true); // auxiliar (ya lo hacía)
    expect(buscar(arbol, "371005")?.saldoOk).toBe(true); // subcuenta (antes marcaba «Saldo contrario»)
    expect(buscar(arbol, "3710")?.saldoOk).toBe(true); // cuenta
    expect(buscar(arbol, "371005")?.nature).toBe("D");
  });

  it("las agrupadoras de «Utilidades» (saldo −, crédito) siguen OK", () => {
    expect(buscar(arbol, "370505")?.saldoOk).toBe(true);
    expect(buscar(arbol, "370505")?.nature).toBe("C");
  });

  it("el GRUPO mixto (utilidades C + pérdidas D) no se marca: naturaleza «-»", () => {
    const g = buscar(arbol, "37")!;
    expect(g.nature).toBe("-");
    expect(g.saldoOk).toBe(true);
  });
});

// ============================================================
// Homologación fuera de la clase contable (V6) — novedad de operación.
// QUIFARMA S.A.S., balance 183: cinco auxiliares de inventarios homologadas por
// IA a `799505 Traslado o cierre de costos de producción` por parecido de nombre
// («TRASLADOS», «TRASLADO AL COSTO»). Como las sumas y el cuadre se calculan
// sobre el código del CLIENTE, el balance seguía cuadrando y nada lo delataba;
// pero el árbol por estándar y el cruce contable de módulos sí clasifican por
// `cuenta_6_russell`, y el grupo 14 pasó de $3.188.261.072,18 a $7.348.118.313,89.
// ============================================================
describe("validación V6 · homologación fuera de la clase contable", () => {
  const STD_CL: CuentaEstandar[] = [
    { code: "140505", nature: "D", critical: false, name: "Materias primas" },
    { code: "799505", nature: "C", critical: false, name: "Traslado o cierre de costos de producción" },
    { code: "413505", nature: "C", critical: false, name: "Ventas" },
  ];
  const v6 = (r: ReturnType<typeof calcularBalance>) => r.validations.find((v) => v.id === "V6")!;

  it("marca la cuenta desplazada de clase y suma el saldo reubicado", () => {
    const r = reconstruirBalance(
      [
        { cuenta8: "14059805", nombreCuenta: "TRASLADOS", cuenta6Russell: "799505", coincidencia: 70, saldoInicial: 0, debitos: 7_137_302_548.64, creditos: 9_941_633_282.16, saldoFinal: -2_804_330_733.52 },
        { cuenta8: "14050501", nombreCuenta: "MATERIAS PRIMAS", cuenta6Russell: "140505", coincidencia: 100, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 2_804_330_733.52 },
      ],
      STD_CL,
    );

    expect(v6(r).status).toBe("warn");
    expect(v6(r).count).toBe(1);
    // Magnitud, no neto: dos cuentas cruzadas que se compensan no deben taparse.
    expect(v6(r).detail).toContain("2.804.330.733,52");
  });

  it("queda en OK cuando toda la homologación conserva la clase", () => {
    const r = reconstruirBalance(
      [{ cuenta8: "14059805", nombreCuenta: "TRASLADOS", cuenta6Russell: "140505", coincidencia: 100, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: -2_804_330_733.52 }],
      STD_CL,
    );

    expect(v6(r).status).toBe("ok");
    expect(v6(r).count).toBeUndefined();
  });

  it("una cuenta sin mapeo no cuenta como cruce de clase", () => {
    const r = reconstruirBalance(
      [{ cuenta8: "14059805", nombreCuenta: "TRASLADOS", cuenta6Russell: null, saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: -100 }],
      STD_CL,
    );

    expect(v6(r).status).toBe("ok");
  });

  it("la memoria automática cruzada no gobierna el cálculo; la manual sí", () => {
    const cuentas: CuentaCruda[] = [
      { code: "14059805", name: "TRASLADOS", prevBalance: 0, balance: -2_804_330_733.52 },
    ];
    const automatica = calcularBalance(cuentas, STD_CL, undefined, undefined, new Map([["140598", { std: "799505", coincidencia: 70 }]]));
    const manual = calcularBalance(cuentas, STD_CL, undefined, undefined, new Map([["140598", { std: "140505", coincidencia: 100 }]]));

    // La config ya llega filtrada por `construirConfigMapeoCliente`: aquí se
    // comprueba el efecto aguas abajo de una y otra decisión.
    const std = (r: ReturnType<typeof calcularBalance>) =>
      r.breakdown.flatMap((g) => g.items).find((i) => i.code === "14059805")?.std;

    expect(std(automatica)).toBe("799505");
    expect(v6(automatica).status).toBe("warn");
    expect(std(manual)).toBe("140505");
    expect(v6(manual).status).toBe("ok");
  });
});
