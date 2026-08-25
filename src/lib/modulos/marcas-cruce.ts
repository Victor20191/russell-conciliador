/**
 * MARCAS DE AUDITORÍA sobre las diferencias del cruce contable de un módulo.
 *
 * Lógica PURA (sin BD): decide qué filas del cruce admiten marca, les pega la que ya
 * exista, numera lo que falte y resume cuánto queda sin marcar. La persistencia vive en
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
import type { FilaCruceContable } from "./cruce-contable";

/** Tolerancia por defecto del cruce (la misma de `construirCruceContable`). */
export const TOLERANCIA_CRUCE = 0.01;

/** Soporte adjunto a una marca (el anexo digital). */
export type AdjuntoMarca = {
  id: number;
  nombreArchivo: string;
  tipoContenido: string;
  tamanoBytes: number;
};

export type MarcaCruce = {
  cuenta4: string;
  /** Correlativo dentro del período; es lo que se pinta en la cédula. */
  numero: number;
  nota: string;
  /** Referencia al anexo del papel de trabajo (p. ej. «Anexo A-3»). */
  referenciaAnexo: string | null;
  /** Diferencia que había cuando se marcó (snapshot). */
  diferencia: number;
  marcadoPor: string | null;
  /** Fecha ya formateada para la UI. */
  marcadoEn: string;
  /** Comentario del hilo de la cuenta donde quedó el rastro, si se registró. */
  comentarioId: number | null;
  adjuntos: AdjuntoMarca[];
};

export type FilaCruceMarcada = FilaCruceContable & {
  /** Solo las filas que NO cuadran admiten marca. */
  admiteMarca: boolean;
  marca: MarcaCruce | null;
  /** Hay marca, pero la diferencia cambió desde que se escribió. */
  desactualizada: boolean;
};

export type ResumenMarcas = {
  /** Filas con diferencia (las que admiten marca). */
  conDiferencia: number;
  marcadas: number;
  /** Con diferencia y sin marcar. */
  pendientes: number;
  /** Marcadas cuyo monto cambió desde la observación. */
  desactualizadas: number;
  /** Suma de las diferencias todavía sin marcar. */
  montoPendiente: number;
};

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

/** ¿La fila del cruce admite marca? Solo las que no cuadran. */
export function admiteMarca(fila: Pick<FilaCruceContable, "cuadra">): boolean {
  return !fila.cuadra;
}

/**
 * Pega a cada fila del cruce su marca (si existe) y resume lo pendiente.
 *
 * La marca de una cuenta que YA cuadra no se pierde ni estorba: la fila deja de admitir
 * marca y no cuenta como pendiente, pero la observación sigue viajando en la fila para que
 * la pantalla la muestre como antecedente.
 */
export function anotarCruceConMarcas(
  filas: readonly FilaCruceContable[],
  marcas: readonly MarcaCruce[],
  opciones?: { tolerancia?: number },
): { filas: FilaCruceMarcada[]; resumen: ResumenMarcas } {
  const tolerancia = opciones?.tolerancia ?? TOLERANCIA_CRUCE;
  const porCuenta = new Map(marcas.map((m) => [m.cuenta4, m]));

  const anotadas: FilaCruceMarcada[] = filas.map((fila) => {
    const marca = porCuenta.get(fila.cuenta4) ?? null;
    const admite = admiteMarca(fila);
    return {
      ...fila,
      admiteMarca: admite,
      marca,
      desactualizada: marca != null && admite && Math.abs(fila.diferencia - marca.diferencia) > tolerancia,
    };
  });

  const resumen = anotadas.reduce<ResumenMarcas>(
    (acc, fila) => {
      if (!fila.admiteMarca) return acc;
      acc.conDiferencia += 1;
      if (fila.marca) {
        acc.marcadas += 1;
        if (fila.desactualizada) acc.desactualizadas += 1;
      } else {
        acc.pendientes += 1;
        acc.montoPendiente = redondear(acc.montoPendiente + fila.diferencia);
      }
      return acc;
    },
    { conDiferencia: 0, marcadas: 0, pendientes: 0, desactualizadas: 0, montoPendiente: 0 },
  );

  return { filas: anotadas, resumen };
}

/**
 * Las marcas del período ordenadas por número, con la fila del cruce a la que apuntan.
 * Es lo que se pinta al pie, en observaciones: la lista numerada que explica la cédula.
 *
 * Una marca cuya cuenta ya no aparece en el cruce (cambió el mapeo, se recargó el archivo)
 * NO se muestra aquí: sin cifra que explicar, la observación no tiene dónde anclarse.
 */
export function observacionesDeMarcas(filas: readonly FilaCruceMarcada[]): FilaCruceMarcada[] {
  return filas
    .filter((f): f is FilaCruceMarcada & { marca: MarcaCruce } => f.marca != null)
    .sort((a, b) => a.marca!.numero - b.marca!.numero);
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
