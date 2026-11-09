/**
 * MARCAS DE AUDITORÍA sobre las diferencias del cruce contable de un módulo.
 *
 * Lógica PURA (sin BD): decide qué filas del cruce admiten marca, les pega las que ya
 * existan, numera lo que falte y resume cuánto queda sin marcar o sin explicar. La persistencia vive en
 * `marca_cruce_modulo` y las Server Actions de `modulos-datos.ts`.
 *
 * El modelo es el del papel de trabajo: la cédula (la tabla del cruce) solo lleva la marca
 * numerada —①②③— y el detalle (la observación, la referencia al anexo y los soportes) vive
 * al pie, en la zona de observaciones. Antes esto era una «justificación» escrita dentro de
 * la propia celda; el número es lo que ahora amarra la cifra con su explicación.
 *
 * La marca se guarda por (cliente, módulo, período, cuenta) —no por cargue—, así que
 * sobrevive a las versiones nuevas del período. Como el monto SÍ puede cambiar entre
 * versiones, se congela el que se marcó: si la diferencia actual ya no coincide, la fila
 * queda `desactualizada` para que alguien la revise en vez de darla por explicada.
 */
import { CLAVE_SIN_CUENTA, cuentasDeClaveCruce, type FilaCruceContable, type HijoContableCruce } from "./cruce-contable";
import type { FilaCruceTerceroCartera } from "./cartera/cruce-tercero-cartera";
import type { FilaControlDeducciones } from "./nomina/cruce-nomina";
import { requiereMarcaPorUmbral } from "@/lib/balance/umbrales-alertas";

/** Tolerancia por defecto del cruce (la misma de `construirCruceContable`): decide si la fila cuadra. */
export const TOLERANCIA_CRUCE = 0.01;

/** Soporte adjunto a una marca (el anexo digital). */
export type AdjuntoMarca = {
  id: number;
  nombreArchivo: string;
  tipoContenido: string;
  tamanoBytes: number;
};

/** Cuenta del cliente excluida por esta marca: no hace parte de la conciliación del módulo. */
export type CuentaNoModular = {
  cuenta8: string;
  nombre: string;
  /** Lo que valía la cuenta cuando se excluyó (constancia; se resta el valor actual). */
  valorAlMarcar: number;
};

/**
 * Qué explica una marca: una cuenta de la cédula contable, un tercero del cruce por tercero o una
 * cuenta del cliente del control de deducciones de Nómina (`control`, 17/Oct/2026).
 */
export type DimensionMarca = "cuenta4" | "tercero" | "control";

export type MarcaCruce = {
  /** Sin valor, una marca de cuenta (las marcas anteriores al cruce por tercero). */
  dimension?: DimensionMarca;
  /** Cuenta Russell de 4 dígitos; vacía en las marcas de tercero. */
  cuenta4: string;
  /** Clave del tercero en las marcas de dimensión `tercero`. */
  clave?: string | null;
  /** Correlativo dentro del período; es lo que se pinta en la cédula. */
  numero: number;
  nota: string;
  /** Referencia al anexo del papel de trabajo (p. ej. «Anexo A-3»). */
  referenciaAnexo: string | null;
  /** Diferencia del renglón cuando se escribió la marca (snapshot). */
  diferencia: number;
  /**
   * Cuánto de la diferencia del renglón explica esta marca, con su signo (9/Nov/2026: un renglón
   * puede llevar varias). Ausente en las marcas anteriores: explican toda su `diferencia`.
   */
  monto?: number;
  marcadoPor: string | null;
  /** Fecha ya formateada para la UI. */
  marcadoEn: string;
  /** Comentario del hilo de la cuenta donde quedó el rastro, si se registró. */
  comentarioId: number | null;
  adjuntos: AdjuntoMarca[];
  /** Cuentas del cliente que esta marca excluyó de la conciliación (puede estar vacío). */
  noModulares: CuentaNoModular[];
  /**
   * Solo la marca del renglón del saldo sin cuenta (`CLAVE_SIN_CUENTA`): los clasificadores que
   * excluyó del lado del módulo, con su total cuando se marcaron.
   */
  clasificadoresNoModulares?: ClasificadorNoModular[];
};

export type ClasificadorNoModular = { clasificador: string; totalAlMarcar: number };

/** Lo que explica una marca: su monto o, en las anteriores al 9/Nov/2026, toda la diferencia que congeló. */
export function montoDeMarca(marca: Pick<MarcaCruce, "monto" | "diferencia">): number {
  return marca.monto ?? marca.diferencia;
}

/** Las marcas de un renglón y cuánto de su cifra explican entre todas. */
export type MarcasDelRenglon = {
  /** Por número. Vacío si el renglón no tiene marcas. */
  marcas: MarcaCruce[];
  /** Σ de los montos de sus marcas. */
  explicado: number;
  /** La cifra del renglón menos lo explicado: lo que todavía falta por explicar. */
  porExplicar: number;
  /**
   * Tiene marcas, pero lo que falta por explicar alcanza la tolerancia del renglón (falta monto o
   * la diferencia cambió después de marcar). Impide cerrar como una diferencia sin marca.
   */
  desactualizada: boolean;
};

/**
 * Explica un renglón con sus marcas. Queda explicado cuando lo que falta (la cifra menos la suma de
 * los montos) es de un centavo o menos, o no alcanza `umbral` (la misma tolerancia con que el
 * renglón exige marca).
 */
export function explicarRenglon(
  cifra: number,
  marcas: readonly MarcaCruce[],
  opciones: { admite: boolean; umbral: number; tolerancia?: number },
): MarcasDelRenglon {
  const tolerancia = opciones.tolerancia ?? TOLERANCIA_CRUCE;
  const ordenadas = [...marcas].sort((a, b) => a.numero - b.numero);
  const explicado = redondear(ordenadas.reduce((s, m) => s + montoDeMarca(m), 0));
  const porExplicar = redondear(cifra - explicado);
  const cubierto = Math.abs(porExplicar) <= tolerancia || (opciones.umbral > 0 && !requiereMarcaPorUmbral(porExplicar, opciones.umbral));
  return {
    marcas: ordenadas,
    explicado,
    porExplicar,
    desactualizada: ordenadas.length > 0 && opciones.admite && !cubierto,
  };
}

/** Agrupa las marcas por la llave de su renglón. */
function agruparPorRenglon(marcas: readonly MarcaCruce[], llave: (m: MarcaCruce) => string | null): Map<string, MarcaCruce[]> {
  const porRenglon = new Map<string, MarcaCruce[]>();
  for (const m of marcas) {
    const k = llave(m);
    if (k == null) continue;
    const lista = porRenglon.get(k);
    if (lista) lista.push(m);
    else porRenglon.set(k, [m]);
  }
  return porRenglon;
}

/** Clasificador del renglón del saldo sin cuenta: lo que se ve al expandirlo. */
export type HijoModuloSinCuenta = { clasificador: string; total: number; noModular: boolean };

export type FilaCruceMarcada = FilaCruceContable & MarcasDelRenglon & {
  /** Solo las filas que NO cuadran admiten marca. */
  admiteMarca: boolean;
  /**
   * La diferencia alcanza la tolerancia de la cédula (`cedula_modulos` de `/config/parametros`):
   * sin marcas que la expliquen, impide cerrar. Por debajo la marca es opcional.
   */
  requiereMarca: boolean;
};

export type ResumenMarcas = {
  /** Filas con diferencia (las que admiten marca). */
  conDiferencia: number;
  marcadas: number;
  /** Con diferencia y sin marcar. */
  pendientes: number;
  /** Con marcas que no alcanzan a explicar su diferencia (falta monto o la diferencia cambió). */
  desactualizadas: number;
  /** Suma de las diferencias todavía sin marcar. */
  montoPendiente: number;
  /** Suma de lo que falta por explicar en los renglones con marcas que no alcanzan. */
  montoPorExplicar?: number;
  /** Diferencias por debajo de la tolerancia (cédula) o del umbral (tercero): no exigen marca. */
  bajoUmbral?: number;
};

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

/**
 * Activos fijos: ¿el costo o la depreciación del renglón difieren, aunque el neto cuadre? Es la
 * reclasificación entre columnas que la cédula avisa con «Revisar columnas».
 */
function detalleDescuadrado(fila: Pick<FilaCruceContable, "columnas">, tolerancia: number): boolean {
  const c = fila.columnas;
  return !!c && (Math.abs(c.costo.diferencia) > tolerancia || Math.abs(c.depreciacion.diferencia) > tolerancia);
}

/**
 * ¿La fila del cruce admite marca? Las que no cuadran y, en Activos fijos, también las que cuadran
 * por el neto pero tienen el costo o la depreciación descuadrados.
 */
export function admiteMarca(fila: Pick<FilaCruceContable, "cuadra"> & Partial<Pick<FilaCruceContable, "columnas">>, tolerancia = TOLERANCIA_CRUCE): boolean {
  return !fila.cuadra || detalleDescuadrado(fila, tolerancia);
}

/**
 * ¿La marca de esta fila se apoya en el DETALLE (Activos fijos) y no en el neto? Cuando el neto queda
 * dentro de la tolerancia de la cédula y el costo difiere, la marca explica la reclasificación: congela
 * la diferencia del costo y por ella sabe si quedó desactualizada. Con cuentas excluidas o conceptos
 * no contabilizados se queda en el neto, que es lo que esas exclusiones ajustan.
 */
export function marcaPorDetalle(
  fila: Pick<FilaCruceContable, "cuadra" | "diferencia"> & Partial<Pick<FilaCruceContable, "columnas">>,
  toleranciaMarca: number,
  sinExclusiones: boolean,
): boolean {
  const netoTolerado = fila.cuadra || !requiereMarcaPorUmbral(fila.diferencia, toleranciaMarca);
  return sinExclusiones && netoTolerado && !!fila.columnas && Math.abs(fila.columnas.costo.diferencia) > TOLERANCIA_CRUCE;
}

/** La cifra que una marca congela (y contra la que se compara): el neto o, por detalle, el costo. */
export function diferenciaQueCongelaLaMarca(
  fila: Pick<FilaCruceContable, "cuadra" | "diferencia"> & Partial<Pick<FilaCruceContable, "columnas">>,
  toleranciaMarca: number,
  sinExclusiones: boolean,
): number {
  return marcaPorDetalle(fila, toleranciaMarca, sinExclusiones) ? fila.columnas!.costo.diferencia : fila.diferencia;
}

const marcaSinExclusiones = (m: MarcaCruce) => m.noModulares.length === 0 && (m.clasificadoresNoModulares?.length ?? 0) === 0;

/**
 * Pega a cada fila del cruce sus marcas y resume lo pendiente. Un renglón puede llevar varias:
 * queda explicado cuando la suma de sus montos cubre su cifra (`explicarRenglon`).
 *
 * Las marcas de una cuenta que YA cuadra no se pierden ni estorban: la fila deja de admitir
 * marca y no cuenta como pendiente, pero las observaciones siguen viajando en la fila para que
 * la pantalla las muestre como antecedente.
 *
 * `toleranciaMarca` es la tolerancia de la cédula: una diferencia por debajo admite marca pero
 * no la exige (cuenta en `bajoUmbral`). Desde el monto, inclusive, la exige. Sin ella, toda
 * diferencia la exige, como antes del parámetro.
 *
 * `toleranciaDetalle` (Activos fijos, «Detalle de Activos fijos» de `/config/parametros`): con el
 * neto dentro de la tolerancia, si el costo o la depreciación difieren desde ese monto el renglón
 * también exige marca. Sin ella, el detalle solo admite marca opcional.
 */
export function anotarCruceConMarcas(
  filas: readonly FilaCruceContable[],
  marcas: readonly MarcaCruce[],
  opciones?: { tolerancia?: number; toleranciaMarca?: number; toleranciaDetalle?: number },
): { filas: FilaCruceMarcada[]; resumen: ResumenMarcas } {
  const tolerancia = opciones?.tolerancia ?? TOLERANCIA_CRUCE;
  const toleranciaMarca = opciones?.toleranciaMarca ?? 0;
  const toleranciaDetalle = opciones?.toleranciaDetalle;
  const porCuenta = agruparPorRenglon(marcas, (m) => ((m.dimension ?? "cuenta4") === "cuenta4" ? m.cuenta4 : null));

  const anotadas: FilaCruceMarcada[] = filas.map((fila) => {
    const delRenglon = porCuenta.get(fila.cuenta4) ?? [];
    const admite = admiteMarca(fila, tolerancia);
    const netoExige = !fila.cuadra && requiereMarcaPorUmbral(fila.diferencia, toleranciaMarca);
    const detalleExige = !netoExige && toleranciaDetalle != null && !!fila.columnas
      && detalleDescuadrado(fila, tolerancia)
      && (requiereMarcaPorUmbral(fila.columnas.costo.diferencia, toleranciaDetalle) || requiereMarcaPorUmbral(fila.columnas.depreciacion.diferencia, toleranciaDetalle));
    // La cifra que explican las marcas: el neto o, en Activos fijos con el neto tolerado y sin
    // exclusiones, la diferencia del costo (`diferenciaQueCongelaLaMarca`).
    const cifra = diferenciaQueCongelaLaMarca(fila, toleranciaMarca, delRenglon.every(marcaSinExclusiones));
    return {
      ...fila,
      admiteMarca: admite,
      requiereMarca: admite && (netoExige || detalleExige),
      ...explicarRenglon(cifra, delRenglon, { admite, umbral: detalleExige ? toleranciaDetalle ?? 0 : toleranciaMarca, tolerancia }),
    };
  });

  const resumen = anotadas.reduce<ResumenMarcas>(
    (acc, fila) => {
      if (!fila.admiteMarca) return acc;
      if (!fila.requiereMarca) {
        acc.bajoUmbral = (acc.bajoUmbral ?? 0) + 1;
        return acc;
      }
      acc.conDiferencia += 1;
      if (fila.marcas.length > 0) {
        acc.marcadas += 1;
        if (fila.desactualizada) {
          acc.desactualizadas += 1;
          acc.montoPorExplicar = redondear((acc.montoPorExplicar ?? 0) + fila.porExplicar);
        }
      } else {
        acc.pendientes += 1;
        acc.montoPendiente = redondear(acc.montoPendiente + fila.diferencia);
      }
      return acc;
    },
    { conDiferencia: 0, marcadas: 0, pendientes: 0, desactualizadas: 0, montoPendiente: 0, montoPorExplicar: 0, bajoUmbral: 0 },
  );

  return { filas: anotadas, resumen };
}

/** Una observación al pie: la marca y el renglón del cruce al que apunta. */
export type ObservacionDeMarca<F> = { fila: F; marca: MarcaCruce };

/**
 * Las marcas del período ordenadas por número, con la fila del cruce a la que apuntan (un renglón
 * con varias marcas aparece una vez por cada una). Es lo que se pinta al pie, en observaciones:
 * la lista numerada que explica la cédula.
 *
 * Una marca cuya cuenta ya no aparece en el cruce (cambió el mapeo, se recargó el archivo)
 * NO se muestra aquí: sin cifra que explicar, la observación no tiene dónde anclarse.
 */
export function observacionesDeMarcas<F extends { marcas: readonly MarcaCruce[] }>(filas: readonly F[]): ObservacionDeMarca<F>[] {
  return filas
    .flatMap((fila) => fila.marcas.map((marca) => ({ fila, marca })))
    .sort((a, b) => a.marca.numero - b.marca.numero);
}

/**
 * Siguiente número libre del período. Los números NO se reciclan: se toma el mayor usado
 * más uno, aunque haya huecos por marcas retiradas, para que una referencia escrita fuera
 * del sistema («ver marca 3») siga apuntando a lo mismo.
 */
export function siguienteNumeroMarca(numerosUsados: readonly number[]): number {
  return numerosUsados.reduce((max, n) => (Number.isInteger(n) && n > max ? n : max), 0) + 1;
}

/** Etiqueta de la marca tal como se lee en el papel de trabajo. */
export function etiquetaMarca(numero: number): string {
  return `Marca ${numero}`;
}

/**
 * Lee el monto de una marca escrito a mano: formato colombiano («-40.251.565,88», con o sin «$»), o
 * con punto decimal cuando no hay coma y el punto lleva uno o dos decimales («-1234.5»). Paréntesis
 * o «-» para negativos. null si no es un número.
 */
export function leerMontoMarca(texto: string): number | null {
  let t = String(texto ?? "").replace(/[\s$]/g, "");
  if (!t) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) {
    negativo = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    negativo = !negativo;
    t = t.slice(1);
  }
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  // Sin coma, el punto es de miles salvo que lleve uno o dos decimales al final («1234.5»).
  else if (/^\d{1,3}(\.\d{3})+$/.test(t) || !/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return redondear(negativo ? -n : n);
}

/** El monto como se escribe en el campo: «-40.251.565,88». */
export function textoMontoMarca(valor: number): string {
  return valor.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Ancla del hilo de comentarios de una cuenta del cruce (`cruce:1435`). */
export function anclaCruce(cuenta4: string): string {
  return `cruce:${cuenta4}`;
}

/** Ancla HTML de la observación de una marca, para saltar de la cédula al pie. */
export function anclaObservacionMarca(numero: number): string {
  return `marca-${numero}`;
}

/** Cuenta Russell de 4 dígitos normalizada, o null si el texto no lo es. */
export function normalizarCuenta4(valor: string): string | null {
  const soloDigitos = (valor ?? "").replace(/\D/g, "");
  return soloDigitos.length === 4 ? soloDigitos : null;
}

/**
 * Valida las cuentas que el usuario marcó como NO MODULARES: normaliza a dígitos,
 * deduplica y exige que cada una sea hija de la fila del cruce que se está marcando.
 * Una selección vacía es válida: la marca sigue siendo una explicación sin exclusión.
 *
 * Se valida contra el cruce VIGENTE (no contra lo que mandó el formulario) porque entre
 * abrir el modal y guardar pudo recargarse el módulo o cambiar la homologación.
 */
export function validarNoModulares(
  seleccion: readonly string[],
  hijos: readonly HijoContableCruce[],
): { ok: true; cuentas8: string[] } | { ok: false; message: string } {
  const validas = new Set(hijos.map((h) => h.cuenta8));
  const elegidas = new Set<string>();
  for (const cruda of seleccion) {
    const cuenta8 = String(cruda ?? "").replace(/\D/g, "");
    if (!cuenta8) continue;
    if (!validas.has(cuenta8)) {
      return { ok: false, message: `La cuenta ${cuenta8} ya no aparece en esta fila del cruce. Recarga la pantalla e inténtalo de nuevo.` };
    }
    elegidas.add(cuenta8);
  }
  return { ok: true, cuentas8: [...elegidas].sort() };
}

/**
 * Diferencia de la fila una vez restadas las cuentas no modulares elegidas. Es la cifra
 * que se congela en la marca, y la calcula el servidor sobre el cruce vigente.
 */
export function diferenciaAjustada(
  fila: Pick<FilaCruceContable, "contable" | "inventario">,
  hijos: readonly HijoContableCruce[],
  seleccion: readonly string[],
  /** Lo que además se excluye del lado del MÓDULO (conceptos no contabilizados). */
  excluidoModulo = 0,
): number {
  const elegidas = new Set(seleccion);
  const excluido = hijos.reduce((suma, h) => (elegidas.has(h.cuenta8) ? suma + h.valor : suma), 0);
  return redondear(fila.contable - excluido - (fila.inventario - excluidoModulo));
}

/** Σ de los conceptos elegidos como NO CONTABILIZADOS en un renglón del cruce. */
export function totalNoContabilizado(
  conceptos: readonly { clasificador: string; total: number }[],
  seleccion: readonly string[],
): number {
  const elegidos = new Set(seleccion);
  return redondear(conceptos.reduce((suma, c) => (elegidos.has(c.clasificador) ? suma + c.total : suma), 0));
}

/**
 * Gemela de `validarNoModulares` para el renglón del saldo sin cuenta: lo que se excluye son
 * CLASIFICADORES del módulo (tal cual, sin normalizar a dígitos) y cada uno tiene que seguir sin
 * cuenta en el cruce vigente — si entretanto se le asignó cuenta, ya no está en el renglón.
 */
export function validarClasificadoresNoModulares(
  seleccion: readonly string[],
  hijos: readonly Pick<HijoModuloSinCuenta, "clasificador">[],
): { ok: true; clasificadores: string[] } | { ok: false; message: string } {
  const validos = new Set(hijos.map((h) => h.clasificador));
  const elegidos = new Set<string>();
  for (const crudo of seleccion) {
    const clasificador = String(crudo ?? "").trim();
    if (!clasificador) continue;
    if (!validos.has(clasificador)) {
      return { ok: false, message: `«${clasificador}» ya no está en este renglón del cruce. Recarga la pantalla e inténtalo de nuevo.` };
    }
    elegidos.add(clasificador);
  }
  return { ok: true, clasificadores: [...elegidos].sort() };
}

/**
 * Diferencia del renglón del saldo sin cuenta una vez excluidos los clasificadores elegidos: lo
 * excluido se descuenta del lado del MÓDULO. Es la cifra que se congela en su marca.
 */
export function diferenciaAjustadaModulo(
  fila: Pick<FilaCruceContable, "contable" | "noModular" | "inventario">,
  hijos: readonly Pick<HijoModuloSinCuenta, "clasificador" | "total">[],
  seleccion: readonly string[],
): number {
  const elegidos = new Set(seleccion);
  const excluido = hijos.reduce((suma, h) => (elegidos.has(h.clasificador) ? suma + h.total : suma), 0);
  return redondear(fila.contable - fila.noModular - (fila.inventario - excluido));
}

export const MAX_NOTA_MARCA = 2000;
export const MAX_REFERENCIA_ANEXO = 120;

/** Valida la observación escrita por el usuario; devuelve el texto limpio o el error. */
export function validarNotaMarca(nota: string): { ok: true; nota: string } | { ok: false; message: string } {
  const limpia = (nota ?? "").trim();
  if (!limpia) return { ok: false, message: "Escribe el detalle de la marca." };
  if (limpia.length > MAX_NOTA_MARCA) {
    return { ok: false, message: `El detalle de la marca no puede superar ${MAX_NOTA_MARCA} caracteres.` };
  }
  return { ok: true, nota: limpia };
}

/**
 * Valida la referencia al anexo. Es opcional: sin ella la marca sigue siendo válida
 * (no todo hallazgo tiene un anexo en el archivo del cliente).
 */
export function validarReferenciaAnexo(
  referencia: string | null | undefined,
): { ok: true; referencia: string | null } | { ok: false; message: string } {
  const limpia = (referencia ?? "").trim();
  if (!limpia) return { ok: true, referencia: null };
  if (limpia.length > MAX_REFERENCIA_ANEXO) {
    return { ok: false, message: `La referencia al anexo no puede superar ${MAX_REFERENCIA_ANEXO} caracteres.` };
  }
  return { ok: true, referencia: limpia };
}

// ===== Marcas del cruce POR TERCERO =====

/** Un tercero del cruce con su marca. */
export type FilaCruceTerceroMarcada = FilaCruceTerceroCartera & MarcasDelRenglon & {
  /** No cuadra: admite marca, también las diferencias pequeñas que el auditor quiera explicar. */
  admiteMarca: boolean;
  /** La diferencia alcanza «Diferencia por tercero» de `/config/parametros`: sin marcas que la expliquen, impide cerrar. */
  requiereMarca: boolean;
};

export const MAX_CLAVE_TERCERO = 200;

/** Clave de tercero utilizable en una marca o un emparejamiento: texto no vacío y acotado. */
export function normalizarClaveTercero(valor: unknown): string | null {
  const clave = String(valor ?? "").trim();
  return clave && clave.length <= MAX_CLAVE_TERCERO ? clave : null;
}

/** Ancla del hilo de comentarios de un tercero del cruce (`tercero:900123456`). */
export function anclaCruceTercero(clave: string): string {
  return `tercero:${clave}`;
}

/**
 * Pega a cada tercero del cruce su marca y resume lo pendiente. Toda diferencia admite marca
 * —también los terceros que solo están en un lado—, pero para cerrar solo se exige en las que
 * alcanzan el umbral «Diferencia por tercero»: por debajo se informan en `bajoUmbral`.
 */
export function anotarCruceTerceroConMarcas(
  filas: readonly FilaCruceTerceroCartera[],
  marcas: readonly MarcaCruce[],
  opciones: { umbralDescuadre: number; tolerancia?: number },
): { filas: FilaCruceTerceroMarcada[]; resumen: ResumenMarcas } {
  const tolerancia = opciones.tolerancia ?? TOLERANCIA_CRUCE;
  const porClave = agruparPorRenglon(marcas, (m) => (m.dimension === "tercero" && m.clave ? m.clave : null));

  const anotadas: FilaCruceTerceroMarcada[] = filas.map((fila) => {
    const admite = fila.estado !== "cuadra" && fila.estado !== "sin_saldo";
    return {
      ...fila,
      admiteMarca: admite,
      requiereMarca: admite && requiereMarcaPorUmbral(fila.diferencia, opciones.umbralDescuadre),
      ...explicarRenglon(fila.diferencia, porClave.get(fila.clave) ?? [], { admite, umbral: opciones.umbralDescuadre, tolerancia }),
    };
  });

  const resumen = anotadas.reduce<ResumenMarcas>(
    (acc, fila) => {
      if (!fila.admiteMarca) return acc;
      if (!fila.requiereMarca) {
        acc.bajoUmbral = (acc.bajoUmbral ?? 0) + 1;
        return acc;
      }
      acc.conDiferencia += 1;
      if (fila.marcas.length > 0) {
        acc.marcadas += 1;
        if (fila.desactualizada) {
          acc.desactualizadas += 1;
          acc.montoPorExplicar = redondear((acc.montoPorExplicar ?? 0) + fila.porExplicar);
        }
      } else {
        acc.pendientes += 1;
        acc.montoPendiente = redondear(acc.montoPendiente + fila.diferencia);
      }
      return acc;
    },
    { conDiferencia: 0, marcadas: 0, pendientes: 0, desactualizadas: 0, montoPendiente: 0, montoPorExplicar: 0, bajoUmbral: 0 },
  );

  return { filas: anotadas, resumen };
}

// ===== Marcas del CONTROL DE DEDUCCIONES (Nómina) =====

/** Un renglón del control de deducciones con sus marcas. */
export type FilaControlMarcada = FilaControlDeducciones & MarcasDelRenglon & {
  /** La diferencia que se concilia: sin la cuenta en el balance, la contabilidad cuenta como cero. */
  diferenciaEfectiva: number;
  admiteMarca: boolean;
  /** Toda diferencia desde 1 centavo exige marca para cerrar (la hoja de alertas). */
  requiereMarca: boolean;
};

/** Diferencia de un renglón del control: sin la cuenta en el balance, todo el valor del módulo. */
export function diferenciaControl(fila: Pick<FilaControlDeducciones, "diferencia" | "modulo">): number {
  return fila.diferencia ?? redondear(0 - fila.modulo);
}

/**
 * Pega a cada renglón del control de deducciones su marca y resume lo pendiente. A diferencia de la
 * cédula no hay tolerancia parametrizable: toda diferencia de más de un centavo exige marca, también
 * la de una cuenta del cliente que no está en el balance.
 */
export function anotarControlConMarcas(
  filas: readonly FilaControlDeducciones[],
  marcas: readonly MarcaCruce[],
  opciones?: { tolerancia?: number },
): { filas: FilaControlMarcada[]; resumen: ResumenMarcas } {
  const tolerancia = opciones?.tolerancia ?? TOLERANCIA_CRUCE;
  const porClave = agruparPorRenglon(marcas, (m) => (m.dimension === "control" && m.clave ? m.clave : null));
  const anotadas: FilaControlMarcada[] = filas.map((fila) => {
    const diferenciaEfectiva = diferenciaControl(fila);
    const admite = Math.abs(diferenciaEfectiva) > tolerancia;
    return {
      ...fila,
      diferenciaEfectiva,
      admiteMarca: admite,
      requiereMarca: admite,
      // Sin tolerancia parametrizable: lo que falta por explicar tiene que ser de un centavo o menos.
      ...explicarRenglon(diferenciaEfectiva, porClave.get(fila.cuentaCliente) ?? [], { admite, umbral: 0, tolerancia }),
    };
  });
  const resumen = anotadas.reduce<ResumenMarcas>(
    (acc, fila) => {
      if (!fila.requiereMarca) return acc;
      acc.conDiferencia += 1;
      if (fila.marcas.length > 0) {
        acc.marcadas += 1;
        if (fila.desactualizada) {
          acc.desactualizadas += 1;
          acc.montoPorExplicar = redondear((acc.montoPorExplicar ?? 0) + fila.porExplicar);
        }
      } else {
        acc.pendientes += 1;
        acc.montoPendiente = redondear(acc.montoPendiente + fila.diferenciaEfectiva);
      }
      return acc;
    },
    { conDiferencia: 0, marcadas: 0, pendientes: 0, desactualizadas: 0, montoPendiente: 0, montoPorExplicar: 0, bajoUmbral: 0 },
  );
  return { filas: anotadas, resumen };
}

/** Ancla del hilo de comentarios de un renglón del control (`control:236505`). */
export function anclaControl(cuentaCliente: string): string {
  return `control:${cuentaCliente}`;
}

/**
 * Una marca del período tal como la conocen las dos pestañas del cruce. La numeración es una
 * sola para las marcas de cuenta y las de tercero, así que cada pestaña lista también las de la
 * otra (como referencia) para que la secuencia 1, 2, 3… se lea completa.
 */
export type MarcaPeriodo = {
  numero: number;
  dimension: DimensionMarca;
  /** Cuenta (o grupo «130505+280505») en las de cuenta; clave del tercero en las de tercero. */
  llave: string;
  nota: string;
  /** Diferencia cuando se escribió la marca. */
  diferencia: number;
  /** Lo que explica (`montoDeMarca`). */
  monto?: number;
  marcadoPor: string | null;
  /** Fecha ya formateada para la UI. */
  marcadoEn: string;
  soportes: number;
  /**
   * Cuentas del cliente que esta marca dejó fuera de la conciliación. Se listan aunque el
   * renglón de la marca ya no aparezca en el cruce: son las que se ven tachadas, y mientras la
   * marca exista siguen restando, la escribiera quien la escribiera.
   */
  noModulares?: { cuenta8: string; nombre: string | null }[];
};

export type EntradaObservacion<T, M extends MarcaPeriodo = MarcaPeriodo> =
  | { tipo: "propia"; numero: number; item: T }
  | { tipo: "referencia"; numero: number; marca: M };

/**
 * Intercala, por número, las observaciones propias de una pestaña con las demás marcas del
 * período (las de la otra pestaña y las que ya no tienen renglón en el cruce). Una marca propia
 * nunca se repite como referencia.
 */
export function intercalarObservaciones<T, M extends MarcaPeriodo>(
  propias: readonly T[],
  numeroDe: (item: T) => number,
  delPeriodo: readonly M[],
): EntradaObservacion<T, M>[] {
  const numerosPropios = new Set(propias.map(numeroDe));
  const entradas: EntradaObservacion<T, M>[] = [
    ...propias.map((item) => ({ tipo: "propia" as const, numero: numeroDe(item), item })),
    ...delPeriodo
      .filter((m) => !numerosPropios.has(m.numero))
      .map((marca) => ({ tipo: "referencia" as const, numero: marca.numero, marca })),
  ];
  return entradas.sort((a, b) => a.numero - b.numero || (a.tipo === b.tipo ? 0 : a.tipo === "propia" ? -1 : 1));
}

// ===== Marca cuyo renglón ya no aparece en el cruce =====
// La marca se guarda por la CLAVE de su renglón. Si las cuentas se agrupan de otra forma (el
// Consolidado asigna un concepto a una cuenta más, o una versión nueva trae otros conceptos), la
// clave del renglón cambia y la marca queda citada sin renglón. Se puede PASAR al renglón que hoy
// contiene alguna de sus cuentas, aunque ya tenga marcas: conserva número, nota, monto, soportes y
// cuentas no modulares.

/** Renglones del cruce que hoy contienen alguna cuenta de la marca: a los que puede pasar. */
export function destinosMarcaSinRenglon<F extends { cuenta4: string }>(llave: string, filas: readonly F[]): F[] {
  if (!llave || llave === CLAVE_SIN_CUENTA) return [];
  const propias = new Set(cuentasDeClaveCruce(llave));
  return filas.filter((f) => f.cuenta4 !== CLAVE_SIN_CUENTA && f.cuenta4 !== llave && cuentasDeClaveCruce(f.cuenta4).some((c) => propias.has(c)));
}

/**
 * ¿Se puede pasar la marca de `origen` (sin renglón) al renglón `destino`? null = sí; si no, el
 * motivo. `clavesVigentes` son las claves de los renglones del cruce de hoy.
 */
export function motivoNoPasarMarca(origen: string, destino: string, clavesVigentes: ReadonlySet<string>): string | null {
  if (origen === CLAVE_SIN_CUENTA || destino === CLAVE_SIN_CUENTA) return "La marca del saldo sin cuenta no se puede pasar a otro renglón.";
  if (origen === destino) return "La marca ya está en ese renglón.";
  if (clavesVigentes.has(origen)) return "Esa marca todavía tiene su renglón en el cruce: edítala ahí.";
  if (!clavesVigentes.has(destino)) return "Ese renglón ya no aparece en el cruce. Recarga la pantalla.";
  const propias = new Set(cuentasDeClaveCruce(origen));
  if (!cuentasDeClaveCruce(destino).some((c) => propias.has(c))) {
    return "La marca solo puede pasar a un renglón que contenga alguna de sus cuentas.";
  }
  return null;
}
