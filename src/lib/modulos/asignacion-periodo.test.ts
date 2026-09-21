import { describe, expect, it } from "vitest";
import { catalogoPrevalidadorDeFabrica } from "@/lib/balance/prevalidador/catalogo";
import { alcanceExplicitoDelCruce } from "@/lib/conciliacion/cuentas-bloqueo";
import {
  cedulaDelCargue,
  extrasDelPeriodo,
  filasPeriodoDeCuentas,
  fusionarAsignaciones,
  separarCuentasCedula,
} from "./asignacion-periodo";
import {
  cedulaModulo,
  claveCedula,
  cuentaAsignableCedula,
  cuentas6ACargarCedula,
  cuentasCedula6,
  esCuentaDelPeriodo,
  fueraDeListaCedula,
  opcionesCedula,
  prefijosCuentaModulo,
  subgruposCedula,
} from "./cuentas-modulo";
import { descriptorModulo } from "./descriptores";

const catalogo = catalogoPrevalidadorDeFabrica();
const CXP = descriptorModulo("CXP")!;
const INV = descriptorModulo("INV")!;
const AFI = descriptorModulo("AFI")!;
const NOM = descriptorModulo("NOM")!;
const cedulaDe = (d: typeof CXP, codigo: string) => cedulaModulo(d, prefijosCuentaModulo(codigo, catalogo));

describe("separar las cuentas elegidas", () => {
  it("a 6: lo de la lista es de la cédula; lo demás del plan, del período", () => {
    const cedula = cedulaDe(CXP, "CXP");
    // 233550 está bajo los prefijos pero fuera de la lista: también puede entrar por el período.
    expect(separarCuentasCedula(cedula, ["220505", "210510", "233550", "2105", " 220505 "])).toEqual({
      deCedula: ["220505"],
      extras: ["210510", "233550"],
      invalidas: ["2105"],
    });
  });

  it("a 4: subgrupos fuera de los prefijos; nunca un subgrupo abierto", () => {
    expect(separarCuentasCedula(cedulaDe(INV, "INV"), ["1435", "1524", "152405"])).toEqual({
      deCedula: ["1435"],
      extras: ["1524"],
      invalidas: ["152405"],
    });
    expect(separarCuentasCedula(cedulaDe(AFI, "AFI"), ["1592", "1105"])).toEqual({ deCedula: [], extras: ["1105"], invalidas: ["1592"] });
  });
});

describe("cédula del período", () => {
  const filas = [
    ...filasPeriodoDeCuentas("GIROS", "", ["210510", "220505"]),
    ...filasPeriodoDeCuentas("OTRO", "", ["233550"]),
  ];

  it("amplía la cédula solo con lo que no concilia", () => {
    const { base, cedula, extras } = cedulaDelCargue(CXP, "CXP", catalogo, filas);
    expect(extras).toEqual(["210510", "233550"]);
    expect([...cedula.delPeriodo]).toEqual(["210510", "233550"]);
    expect(base.delPeriodo.size).toBe(0);
    // La cuenta del período es su propia clave, no queda «fuera de la lista» y se puede asignar.
    expect(claveCedula(cedula, "210510")).toBe("210510");
    expect(fueraDeListaCedula(cedula, "233550")).toBe(false);
    expect(fueraDeListaCedula(base, "233550")).toBe(true);
    expect(cuentaAsignableCedula(cedula, "210510")).toBe(true);
    expect(cuentaAsignableCedula(base, "210510")).toBe(false);
    expect(subgruposCedula(cedula, [])).toContain("2105");
    expect(cuentas6ACargarCedula(cedula)).toEqual(expect.arrayContaining(["210510", "233550"]));
    expect(esCuentaDelPeriodo(cedula, "210510", "2105")).toBe(true);
    expect(esCuentaDelPeriodo(cedula, "210505", "2105")).toBe(false);
    // Las opciones del selector siguen siendo las de la cédula.
    const plan = [{ codigo: "210510", nombre: "Giros" }, { codigo: "220505", nombre: "Nacionales" }];
    expect(opcionesCedula(cedula, [], plan).map((c) => c.codigo)).toEqual(["220505"]);
  });

  it("el cierre deja en firme las cuentas del período", () => {
    const { cedula } = cedulaDelCargue(CXP, "CXP", catalogo, filas);
    const alcance = alcanceExplicitoDelCruce(cedula, { filas: [] });
    expect(alcance).toEqual(expect.arrayContaining(["210510", "233550", "220505"]));
    expect(alcanceExplicitoDelCruce(cedulaDe(CXP, "CXP"), { filas: [] })).not.toContain("210510");
  });

  it("a 4 dígitos la cuenta del período es el subgrupo entero", () => {
    const { cedula, extras } = cedulaDelCargue(INV, "INV", catalogo, filasPeriodoDeCuentas("MUEBLES", "", ["1524"]));
    expect(extras).toEqual(["1524"]);
    expect(claveCedula(cedula, "152405", "1524")).toBe("1524");
    expect(esCuentaDelPeriodo(cedula, "152405", "1524")).toBe(true);
    expect(subgruposCedula(cedula, [])).toContain("1524");
  });

  it("Nómina: las cuentas del período cruzan como las de la lista (por saldo final, como todo el cruce)", () => {
    const { cedula, extras } = cedulaDelCargue(NOM, "NOM", catalogo, filasPeriodoDeCuentas("99", "GYA", ["513505"]));
    expect(extras).toEqual(["513505"]);
    expect(cedula.delPeriodo.has("513505")).toBe(true);
    expect(cuentasCedula6(NOM, extras)).toContain("513505");
    expect(cuentasCedula6(NOM)).not.toContain("513505");
  });

  it("una fila del período con una cuenta de la cédula no la vuelve extra", () => {
    expect(extrasDelPeriodo(cedulaDe(CXP, "CXP"), filasPeriodoDeCuentas("A", "", ["220505"]))).toEqual([]);
  });
});

describe("fusionar la memoria con el período", () => {
  type Fila = { clasificador: string; agrupador: string; cuenta4: string; cuenta6: string; descripcion: string | null; cuentaCliente: string };
  const memoria: Fila[] = [
    { clasificador: "GIROS", agrupador: "", cuenta4: "2205", cuenta6: "220505", descripcion: "Giros", cuentaCliente: "22050501" },
    { clasificador: "NAC", agrupador: "", cuenta4: "2205", cuenta6: "220505", descripcion: null, cuentaCliente: "" },
  ];
  const vacia = (f: { clasificador: string }) => ({ clasificador: f.clasificador, agrupador: "", cuenta4: "", cuenta6: "", descripcion: null, cuentaCliente: "" });

  it("el renglón con asignación del período reemplaza sus cuentas y conserva lo demás", () => {
    const r = fusionarAsignaciones(memoria, filasPeriodoDeCuentas("GIROS", "", ["210510"]), vacia);
    expect(r).toEqual([
      { ...memoria[1], soloPeriodo: false },
      { clasificador: "GIROS", agrupador: "", cuenta4: "2105", cuenta6: "210510", descripcion: "Giros", cuentaCliente: "22050501", soloPeriodo: true },
    ]);
  });

  it("un renglón nuevo del período nace de la fila vacía y sin período la memoria queda igual", () => {
    const r = fusionarAsignaciones(memoria, filasPeriodoDeCuentas("NUEVO", "", ["210510", "220505"]), vacia);
    expect(r.filter((f) => f.soloPeriodo).map((f) => f.cuenta6)).toEqual(["210510", "220505"]);
    expect(fusionarAsignaciones(memoria, [], vacia).every((f) => !f.soloPeriodo)).toBe(true);
  });

  it("Nómina: el centro de costo es parte del renglón", () => {
    const nomina: Fila[] = [
      { clasificador: "1", agrupador: "GYA", cuenta4: "5105", cuenta6: "510506", descripcion: "Sueldo", cuentaCliente: "" },
      { clasificador: "1", agrupador: "MOD", cuenta4: "7205", cuenta6: "720506", descripcion: "Sueldo", cuentaCliente: "" },
    ];
    const r = fusionarAsignaciones(nomina, filasPeriodoDeCuentas("1", "MOD", ["513505"]), vacia);
    expect(r.map((f) => `${f.agrupador}:${f.cuenta6}:${f.soloPeriodo}`)).toEqual(["GYA:510506:false", "MOD:513505:true"]);
  });
});
