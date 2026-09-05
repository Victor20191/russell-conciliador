import { z } from "zod";

/** Información complementaria. Nunca sustituye la llave histórica nitTercero
 * usada por los cruces ni interviene en la clasificación del borrador. */
export const IdentidadTerceroSchema = z.object({
  version: z.literal(1),
  documentoOriginal: z.string(),
  tipoOriginal: z.string(),
  dvOriginal: z.string(),
  tipoDocumento: z.enum(["NIT", "CC", "CE", "TI", "PASAPORTE"]).nullable(),
  numeroDocumento: z.string().nullable(),
  digitoVerificacion: z.string().nullable(),
  nombre: z.string().nullable(),
  origen: z.enum(["archivo", "historico"]),
  fuenteNombre: z.string().optional(),
  observaciones: z.array(z.string()),
});
export type IdentidadTercero = z.infer<typeof IdentidadTerceroSchema>;
export type EstadoIdentidadTercero = "identificado" | "sin_nombre" | "sin_documento" | "revisar";

const texto = (v: unknown) => v == null ? "" : String(v).trim();
const claveTexto = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[.\s_]/g, "");
const tipos: Record<string, NonNullable<IdentidadTercero["tipoDocumento"]>> = {
  NIT: "NIT", CC: "CC", CEDULA: "CC", CEDULADECIUDADANIA: "CC",
  CE: "CE", CEDULADEEXTRANJERIA: "CE", TI: "TI", TARJETADEIDENTIDAD: "TI",
  PASAPORTE: "PASAPORTE", PASSPORT: "PASAPORTE",
};
const nombreUtil = (v: unknown) => {
  const s = texto(v);
  return !s || /^(gen[eé]rico|sin (nit|tercero|nombre)|nombre no disponible|0)$/i.test(s) ? null : s;
};

/** Conserva identificaciones completas, ceros iniciales y la fuente. Solo separa
 * DV cuando viene separado en una columna o mediante un guion explícito de NIT.
 * No deduce NIT/cédula por longitud, no calcula DV, no busca números en nombres. */
export function reconocerIdentidadTercero(entrada: { documento?: unknown; tipo?: unknown; dv?: unknown; nombre?: unknown }): IdentidadTercero {
  const documentoOriginal = texto(entrada.documento);
  const tipoOriginal = texto(entrada.tipo);
  const dvOriginal = texto(entrada.dv);
  const observaciones: string[] = [];
  let tipoDocumento = tipos[claveTexto(tipoOriginal)] ?? null;
  if (tipoOriginal && !tipoDocumento) observaciones.push("Tipo de documento no reconocido: " + tipoOriginal);
  let raw = documentoOriginal;
  const etiqueta = /^(NIT|C\.?C\.?|C\.?E\.?|T\.?I\.?|C[EÉ]DULA|PASAPORTE)(?:\s*[:\-]\s*|\s+)(.*)$/i.exec(raw);
  if (etiqueta) {
    const tipoEtiqueta = tipos[claveTexto(etiqueta[1])];
    if (tipoDocumento && tipoDocumento !== tipoEtiqueta) observaciones.push("El tipo de la columna no coincide con el del documento.");
    else if (!tipoOriginal) tipoDocumento = tipoEtiqueta;
    raw = etiqueta[2].trim();
  }
  let numeroDocumento: string | null = null;
  let digitoVerificacion: string | null = null;
  let nombre = nombreUtil(entrada.nombre);
  if (raw && !/^(0+|gen[eé]rico|sin (nit|tercero))$/i.test(raw)) {
    const token = tipoDocumento === "PASAPORTE"
      ? /^([A-Za-z0-9]+)(?:\s+(.+))?$/.exec(raw)
      : /^(\d[\d.]*)(?:\s*-\s*(\d))?(?:\s+(.+))?$/.exec(raw);
    if (token) {
      numeroDocumento = /^0+$/.test(token[1]) ? null : token[1].replace(/\./g, "").toUpperCase();
      const dvSeparado = tipoDocumento === "PASAPORTE" ? null : token[2];
      nombre ??= nombreUtil(tipoDocumento === "PASAPORTE" ? token[2] : token[3]);
      if (dvSeparado) {
        if (tipoDocumento && tipoDocumento !== "NIT") {
          numeroDocumento = raw;
          observaciones.push("Documento con guion incompatible con el tipo indicado; revisar la fuente.");
        } else {
          digitoVerificacion = dvSeparado;
          // El separador aporta el DV, pero no confirma por sí solo el tipo.
        }
      }
    } else if (!tipoDocumento && !/^\d/.test(raw) && (!/\d/.test(raw) || /\s/.test(raw))) {
      nombre ??= nombreUtil(raw);
    } else {
      numeroDocumento = raw;
      observaciones.push("Formato de documento por revisar; se conserva el valor original.");
    }
  }
  if (dvOriginal) {
    if (!/^\d$/.test(dvOriginal) || (tipoDocumento && tipoDocumento !== "NIT") || !numeroDocumento) {
      observaciones.push("Dígito de verificación incompatible o inválido.");
    } else if (digitoVerificacion && digitoVerificacion !== dvOriginal) {
      observaciones.push("El DV de la columna no coincide con el del documento.");
    } else digitoVerificacion = dvOriginal;
  }
  if (typeof entrada.documento === "number" && !Number.isSafeInteger(entrada.documento)) {
    observaciones.push("La celda numérica puede haber perdido precisión; usar el documento como texto en el archivo.");
  }
  if (/\d[.,]?\d*[eE][+-]?\d+/.test(raw)) observaciones.push("Documento en notación científica; revisar el valor original.");
  return { version: 1, documentoOriginal, tipoOriginal, dvOriginal, tipoDocumento, numeroDocumento, digitoVerificacion, nombre, origen: "archivo", observaciones };
}

export function leerIdentidadTercero(valor: unknown): IdentidadTercero | undefined {
  const r = IdentidadTerceroSchema.safeParse(valor);
  return r.success ? r.data : undefined;
}

/** En históricos no se reconstruyen dígitos ni tipos que nunca se guardaron. */
export function identidadParaVisor(fila: { identidadTercero?: IdentidadTercero; nitTercero: string | null; nombreTercero: string | null }): IdentidadTercero {
  return fila.identidadTercero ?? {
    version: 1, documentoOriginal: fila.nitTercero ?? "", tipoOriginal: "", dvOriginal: "",
    tipoDocumento: null, numeroDocumento: fila.nitTercero, digitoVerificacion: null,
    nombre: nombreUtil(fila.nombreTercero), origen: "historico", observaciones: [],
  };
}

export function estadoIdentidadTercero(i: IdentidadTercero): EstadoIdentidadTercero {
  if (i.observaciones.length) return "revisar";
  if (!i.numeroDocumento) return "sin_documento";
  if (!i.nombre) return "sin_nombre";
  return i.tipoDocumento ? "identificado" : "revisar";
}

export const ETIQUETAS_IDENTIDAD: Record<EstadoIdentidadTercero, string> = {
  identificado: "Tercero identificado", sin_nombre: "Identificación sin nombre",
  sin_documento: "Sin tercero reportado", revisar: "Documento por revisar",
};

/** Clave exclusiva del visor: tipo + número COMPLETO. Los valores ambiguos
 * conservan también el original para no fusionar documentos distintos. */
export function claveIdentidadTercero(i: IdentidadTercero): string {
  const base = i.numeroDocumento ? `${i.tipoDocumento ?? "SIN_TIPO"}:${i.numeroDocumento}` : `nombre:${claveTexto(i.nombre ?? "")}`;
  return i.observaciones.length ? `${base}:revisar:${i.tipoOriginal}:${i.documentoOriginal}:${i.dvOriginal}` : base;
}

/** Completa nombres exclusivamente desde otra fila del MISMO archivo con tipo y
 * documento completo iguales. Una llave con nombres contradictorios no resuelve
 * nada; un NIT histórico recortado nunca sirve para completar identidades nuevas. */
export function completarNombresDelMismoArchivo<T extends { identidadTercero?: IdentidadTercero }>(filas: readonly T[]): T[] {
  const candidatos = new Map<string, Map<string, string>>();
  for (const f of filas) {
    const i = f.identidadTercero;
    if (!i || i.origen !== "archivo" || !i.tipoDocumento || !i.numeroDocumento || !i.nombre || i.observaciones.length) continue;
    const clave = claveIdentidadTercero(i);
    const nombres = candidatos.get(clave) ?? new Map<string, string>();
    nombres.set(claveTexto(i.nombre), i.nombre);
    candidatos.set(clave, nombres);
  }
  return filas.map((f) => {
    const i = f.identidadTercero;
    if (!i || i.origen !== "archivo" || !i.tipoDocumento || !i.numeroDocumento || i.nombre || i.observaciones.length) return f;
    const nombres = candidatos.get(claveIdentidadTercero(i));
    if (nombres?.size !== 1) return f;
    return { ...f, identidadTercero: { ...i, nombre: [...nombres.values()][0], fuenteNombre: "Otra fila del mismo archivo con igual tipo y documento completo." } };
  });
}
