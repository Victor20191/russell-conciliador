// Catálogo de GRUPOS DE CUENTA CONTABLE de los conceptos de nómina (RF-NOM-01/02/08).
//
// El grupo es la FAMILIA del concepto —sueldos, horas extras, comisiones, incapacidades,
// auxilio de transporte, cesantías, prima, vacaciones, auxilios, bonificaciones…— y es un
// atributo de la HOMOLOGACIÓN, no del archivo de nómina: el cliente lo declara en la plantilla
// RF-NOM-08 (columna «Grupo de cuenta contable») o la plataforma lo sugiere por el nombre del
// concepto o por la subcuenta PUC de la cuenta del cliente. Con el grupo y la CLASE del gasto
// (51 administración, 52 ventas, 72 mano de obra directa, 73 indirecta) sale la cuenta Russell
// de 6 dígitos por defecto (`cuentaPorGrupo` en `homologacion.ts`).
//
// Dos numeraciones conviven aquí y conviene no confundirlas:
//  - `subcuentasPuc`: los dígitos 5-6 del PUC colombiano (Decreto 2649) que comparten TODOS los
//    clientes (510506 sueldos, 510515 horas extras, 510527 auxilio de transporte…). Es la llave
//    de la vista del cruce «por subcuenta sumando clases», que es el papel que hace el auditor.
//  - `sufijoRussell`: la subcuenta del plan Russell, que colapsa casi todo en «xx95 Otros»:
//    sueldos, horas extras, comisiones e incapacidades van a 510506; cesantías a 510530; prima a
//    510536; vacaciones a 510539; ARL/EPS/pensión a 68/69/70; el resto a 510595.
//
// Puro: sin BD, sin Excel. Las pruebas viven en `grupos-concepto.test.ts`.

export type GrupoConceptoNomina = {
  /** Identificador estable (se guarda en `consolidacion_modulo_cliente.grupo`). */
  id: string;
  /** Etiqueta que ve el usuario (y que acepta la plantilla). */
  etiqueta: string;
  /** Subcuenta Russell de 5105/5205 para el grupo (`7205` se transpone por posición). */
  sufijoRussell: string;
  /** Subcuentas PUC (dígitos 5-6) del cliente que pertenecen al grupo. */
  subcuentasPuc: readonly string[];
  /** Patrones sobre el nombre normalizado del concepto (sin acentos, minúsculas). */
  patrones: readonly RegExp[];
  /** Otras formas de escribir el grupo en la plantilla. */
  sinonimos: readonly string[];
  /** ¿Es un aporte patronal o una provisión? (D2: si el archivo no los trae, no modulares.) */
  aportePatronal?: boolean;
};

export const GRUPOS_CONCEPTO_NOMINA: readonly GrupoConceptoNomina[] = [
  {
    id: "sueldos",
    etiqueta: "Sueldos",
    sufijoRussell: "06",
    subcuentasPuc: ["06", "12"],
    patrones: [/sueldo|salario|basico|recargo|dia 31|retroactiv|festivo|dominical|jornal|integral|ajuste al sueldo|suspension/],
    sinonimos: ["sueldo", "salarios", "salario", "salario basico", "sueldo basico"],
  },
  {
    id: "horas_extras",
    etiqueta: "Horas extras y recargos",
    sufijoRussell: "06",
    subcuentasPuc: ["15"],
    patrones: [/hora[s]? ?extra|h\.? ?e\.? |hed|hen|hedf|henf|extra diurna|extra nocturna|recargo noct|\bhe\b/],
    sinonimos: ["horas extras", "horas extra", "extras", "horas extras y recargos"],
  },
  {
    id: "comisiones",
    etiqueta: "Comisiones",
    sufijoRussell: "06",
    subcuentasPuc: ["18"],
    patrones: [/comision/],
    sinonimos: ["comision"],
  },
  {
    id: "viaticos",
    etiqueta: "Viáticos",
    sufijoRussell: "95",
    subcuentasPuc: ["21"],
    patrones: [/viatico/],
    sinonimos: ["viatico"],
  },
  {
    id: "incapacidades",
    etiqueta: "Incapacidades",
    sufijoRussell: "06",
    subcuentasPuc: ["24"],
    patrones: [/incapacidad|licencia de maternidad|licencia de paternidad|\blma\b|\blmp\b|ausentismo/],
    sinonimos: ["incapacidad", "incapacidades y licencias"],
  },
  {
    id: "auxilio_transporte",
    etiqueta: "Auxilio de transporte",
    sufijoRussell: "95",
    subcuentasPuc: ["27"],
    patrones: [/aux(ilio)?\.? ?(de )?transp|subsidio (de )?transp|sub\.? ?transp|rodamiento|gastos de transporte/],
    sinonimos: ["auxilio transporte", "subsidio de transporte", "transporte"],
  },
  {
    id: "cesantias",
    etiqueta: "Cesantías",
    sufijoRussell: "30",
    subcuentasPuc: ["30"],
    patrones: [/^(?!.*interes).*cesantia/],
    sinonimos: ["cesantia"],
  },
  {
    id: "intereses_cesantias",
    etiqueta: "Intereses sobre cesantías",
    sufijoRussell: "95",
    subcuentasPuc: ["33"],
    patrones: [/interes.*cesantia|int\.? ?cesantia|intereses? ?de ?ces/],
    sinonimos: ["intereses cesantias", "intereses de cesantias", "intereses a las cesantias"],
  },
  {
    id: "prima",
    etiqueta: "Prima de servicios",
    sufijoRussell: "36",
    subcuentasPuc: ["36"],
    patrones: [/prima (de )?servicio|prima legal|\bprima\b/],
    sinonimos: ["prima", "prima legal", "prima servicios"],
  },
  {
    id: "vacaciones",
    etiqueta: "Vacaciones",
    sufijoRussell: "39",
    subcuentasPuc: ["39"],
    patrones: [/vacacion|vacac/],
    sinonimos: ["vacacion"],
  },
  {
    id: "primas_extralegales",
    etiqueta: "Primas extralegales",
    sufijoRussell: "95",
    subcuentasPuc: ["42"],
    patrones: [/prima extralegal|prima de vacaciones|prima de navidad|prima extra/],
    sinonimos: ["prima extralegal", "extralegales"],
  },
  {
    id: "auxilios",
    etiqueta: "Auxilios",
    sufijoRussell: "95",
    subcuentasPuc: ["45"],
    patrones: [/auxilio|subsidio|aux\.? /],
    sinonimos: ["auxilio", "auxilios y subsidios"],
  },
  {
    id: "bonificaciones",
    etiqueta: "Bonificaciones",
    sufijoRussell: "95",
    subcuentasPuc: ["48"],
    patrones: [/bonif|bono|gratificacion|premio|incentivo/],
    sinonimos: ["bonificacion", "bonos", "bonificaciones y bonos"],
  },
  {
    id: "dotacion",
    etiqueta: "Dotación y suministro a trabajadores",
    sufijoRussell: "95",
    subcuentasPuc: ["51"],
    patrones: [/dotacion|uniforme/],
    sinonimos: ["dotacion"],
  },
  {
    id: "seguros",
    etiqueta: "Seguros",
    sufijoRussell: "95",
    subcuentasPuc: ["54"],
    patrones: [/seguro de vida|poliza/],
    sinonimos: ["seguro"],
  },
  {
    id: "indemnizaciones",
    etiqueta: "Indemnizaciones",
    sufijoRussell: "95",
    subcuentasPuc: ["60"],
    patrones: [/indemniz|liquidacion (de )?contrato|sancion moratoria/],
    sinonimos: ["indemnizacion", "indemnizaciones laborales"],
  },
  {
    id: "capacitacion",
    etiqueta: "Capacitación al personal",
    sufijoRussell: "95",
    subcuentasPuc: ["63"],
    patrones: [/capacitacion|formacion/],
    sinonimos: ["capacitacion"],
  },
  {
    id: "gastos_deportivos",
    etiqueta: "Gastos deportivos y de recreación",
    sufijoRussell: "95",
    subcuentasPuc: ["66"],
    patrones: [/deport|recreacion/],
    sinonimos: ["recreacion"],
  },
  {
    id: "aportes_arl",
    etiqueta: "Aportes ARL",
    sufijoRussell: "68",
    subcuentasPuc: ["68"],
    patrones: [/\barl\b|riesgos? (laboral|profesional)|\barp\b/],
    sinonimos: ["arl", "aportes arl", "riesgos laborales"],
    aportePatronal: true,
  },
  {
    id: "aportes_eps",
    etiqueta: "Aportes EPS",
    sufijoRussell: "69",
    subcuentasPuc: ["69"],
    patrones: [/\beps\b|salud|entidades? de salud|\bsalud\b/],
    sinonimos: ["eps", "aportes eps", "aportes salud", "salud"],
    aportePatronal: true,
  },
  {
    id: "aportes_pension",
    etiqueta: "Aportes pensión",
    sufijoRussell: "70",
    subcuentasPuc: ["70"],
    patrones: [/pension|\bafp\b|fondo de pensiones|colpensiones|proteccion|porvenir|colfondos/],
    sinonimos: ["pension", "aportes pension", "afp", "fondos de pensiones"],
    aportePatronal: true,
  },
  {
    id: "caja_compensacion",
    etiqueta: "Aportes caja de compensación",
    sufijoRussell: "95",
    subcuentasPuc: ["72"],
    patrones: [/caja de comp|comfama|comfenalco|compensar|colsubsidio|comfandi|cafam|\bccf\b/],
    sinonimos: ["caja de compensacion", "ccf", "comfama"],
    aportePatronal: true,
  },
  {
    id: "aportes_icbf",
    etiqueta: "Aportes ICBF",
    sufijoRussell: "95",
    subcuentasPuc: ["75"],
    patrones: [/icbf|bienestar familiar/],
    sinonimos: ["icbf"],
    aportePatronal: true,
  },
  {
    id: "aportes_sena",
    etiqueta: "Aportes SENA",
    sufijoRussell: "95",
    subcuentasPuc: ["78"],
    patrones: [/\bsena\b/],
    sinonimos: ["sena"],
    aportePatronal: true,
  },
  {
    id: "gastos_medicos",
    etiqueta: "Gastos médicos y drogas",
    sufijoRussell: "95",
    subcuentasPuc: ["84"],
    patrones: [/medic|droga|examen/],
    sinonimos: ["gastos medicos"],
  },
  {
    id: "otros",
    etiqueta: "Otros",
    sufijoRussell: "95",
    subcuentasPuc: ["95"],
    patrones: [],
    sinonimos: ["otro", "otros conceptos"],
  },
];

/** Etiqueta PUC de cada subcuenta del gasto de personal (dígitos 5-6), común a los clientes. */
export const SUBCUENTAS_PUC_NOMINA: Readonly<Record<string, string>> = {
  "03": "Salario integral",
  "06": "Sueldos",
  "09": "Jornales",
  "12": "Dominicales y festivos",
  "15": "Horas extras y recargos",
  "18": "Comisiones",
  "21": "Viáticos",
  "24": "Incapacidades",
  "27": "Auxilio de transporte",
  "30": "Cesantías",
  "33": "Intereses sobre cesantías",
  "36": "Prima de servicios",
  "39": "Vacaciones",
  "42": "Primas extralegales",
  "45": "Auxilios",
  "48": "Bonificaciones",
  "51": "Dotación y suministro a trabajadores",
  "54": "Seguros",
  "57": "Cuotas partes pensiones de jubilación",
  "58": "Amortización cálculo actuarial",
  "59": "Pensiones de jubilación",
  "60": "Indemnizaciones laborales",
  "63": "Capacitación al personal",
  "66": "Gastos deportivos y de recreación",
  "68": "Aportes ARL",
  "69": "Aportes EPS",
  "70": "Aportes fondos de pensiones",
  "72": "Aportes cajas de compensación familiar",
  "75": "Aportes ICBF",
  "78": "Aportes SENA",
  "81": "Aportes sindicales",
  "84": "Gastos médicos y drogas",
  "95": "Otros",
};

const POR_ID = new Map(GRUPOS_CONCEPTO_NOMINA.map((g) => [g.id, g]));

export function grupoConcepto(id: string | null | undefined): GrupoConceptoNomina | null {
  return id ? POR_ID.get(id) ?? null : null;
}

/** Sin acentos, minúsculas, espacios colapsados: la forma en que se comparan nombres y grupos. */
export function normalizarTextoConcepto(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Grupo que el usuario escribió en la plantilla («Prima», «Cesantías», «horas extras») → id del
 * catálogo. Acepta el id, la etiqueta o un sinónimo, sin acentos ni mayúsculas. `null` si no se
 * reconoce: la carga lo dice fila a fila en vez de adivinar.
 */
export function normalizarGrupoConcepto(texto: unknown): string | null {
  const t = normalizarTextoConcepto(texto);
  if (!t) return null;
  for (const g of GRUPOS_CONCEPTO_NOMINA) {
    if (g.id === t || g.id.replace(/_/g, " ") === t) return g.id;
    if (normalizarTextoConcepto(g.etiqueta) === t) return g.id;
    if (g.sinonimos.some((s) => normalizarTextoConcepto(s) === t)) return g.id;
  }
  return null;
}

/**
 * Grupo sugerido por el NOMBRE del concepto («AUXILIO DE TRANSPORTE» → auxilio_transporte,
 * «INTERESES CESANTIAS» → intereses_cesantias, «SALARIO BASICO» → sueldos). Los grupos más
 * específicos van primero en el catálogo para que «auxilio de transporte» no caiga en
 * «auxilios» ni «intereses cesantías» en «cesantías». `null` si ningún patrón aplica: la
 * sugerencia nunca inventa; a lo sumo el llamador cae en «otros».
 */
export function sugerirGrupoConcepto(nombre: unknown): string | null {
  const t = normalizarTextoConcepto(nombre);
  if (!t) return null;
  // Las deducciones de pensión/salud del empleado no son aportes patronales: se dejan al
  // llamador (la cuenta destino manda). Aquí solo se reconoce la familia.
  const orden: readonly string[] = [
    "intereses_cesantias",
    "auxilio_transporte",
    "primas_extralegales",
    "horas_extras",
    "incapacidades",
    "indemnizaciones",
    "comisiones",
    "viaticos",
    "cesantias",
    "prima",
    "vacaciones",
    "bonificaciones",
    "dotacion",
    "capacitacion",
    "gastos_deportivos",
    "aportes_arl",
    "caja_compensacion",
    "aportes_icbf",
    "aportes_sena",
    "aportes_pension",
    "aportes_eps",
    "gastos_medicos",
    "seguros",
    "auxilios",
    "sueldos",
  ];
  for (const id of orden) {
    const g = POR_ID.get(id);
    if (g && g.patrones.some((p) => p.test(t))) return g.id;
  }
  return null;
}

/** Grupo al que pertenece una subcuenta PUC (dígitos 5-6 de la cuenta del cliente). */
export function grupoPorSubcuentaPuc(subcuenta: string | null | undefined): string | null {
  if (!subcuenta) return null;
  const s = subcuenta.padStart(2, "0").slice(-2);
  return GRUPOS_CONCEPTO_NOMINA.find((g) => g.subcuentasPuc.includes(s))?.id ?? null;
}

/** Etiqueta PUC de la subcuenta, o «Subcuenta xx» si no está en la tabla. */
export function etiquetaSubcuentaPuc(subcuenta: string): string {
  return SUBCUENTAS_PUC_NOMINA[subcuenta] ?? `Subcuenta ${subcuenta}`;
}
