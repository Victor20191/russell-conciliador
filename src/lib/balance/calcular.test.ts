import { describe, it, expect } from "vitest";
import {
  calcularBalance,
  construirValidacionContable,
  claseNatura,
  aplanarBreakdown,
  compararBalances,
  consolidarPorCodigo,
  quitarPadresRedundantes,
  descomponerCuenta,
  aFilasDetalle,
  reconstruirBalance,
  mapearCuenta,
  type CuentaCruda,
  type CuentaEstandar,
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
    expect(r.validations.find((v) => v.id === "V1")?.status).toBe("ok");
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
  const CUENTAS: CuentaCruda[] = [
    { code: "110505", name: "Caja", prevBalance: 1000, balance: 2000 }, // D normal +
    { code: "111005", name: "Bancos", prevBalance: 3000, balance: 3000 }, // D normal +
    { code: "220505", name: "Proveedores", prevBalance: 1500, balance: 1500 }, // C normal + (magnitud)
    { code: "240805", name: "IVA", prevBalance: 500, balance: 500 }, // C normal +
    { code: "310505", name: "Capital", prevBalance: 4000, balance: 4000 }, // C normal +
    { code: "413505", name: "Ventas (saldo deudor)", prevBalance: 0, balance: -500 }, // C contrario → negativo
  ];
  const r = calcularBalance(CUENTAS, STD);

  it("detecta la convención magnitud y voltea los créditos normales", () => {
    expect(r.breakdown.find((g) => g.code === "22")?.balance).toBe(-1500);
  });

  it("preserva el saldo contrario (no lo fuerza a -|v|) y V2 lo marca", () => {
    const ventas = r.breakdown.find((g) => g.code === "41")?.items[0];
    expect(ventas?.balance).toBe(500); // el crédito en deudor queda POSITIVO tras el flip
    expect(ventas?.saldoOk).toBe(false); // contrario a su naturaleza → detectado
    const v2 = r.validations.find((v) => v.id === "V2");
    expect(v2?.status).toBe("warn");
    expect(v2?.count).toBe(1);
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
    expect(r.validations.find((v) => v.id === "V5")?.status).toBe("ok");
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

  it("warn cuando los movimientos descuadran por más de $1000", () => {
    const r = calcularBalance(
      [
        { code: "110505", name: "Caja", prevBalance: 0, balance: 2000, debitos: 2000, creditos: 0 },
        { code: "220505", name: "Proveedores", prevBalance: 0, balance: -500, debitos: 0, creditos: 500 },
      ],
      STD,
    );
    // Σdéb 2000 − Σcré 500 = 1500 > 1000 ⇒ alerta.
    expect(r.validations.find((v) => v.id === "V5")?.status).toBe("warn");
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
