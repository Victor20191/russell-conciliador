/**
 * Hoja 2 del recibo 2593: «Liquidación del componente ICA consolidado territorial bimestral por
 * municipio o distrito». Una página por municipio, con su base gravable (84 a 90), hasta 15
 * actividades (CIIU, ingresos gravados, tarifa por mil e impuesto, casillas 91 a 94), los valores a
 * pagar del ICA (95 a 105) y la sección informativa (106 a 108). Puro: tipos, etiquetas y controles.
 *
 * La hoja 2 se guarda dentro de la lectura del formulario (`lectura_json`, campo `ica`) y se
 * normaliza con la hoja 1 (`normalizarLectura`). Sus controles avisan sin bloquear, como las demás
 * fórmulas del 2593; los que la amarran a la hoja 1 son Σ104 = 76, Σ99 = 43, Σ84 = 39 y Σ106 = 37.
 */

/** Lo que devuelve la IA por cada página de la hoja 2: todo como texto. */
export type IcaMunicipioCrudo = {
  pagina: string;
  departamento: string;
  codigoDepartamento: string;
  municipio: string;
  codigoMunicipio: string;
  renglones: { renglon: number; valor: string }[];
  actividades: { ciiu: string; ingresosGravados: string; tarifaPorMil: string; impuesto: string }[];
  /** Casilla 107 (X si la tarifa la adoptó e informó el municipio). */
  tarifaDelMunicipio: string;
  /** Casilla 108 (X si la informó el contribuyente). */
  tarifaDelContribuyente: string;
};

export type ActividadIca = { ciiu: string | null; ingresosGravados: number; tarifaPorMil: number | null; impuesto: number };

export type MunicipioIca = {
  pagina: number | null;
  departamento: string | null;
  codigoDepartamento: string | null;
  municipio: string | null;
  codigoMunicipio: string | null;
  /** Importes de las casillas 84 a 90 y 95 a 106 (sin los que no vinieron). */
  valores: Record<number, number>;
  actividades: ActividadIca[];
  /** Quién informó la tarifa (107 o 108); null si no se marcó. */
  origenTarifa: "municipio" | "contribuyente" | null;
};

/** Casillas con importe de cada municipio, en el orden del formulario. */
export const ETIQUETAS_ICA: Readonly<Record<number, string>> = {
  84: "Ingresos brutos bimestrales en este municipio o distrito",
  85: "Por devoluciones, rebajas y descuentos",
  86: "Por exportaciones",
  87: "Por venta de activos fijos",
  88: "Por actividades excluidas o no sujetas y otros ingresos no gravados",
  89: "Por otras actividades exentas en este municipio o distrito",
  90: "Total ingresos gravables bimestrales (84 − 85 − 86 − 87 − 88 − 89)",
  95: "Total impuesto de industria y comercio consolidado bimestral (Σ 94)",
  96: "Exención o exoneración sobre el impuesto",
  97: "Total saldo a cargo ICA consolidado bimestral (95 − 96)",
  98: "Otros beneficios e incentivos",
  99: "Total componente ICA consolidado bimestral (97 − 98)",
  100: "Retenciones o autorretenciones de ICA antes de pertenecer al SIMPLE",
  101: "Saldo componente ICA consolidado bimestral (99 − 100)",
  102: "Intereses causados por ICA en el municipio (art. 804 E.T.)",
  103: "Pagos anteriores de ICA al municipio por este período",
  104: "Saldo a pagar componente ICA territorial (99 + 102 − 100 − 103)",
  105: "Saldo a favor a solicitar en el municipio (100 + 103 − 99 − 102)",
  106: "Ingresos por ganancias ocasionales en el municipio (informativo)",
};

export const RENGLONES_ICA: readonly number[] = Object.keys(ETIQUETAS_ICA).map(Number);

/** La tarifa por mil como número («9,66», «9.66», «11,04 x mil» → 9.66 / 11.04); null si no hay número. */
export function aTarifaPorMil(texto: string | null | undefined): number | null {
  const m = /(\d+(?:[.,]\d+)?)/.exec((texto ?? "").replace(/\s+/g, ""));
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Cómo se nombra un municipio en los mensajes: su nombre, o su página. */
export function nombreMunicipioIca(m: Pick<MunicipioIca, "municipio" | "departamento" | "pagina">, indice: number): string {
  if (m.municipio) return m.departamento ? `${m.municipio} (${m.departamento})` : m.municipio;
  return m.pagina != null ? `página ${m.pagina}` : `municipio ${indice + 1}`;
}

export type ControlIca = { clave: string; ok: boolean; mensaje: string };

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
const piso = (n: number) => Math.max(0, n);
const suma = (valores: readonly number[]) => valores.reduce((s, v) => s + v, 0);
/** El impuesto de una actividad se aproxima a miles: hasta $500 de diferencia es redondeo. */
const REDONDEO_MILES = 500;

/** Las fórmulas de un municipio que no cuadran, en texto («el 90 dice … y 84 − … da …»). */
export function fallasMunicipioIca(m: MunicipioIca): string[] {
  const v = (r: number) => m.valores[r] ?? 0;
  const fallas: string[] = [];
  const revisar = (renglon: number, esperado: number, formula: string) => {
    if (Math.round(v(renglon)) !== Math.round(esperado)) fallas.push(`el ${renglon} dice ${pesos(v(renglon))} y ${formula} da ${pesos(esperado)}`);
  };
  revisar(90, piso(v(84) - v(85) - v(86) - v(87) - v(88) - v(89)), "84 − 85 − 86 − 87 − 88 − 89");
  m.actividades.forEach((a, i) => {
    if (a.tarifaPorMil == null) return;
    const calculado = (a.ingresosGravados * a.tarifaPorMil) / 1000;
    if (Math.abs(a.impuesto - calculado) > REDONDEO_MILES) {
      fallas.push(`la actividad ${a.ciiu ?? i + 1} tiene impuesto ${pesos(a.impuesto)} y ${pesos(a.ingresosGravados)} × ${a.tarifaPorMil} por mil da ${pesos(calculado)}`);
    }
  });
  if (m.actividades.length > 0) revisar(95, suma(m.actividades.map((a) => a.impuesto)), "la suma de los 94");
  revisar(97, piso(v(95) - v(96)), "95 − 96");
  revisar(99, piso(v(97) - v(98)), "97 − 98");
  revisar(101, piso(v(99) - v(100)), "99 − 100");
  revisar(104, piso(v(99) + v(102) - v(100) - v(103)), "99 + 102 − 100 − 103");
  revisar(105, piso(v(100) + v(103) - v(99) - v(102)), "100 + 103 − 99 − 102");
  return fallas;
}

/**
 * Controles de la hoja 2 contra sí misma y contra la hoja 1 (`hoja1`: los valores del 2593). Sin
 * municipios avisa que no se leyó: el instructivo pide la hoja 2 en todo recibo, aun sin operaciones.
 */
export function controlesIca(hoja1: Readonly<Record<number, number>>, municipios: readonly MunicipioIca[]): ControlIca[] {
  if (municipios.length === 0) {
    return [{ clave: "ica_hoja2", ok: false, mensaje: "No se leyó la hoja 2 (ICA por municipio). Si el recibo la trae, vuelve a importarlo para guardarla." }];
  }
  const total = (r: number) => suma(municipios.map((m) => m.valores[r] ?? 0));
  const cruce = (clave: string, renglonHoja1: number, renglonHoja2: number, texto: string): ControlIca => {
    const hoja2 = total(renglonHoja2);
    const enHoja1 = hoja1[renglonHoja1] ?? 0;
    const ok = Math.round(hoja2) === Math.round(enHoja1);
    return {
      clave,
      ok,
      mensaje: ok
        ? `Hoja 2: la suma de los ${renglonHoja2} cuadra con el ${renglonHoja1} (${texto})`
        : `Hoja 2: la suma de los ${renglonHoja2} de ${municipios.length === 1 ? "el municipio" : `los ${municipios.length} municipios`} da ${pesos(hoja2)} y el ${renglonHoja1} (${texto}) dice ${pesos(enHoja1)}.`,
    };
  };
  const controles: ControlIca[] = [
    cruce("ica_76", 76, 104, "ICA a pagar"),
    cruce("ica_43", 43, 99, "ICA consolidado liquidado"),
    cruce("ica_39", 39, 84, "ingresos brutos bimestrales"),
  ];
  if (total(106) !== 0 || (hoja1[37] ?? 0) !== 0) controles.push(cruce("ica_37", 37, 106, "ganancias ocasionales en el país"));
  municipios.forEach((m, i) => {
    const fallas = fallasMunicipioIca(m);
    const nombre = nombreMunicipioIca(m, i);
    const actividades = m.actividades.length === 1 ? "1 actividad" : `${m.actividades.length} actividades`;
    controles.push({
      clave: `ica_municipio_${i + 1}`,
      ok: fallas.length === 0,
      mensaje: fallas.length === 0
        ? `Hoja 2 · ${nombre}: las fórmulas cuadran (${actividades})`
        : `Hoja 2 · ${nombre}: ${fallas.slice(0, 3).join("; ")}${fallas.length > 3 ? ` (y ${fallas.length - 3} más)` : ""}.`,
    });
  });
  return controles;
}
