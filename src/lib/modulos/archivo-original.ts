import { createHash } from "node:crypto";

/** Estados durables de la bitácora; nunca implican borrar el objeto original. */
export type EstadoArchivoOriginalModulo =
  | "recibido"
  | "no_procesable"
  | "borrador"
  | "cargado"
  | "descartado"
  | "cargue_eliminado";

export type DocumentacionArchivoModulo = {
  softwareOrigen: string | null;
  ubicacionOrigen: string | null;
  reflejoContableEsperado: string | null;
};

export type ResumenRecoleccionModulo = {
  codigo: string;
  label: string;
  archivosRegistrados: number;
  archivosDisponibles: number;
  estado: "disponible" | "pendiente";
};

/** Primera fila durable: existe antes de subir o interpretar el binario. */
export function datosArchivoOriginalRecibido() {
  return { estado: "recibido" as const, disponible: false };
}

/** El proveedor confirmó que conserva exactamente los bytes registrados. */
export function datosArchivoOriginalConservado() {
  return { disponible: true };
}

/** El original permanece trazable aunque no se pueda convertir en borrador. */
export function datosArchivoOriginalNoProcesable(objetoConservado: boolean) {
  return {
    estado: "no_procesable" as const,
    ...(objetoConservado ? { disponible: true } : {}),
  };
}

/** Transiciones de metadata; el objeto binario no participa y por tanto no se elimina. */
export function datosArchivoOriginalPromovido(args: {
  encabezadoId: number;
  periodo: string;
  esAnexo: boolean;
}) {
  return {
    encabezadoId: args.encabezadoId,
    periodo: args.periodo,
    estado: "cargado" as const,
    esAnexo: args.esAnexo,
  };
}

export function datosArchivoOriginalDescartado() {
  return { encabezadoId: null, estado: "descartado" as const };
}

export function datosArchivoOriginalConCargueEliminado() {
  return { encabezadoId: null, estado: "cargue_eliminado" as const };
}

const TIPOS_CONTENIDO: Record<string, string> = {
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xls: "application/vnd.ms-excel",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Huella del contenido binario exacto, antes de cualquier lectura o transformación. */
export function huellaSha256Archivo(contenido: Uint8Array): string {
  return createHash("sha256").update(contenido).digest("hex");
}

/** Nombre seguro para Content-Disposition y para el último segmento de la clave S3. */
export function nombreArchivoOriginalSeguro(nombre: string): string {
  const base = String(nombre ?? "")
    .split(/[\\/]/)
    .pop()
    ?.normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim();
  return (base || "archivo-original").slice(0, 180);
}

function segmentoRuta(valor: string, respaldo: string): string {
  const limpio = String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return limpio || respaldo;
}

/** Carpeta lógica que la bitácora muestra al usuario. Es estable aunque cambie el período. */
export function carpetaArchivoOriginalModulo(args: {
  moduloLabel: string;
  clienteId: number;
  nitCliente?: string | null;
}): string {
  const modulo = segmentoRuta(args.moduloLabel, "modulo");
  const cliente = segmentoRuta(args.nitCliente ?? "", `cliente-${args.clienteId}`);
  return `Software/${modulo}/${cliente}/Originales`;
}

/** Clave interna única; el UUID del lote evita colisiones y conserva el nombre legible. */
export function claveArchivoOriginalModulo(args: {
  moduloCodigo: string;
  clienteId: number;
  loteId: string;
  nombreArchivo: string;
}): string {
  const modulo = segmentoRuta(args.moduloCodigo, "modulo");
  const nombre = nombreArchivoOriginalSeguro(args.nombreArchivo);
  return `software/modulos/${modulo}/clientes/${args.clienteId}/originales/${args.loteId}/${nombre}`;
}

export function tipoContenidoArchivo(nombre: string, declarado?: string | null): string {
  const tipo = String(declarado ?? "").trim();
  if (tipo) return tipo.slice(0, 160);
  const extension = nombreArchivoOriginalSeguro(nombre).split(".").pop()?.toLowerCase() ?? "";
  return TIPOS_CONTENIDO[extension] ?? "application/octet-stream";
}

/** La documentación se considera completa solo cuando responde las tres preguntas funcionales. */
export function documentacionArchivoCompleta(documentacion: DocumentacionArchivoModulo): boolean {
  return Boolean(
    documentacion.softwareOrigen?.trim()
      && documentacion.ubicacionOrigen?.trim()
      && documentacion.reflejoContableEsperado?.trim(),
  );
}

/**
 * Estado de recolección por módulo. `ClientModule.status` no participa: describe
 * parametrización, no disponibilidad de archivos. Un original descartado o cuyo
 * cargue se eliminó sigue conservado en la bitácora y cuenta como material disponible
 * para revisión siempre que el binario verificable continúe almacenado. El estado
 * operativo se muestra por separado y no redefine la recolección.
 */
export function resumirRecoleccionModulos(
  modulos: readonly { codigo: string; label: string }[],
  archivos: readonly {
    moduloCodigo: string;
    estado: string;
    disponible: boolean;
  }[],
): ResumenRecoleccionModulo[] {
  const porModulo = new Map<string, { registrados: number; disponibles: number }>();
  for (const archivo of archivos) {
    acumularConteo(porModulo, archivo, 1);
  }
  return construirResumen(modulos, porModulo);
}

/** Variante para resultados agregados de Prisma; evita cargar toda la bitácora. */
export function resumirRecoleccionModulosAgrupada(
  modulos: readonly { codigo: string; label: string }[],
  grupos: readonly {
    moduloCodigo: string;
    estado: string;
    disponible: boolean;
    cantidad: number;
  }[],
): ResumenRecoleccionModulo[] {
  const porModulo = new Map<string, { registrados: number; disponibles: number }>();
  for (const grupo of grupos) {
    acumularConteo(porModulo, grupo, Math.max(0, Math.trunc(grupo.cantidad)));
  }
  return construirResumen(modulos, porModulo);
}

function acumularConteo(
  porModulo: Map<string, { registrados: number; disponibles: number }>,
  archivo: { moduloCodigo: string; estado: string; disponible: boolean },
  cantidad: number,
): void {
  const codigo = archivo.moduloCodigo.toUpperCase();
  const actual = porModulo.get(codigo) ?? { registrados: 0, disponibles: 0 };
  actual.registrados += cantidad;
  if (archivo.disponible) {
    actual.disponibles += cantidad;
  }
  porModulo.set(codigo, actual);
}

function construirResumen(
  modulos: readonly { codigo: string; label: string }[],
  porModulo: Map<string, { registrados: number; disponibles: number }>,
): ResumenRecoleccionModulo[] {
  return modulos.map((modulo) => {
    const conteo = porModulo.get(modulo.codigo.toUpperCase()) ?? { registrados: 0, disponibles: 0 };
    return {
      codigo: modulo.codigo,
      label: modulo.label,
      archivosRegistrados: conteo.registrados,
      archivosDisponibles: conteo.disponibles,
      estado: conteo.disponibles > 0 ? "disponible" : "pendiente",
    };
  });
}
