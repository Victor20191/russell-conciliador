// % DE COINCIDENCIA de cada renglón del cruce por tercero — puro, sin BD.
//
// Responde de un vistazo «¿este tercero cruzó con algo del otro lado, CONTRA QUÉ, y qué tan bien?»:
//  - CRUZADO (el tercero está en la contabilidad y en el auxiliar): identidad × valor. La
//    identidad es 100 con la clave exacta o un emparejamiento que confirmó el auditor, y menos
//    cuando la unión la hizo el sistema solo (por DV, por núcleo). El valor es la parte común
//    de los dos saldos (el menor sobre el mayor; signos opuestos no tienen nada en común).
//  - CANDIDATO (el tercero está en un solo lado y hay alguien en el otro que probablemente es
//    él): la confianza de que es el mismo tercero. Viene de la validación de coherencia (NIT con
//    DV o sufijo, núcleo, saldo, nombre) o de que su saldo es EXACTAMENTE la diferencia de otro
//    tercero con descuadre (`explicaDiferencia`).
//  - SIN CRUCE (en un solo lado y sin candidato): 0 %.
// Los renglones sin saldo en ningún lado no tienen nada que cruzar: devuelven null.
// `contra` es la línea visible bajo el %: con quién cruzó o a quién se propone.
import { describirSenales, type SenalCoherencia } from "./coherencia-tercero";
import type { FilaCruceTerceroCartera } from "./cruce-tercero-cartera";

export type TipoCoincidencia = "cruzado" | "candidato" | "sin_cruce";

export type CoincidenciaTercero = {
  /** 0–100, entero. */
  porcentaje: number;
  tipo: TipoCoincidencia;
  /** Confianza en que los dos lados son el mismo tercero (0–100). */
  identidad: number;
  /** Parte común de los saldos (0–100); null cuando no hay saldo del otro lado con qué comparar. */
  valor: number | null;
  /** Contra qué se calculó, en una línea corta visible. */
  contra: string;
  /** Tercero del otro lado que se propone (candidato) o que explica la diferencia; null si no hay. */
  propuesto: { clave: string; nombre: string | null } | null;
  explicacion: string;
};

/** Confianza de identidad cuando la unión la hizo el sistema sin el auditor. */
const IDENTIDAD_POR_DV = 95;
const IDENTIDAD_POR_NUCLEO = 85;

/** Probabilidad aportada por cada señal de coherencia; se combinan como evidencias independientes. */
const PROBABILIDAD_SENAL: Record<SenalCoherencia, number> = {
  nit_dv: 0.95,
  nit_prefijo: 0.8,
  nucleo: 0.8,
  saldo: 0.7,
  nombre: 0.6,
};

/** Confianza (0–100) de que dos terceros son el mismo, por las señales que los unen. */
export function confianzaSenales(senales: readonly SenalCoherencia[]): number {
  if (senales.length === 0) return 0;
  const noEsElMismo = senales.reduce((p, s) => p * (1 - PROBABILIDAD_SENAL[s]), 1);
  return Math.floor((1 - noEsElMismo) * 100);
}

/**
 * Parte común de dos saldos (0–100). Iguales → 100; signos opuestos o uno en cero → 0. Se
 * trunca hacia abajo: una diferencia de centavos sobre un saldo grande no se lee como 100 %.
 */
export function similitudSaldos(a: number, b: number, tolerancia = 0.01): number {
  if (Math.abs(a - b) <= tolerancia) return 100;
  if (a === 0 || b === 0 || Math.sign(a) !== Math.sign(b)) return 0;
  const [menor, mayor] = Math.abs(a) <= Math.abs(b) ? [Math.abs(a), Math.abs(b)] : [Math.abs(b), Math.abs(a)];
  return Math.min(99, Math.floor((menor / mayor) * 100));
}

const nombrar = (clave: string, nombre: string | null) =>
  clave.startsWith("~") ? `«${nombre ?? clave.slice(1)}» (sin NIT)` : nombre ? `${clave} ${nombre}` : clave;

const LADO = { contable: "contabilidad", modulo: "auxiliar" } as const;

export function coincidenciaTercero(
  fila: Pick<
    FilaCruceTerceroCartera,
    "clave" | "estado" | "contable" | "modulo" | "diferencia" | "claveModuloPorDv" | "claveModuloPorNucleo" | "emparejadoDesde" | "sugerencia" | "explicaDiferencia"
  >,
  tolerancia = 0.01,
): CoincidenciaTercero | null {
  if (fila.estado === "sin_saldo") return null;
  const compensa = fila.explicaDiferencia ?? null;

  if (fila.estado === "cuadra" || fila.estado === "descuadre") {
    const valor = fila.estado === "cuadra" ? 100 : similitudSaldos(fila.contable.total, fila.modulo.total, tolerancia);
    const [identidad, contraQuien, como] = fila.claveModuloPorDv
      ? [IDENTIDAD_POR_DV, `con ${fila.claveModuloPorDv} del auxiliar (por DV)`, `unido por el sistema con ${fila.claveModuloPorDv} (NIT + dígito de verificación)`]
      : fila.claveModuloPorNucleo
        ? [IDENTIDAD_POR_NUCLEO, `con ${fila.claveModuloPorNucleo} del auxiliar (por núcleo)`, `unido por el sistema con ${fila.claveModuloPorNucleo} (mismos nueve dígitos)`]
        : fila.emparejadoDesde.length > 0
          ? [100, `con ${fila.emparejadoDesde.join(", ")} del auxiliar (emparejado)`, "emparejado por el auditor"]
          : [100, "mismo NIT en el auxiliar", "mismo NIT en los dos lados"];
    const saldos = fila.estado === "cuadra" ? "saldos iguales" : `saldos ${valor} % iguales`;
    const partes = [`Cruzó: ${como} (identidad ${identidad} %); ${saldos}.`];
    if (compensa) {
      partes.push(`La diferencia es exactamente el saldo de ${nombrar(compensa.clave, compensa.nombre)}, que solo está en ${LADO[compensa.ladoSuelto]}: probablemente es este mismo tercero con otro NIT.`);
    }
    return {
      porcentaje: Math.floor((identidad * valor) / 100),
      tipo: "cruzado",
      identidad,
      valor,
      contra: compensa ? `${contraQuien} · diferencia = saldo de ${nombrar(compensa.clave, compensa.nombre)}` : `${contraQuien} · ${saldos}`,
      propuesto: compensa ? { clave: compensa.clave, nombre: compensa.nombre } : null,
      explicacion: partes.join(" "),
    };
  }

  const otroLado = fila.estado === "solo_contable" ? "el auxiliar" : "la contabilidad";
  if (fila.sugerencia) {
    const identidad = confianzaSenales(fila.sugerencia.senales);
    const quien = nombrar(fila.sugerencia.clave, fila.sugerencia.nombre);
    return {
      porcentaje: identidad,
      tipo: "candidato",
      identidad,
      valor: null,
      contra: `posible ${quien} (${describirSenales(fila.sugerencia.senales)})`,
      propuesto: { clave: fila.sugerencia.clave, nombre: fila.sugerencia.nombre },
      explicacion: `No cruzó, pero en ${otroLado} hay un candidato: ${quien}, por ${describirSenales(fila.sugerencia.senales)}. Confírmalo para que cruce.`,
    };
  }
  if (compensa) {
    const identidad = confianzaSenales(compensa.nombreParecido ? ["saldo", "nombre"] : ["saldo"]);
    const quien = nombrar(compensa.clave, compensa.nombre);
    return {
      porcentaje: identidad,
      tipo: "candidato",
      identidad,
      valor: null,
      contra: `su saldo = la diferencia de ${quien}`,
      propuesto: { clave: compensa.clave, nombre: compensa.nombre },
      explicacion: `No cruzó con su NIT, pero su saldo es exactamente la diferencia de ${quien}${compensa.nombreParecido ? ", que además tiene un nombre parecido" : ""}: probablemente es el mismo tercero registrado con otro NIT.`,
    };
  }
  return {
    porcentaje: 0,
    tipo: "sin_cruce",
    identidad: 0,
    valor: null,
    contra: `nada en ${otroLado} con este NIT ni parecido`,
    propuesto: null,
    explicacion: `No cruzó con nada: no hay en ${otroLado} un tercero con el mismo NIT, ni un candidato parecido, ni una diferencia que su saldo explique.`,
  };
}
