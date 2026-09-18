"use server";

// Server Actions del MOTOR genérico de importación de módulos (Inventarios piloto).
// Flujo: leer archivo → staging editable (borrador) → promover a oficial (detalle) →
// purga. Todo dirigido por el descriptor del módulo. Sin PUC ni partida doble.
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import * as z from "zod";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD, registrarError } from "@/lib/errores";
import type { ActionState } from "@/lib/definitions";
import { ingerir, leerCeldaFisicaArchivo, type GridHoja } from "@/lib/balance/extraccion/ingesta";
import { calcularHuella, huellasCandidatas } from "@/lib/balance/extraccion/huella";
import {
  bloqueoAnexoPorVerificacionesCriticasModulo,
  bloqueoVerificacionesCriticasModulo,
  descriptorModulo,
  type DescriptorModulo,
} from "@/lib/modulos/descriptores";
import {
  parseAlcanceEliminacionModulo,
  resolverAlcanceEliminacionModulo,
  type AlcanceEliminacionModulo,
} from "@/lib/modulos/alcance-eliminacion";
import {
  cedulaModulo,
  cuentaAsignableCedula,
  cuentasCedula6,
  longitudesCedula,
  prefijosCuentaModulo,
  type CedulaModulo,
} from "@/lib/modulos/cuentas-modulo";
import {
  cedulaDelCargue,
  filasPeriodoDeCuentas,
  llaveAsignacion,
  separarCuentasCedula,
} from "@/lib/modulos/asignacion-periodo";
import { SpecModuloSchema, type SpecModulo } from "@/lib/modulos/extraccion/esquema";
import {
  encabezadoValorIngresoAmbiguo,
  invalidarValorAmbiguoIngresos,
  sugerirSpec,
} from "@/lib/modulos/extraccion/sugerir";
import { letraColumnaModulo, modoClasificadorDe, normalizarSpecModulo, normalizarSpecModuloArchivo } from "@/lib/modulos/perfil-modulo";
import { CLASIFICADOR_GLOBAL, transformarModulo, resultadoAReconciliacion } from "@/lib/modulos/extraccion/transformar";
import { ETIQUETA_GRUPO_SIN_NOMBRE, esGrupoSinNombre, normalizarNombreClasificador, type GrupoSinNombre } from "@/lib/modulos/nombre-clasificador";
import { aCeldaMuestra, textoCeldaMuestra, vistaAnalisisHoja, type CeldaMuestra } from "@/lib/modulos/extraccion/vista-analisis";
import { aplicarClasificadorDeCarga, aplicarPatronASpec } from "@/lib/modulos/patrones/aplicar";
import { mejorVersion } from "@/lib/modulos/patrones/mejor-version";
import { aplicativoConfirmadoDeCarga, versionesPatronCandidatas } from "@/lib/modulos/patrones/servidor";
import type { ResumenPeriodo } from "@/lib/modulos/nomina/periodo";
import { claveConsolidado, partirClaveConsolidado } from "@/lib/modulos/nomina/clave-consolidado";
import { CLASES_NOMINA } from "@/lib/modulos/nomina/homologacion";
import { validarReparto } from "@/lib/modulos/nomina/cruce-nomina";
import { esImputable, promoverStaging, type FilaStagingModulo } from "@/lib/modulos/promocion";
import { CLAVE_MONEDA, datosConExtrasCartera, filaCarteraDesdeDetalle, leerSaldoDeclarado, rotulosDeEdades } from "@/lib/modulos/cartera/detalle-cartera";
import { esTipoFormatoCartera, formatoArchivoCartera, leerFormatosCartera, nivelCarteraDeSpec } from "@/lib/modulos/cartera/tipo-formato";
import { esMonedaExtranjera, validarTrm } from "@/lib/modulos/cartera/moneda";
import { fechaISO as fechaDeCelda, finDePeriodo } from "@/lib/modulos/cartera/fecha-corte";
import { resolverOrigenCartera } from "@/lib/modulos/cartera/origen-cartera";
import { fechaCalendarioISO, fechaCalendarioPrisma } from "@/lib/fecha-hora";
import { getTRM } from "@/lib/ia/trm";
import { materializarSaldosTercero, type NivelCartera } from "@/lib/modulos/cartera/saldos-tercero";
import { normalizarTerceroCartera } from "@/lib/modulos/cartera/tercero-cartera";
import { seleccionarHojaModulo } from "@/lib/modulos/extraccion/seleccion-hoja";
import { controlSubtotales } from "@/lib/modulos/subtotales";
import {
  diferenciaAjustada,
  diferenciaAjustadaModulo,
  MAX_NOTA_MARCA,
  normalizarClaveTercero,
  siguienteNumeroMarca,
  type DimensionMarca,
  validarNoModulares,
  validarClasificadoresNoModulares,
  validarNotaMarca,
  validarReferenciaAnexo,
} from "@/lib/modulos/marcas-cruce";
import {
  claveSoporteMarca,
  nombreArchivoSeguro,
  SOPORTES_MARCA_MAX,
  validarSoporteMarca,
  type TipoSoporteMarca,
} from "@/lib/modulos/marcas-adjuntos";
import { almacenamientoDisponible, eliminarObjeto, obtenerObjeto, subirObjeto } from "@/lib/storage/objetos";
import { rolesLlaveItemDe, clavesDeDetalle, decidirCarga, remapFilas } from "@/lib/modulos/fraccionamiento";
import {
  carpetaArchivoOriginalModulo,
  claveArchivoOriginalModulo,
  datosArchivoOriginalConservado,
  datosArchivoOriginalConCargueEliminado,
  datosArchivoOriginalDescartado,
  datosArchivoOriginalNoProcesable,
  datosArchivoOriginalPromovido,
  datosArchivoOriginalRecibido,
  huellaSha256Archivo,
  tipoContenidoArchivo,
} from "@/lib/modulos/archivo-original";
import { getCatalogoPrevalidador } from "@/lib/parametros/prevalidador";
import { tomarCandadoTransaccion, transaccionSerializable, type TransactionClient } from "@/lib/concurrency";
import { cargarInsumosCruceModulo, construirCruceContableModulo } from "@/lib/modulos/cruce-contable-servidor";
import { CLAVE_SIN_CUENTA, normalizarClaveCruce } from "@/lib/modulos/cruce-contable";
import { cargarContextoPrevalidadorBalance } from "@/lib/balance/prevalidador/servidor";
import { cruceTerceroDeCargue } from "@/lib/modulos/cruce-tercero-servidor";
import { validarEmparejamientoTercero } from "@/lib/modulos/cartera/cruce-tercero-cartera";
import { evidenciaCruceTercero } from "@/lib/conciliacion/evidencia-cruce-tercero";
import {
  alcanceExplicitoDelCruce,
  cuentasBloqueoDelModulo,
  cuentasRussellDelCruce,
  ESTADO_CIERRE_DESBLOQUEADO,
  ESTADO_CIERRE_FIRME,
  evaluarCierreConciliacion,
  validarJustificacionDesbloqueo,
} from "@/lib/conciliacion/cuentas-bloqueo";
import { autorizarCierreConciliacion } from "@/lib/conciliacion/verificar-bloqueo";

const rutaModulo = (codigo: string) => `/modulos/${codigo.toLowerCase()}`;
/** Las dos pantallas que listan lotes: datos cargados (aviso de pendientes) e índice de borradores. */
function revalidarListadosModulo(codigo: string) {
  revalidatePath(rutaModulo(codigo));
  revalidatePath(`${rutaModulo(codigo)}/borradores`);
}
// Marca de idempotencia de un anexo (modo "agregar"): se guarda al final de las
// observaciones del encabezado vigente para poder detectar un reintento del mismo
// `loteId` (el anexo NO crea un encabezado propio, así que no puede reutilizar la
// idempotencia por `ModuloDatoEncabezado.loteId` que sí tiene el modo "version").
const marcaAnexoModulo = (loteId: string) => `[lote:${loteId}]`;
const LOTE_STAGING_MODULO = 2_000;

/**
 * Un cargue de cartera solo se promueve si TODO su saldo quedó atribuido a algún tercero.
 *
 * La conciliación de este módulo es por NIT: un cargue cuyo total cuadra pero cuyo detalle
 * no se puede repartir entre terceros produciría una pantalla de terceros incompleta y un
 * cruce que parece tener diferencias donde solo hay lectura a medias. Es preferible
 * rechazarlo con el monto a la vista —el usuario corrige el mapeo y vuelve a cargar— que
 * dejar pasar un dato que nadie va a poder explicar.
 */
function exigirCarteraAtribuida(sinAtribuir: { filas: number; monto: number }) {
  if (sinAtribuir.monto === 0) return;
  const monto = sinAtribuir.monto.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  throw new Error(
    `No se pudo identificar el tercero de ${sinAtribuir.filas} fila(s) por $ ${monto}. `
    + "La conciliación de cartera es por NIT, así que el cargue se revirtió: revisa el mapeo "
    + "de la columna del NIT en el borrador y vuelve a cargarlo.",
  );
}

/**
 * Reconstruye `cartera_saldo_tercero` de un cargue ENTERO a partir de su detalle.
 *
 * Se rehace completo, no de forma incremental, por dos razones: es idempotente (un anexo
 * que se reintenta no duplica nada) y deja explícito que la tabla es un DERIVADO —si
 * alguna vez discrepa del detalle, el detalle manda y esto lo repara.
 *
 * Devuelve lo que no se pudo atribuir a ningún tercero. El llamador decide qué hacer con
 * ello: nunca se descarta en silencio, que es justo el defecto que esta tabla evita.
 */
async function materializarCarteraEnTransaccion(
  tx: TransactionClient,
  encabezadoId: number,
  loteId: string,
  nivelImputable: NivelCartera,
): Promise<{ filas: number; monto: number }> {
  const detalle = await tx.moduloDatoDetalle.findMany({
    where: { encabezadoId },
    select: {
      filaNum: true, valor: true, datos: true,
      nivel: true, imputable: true, cuentaCliente: true, origenCartera: true,
    },
    orderBy: { filaNum: "asc" },
  });

  const { saldos, sinAtribuir } = materializarSaldosTercero(
    detalle.map((d) => filaCarteraDesdeDetalle(
      {
        filaNum: d.filaNum,
        valor: Number(d.valor),
        datos: (d.datos ?? {}) as Record<string, unknown>,
        nivel: d.nivel,
        imputable: d.imputable,
        cuentaCliente: d.cuentaCliente,
        origenCartera: d.origenCartera,
      },
      nivelImputable,
    )),
    { loteId, nivelImputable },
  );

  await tx.saldoTerceroModulo.deleteMany({ where: { encabezadoId } });
  for (let i = 0; i < saldos.length; i += LOTE_STAGING_MODULO) {
    await tx.saldoTerceroModulo.createMany({
      data: saldos.slice(i, i + LOTE_STAGING_MODULO).map((s) => ({
        encabezadoId,
        loteId: s.loteId,
        nivel: s.nivel,
        origen: s.origen,
        cuentaCliente: s.cuentaCliente,
        origenCartera: s.origenCartera,
        claveTercero: s.claveTercero,
        nitOriginal: s.nitOriginal,
        dv: s.dv,
        sucursal: s.sucursal,
        nombre: s.nombre,
        saldo: s.saldo,
        saldoReportado: s.saldoReportado,
        sumaEdades: s.sumaEdades,
        edades: (s.edades ?? undefined) as Prisma.InputJsonValue | undefined,
        documentos: s.documentos,
        diasMax: s.diasMax,
      })),
    });
  }
  return sinAtribuir;
}
const TIMEOUT_TRANSACCION_MODULO_MS = 15 * 60 * 1000;
const tamArchivo = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};
const fechaISO = (v: FormDataEntryValue | null): Date | null => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const fecha = new Date(`${s}T00:00:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
};

const DocumentacionArchivoModuloSchema = z.object({
  softwareOrigen: z.string().trim().max(160, "El software de origen es demasiado largo.").transform((v) => v || null),
  ubicacionOrigen: z.string().trim().max(500, "La ubicación de origen es demasiado larga.").transform((v) => v || null),
  reflejoContableEsperado: z.string().trim().max(4000, "El reflejo contable esperado es demasiado largo.").transform((v) => v || null),
});

function documentacionDesdeFormulario(formData: FormData) {
  return DocumentacionArchivoModuloSchema.safeParse({
    softwareOrigen: String(formData.get("softwareOrigen") ?? ""),
    ubicacionOrigen: String(formData.get("ubicacionOrigen") ?? ""),
    reflejoContableEsperado: String(formData.get("reflejoContableEsperado") ?? ""),
  });
}

type DocumentacionArchivoModuloValidada = z.infer<typeof DocumentacionArchivoModuloSchema>;

/** En una recepción existente, omitir un campo significa «conservar lo documentado»,
 * no «borrarlo». El vaciado explícito sigue disponible desde el editor de Bitácora. */
function cambiosDocumentacionPresentes(
  formData: FormData,
  documentacion: DocumentacionArchivoModuloValidada,
): Partial<DocumentacionArchivoModuloValidada> {
  const cambios: Partial<DocumentacionArchivoModuloValidada> = {};
  if (formData.has("softwareOrigen")) cambios.softwareOrigen = documentacion.softwareOrigen;
  if (formData.has("ubicacionOrigen")) cambios.ubicacionOrigen = documentacion.ubicacionOrigen;
  if (formData.has("reflejoContableEsperado")) cambios.reflejoContableEsperado = documentacion.reflejoContableEsperado;
  return cambios;
}

function mensajeErrorLecturaArchivoModulo(contexto: string, e: unknown): string {
  registrarError(contexto, e);
  const mensaje = e instanceof Error ? e.message.trim() : "";
  if (/^(No se pudo leer|El formato|Formato de archivo)/i.test(mensaje)) return mensaje;
  return "No se pudo leer el archivo. Si es un Excel, ábrelo, guárdalo nuevamente como .xlsx e intenta otra vez.";
}

// Datos para el editor de mapeo (`vistaAnalisisHoja`): encabezado + filas de muestra alineadas por
// columna, de la MISMA grilla del servidor. `CeldaMuestra` se importa desde
// `@/lib/modulos/extraccion/vista-analisis`: un archivo "use server" NO debe re-exportar tipos
// (`export type { X }`), porque el build con Turbopack lo trata como export en runtime y el módulo
// revienta al cargar («CeldaMuestra is not defined»), tumbando TODAS las acciones de la página.

const ADVERTENCIA_VALOR_AMBIGUO =
  "El mapeo guardado apuntaba a un total de factura ambiguo. Selecciona una columna de ingreso neto sin IVA/impuestos, subtotal o base gravable.";

export type AnalisisModulo = {
  ok: boolean;
  message?: string;
  /** Identifica el original ya conservado; se reutiliza al crear el borrador. */
  recepcionLoteId?: string;
  hoja?: string;
  hojas?: string[];
  totalFilas?: number;
  ancho?: number;
  /**
   * Columnas vacías con que empieza la hoja (`GridHoja.columnaInicial`). Las columnas del spec son
   * relativas a la grilla; el asistente suma este desplazamiento para mostrar la letra de Excel.
   */
  columnaInicial?: number;
  encabezado?: CeldaMuestra[];
  muestraFilas?: CeldaMuestra[][];
  /**
   * ÚLTIMAS filas con contenido de la hoja, con su número de fila real. Los archivos
   * declaran su total AL PIE (a veces en un cuadro de cierre sin rótulos), fuera del
   * alcance de `muestraFilas`, que solo trae las primeras. Sin esto, el selector manual de
   * la fila de total no puede ofrecer la celda que hay que señalar.
   */
  muestraCola?: { filaNum: number; celdas: CeldaMuestra[] }[];
  spec?: SpecModulo;
  // «patron»: el mapeo sale de la versión del patrón del aplicativo que coincidió con el archivo.
  // «perfil» / «ia»: archivo manual, con el perfil del cliente o la heurística.
  origen?: "perfil" | "ia" | "patron";
  /**
   * Camino de la carga: «patron» (el archivo coincide con un patrón del aplicativo y se lee sin
   * mapear), «sin_patron» (no coincide: la carga se detiene hasta que un administrador cree el
   * patrón) o «manual» (aplicativo «Archivo manual»: se mapea a mano y se memoriza por cliente).
   */
  modo?: "patron" | "sin_patron" | "manual";
  aplicativo?: { id: number; nombre: string; manual: boolean };
  coincidencia?: {
    versionId: number;
    version: number;
    porcentaje: number;
    estado: "aprobada" | "pendiente";
    advertencias: string[];
  };
  sinPatron?: {
    totalVersiones: number;
    mejor: { version: number; porcentaje: number; hoja: string; faltantes: string[]; faltantesRequeridos: string[] } | null;
  };
  advertenciaValor?: string;
  /**
   * El libro trae otra hoja con exactamente el mismo formato que la elegida. No se bloquea
   * —a veces es legítimo—, pero se avisa: si es la misma cartera exportada en otro momento,
   * los totales de cada hoja cuadran por sí solos y ningún control detectaría la equivocada.
   * En Cartera y CxP explica además qué hojas del libro no se tomaron (balances, hojas de
   * trabajo) y cuáles otras también parecen un auxiliar.
   */
  advertenciaHojas?: string;
  /**
   * Nómina: meses (o rangos, en un acumulado) que trae el archivo con el mapeo propuesto,
   * con filas y valor de cada uno. Guía el rango del cargue que declara el usuario.
   */
  periodosDetectados?: ResumenPeriodo[];
};

async function specPerfilModulo(
  clienteId: number,
  descriptor: NonNullable<ReturnType<typeof descriptorModulo>>,
  candidatas: { huella: string }[],
): Promise<SpecModulo | null> {
  if (candidatas.length === 0) return null;
  const perfiles = await prisma.perfilCargaModulo.findMany({
    where: { clienteId, moduloCodigo: descriptor.codigo, huella: { in: candidatas.map((c) => c.huella) } },
    select: { huella: true, specJson: true },
  });
  const porHuella = new Map(perfiles.map((perfil) => [perfil.huella, perfil.specJson]));
  for (const candidata of candidatas) {
    const perfil = porHuella.get(candidata.huella);
    if (perfil == null) continue;
    const parsed = SpecModuloSchema.safeParse(perfil);
    if (parsed.success) return normalizarSpecModulo(descriptor, parsed.data);
  }
  return null;
}

const mismoSpecModulo = (a: SpecModulo, b: SpecModulo): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Hoja a importar: la elegida explícitamente por el usuario; si no eligió ninguna,
 * la HOJA PREFERIDA del cliente para este módulo (Configuración › Perfiles de carga)
 * cuando existe en el libro; y si no, la primera. Mismo criterio que la carga de
 * balance con `ajustes_carga_balance.hojaPreferida`.
 */
async function resolverHojaModulo(
  hojas: { nombre: string; oculta?: boolean }[],
  hojaElegida: string,
  clienteId: number,
  moduloCodigo: string,
  /** Hoja propuesta por contenido (`seleccionarHojaModulo`); sin ella, la primera VISIBLE del libro. */
  propuesta: string | null = null,
): Promise<string | null> {
  if (hojaElegida && hojas.some((h) => h.nombre === hojaElegida)) return hojaElegida;
  if (!hojaElegida) {
    const ajustes = await prisma.ajustesCargaModulo.findUnique({
      where: { clienteId_moduloCodigo: { clienteId, moduloCodigo } },
      select: { hojaPreferida: true },
    });
    const preferida = ajustes?.hojaPreferida?.trim();
    if (preferida && hojas.some((h) => h.nombre === preferida)) return preferida;
  }
  // Una hoja oculta (resto de la plantilla del auditor) solo se toma si el usuario la nombra.
  return propuesta ?? hojas.find((h) => !h.oculta)?.nombre ?? hojas[0]?.nombre ?? null;
}

export type PreferenciasCargaModulo = {
  ok: boolean;
  message?: string;
  hojaPreferida: string | null;
  observaciones: string | null;
};

/**
 * Preferencias de carga del cliente en un módulo (`ajustes_carga_modulo`), para que el
 * modal de carga preseleccione la hoja preferida y muestre las notas del equipo al
 * elegir el cliente. Se editan en Configuración › Perfiles de carga (admin-only); aquí
 * solo se LEEN con el permiso operativo del módulo y alcance de lectura sobre el cliente.
 */
export async function preferenciasCargaModulo(clienteId: number, moduloCodigo: string): Promise<PreferenciasCargaModulo> {
  const vacio: PreferenciasCargaModulo = { ok: false, hojaPreferida: null, observaciones: null };
  const codigo = String(moduloCodigo ?? "").trim().toUpperCase();
  if (!descriptorModulo(codigo)) return { ...vacio, message: "Módulo no soportado." };
  const cid = Number(clienteId);
  if (!Number.isInteger(cid) || cid <= 0) return { ...vacio, message: "Cliente inválido." };
  const authz = await authorizePermiso("modulos_datos:crear", { clientId: cid, modo: "lectura" });
  if (!authz.ok) return { ...vacio, message: authz.message };
  try {
    const ajustes = await prisma.ajustesCargaModulo.findUnique({
      where: { clienteId_moduloCodigo: { clienteId: cid, moduloCodigo: codigo } },
      select: { hojaPreferida: true, observaciones: true },
    });
    return {
      ok: true,
      hojaPreferida: ajustes?.hojaPreferida?.trim() || null,
      observaciones: ajustes?.observaciones?.trim() || null,
    };
  } catch (e) {
    return { ...vacio, message: mensajeErrorBD("preferenciasCargaModulo", e) };
  }
}

// ============================================================
// ANALIZAR: primero conserva el original y después devuelve la grilla del servidor +
// spec sugerido. El token de recepción permite que LEER reutilice la misma bitácora
// y el mismo objeto, sin duplicarlos al crear el borrador.
// ============================================================
export async function analizarArchivoModulo(formData: FormData): Promise<AnalisisModulo> {
  const moduloCodigo = String(formData.get("moduloCodigo") ?? "").trim().toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) return { ok: false, message: "Módulo no soportado." };
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const clienteId = Number(formData.get("clienteId"));
  if (!Number.isInteger(clienteId) || clienteId <= 0) return { ok: false, message: "Selecciona el cliente." };
  const scope = await authorizePermiso("modulos_datos:crear", { clientId: clienteId });
  if (!scope.ok) return { ok: false, message: scope.message };
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, message: "Adjunta el archivo del módulo." };
  const documentacion = documentacionDesdeFormulario(formData);
  if (!documentacion.success) {
    return { ok: false, message: documentacion.error.issues[0]?.message ?? "La documentación del archivo no es válida." };
  }
  if (!almacenamientoDisponible()) {
    return {
      ok: false,
      message: "No se puede conservar el archivo original porque el almacenamiento de objetos no está configurado. Avisa al administrador antes de continuar.",
    };
  }

  let recepcionLoteId: string | null = null;
  let recepcionOriginalDisponible = false;
  try {
    const [cliente, user] = await Promise.all([
      prisma.client.findUnique({ where: { id: clienteId }, select: { name: true, nit: true } }),
      getCurrentUser(),
    ]);
    if (!cliente) return { ok: false, message: "El cliente seleccionado ya no existe." };
    // El aplicativo que confirmó el analista decide el camino; debe estar en la ficha del cliente.
    const aplicativoValidado = await aplicativoConfirmadoDeCarga(clienteId, moduloCodigo, formData.get("erpId"));
    if (!aplicativoValidado.ok) return { ok: false, message: aplicativoValidado.message };
    const aplicativo = aplicativoValidado.aplicativo;

    let contenidoOriginal: Uint8Array;
    try {
      contenidoOriginal = new Uint8Array(await archivo.arrayBuffer()).slice();
    } catch (e) {
      return { ok: false, message: mensajeErrorLecturaArchivoModulo("analizarArchivoModulo.leerBytes", e) };
    }
    const huellaOriginal = huellaSha256Archivo(contenidoOriginal);
    const recepcionPedida = String(formData.get("recepcionLoteId") ?? "").trim();
    const existente = recepcionPedida
      ? await prisma.archivoOriginalModulo.findUnique({
          where: { loteId: recepcionPedida },
          select: {
            loteId: true,
            clienteId: true,
            moduloCodigo: true,
            nombreArchivo: true,
            tamanoBytes: true,
            huellaSha256: true,
            claveObjeto: true,
            disponible: true,
            estado: true,
          },
        })
      : null;

    if (recepcionPedida && (
      !existente
      || existente.clienteId !== clienteId
      || existente.moduloCodigo !== moduloCodigo
      || existente.nombreArchivo !== archivo.name
      || existente.tamanoBytes !== contenidoOriginal.byteLength
      || existente.huellaSha256 !== huellaOriginal
      || !existente.claveObjeto
      || !["recibido", "no_procesable"].includes(existente.estado)
    )) {
      return { ok: false, message: "La recepción previa no corresponde a este archivo, cliente o módulo. Selecciona nuevamente el archivo." };
    }

    const loteId = existente?.loteId ?? randomUUID();
    const claveObjeto = existente?.claveObjeto ?? claveArchivoOriginalModulo({
      moduloCodigo,
      clienteId,
      loteId,
      nombreArchivo: archivo.name,
    });
    const tipoContenido = tipoContenidoArchivo(archivo.name, archivo.type);
    recepcionLoteId = loteId;
    recepcionOriginalDisponible = existente?.disponible === true;
    if (existente) {
      const recepcionActualizada = await prisma.archivoOriginalModulo.updateMany({
        where: { loteId, estado: { in: ["recibido", "no_procesable"] } },
        data: {
          estado: "recibido",
          ...cambiosDocumentacionPresentes(formData, documentacion.data),
          // El software de origen es el aplicativo que el analista confirmó.
          softwareOrigen: aplicativo.name,
        },
      });
      if (recepcionActualizada.count !== 1) {
        return {
          ok: false,
          message: "La recepción ya fue convertida en borrador o cambió mientras se analizaba. Selecciona nuevamente el archivo.",
        };
      }
    } else {
      await prisma.archivoOriginalModulo.create({
        data: {
          loteId,
          clienteId,
          nombreCliente: cliente.name,
          nitCliente: cliente.nit,
          moduloCodigo,
          periodo: null,
          nombreArchivo: archivo.name,
          tipoContenido,
          tamanoBytes: contenidoOriginal.byteLength,
          huellaSha256: huellaOriginal,
          claveObjeto,
          ubicacionCarpeta: carpetaArchivoOriginalModulo({
            moduloLabel: descriptor.label,
            clienteId,
            nitCliente: cliente.nit,
          }),
          softwareOrigen: aplicativo.name,
          ubicacionOrigen: documentacion.data.ubicacionOrigen,
          reflejoContableEsperado: documentacion.data.reflejoContableEsperado,
          ...datosArchivoOriginalRecibido(),
          esAnexo: false,
          cargadoPor: user?.name ?? null,
          cargadoPorId: user?.id ?? null,
        },
      });
    }
    if (!existente?.disponible) {
      let objetoConservado = false;
      try {
        await subirObjeto({ key: claveObjeto, cuerpo: contenidoOriginal, contentType: tipoContenido });
        objetoConservado = true;
        recepcionOriginalDisponible = true;
        const disponibleActualizado = await prisma.archivoOriginalModulo.updateMany({
          where: { loteId, estado: { in: ["recibido", "no_procesable"] } },
          data: datosArchivoOriginalConservado(),
        });
        if (disponibleActualizado.count !== 1) {
          return {
            ok: false,
            recepcionLoteId: loteId,
            message: "La recepción cambió mientras se conservaba el original. Selecciona nuevamente el archivo.",
          };
        }
      } catch (e) {
        registrarError("analizarArchivoModulo.conservarOriginal", e);
        await prisma.archivoOriginalModulo.updateMany({
          where: { loteId, estado: { in: ["recibido", "no_procesable"] } },
          data: datosArchivoOriginalNoProcesable(objetoConservado),
        }).catch((errorEstado) => registrarError("analizarArchivoModulo.marcarNoProcesable", errorEstado));
        return {
          ok: false,
          recepcionLoteId: loteId,
          message: "No se pudo conservar el archivo original. No se analizará hasta que el almacenamiento esté disponible.",
        };
      }
    }

    const noProcesable = async (message: string): Promise<AnalisisModulo> => {
      await prisma.archivoOriginalModulo.updateMany({
        where: { loteId, estado: { in: ["recibido", "no_procesable"] } },
        data: datosArchivoOriginalNoProcesable(recepcionOriginalDisponible),
      }).catch((errorEstado) => registrarError("analizarArchivoModulo.marcarNoProcesable", errorEstado));
      revalidarListadosModulo(moduloCodigo);
      return {
        ok: false,
        recepcionLoteId: loteId,
        message: `${message} El original quedó conservado y registrado como no procesable en la Bitácora.`,
      };
    };

    let ingesta: Awaited<ReturnType<typeof ingerir>>;
    try {
      ingesta = await ingerir(contenidoOriginal.slice().buffer as ArrayBuffer, archivo.name);
    } catch (e) {
      return noProcesable(mensajeErrorLecturaArchivoModulo("analizarArchivoModulo.ingerir", e));
    }
    if (ingesta.modo !== "tabular") return noProcesable("Por ahora solo se admiten archivos tabulares (Excel/CSV).");
    // Cartera y CxP: los libros de conciliación traen el auxiliar junto al balance por terceros
    // y a hojas de trabajo. La hoja se propone por su contenido, y un archivo que solo trae
    // balances no se procesa como auxiliar.
    const seleccionHoja = descriptor.crucePorTercero.detalleTercero === true || descriptor.nomina != null
      ? seleccionarHojaModulo(descriptor, ingesta.hojas)
      : null;
    if (seleccionHoja?.soloBalances) {
      return noProcesable("Este archivo es un balance (saldo inicial, débitos, créditos y saldo final), no un auxiliar del módulo: cárgalo en Balance.");
    }
    // Nómina (D5): de un libro se lee solo la hoja del módulo; un archivo sin ninguna (un libro
    // auxiliar de todas las cuentas, un catálogo de conceptos, una lista de empleados) no es el
    // módulo y no se carga como tal.
    if (descriptor.nomina && seleccionHoja?.sinAuxiliar) {
      return noProcesable(
        "Este archivo no trae una hoja de nómina (detalle por concepto con su valor, devengo o deducción). "
        + "Si es la relación de conceptos, cárgala en Configuración › Conceptos de nómina; si es un balance, en Balance.",
      );
    }
    const hojaElegida = String(formData.get("hoja") ?? "").trim();
    const nombreHoja = await resolverHojaModulo(ingesta.hojas, hojaElegida, clienteId, moduloCodigo, seleccionHoja?.propuesta ?? null);
    const hoja = ingesta.hojas.find((h) => h.nombre === nombreHoja);
    if (!hoja) return noProcesable("El archivo no tiene hojas legibles.");

    const aplicativoVm = { id: aplicativo.id, nombre: aplicativo.name, manual: aplicativo.manual };

    // ARCHIVO MANUAL: el analista mapea las columnas y el mapeo se memoriza por cliente (perfil
    // por huella). Es el único camino que usa la memoria por cliente.
    if (aplicativo.manual) {
      const perfilSpec = await specPerfilModulo(clienteId, descriptor, huellasCandidatas([hoja]));
      let spec: SpecModulo;
      let origen: "perfil" | "ia";
      let valorAmbiguoInvalidado: boolean;
      if (perfilSpec) {
        const saneado = invalidarValorAmbiguoIngresos(descriptor, hoja, normalizarSpecModulo(descriptor, perfilSpec));
        spec = saneado.spec;
        origen = "perfil";
        valorAmbiguoInvalidado = saneado.invalidado;
      } else {
        spec = sugerirSpec(descriptor, hoja);
        origen = "ia";
        valorAmbiguoInvalidado = moduloCodigo === "ING"
          && (spec.columnas[descriptor.valor] ?? 0) < 1
          && (hoja.filas[spec.filaEncabezado - 1] ?? []).some(encabezadoValorIngresoAmbiguo);
      }
      revalidarListadosModulo(moduloCodigo);
      return {
        ok: true,
        recepcionLoteId: loteId,
        modo: "manual",
        aplicativo: aplicativoVm,
        ...vistaAnalisisHoja(descriptor, ingesta.hojas, hoja, spec, seleccionHoja),
        spec,
        origen,
        ...(valorAmbiguoInvalidado ? { advertenciaValor: ADVERTENCIA_VALOR_AMBIGUO } : {}),
      };
    }

    // PATRÓN DEL APLICATIVO: la versión que mejor coincide con el archivo. Con 80 % o más (y sin
    // columnas obligatorias faltantes) el archivo se lee sin mapear; si no, la carga se detiene
    // hasta que un administrador cree el patrón.
    const { versiones, total } = await versionesPatronCandidatas(descriptor, aplicativo.id, clienteId);
    const ubicacion = mejorVersion(descriptor, ingesta.hojas, versiones, {
      hojaElegida: hojaElegida || null,
      hojaPropuesta: hoja.nombre,
    });
    const hojaPatron = ubicacion ? ingesta.hojas.find((h) => h.nombre === ubicacion.hoja) : undefined;
    let valorAmbiguoPatron = false;
    if (ubicacion && hojaPatron && ubicacion.coincidencia.elegible) {
      const aplicado = aplicarPatronASpec(descriptor, ubicacion);
      const saneado = invalidarValorAmbiguoIngresos(descriptor, hojaPatron, aplicado.spec);
      valorAmbiguoPatron = saneado.invalidado;
      if (!saneado.invalidado) {
        revalidarListadosModulo(moduloCodigo);
        return {
          ok: true,
          recepcionLoteId: loteId,
          modo: "patron",
          origen: "patron",
          aplicativo: aplicativoVm,
          ...vistaAnalisisHoja(descriptor, ingesta.hojas, hojaPatron, saneado.spec, seleccionHoja),
          spec: saneado.spec,
          coincidencia: {
            versionId: ubicacion.version.id,
            version: ubicacion.version.version,
            porcentaje: ubicacion.coincidencia.porcentaje,
            estado: ubicacion.version.estado,
            advertencias: aplicado.advertencias,
          },
        };
      }
    }

    revalidarListadosModulo(moduloCodigo);
    return {
      ok: true,
      recepcionLoteId: loteId,
      modo: "sin_patron",
      aplicativo: aplicativoVm,
      hoja: hoja.nombre,
      hojas: ingesta.hojas.map((h) => h.nombre),
      sinPatron: {
        totalVersiones: total,
        mejor: ubicacion
          ? {
              version: ubicacion.version.version,
              porcentaje: ubicacion.coincidencia.porcentaje,
              hoja: ubicacion.hoja,
              faltantes: ubicacion.coincidencia.faltantes.map((f) => f.rotulo).filter(Boolean).slice(0, 8),
              faltantesRequeridos: ubicacion.coincidencia.faltantesRequeridos,
            }
          : null,
      },
      ...(valorAmbiguoPatron
        ? { advertenciaValor: "El patrón apunta a un total de factura con impuestos como valor del ingreso. Un administrador debe corregirlo antes de cargar." }
        : {}),
    };
  } catch (e) {
    if (recepcionLoteId) {
      await prisma.archivoOriginalModulo.updateMany({
        where: {
          loteId: recepcionLoteId,
          estado: { in: ["recibido", "no_procesable"] },
        },
        data: datosArchivoOriginalNoProcesable(recepcionOriginalDisponible),
      }).catch((errorEstado) => registrarError("analizarArchivoModulo.marcarNoProcesableInesperado", errorEstado));
      revalidarListadosModulo(moduloCodigo);
    }
    const message = mensajeErrorBD("analizarArchivoModulo", e);
    return {
      ok: false,
      ...(recepcionLoteId ? { recepcionLoteId } : {}),
      message: recepcionLoteId
        ? recepcionOriginalDisponible
          ? `${message} El original quedó conservado y registrado como no procesable en la Bitácora.`
          : `${message} La recepción quedó registrada como no procesable, pero el original no está disponible en el almacenamiento.`
        : message,
    };
  }
}

const UbicarCeldaArchivoModuloSchema = z.object({
  moduloCodigo: z.string().trim().min(1).max(20).transform((valor) => valor.toUpperCase()),
  clienteId: z.number().int().positive(),
  recepcionLoteId: z.string().uuid(),
  hoja: z.string().trim().min(1).max(200),
  /** Columna de la GRILLA (la del spec); con `columnaInicial` se vuelve la columna física. */
  columna: z.number().int().min(1).max(16_384),
  columnaInicial: z.number().int().min(0).max(16_383).default(0),
  fila: z.number().int().min(1).max(1_048_576),
});

export type ResultadoUbicarCeldaArchivoModulo = {
  ok: boolean;
  message?: string;
  valor?: CeldaMuestra;
  direccion?: string;
};

/**
 * Resuelve una coordenada exacta del original ya conservado durante el análisis.
 * Devuelve solo esa celda: la fila es una ayuda efímera del modal y nunca se guarda en
 * el perfil, porque cambia entre archivos aunque el formato sea el mismo.
 */
export async function ubicarCeldaArchivoModulo(
  entrada: z.input<typeof UbicarCeldaArchivoModuloSchema>,
): Promise<ResultadoUbicarCeldaArchivoModulo> {
  const permiso = await authorizePermiso("modulos_datos:crear");
  if (!permiso.ok) return { ok: false, message: permiso.message };

  const validacion = UbicarCeldaArchivoModuloSchema.safeParse(entrada);
  if (!validacion.success) {
    return { ok: false, message: "Indica una columna y un número de fila válidos." };
  }
  const datos = validacion.data;
  if (!descriptorModulo(datos.moduloCodigo)) return { ok: false, message: "Módulo no soportado." };

  const alcance = await authorizePermiso("modulos_datos:crear", { clientId: datos.clienteId });
  if (!alcance.ok) return { ok: false, message: alcance.message };

  try {
    const original = await prisma.archivoOriginalModulo.findUnique({
      where: { loteId: datos.recepcionLoteId },
      select: {
        clienteId: true,
        moduloCodigo: true,
        nombreArchivo: true,
        tamanoBytes: true,
        huellaSha256: true,
        claveObjeto: true,
        disponible: true,
        estado: true,
      },
    });
    if (
      !original
      || original.clienteId !== datos.clienteId
      || original.moduloCodigo !== datos.moduloCodigo
      || original.estado !== "recibido"
      || !original.disponible
      || !original.claveObjeto?.trim()
      || typeof original.tamanoBytes !== "number"
      || !Number.isSafeInteger(original.tamanoBytes)
      || original.tamanoBytes <= 0
      || typeof original.huellaSha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(original.huellaSha256)
    ) {
      return { ok: false, message: "El archivo original ya no está disponible para ubicar la celda." };
    }

    const claveObjeto = original.claveObjeto as string;
    const tamanoEsperado = original.tamanoBytes as number;
    const huellaEsperada = original.huellaSha256 as string;
    const objeto = await obtenerObjeto(claveObjeto);
    if (!objeto) return { ok: false, message: "El archivo original ya no está disponible para ubicar la celda." };
    if (
      objeto.cuerpo.byteLength !== tamanoEsperado
      || huellaSha256Archivo(objeto.cuerpo) !== huellaEsperada
    ) {
      registrarError(
        "ubicarCeldaArchivoModulo.integridad",
        new Error(`El objeto ${datos.recepcionLoteId} no coincide con su metadata durable.`),
      );
      return { ok: false, message: "El archivo original no supera la verificación de integridad." };
    }

    // La grilla de SheetJS empieza en la primera columna usada: la O del asistente es la Q de
    // Excel si la hoja trae A y B vacías. Aquí se lee y se rotula la celda real.
    const columnaFisica = datos.columna + datos.columnaInicial;
    if (columnaFisica > 16_384) return { ok: false, message: "Indica una columna y un número de fila válidos." };
    let celdaFisica: Awaited<ReturnType<typeof leerCeldaFisicaArchivo>>;
    try {
      const bytes = objeto.cuerpo.slice();
      celdaFisica = await leerCeldaFisicaArchivo(
        bytes.buffer as ArrayBuffer,
        original.nombreArchivo,
        datos.hoja,
        datos.fila,
        columnaFisica,
      );
    } catch (error) {
      return { ok: false, message: mensajeErrorLecturaArchivoModulo("ubicarCeldaArchivoModulo.leerCeldaFisica", error) };
    }
    if (!celdaFisica.hojaExiste) return { ok: false, message: "La hoja seleccionada ya no existe en el archivo." };

    const direccion = `${letraColumnaModulo(columnaFisica)}${datos.fila}`;
    if (!celdaFisica.filaExiste) {
      return { ok: false, message: `La fila ${datos.fila} no existe en la hoja «${datos.hoja}».` };
    }
    const valor = aCeldaMuestra(celdaFisica.valor);
    const texto = textoCeldaMuestra(valor);
    if (!texto) return { ok: false, message: `La celda ${direccion} está vacía. Elige una celda que contenga el dato marcador.` };
    if (texto.length > 80) {
      return { ok: false, message: `La celda ${direccion} contiene más de 80 caracteres y no puede usarse como marcador.` };
    }
    return { ok: true, valor, direccion };
  } catch (error) {
    return { ok: false, message: mensajeErrorBD("ubicarCeldaArchivoModulo", error) };
  }
}

// ============================================================
// LEER: archivo → staging (borrador). Cliente OBLIGATORIO (los módulos no detectan NIT).
// ============================================================
export async function leerDatosModulo(_prev: ActionState | undefined, formData: FormData): Promise<ActionState & { loteId?: string }> {
  const moduloCodigo = String(formData.get("moduloCodigo") ?? "").trim().toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) return { ok: false, message: "Módulo no soportado." };

  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const clienteId = Number(formData.get("clienteId"));
  if (!Number.isInteger(clienteId) || clienteId <= 0) return { ok: false, message: "Selecciona el cliente." };
  const scope = await authorizePermiso("modulos_datos:crear", { clientId: clienteId });
  if (!scope.ok) return { ok: false, message: scope.message };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, message: "Adjunta el archivo del módulo." };
  const documentacion = documentacionDesdeFormulario(formData);
  if (!documentacion.success) {
    return { ok: false, message: documentacion.error.issues[0]?.message ?? "La documentación del archivo no es válida." };
  }
  if (!almacenamientoDisponible()) {
    return {
      ok: false,
      message: "No se puede conservar el archivo original porque el almacenamiento de objetos no está configurado. Avisa al administrador antes de continuar.",
    };
  }

  // ANEXO declarado («Agregar archivo» desde una fila ya cargada). El destino se valida
  // aquí, contra la BD, y NO se vuelve a confiar en lo que mande el navegador: el borrador
  // queda sellado con el encabezado al que se sumará.
  const anexoCrudo = formData.get("anexoEncabezadoId");
  const anexoPedido = typeof anexoCrudo === "string" && anexoCrudo.trim() ? Number(anexoCrudo) : null;
  if (anexoPedido != null && (!Number.isInteger(anexoPedido) || anexoPedido <= 0)) {
    return { ok: false, message: "El cargue al que se quiere agregar el archivo no es válido." };
  }

  let loteOriginalRecibido: string | null = null;
  try {
    const cliente = await prisma.client.findUnique({
      where: { id: clienteId },
      select: { name: true, nit: true },
    });
    if (!cliente) return { ok: false, message: "El cliente seleccionado ya no existe." };
    const aplicativoValidado = await aplicativoConfirmadoDeCarga(clienteId, moduloCodigo, formData.get("erpId"));
    if (!aplicativoValidado.ok) return { ok: false, message: aplicativoValidado.message };
    const aplicativo = aplicativoValidado.aplicativo;

    let anexoEncabezadoId: number | null = null;
    if (anexoPedido != null) {
      const destino = await prisma.moduloDatoEncabezado.findUnique({
        where: { id: anexoPedido },
        select: {
          id: true,
          clienteId: true,
          moduloCodigo: true,
          esOficial: true,
          estaCongelado: true,
          verificaciones: true,
        },
      });
      if (!destino) return { ok: false, message: "El cargue al que ibas a agregar el archivo ya no existe." };
      if (destino.clienteId !== clienteId || destino.moduloCodigo !== moduloCodigo) {
        return { ok: false, message: "Ese cargue pertenece a otro cliente o módulo." };
      }
      if (!destino.esOficial) return { ok: false, message: "Solo se puede agregar un archivo a la versión vigente." };
      if (destino.estaCongelado) return { ok: false, message: "Ese cargue está congelado: no admite archivos adicionales." };
      const bloqueoAnexo = bloqueoAnexoPorVerificacionesCriticasModulo(
        descriptor,
        (destino.verificaciones ?? {}) as Record<string, { respuesta: "si" | "no" | "na" } | undefined>,
      );
      if (bloqueoAnexo) return { ok: false, message: bloqueoAnexo };
      anexoEncabezadoId = destino.id;
    }

    let contenidoOriginal: Uint8Array;
    try {
      // Copia independiente y huella ANTES del parser. El analizador recibe otra
      // copia, por lo que nunca puede mutar la evidencia que se conserva.
      contenidoOriginal = new Uint8Array(await archivo.arrayBuffer()).slice();
    } catch (e) {
      return { ok: false, message: mensajeErrorLecturaArchivoModulo("leerDatosModulo.leerBytes", e) };
    }

    const user = await getCurrentUser();
    const periodoInicial = fechaISO(formData.get("periodoInicio"));
    const periodoFinal = fechaISO(formData.get("periodoFin"));
    const periodoArchivo = periodoFinal?.toISOString().slice(0, 7)
      ?? periodoInicial?.toISOString().slice(0, 7)
      ?? null;
    const huellaOriginal = huellaSha256Archivo(contenidoOriginal);
    const recepcionPedida = String(formData.get("recepcionLoteId") ?? "").trim();
    const originalRecibido = recepcionPedida
      ? await prisma.archivoOriginalModulo.findUnique({
          where: { loteId: recepcionPedida },
          select: {
            loteId: true,
            clienteId: true,
            moduloCodigo: true,
            nombreArchivo: true,
            tamanoBytes: true,
            huellaSha256: true,
            claveObjeto: true,
            disponible: true,
            estado: true,
          },
        })
      : null;
    if (recepcionPedida && (
      !originalRecibido
      || originalRecibido.clienteId !== clienteId
      || originalRecibido.moduloCodigo !== moduloCodigo
      || originalRecibido.nombreArchivo !== archivo.name
      || originalRecibido.tamanoBytes !== contenidoOriginal.byteLength
      || originalRecibido.huellaSha256 !== huellaOriginal
      || !originalRecibido.claveObjeto
      || !["recibido", "no_procesable"].includes(originalRecibido.estado)
    )) {
      return {
        ok: false,
        message: "La recepción previa no corresponde a este archivo, cliente o módulo. Selecciona nuevamente el archivo.",
      };
    }
    const loteId = originalRecibido?.loteId ?? randomUUID();
    const ubicacionCarpeta = carpetaArchivoOriginalModulo({
      moduloLabel: descriptor.label,
      clienteId,
      nitCliente: cliente.nit,
    });
    const claveObjeto = originalRecibido?.claveObjeto ?? claveArchivoOriginalModulo({
      moduloCodigo,
      clienteId,
      loteId,
      nombreArchivo: archivo.name,
    });
    const tipoContenido = tipoContenidoArchivo(archivo.name, archivo.type);

    // La fila durable nace ANTES de tocar S3 o interpretar el archivo. De ese modo,
    // cualquier objeto que alcance el proveedor siempre tiene una clave y una huella
    // rastreables en PostgreSQL, incluso si luego el parser rechaza su contenido.
    if (originalRecibido) {
      const recepcionActualizada = await prisma.archivoOriginalModulo.updateMany({
        where: { loteId, estado: { in: ["recibido", "no_procesable"] } },
        data: {
          periodo: periodoArchivo,
          estado: "recibido",
          esAnexo: anexoEncabezadoId != null,
          ...cambiosDocumentacionPresentes(formData, documentacion.data),
          // El software de origen es el aplicativo que el analista confirmó.
          softwareOrigen: aplicativo.name,
        },
      });
      if (recepcionActualizada.count !== 1) {
        return {
          ok: false,
          message: "La recepción ya fue procesada o cambió mientras se creaba el borrador. Selecciona nuevamente el archivo.",
        };
      }
    } else {
      await prisma.archivoOriginalModulo.create({
        data: {
          loteId,
          clienteId,
          nombreCliente: cliente.name,
          nitCliente: cliente.nit,
          moduloCodigo,
          periodo: periodoArchivo,
          nombreArchivo: archivo.name,
          tipoContenido,
          tamanoBytes: contenidoOriginal.byteLength,
          huellaSha256: huellaOriginal,
          claveObjeto,
          ubicacionCarpeta,
          softwareOrigen: aplicativo.name,
          ubicacionOrigen: documentacion.data.ubicacionOrigen,
          reflejoContableEsperado: documentacion.data.reflejoContableEsperado,
          ...datosArchivoOriginalRecibido(),
          esAnexo: anexoEncabezadoId != null,
          cargadoPor: user?.name ?? null,
          cargadoPorId: user?.id ?? null,
        },
      });
    }
    loteOriginalRecibido = loteId;

    let objetoConservado = originalRecibido?.disponible === true;
    const marcarNoProcesable = async (
      message: string,
      contexto?: string,
      error?: unknown,
    ): Promise<ActionState & { loteId?: string }> => {
      if (contexto && error !== undefined) registrarError(contexto, error);
      try {
        await prisma.archivoOriginalModulo.updateMany({
          where: { loteId, estado: { in: ["recibido", "no_procesable"] } },
          data: datosArchivoOriginalNoProcesable(objetoConservado),
        });
      } catch (errorEstado) {
        registrarError("leerDatosModulo.marcarNoProcesable", errorEstado);
      }
      revalidarListadosModulo(moduloCodigo);
      return { ok: false, message };
    };

    if (!objetoConservado) {
      try {
        await subirObjeto({ key: claveObjeto, cuerpo: contenidoOriginal, contentType: tipoContenido });
        objetoConservado = true;
        const disponibleActualizado = await prisma.archivoOriginalModulo.updateMany({
          where: { loteId, estado: { in: ["recibido", "no_procesable"] } },
          data: datosArchivoOriginalConservado(),
        });
        if (disponibleActualizado.count !== 1) {
          return {
            ok: false,
            message: "La recepción cambió mientras se conservaba el original. Selecciona nuevamente el archivo.",
          };
        }
      } catch (e) {
        return marcarNoProcesable(
          "No se pudo conservar el archivo original. No se creó el borrador; verifica el almacenamiento e intenta nuevamente.",
          "leerDatosModulo.conservarOriginal",
          e,
        );
      }
    }

    let ingesta: Awaited<ReturnType<typeof ingerir>>;
    try {
      ingesta = await ingerir(contenidoOriginal.slice().buffer as ArrayBuffer, archivo.name);
    } catch (e) {
      return marcarNoProcesable(
        mensajeErrorLecturaArchivoModulo("leerDatosModulo.ingerir", e),
      );
    }
    if (ingesta.modo !== "tabular") {
      return marcarNoProcesable("Por ahora solo se admiten archivos tabulares (Excel/CSV) para módulos.");
    }
    const hojaElegida = String(formData.get("hoja") ?? "").trim();
    type Lectura = {
      hoja: GridHoja;
      spec: SpecModulo;
      origen: "manual" | "perfil" | "ia" | "patron";
      patron: { versionId: number; version: number; porcentaje: number; clasificadorCambiado: boolean } | null;
    };

    // ARCHIVO MANUAL: (1) editado a mano → manual · (2) perfil por huella → perfil · (3) heurístico → ia.
    const lecturaManual = async (): Promise<Lectura | string> => {
      const nombreHoja = await resolverHojaModulo(ingesta.hojas, hojaElegida, clienteId, moduloCodigo);
      const hoja = ingesta.hojas.find((h) => h.nombre === nombreHoja);
      if (!hoja) return "El archivo no tiene hojas legibles.";
      const specEditadoRaw = formData.get("specJson");
      if (typeof specEditadoRaw === "string" && specEditadoRaw.trim()) {
        let specEditado: unknown;
        try {
          specEditado = JSON.parse(specEditadoRaw);
        } catch {
          return "El mapeo de columnas no es válido.";
        }
        const parsed = SpecModuloSchema.safeParse(specEditado);
        if (!parsed.success) return "El mapeo de columnas no es válido.";
        // El origen es metadata de auditoría: se recompone contra fuentes del
        // servidor y nunca se acepta una etiqueta arbitraria enviada por el navegador.
        const spec = normalizarSpecModuloArchivo(descriptor, parsed.data);
        const specReutilizable = normalizarSpecModulo(descriptor, spec);
        const perfilSpec = await specPerfilModulo(clienteId, descriptor, huellasCandidatas([hoja]));
        const origen = perfilSpec && mismoSpecModulo(specReutilizable, perfilSpec)
          ? "perfil"
          : mismoSpecModulo(specReutilizable, normalizarSpecModulo(descriptor, sugerirSpec(descriptor, hoja))) ? "ia" : "manual";
        return { hoja, spec, origen, patron: null };
      }
      const perfilSpec = await specPerfilModulo(clienteId, descriptor, huellasCandidatas([hoja]));
      return perfilSpec
        ? { hoja, spec: perfilSpec, origen: "perfil", patron: null }
        : { hoja, spec: sugerirSpec(descriptor, hoja), origen: "ia", patron: null };
    };

    // PATRÓN DEL APLICATIVO: el navegador solo dice qué versión confirmó; el servidor vuelve a
    // comprobar que el archivo coincide y arma el mapeo. Del navegador solo llegan los datos de
    // ESTE cargue (fecha de corte, TRM, fila del total), nunca columnas.
    const lecturaPorPatron = async (): Promise<Lectura | string> => {
      const versionId = Number(formData.get("patronVersionId"));
      if (!Number.isInteger(versionId) || versionId <= 0) return "Vuelve a analizar el archivo: falta el patrón con que se leerá.";
      const { versiones } = await versionesPatronCandidatas(descriptor, aplicativo.id, clienteId, versionId);
      const ubicacion = mejorVersion(descriptor, ingesta.hojas, versiones, { hojaElegida: hojaElegida || null });
      if (!ubicacion || !ubicacion.coincidencia.elegible) {
        return "El archivo ya no coincide con el patrón del aplicativo. Vuelve a analizarlo.";
      }
      const hoja = ingesta.hojas.find((h) => h.nombre === ubicacion.hoja);
      if (!hoja) return "El archivo no tiene hojas legibles.";
      let spec = aplicarPatronASpec(descriptor, ubicacion).spec;
      const fechaCorte = String(formData.get("fechaCorte") ?? "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte)) spec = { ...spec, fechaCorte };
      const trm = Number(String(formData.get("trmCierre") ?? "").trim());
      if (Number.isFinite(trm) && trm > 0) spec = { ...spec, trmCierre: trm };
      const filaTotal = Number(formData.get("subtotalesFila"));
      if (spec.subtotales === "manual" && Number.isInteger(filaTotal) && filaTotal > 0) spec = { ...spec, subtotalesFila: filaTotal };
      // Inventarios: el analista confirma el clasificador en cada cargue. Vale solo para este
      // archivo (queda en el spec del lote); la versión del patrón no se toca.
      let clasificadorCambiado = false;
      if (descriptor.confirmarClasificadorEnCarga) {
        // Sin respuesta, `Number("")` es 0 y el helper la rechaza con su mensaje.
        const ancho = hoja.filas.reduce((max, fila) => Math.max(max, fila?.length ?? 0), 0);
        const eleccion = aplicarClasificadorDeCarga(
          descriptor,
          spec,
          {
            columna: Number(String(formData.get("clasificadorColumna") ?? "").trim()),
            modo: String(formData.get("clasificadorModo") ?? "").trim() || null,
          },
          ancho,
        );
        if (!eleccion.ok) return eleccion.message;
        spec = eleccion.spec;
        clasificadorCambiado = eleccion.cambio;
      }
      return {
        hoja,
        spec: normalizarSpecModuloArchivo(descriptor, spec),
        origen: "patron",
        patron: { versionId: ubicacion.version.id, version: ubicacion.version.version, porcentaje: ubicacion.coincidencia.porcentaje, clasificadorCambiado },
      };
    };

    const lectura = aplicativo.manual ? await lecturaManual() : await lecturaPorPatron();
    if (typeof lectura === "string") return marcarNoProcesable(lectura);
    const { hoja, origen, patron } = lectura;
    let spec = lectura.spec;

    // Defensa en profundidad: perfiles antiguos, sugerencias ERP o un specJson
    // manipulado solo conservan roles vigentes del descriptor. Después se aplica la
    // protección específica que impide colar un total de factura como cuenta 41.
    spec = normalizarSpecModuloArchivo(descriptor, spec);
    const valorSeguro = invalidarValorAmbiguoIngresos(descriptor, hoja, spec);
    if (valorSeguro.invalidado) {
      return marcarNoProcesable(
        "Ingresos no admite una columna de total de factura para el cruce contable. Mapea ingreso neto sin IVA/impuestos, subtotal o base gravable.",
      );
    }
    spec = valorSeguro.spec;

    // Nómina: el rango de meses del cargue viaja en el spec de ESTE archivo (nunca al perfil):
    // las filas de otros meses quedan fuera del cargue y se avisan.
    if (descriptor.nomina?.periodoPorFila) {
      const desde = periodoInicial?.toISOString().slice(0, 7);
      const hasta = periodoFinal?.toISOString().slice(0, 7);
      spec = { ...spec, ...(desde ? { periodoDesde: desde } : {}), ...(hasta ? { periodoHasta: hasta } : {}) };
    }

    // Importes en divisa: sin la TRM de cierre se leerían dólares como si fueran pesos.
    if (descriptor.crucePorTercero.detalleTercero && esMonedaExtranjera(spec.monedaArchivo) && !(spec.trmCierre != null && spec.trmCierre > 0)) {
      return marcarNoProcesable(`Los importes de esta hoja están en ${spec.monedaArchivo}: indica la TRM de cierre para convertirlos a pesos.`);
    }

    // La coordenada manual es autoridad solo para ESTE original. Nunca se acepta una fila
    // heredada del perfil ni se confía en el texto enviado por el navegador: se vuelve a
    // resolver contra la grilla íntegra y el servidor fija el patrón real de esa celda.
    if (spec.subtotales === "manual") {
      const columna = spec.subtotalesColumna ?? 0;
      const fila = spec.subtotalesFila ?? 0;
      if (columna < 1) return marcarNoProcesable("Indica la columna del archivo donde está el total.");
      if (!Number.isInteger(fila) || fila < 1) {
        return marcarNoProcesable("Ubica la celda exacta del total para este archivo antes de crear el borrador.");
      }
      const indiceFila = hoja.filasFisicas
        ? hoja.filasFisicas.findIndex((numero) => numero === fila)
        : fila - 1;
      const valorUbicado = indiceFila >= 0 ? aCeldaMuestra(hoja.filas[indiceFila]?.[columna - 1] ?? null) : null;
      const textoUbicado = textoCeldaMuestra(valorUbicado);
      if (!textoUbicado) {
        return marcarNoProcesable(`La celda ${letraColumnaModulo(columna + (hoja.columnaInicial ?? 0))}${fila} no existe o está vacía en este archivo.`);
      }
      if (textoUbicado.length > 80) {
        return marcarNoProcesable(`La celda ${letraColumnaModulo(columna + (hoja.columnaInicial ?? 0))}${fila} no puede usarse como total porque supera 80 caracteres.`);
      }
      spec = { ...spec, subtotalesColumna: columna, subtotalesFila: fila, subtotalesTexto: textoUbicado };
    }

    const resultado = transformarModulo(descriptor, spec, hoja);
    if (resultado.filas.length === 0) {
      return marcarNoProcesable("No se leyeron filas con el mapeo actual. Ajusta las columnas.");
    }
    if (
      spec.subtotales === "manual"
      && !resultado.filas.some((fila) => (
        fila.filaNum === spec.subtotalesFila
        && fila.tipoFila === "total"
        && fila.motivo?.startsWith("gran_total:marca_manual")
      ))
    ) {
      return marcarNoProcesable("La fila exacta indicada no pudo convertirse en el total del archivo con el mapeo actual.");
    }

    const huella = calcularHuella(hoja.nombre, hoja.filas[spec.filaEncabezado - 1] ?? []);
    // Reconciliación (red de seguridad de integridad): si quedaron filas con valor real por
    // encima del inicio efectivo, se guarda junto al spec del LOTE (JSON libre, sin migración)
    // para que el borrador pueda avisarlo. El perfil reutilizable (`perfilCargaModulo`) NO
    // lleva esta marca: es información de ESTE archivo, no del layout que se memoriza.
    const reconciliacion = resultadoAReconciliacion(resultado);
    const specConReconciliacion = reconciliacion ? { ...spec, reconciliacion } : spec;
    // La columna y el patrón pertenecen al formato; la fila física pertenece solo a este
    // lote. La normalización reutilizable la retira antes de guardar/actualizar el perfil.
    const specPerfil = normalizarSpecModulo(descriptor, spec);
    const clasificadorDelCargue = patron?.clasificadorCambiado
      ? ` · ${descriptor.columnas.find((c) => c.nombre === descriptor.clasificador)?.etiqueta ?? "Clasificador"} solo para este cargue: ${
          modoClasificadorDe(spec) === "global"
            ? "único para todo el archivo"
            : `columna ${letraColumnaModulo((spec.columnas[descriptor.clasificador] ?? 0) + (hoja.columnaInicial ?? 0))}`
        }`
      : "";
    const detallePatron = patron ? ` · patrón ${aplicativo.name} v${patron.version} (${patron.porcentaje} %)${clasificadorDelCargue}` : ` · ${aplicativo.name}`;

    try {
      await prisma.$transaction(async (tx) => {
        for (let i = 0; i < resultado.filas.length; i += LOTE_STAGING_MODULO) {
          await tx.moduloImportacionStaging.createMany({
            data: resultado.filas.slice(i, i + LOTE_STAGING_MODULO).map((f) => ({
              loteId, moduloCodigo, clienteId, hoja: hoja.nombre, filaNum: f.filaNum,
              clasificador: f.clasificador, valor: f.valor, tipoFila: f.tipoFila,
              // Lo que el transform calcula aparte de los roles (baldes de vencimiento, su
              // suma, el saldo que declaraba la columna de total, el que declara una
              // cabecera de tercero) viaja DENTRO de `datos`: es el único campo que el
              // motor lleva del staging al detalle. Sin esto se perdería en esta frontera.
              // Para los módulos sin familias devuelve el mismo objeto, sin copiarlo.
              datos: datosConExtrasCartera(f.datos, f) as Prisma.InputJsonValue,
              omitida: f.omitida ?? null,
              motivoTipoFila: f.motivo ?? null,
            })),
          });
        }
        await tx.moduloImportacionLote.create({
          data: {
            moduloCodigo, loteId, clienteId, archivoNombre: archivo.name, archivoTam: tamArchivo(archivo.size),
            periodoInicial, periodoFinal,
            anexoEncabezadoId,
            filasLeidas: resultado.filasLeidas, filasExcluidas: resultado.filasExcluidas,
            huella, origenExtraccion: origen, specJson: specConReconciliacion,
            patronVersionId: patron?.versionId ?? null, patronCoincidencia: patron?.porcentaje ?? null,
            cargadoPor: user?.name ?? null, cargadoPorId: user?.id ?? null,
          },
        });
        const originalActualizado = await tx.archivoOriginalModulo.updateMany({
          where: { loteId, estado: "recibido", disponible: true },
          data: { estado: "borrador" },
        });
        if (originalActualizado.count !== 1) {
          throw new Error("La bitácora durable del original no está disponible; no se creó el borrador.");
        }
        // Con patrón se cuenta el uso de la versión; la memoria por cliente es solo del archivo manual.
        if (patron) {
          await tx.versionPatronArchivoModulo.update({
            where: { id: patron.versionId },
            data: { vecesUsado: { increment: 1 }, ultimoUsoEn: new Date() },
          });
        }
        // Perfil del layout por cliente+módulo: se guarda/actualiza para las próximas cargas.
        if (huella && aplicativo.manual) {
          await tx.perfilCargaModulo.upsert({
            where: { clienteId_moduloCodigo_huella: { clienteId, moduloCodigo, huella } },
            create: { clienteId, moduloCodigo, huella, specJson: specPerfil, origen, vecesUsado: 1, ultimoUsoEn: new Date(), archivoEjemplo: archivo.name, creadoPor: user?.name ?? null, creadoPorId: user?.id ?? null },
            update: { specJson: specPerfil, vecesUsado: { increment: 1 }, ultimoUsoEn: new Date(), archivoEjemplo: archivo.name, ...(origen === "manual" ? { origen: "manual" } : {}) },
          });
        }
      }, {
        maxWait: 5_000,
        timeout: TIMEOUT_TRANSACCION_MODULO_MS,
      });
    } catch (e) {
      return marcarNoProcesable(
        mensajeErrorBD("leerDatosModulo.crearBorrador", e),
      );
    }
    loteOriginalRecibido = null;

    await logAudit({
      user: user?.name ?? "Sistema",
      action: `LEYÓ archivo de ${descriptor.label}`,
      entity: cliente.name,
      detail: `${resultado.filas.length} filas · ${archivo.name}${detallePatron} · original conservado · SHA-256 ${huellaOriginal.slice(0, 12)}…`,
      clientId: clienteId,
    });
    revalidarListadosModulo(moduloCodigo);
    return { ok: true, loteId, message: "Archivo leído. Revisa el borrador." };
  } catch (e) {
    if (loteOriginalRecibido) {
      await prisma.archivoOriginalModulo.updateMany({
        where: {
          loteId: loteOriginalRecibido,
          estado: { in: ["recibido", "no_procesable"] },
        },
        data: datosArchivoOriginalNoProcesable(false),
      }).catch((errorEstado) => registrarError("leerDatosModulo.marcarNoProcesableInesperado", errorEstado));
      revalidarListadosModulo(moduloCodigo);
    }
    return { ok: false, message: mensajeErrorBD("leerDatosModulo", e) };
  }
}

/**
 * Reasigna el agrupador (clasificador) de filas del staging en la COLUMNA y en `datos[rol]`, en
 * una sola sentencia. Las dos copias tienen que ir juntas: en Cartera y CxP la cuenta del archivo
 * que usa el cruce por tercero sale de `datos.cuenta` (la promoción la copia a `cuentaCliente`),
 * no de la columna; cambiar solo la columna dejaría la fila «sin clasificar» en ese cruce.
 */
function asignarAgrupadorStaging(loteId: string, rol: string, valor: string | null, filtro: Prisma.Sql) {
  return prisma.$executeRaw`
    UPDATE "modulo_importacion_staging"
    SET "clasificador" = ${valor},
        "datos" = jsonb_set(COALESCE("datos", '{}'::jsonb), ARRAY[${rol}]::text[], COALESCE(to_jsonb(${valor}::text), 'null'::jsonb), true)
    WHERE "lote_id" = ${loteId} AND ${filtro}`;
}

// ============================================================
// EDITAR el borrador: marcar agrupador / subtotal / omitir por fila (se guarda en el staging).
// ============================================================
export async function aplicarCambiosBorradorModulo(
  loteId: string,
  cambios: { filaNum: number; tipoFila?: string; omitida?: boolean | null; clasificador?: string | null }[],
  periodo?: string,
): Promise<ActionState> {
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(loteId ?? "").trim();
  if (!id) return { ok: false, message: "Borrador inválido." };
  try {
    const lote = await prisma.moduloImportacionLote.findUnique({ where: { loteId: id }, select: { clienteId: true, moduloCodigo: true } });
    if (!lote?.clienteId) return { ok: false, message: "El borrador ya no existe o no tiene cliente." };
    const scope = await authorizePermiso("modulos_datos:crear", { clientId: lote.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };
    const periodoNormalizado = periodo?.trim() ?? "";
    if (periodo !== undefined && !/^\d{4}-\d{2}$/.test(periodoNormalizado)) {
      return { ok: false, message: "Indica el período en formato AAAA-MM." };
    }
    const descriptor = descriptorModulo(lote.moduloCodigo);
    const validos = cambios.filter((c) => Number.isInteger(c.filaNum));
    // Agrupador manual: reasigna el clasificador de las filas (vacío → sin clasificar), agrupado
    // por valor para escribirlo en una sola sentencia por agrupador.
    const porAgrupador = new Map<string | null, number[]>();
    for (const c of validos) {
      if (c.clasificador === undefined) continue;
      const valor = c.clasificador?.trim() ? c.clasificador.trim() : null;
      porAgrupador.set(valor, [...(porAgrupador.get(valor) ?? []), c.filaNum]);
    }
    await prisma.$transaction([
      ...validos.flatMap((c) => {
        const data = {
          // `total` = subtotal del archivo (control). Al cambiar de tipo se limpia el
          // tri-estado `omitida` para no dejar estados mixtos (un total nunca se «omite»).
          ...(c.tipoFila === "agrupadora" || c.tipoFila === "movimiento" || c.tipoFila === "total"
            ? { tipoFila: c.tipoFila, tipoFilaForzado: c.tipoFila, omitida: null }
            : {}),
          ...(c.omitida !== undefined ? { omitida: c.omitida } : {}),
        };
        return Object.keys(data).length > 0
          ? [prisma.moduloImportacionStaging.updateMany({ where: { loteId: id, filaNum: c.filaNum }, data })]
          : [];
      }),
      ...[...porAgrupador].map(([valor, filas]) =>
        descriptor && !descriptor.nomina
          ? asignarAgrupadorStaging(id, descriptor.clasificador, valor, Prisma.sql`"fila_num" IN (${Prisma.join(filas)})`)
          : prisma.moduloImportacionStaging.updateMany({ where: { loteId: id, filaNum: { in: filas } }, data: { clasificador: valor } }),
      ),
      ...(periodo !== undefined
        ? [
            prisma.moduloImportacionLote.update({
              where: { loteId: id },
              data: {
                periodoInicial: new Date(`${periodoNormalizado}-01T00:00:00`),
                periodoFinal: new Date(`${periodoNormalizado}-01T00:00:00`),
              },
            }),
            prisma.archivoOriginalModulo.updateMany({
              where: { loteId: id },
              data: { periodo: periodoNormalizado },
            }),
          ]
        : []),
    ]);
    revalidatePath(`${rutaModulo(lote.moduloCodigo)}/borradores/${id}`);
    revalidarListadosModulo(lote.moduloCodigo);
    return { ok: true, message: "Cambios guardados." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("aplicarCambiosBorradorModulo", e) };
  }
}

/**
 * Le pone NOMBRE a uno de los dos grupos del borrador que nombra el sistema y no el archivo: las
 * filas «(sin clasificar)» (el archivo no trae la columna del clasificador) o las «GLOBAL» (modo
 * «único para todo el archivo»). Con un nombre propio se concilian como un renglón más del
 * Consolidado; en un anexo, un nombre que ya usa el cargue destino junta las filas en ese renglón.
 * Nómina no aplica: su clasificador es el código del concepto y de él depende la homologación.
 */
export async function nombrarAgrupadorBorrador(input: { loteId: string; grupo: GrupoSinNombre; nombre: string }): Promise<ActionState> {
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(input?.loteId ?? "").trim();
  if (!id) return { ok: false, message: "Borrador inválido." };
  if (!esGrupoSinNombre(input?.grupo)) return { ok: false, message: "Agrupador inválido." };
  const grupo = input.grupo;
  const nombre = normalizarNombreClasificador(input?.nombre);
  if (!nombre.ok) return nombre;
  if (grupo === "global" && nombre.nombre === CLASIFICADOR_GLOBAL) return { ok: false, message: `Ya se llama «${CLASIFICADOR_GLOBAL}».` };
  try {
    const lote = await prisma.moduloImportacionLote.findUnique({
      where: { loteId: id },
      select: { clienteId: true, moduloCodigo: true, anexoEncabezadoId: true },
    });
    if (!lote?.clienteId) return { ok: false, message: "El borrador ya no existe o no tiene cliente." };
    const scope = await authorizePermiso("modulos_datos:crear", { clientId: lote.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };
    const descriptor = descriptorModulo(lote.moduloCodigo);
    if (!descriptor) return { ok: false, message: "Módulo no soportado." };
    if (descriptor.nomina) return { ok: false, message: "En Nómina el agrupador es el código del concepto: no se renombra." };

    const filtro = grupo === "global"
      ? Prisma.sql`"clasificador" = ${CLASIFICADOR_GLOBAL}`
      : Prisma.sql`("clasificador" IS NULL OR btrim("clasificador") = '')`;
    const filas = await asignarAgrupadorStaging(id, descriptor.clasificador, nombre.nombre, filtro);
    const etiqueta = ETIQUETA_GRUPO_SIN_NOMBRE[grupo];
    if (filas === 0) return { ok: false, message: `No hay filas «${etiqueta}» en este borrador.` };

    const [user, cliente, destino] = await Promise.all([
      getCurrentUser(),
      prisma.client.findUnique({ where: { id: lote.clienteId }, select: { name: true } }),
      lote.anexoEncabezadoId != null
        ? prisma.moduloDatoEncabezado.findUnique({ where: { id: lote.anexoEncabezadoId }, select: { version: true, periodo: true } })
        : Promise.resolve(null),
    ]);
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "NOMBRÓ agrupador del borrador",
      entity: cliente?.name ?? `Cliente ${lote.clienteId}`,
      detail: `${lote.moduloCodigo} · ${filas} fila(s) «${etiqueta}» → «${nombre.nombre}»`
        + (destino ? ` · anexo a la v${destino.version} de ${destino.periodo}` : ""),
      clientId: lote.clienteId,
    });
    revalidatePath(`${rutaModulo(lote.moduloCodigo)}/borradores/${id}`);
    return { ok: true, message: `${filas === 1 ? "La fila quedó" : `Las ${filas} filas quedaron`} como «${nombre.nombre}».` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("nombrarAgrupadorBorrador", e) };
  }
}

// ============================================================
// PROMOVER el borrador a oficial (staging → detalle) + purga.
// ============================================================
/**
 * Mes inicial del rango del cargue (`periodo_desde`), solo en Nómina y solo cuando el
 * rango declarado en el wizard arranca antes del mes final; null = un solo mes.
 */
function periodoDesdeDelLote(moduloCodigo: string, periodoInicial: Date | null | undefined, periodo: string): string | null {
  if (!descriptorModulo(moduloCodigo)?.nomina || !periodoInicial) return null;
  const desde = periodoInicial.toISOString().slice(0, 7);
  return /^d{4}-d{2}$/.test(desde) && desde < periodo ? desde : null;
}
export async function cargarBorradorModulo(_prev: ActionState | undefined, formData: FormData): Promise<ActionState & { encabezadoId?: number; modo?: "agregar" | "version" }> {
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const loteId = String(formData.get("loteId") ?? "").trim();
  if (!loteId) return { ok: false, message: "Borrador inválido." };
  const periodo = String(formData.get("periodo") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(periodo)) return { ok: false, message: "Indica el período (p. ej. 2026-03)." };
  const observaciones = String(formData.get("observaciones") ?? "").trim().slice(0, 4000) || null;
  try {
    // Reintento idempotente: si el navegador perdió la respuesta después del
    // commit, el lote ya no existe pero su encabezado conserva el mismo UUID.
    const yaPromovido = await prisma.moduloDatoEncabezado.findUnique({
      where: { loteId },
      select: { id: true, clienteId: true, version: true },
    });
    if (yaPromovido) {
      const scope = await authorizePermiso("modulos_datos:crear", { clientId: yaPromovido.clienteId });
      if (!scope.ok) return { ok: false, message: scope.message };
      return { ok: true, encabezadoId: yaPromovido.id, message: `La versión v${yaPromovido.version} ya había sido cargada.` };
    }
    // Mismo reintento, pero para un anexo (modo "agregar"): el detalle ya se sumó al
    // vigente en un intento previo, aunque este loteId no bautizó ningún encabezado.
    const yaFusionado = await prisma.moduloDatoEncabezado.findFirst({
      where: { observaciones: { contains: marcaAnexoModulo(loteId) } },
      select: { id: true, clienteId: true, version: true, periodo: true },
    });
    if (yaFusionado) {
      const scope = await authorizePermiso("modulos_datos:crear", { clientId: yaFusionado.clienteId });
      if (!scope.ok) return { ok: false, message: scope.message };
      return { ok: true, encabezadoId: yaFusionado.id, message: `Ese archivo ya se había agregado a la v${yaFusionado.version} del período ${yaFusionado.periodo}.` };
    }

    const lote = await prisma.moduloImportacionLote.findUnique({
      where: { loteId },
      select: { clienteId: true, moduloCodigo: true, anexoEncabezadoId: true },
    });
    if (!lote?.clienteId) return { ok: false, message: "El borrador ya no existe o no tiene cliente." };
    const scope = await authorizePermiso("modulos_datos:crear", { clientId: lote.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };
    const descriptor = descriptorModulo(lote.moduloCodigo);
    if (!descriptor) return { ok: false, message: "Módulo no soportado." };

    // Checklist de verificación (novedades): TODAS las preguntas del descriptor deben venir
    // respondidas (si | no | na). Se guarda id → { respuesta, nota }.
    const verifSchema = z.record(z.string(), z.object({ respuesta: z.enum(["si", "no", "na"]), nota: z.string().max(1000).optional() }));
    let verificaciones: Record<string, { respuesta: "si" | "no" | "na"; nota?: string }> = {};
    const verifRaw = formData.get("verificaciones");
    if (typeof verifRaw === "string" && verifRaw.trim()) {
      const parsed = verifSchema.safeParse(JSON.parse(verifRaw));
      if (!parsed.success) return { ok: false, message: "Respuestas de verificación inválidas." };
      verificaciones = parsed.data;
    }
    const faltan = (descriptor.verificaciones ?? []).filter((v) => !verificaciones[v.id]);
    if (faltan.length) return { ok: false, message: "Responde todas las verificaciones antes de cargar." };
    const bloqueoCritico = bloqueoVerificacionesCriticasModulo(descriptor, verificaciones);
    if (bloqueoCritico) return { ok: false, message: bloqueoCritico };

    const cliente = await prisma.client.findUnique({ where: { id: lote.clienteId }, select: { name: true } });
    if (!cliente) return { ok: false, message: "El cliente ya no existe." };
    const user = await getCurrentUser();

    const resultado = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, `modulo-promocion:${loteId}`);

      const existente = await tx.moduloDatoEncabezado.findUnique({
        where: { loteId },
        select: { id: true, version: true, filas: true, total: true },
      });
      if (existente) return { encabezadoId: existente.id, version: existente.version, filas: existente.filas, total: Number(existente.total), aportados: existente.filas, reutilizado: true, modo: "version" as const };

      await tomarCandadoTransaccion(tx, `modulo-borrador:${loteId}`);
      const loteActual = await tx.moduloImportacionLote.findUnique({
        where: { loteId },
        select: {
          id: true,
          clienteId: true,
          moduloCodigo: true,
          archivoNombre: true,
          archivoTam: true,
          origenExtraccion: true,
          // El spec dice qué representa una fila de ESTE archivo (por tercero o por
          // documento) y de dónde viene la cartera; ambos se persisten en el cargue.
          specJson: true,
          // Nómina: el rango declarado del cargue (D7) se congela en el encabezado.
          periodoInicial: true,
        },
      });
      if (!loteActual || loteActual.clienteId == null || loteActual.clienteId !== lote.clienteId || loteActual.moduloCodigo !== lote.moduloCodigo) {
        throw new Error("El borrador cambió durante la carga o ya no existe; no se creó ninguna versión.");
      }

      const filasBD = await tx.moduloImportacionStaging.findMany({ where: { loteId }, orderBy: { filaNum: "asc" } });
      if (filasBD.length === 0) throw new Error("El borrador no tiene filas.");
      const filas: FilaStagingModulo[] = filasBD.map((f) => ({
        filaNum: f.filaNum,
        clasificador: f.clasificador,
        valor: Number(f.valor),
        datos: (f.datos ?? {}) as Record<string, unknown>,
        tipoFila: f.tipoFila,
        omitida: f.omitida,
        motivo: f.motivoTipoFila,
      }));
      const columnasNumericas = descriptor.columnas
        .filter((c) => c.tipo === "numero" || c.tipo === "moneda")
        .map((c) => c.nombre);
      // Todas las filas del lote comparten hoja (una sola por archivo importado).
      const hojaLote = filasBD.find((f) => f.hoja)?.hoja ?? null;
      const promocion = promoverStaging(filas, columnasNumericas);
      // VALIDACIÓN DEL ARCHIVO: mismo cálculo que muestra el borrador, para que el cargue
      // conserve EL MISMO veredicto. Hay que hacerlo aquí: la fila del total no es imputable
      // y el staging se purga en esta misma transacción, así que después ya no se puede
      // reconstruir desde el detalle.
      const granTotalArchivo = controlSubtotales(
        filas,
        (f) => esImputable({ tipoFila: f.tipoFila, omitida: f.omitida ?? null, datos: f.datos } as FilaStagingModulo, columnasNumericas),
      ).granTotal;
      if (promocion.filas === 0) {
        throw new Error("No hay filas imputables para cargar (todas omitidas, agrupadoras o en cero).");
      }

      // ===== CARTERA: nivel de la fila, identidad del tercero y saldo materializado =====
      // Todo lo que sigue es inerte para los módulos sin detalle por tercero
      // (crucePorTercero.detalleTercero: Cartera y, cuando exista, CxP).
      const cartera = descriptor.crucePorTercero.detalleTercero ? (() => {
        const specLote = (loteActual.specJson ?? {}) as Record<string, unknown>;
        const columnasSpec = (specLote.columnas ?? {}) as Record<string, number>;
        // El tipo de formato declarado; si no, el nivel declarado; y, sin nada, una columna de
        // documento mapeada dice que cada fila es un documento.
        const specFormato = {
          tipoFormato: esTipoFormatoCartera(specLote.tipoFormato) ? specLote.tipoFormato : undefined,
          nivel: SpecModuloSchema.shape.nivel.safeParse(specLote.nivel).data,
          columnas: columnasSpec,
          familias: SpecModuloSchema.shape.familias.safeParse(specLote.familias).data,
          edadesModo: SpecModuloSchema.shape.edadesModo.safeParse(specLote.edadesModo).data,
        };
        const nivel: NivelCartera = nivelCarteraDeSpec(specFormato);
        // Qué controles se podían validar con este archivo (se congela en el encabezado).
        const formato = formatoArchivoCartera(specFormato, {
          loteId,
          archivo: loteActual.archivoNombre,
          rolTotal: descriptor.valor,
        });
        const origenDeclarado = specLote.origenCartera === "nacional" || specLote.origenCartera === "exterior"
          ? specLote.origenCartera
          : null;
        // Las CABECERAS de tercero no imputan —sumarían dos veces lo mismo— pero se guardan
        // en el detalle: su saldo declarado es la contraparte del control que certifica que
        // el archivo se leyó bien. Conservarlas aquí, y no solo en el agregado, es lo que
        // permite reconstruir ese agregado desde el detalle.
        // Igual el «Total <cliente>» debajo de sus documentos: el transform le dejó el saldo
        // declarado (`totalesPorTercero`); los demás totales no lo traen.
        const cabeceras = filas.filter((f) => (
          f.motivo === "subtotal_tercero:cabecera"
          || (f.tipoFila === "total" && leerSaldoDeclarado(f.datos) != null)
        ));
        return {
          nivel,
          formato,
          origenDeclarado,
          cabeceras,
          fechaCorte: fechaDeCelda(specLote.fechaCorte),
          trmCierre: validarTrm(specLote.trmCierre),
          monedaArchivo: typeof specLote.monedaArchivo === "string" ? specLote.monedaArchivo : null,
        };
      })() : null;
      // Fecha de corte del cargue: la que declaró quien cargó o, por defecto, el fin del período.
      const fechaCorteCargue = cartera ? cartera.fechaCorte ?? finDePeriodo(periodo) : null;

      /** Columnas propias de cartera para una fila del detalle. */
      const columnasCartera = (f: { datos: Record<string, unknown> }, imputable: boolean) => {
        if (!cartera) return {};
        const t = normalizarTerceroCartera({
          nit: f.datos.nit, dv: f.datos.dv, nombre: f.datos.nombre, sucursal: f.datos.sucursal,
        });
        return {
          nivel: cartera.nivel,
          imputable,
          nitCanonico: t.claveCanonica,
          cuentaCliente: typeof f.datos.cuenta === "string" ? f.datos.cuenta : null,
          // Sin la cuenta del archivo: en el cruce por tercero manda la cuenta asignada en el
          // Consolidado (`origenPorAsignacion`); esto es el respaldo cuando la asignación no decide.
          origenCartera: resolverOrigenCartera({
            declarado: cartera.origenDeclarado as "nacional" | "exterior" | null,
            moneda: typeof f.datos[CLAVE_MONEDA] === "string" ? (f.datos[CLAVE_MONEDA] as string) : cartera.monedaArchivo,
            sugerido: t.origenSugerido,
          }),
        };
      };

      // Serializa el consecutivo y el cambio de versión vigente para este grupo (también
      // serializa dos anexos concurrentes al mismo vigente: el segundo espera al primero).
      await tomarCandadoTransaccion(tx, `modulo-cargue:${loteActual.clienteId}:${loteActual.moduloCodigo}:${periodo}`);
      const ahora = new Date();

      // Fraccionamiento: el vigente del período (si lo hay) decide si el archivo se
      // AGREGA (ítems nuevos → misma versión, se acumula) o si crea una VERSIÓN nueva
      // completa (re-subida de algún ítem ya cargado, o el vigente está congelado).
      const vigente = await tx.moduloDatoEncabezado.findFirst({
        where: { clienteId: loteActual.clienteId, moduloCodigo: loteActual.moduloCodigo, periodo, esOficial: true },
        select: {
          id: true,
          version: true,
          filas: true,
          total: true,
          observaciones: true,
          estaCongelado: true,
          verificaciones: true,
          totalDeclarado: true,
          archivosDelCargue: true,
          archivosConTotal: true,
          trmCierre: true,
          fechaCorte: true,
          formatosCartera: true,
        },
      });
      // El anexo solo procede sobre el MISMO encabezado que el usuario eligió. Si entre la
      // subida y la confirmación ese cargue dejó de ser el vigente (otra versión, o se
      // eliminó), no se anexa a ciegas: la carga sigue como versión nueva.
      const anexoSolicitado = lote.anexoEncabezadoId != null && vigente?.id === lote.anexoEncabezadoId;
      if (lote.anexoEncabezadoId != null && descriptor.verificacionesCriticasSi?.length) {
        if (!anexoSolicitado || !vigente) {
          throw new Error(
            `El cargue elegido de ${descriptor.label} dejó de ser la versión vigente. El archivo no se anexó: se requiere una recarga completa como nueva versión.`,
          );
        }
        const bloqueoAnexo = bloqueoAnexoPorVerificacionesCriticasModulo(
          descriptor,
          (vigente.verificaciones ?? {}) as Record<string, { respuesta: "si" | "no" | "na" } | undefined>,
        );
        if (bloqueoAnexo) throw new Error(bloqueoAnexo);
      }
      const rolesLlave = rolesLlaveItemDe(descriptor);
      const clavesNuevas = clavesDeDetalle(promocion.detalle, rolesLlave);
      let clavesExistentes = new Set<string>();
      let maxFilaExistente = 0;
      if (vigente) {
        const detalleVigente = await tx.moduloDatoDetalle.findMany({
          where: { encabezadoId: vigente.id },
          select: { filaNum: true, clasificador: true, datos: true },
        });
        clavesExistentes = clavesDeDetalle(
          detalleVigente.map((d) => ({ clasificador: d.clasificador, datos: (d.datos ?? {}) as Record<string, unknown> })),
          rolesLlave,
        );
        maxFilaExistente = detalleVigente.reduce((m, d) => Math.max(m, d.filaNum), 0);
      }
      const decision = decidirCarga({
        hayVigente: !!vigente,
        vigenteCongelado: vigente?.estaCongelado ?? false,
        anexoSolicitado,
        clavesNuevas,
        clavesExistentes,
      });

      if (decision.modo === "agregar" && vigente) {
        // Todo el período se convierte con UNA TRM de cierre: un anexo con otra tasa dejaría pesos
        // de dos tasas distintas en el mismo cargue.
        if (cartera?.trmCierre != null && vigente.trmCierre != null && Math.abs(Number(vigente.trmCierre) - cartera.trmCierre) > 0.00005) {
          throw new Error(`El cargue de ${periodo} ya usa una TRM de cierre de ${Number(vigente.trmCierre)} y este archivo trae ${cartera.trmCierre}. Usa la misma TRM para que todo el período quede en la misma tasa.`);
        }
        const { filas: detalleRemapeado, remap } = remapFilas(promocion.detalle, maxFilaExistente);
        await tx.moduloDatoDetalle.createMany({
          data: detalleRemapeado.map((d) => ({
            encabezadoId: vigente.id,
            filaNum: d.filaNum,
            clasificador: d.clasificador,
            valor: d.valor,
            datos: d.datos as Prisma.InputJsonValue,
            ...columnasCartera(d, true),
          })),
        });
        if (cartera && cartera.cabeceras.length > 0) {
          const { filas: cabecerasRemapeadas } = remapFilas(
            cartera.cabeceras.map((f) => ({ filaNum: f.filaNum, clasificador: f.clasificador, valor: 0, datos: f.datos })),
            maxFilaExistente + detalleRemapeado.length,
          );
          await tx.moduloDatoDetalle.createMany({
            data: cabecerasRemapeadas.map((d) => ({
              encabezadoId: vigente.id,
              filaNum: d.filaNum,
              clasificador: d.clasificador,
              valor: 0,
              datos: d.datos as Prisma.InputJsonValue,
              ...columnasCartera(d, false),
            })),
          });
        }

        // No toca `hoja` del encabezado (es la del archivo principal); la del anexo
        // queda en la propia línea de observaciones, junto al resto de la evidencia.
        const hojaTxt = hojaLote ? ` · hoja: ${hojaLote}` : "";
        const linea = `Anexo: ${loteActual.archivoNombre}${hojaTxt} (+${promocion.filas} ítems) · ${ahora.toISOString().slice(0, 10)}${observaciones ? ` — ${observaciones}` : ""} ${marcaAnexoModulo(loteId)}`;
        const observacionesFinal = vigente.observaciones ? `${vigente.observaciones}\n${linea}` : linea;

        // El declarado se ACUMULA archivo a archivo (no se puede usar `increment`: sobre una
        // columna null daría null). `filaTotalDeclarado` se pierde a propósito — con dos
        // archivos ya no señala una fila concreta —, y la cobertura queda registrada para no
        // presentar como descuadre lo que solo es un anexo sin total al pie.
        const archivosConTotal = (vigente.archivosConTotal ?? 0) + (granTotalArchivo ? 1 : 0);
        const declaradoAcumulado = archivosConTotal === 0
          ? null
          : Number(vigente.totalDeclarado ?? 0) + (granTotalArchivo?.subtotalArchivo ?? 0);

        await tx.moduloDatoEncabezado.update({
          where: { id: vigente.id },
          data: {
            filas: { increment: promocion.filas },
            total: { increment: promocion.total },
            totalDeclarado: declaradoAcumulado,
            filaTotalDeclarado: null,
            ...(cartera?.trmCierre != null && vigente.trmCierre == null ? { trmCierre: new Prisma.Decimal(cartera.trmCierre.toFixed(4)) } : {}),
            ...(cartera && fechaCorteCargue && vigente.fechaCorte == null ? { fechaCorte: fechaCalendarioPrisma(fechaCorteCargue) } : {}),
            archivosDelCargue: (vigente.archivosDelCargue ?? 1) + 1,
            archivosConTotal,
            ultimaCarga: ahora,
            cargadoPor: user?.name ?? null,
            cargadoPorId: user?.id ?? null,
            observaciones: observacionesFinal,
            verificaciones: verificaciones as Prisma.InputJsonValue,
            ...(cartera
              ? { rangosEdades: rotulosDeEdades([...promocion.detalle]) as Prisma.InputJsonValue }
              : {}),
            // Un cargue anterior (sin formatos) sigue sin ellos: su primer archivo es desconocido.
            ...(cartera && leerFormatosCartera(vigente.formatosCartera)
              ? { formatosCartera: [...leerFormatosCartera(vigente.formatosCartera)!, cartera.formato] as Prisma.InputJsonValue }
              : {}),
          },
        });

        // El agregado por tercero se rehace con el detalle COMPLETO del cargue, no solo con
        // lo que trajo este anexo: el saldo de un tercero puede venir repartido entre los
        // archivos del período.
        if (cartera) {
          const sinAtribuir = await materializarCarteraEnTransaccion(tx, vigente.id, loteId, cartera.nivel);
          exigirCarteraAtribuida(sinAtribuir);
        }

        // Reancla SOLO los comentarios `fila:<n>` cuyo renglón se promovió (está en el
        // remap); los de otras anclas, o de filas que no llegaron al oficial, migran tal cual.
        const comentarios = await tx.comment.findMany({ where: { entityType: "modulos_borrador", entityId: loteActual.id } });
        for (const c of comentarios) {
          const m = /^fila:(\d+)$/.exec(c.anchor ?? "");
          const nuevaFila = m ? remap.get(Number(m[1])) : undefined;
          await tx.comment.update({
            where: { id: c.id },
            data: { entityType: "modulos_datos", entityId: vigente.id, ...(nuevaFila != null ? { anchor: `fila:${nuevaFila}` } : {}) },
          });
        }

        const originalActualizado = await tx.archivoOriginalModulo.updateMany({
          where: { loteId },
          data: datosArchivoOriginalPromovido({ encabezadoId: vigente.id, periodo, esAnexo: true }),
        });
        if (originalActualizado.count !== 1) {
          throw new Error("No se encontró la bitácora del archivo original; la promoción fue revertida.");
        }

        const stagingEliminado = await tx.moduloImportacionStaging.deleteMany({ where: { loteId } });
        if (stagingEliminado.count === 0) throw new Error("No se pudo consumir el detalle del borrador; la promoción fue revertida.");
        const loteEliminado = await tx.moduloImportacionLote.deleteMany({ where: { loteId } });
        if (loteEliminado.count !== 1) throw new Error("No se pudo consumir el encabezado del borrador; la promoción fue revertida.");

        return {
          encabezadoId: vigente.id,
          version: vigente.version,
          filas: vigente.filas + promocion.filas,
          total: Number(vigente.total) + promocion.total,
          aportados: promocion.filas,
          reutilizado: false,
          modo: "agregar" as const,
        };
      }

      // VERSIÓN nueva completa (sin vigente, vigente congelado, o re-subida de un ítem):
      // cada confirmación en este modo es una fotografía independiente. Ningún detalle se
      // anexa a una versión anterior: las anteriores quedan como historial.
      const previa = await tx.moduloDatoEncabezado.findFirst({
        where: { clienteId: loteActual.clienteId, moduloCodigo: loteActual.moduloCodigo, periodo },
        orderBy: [{ version: "desc" }, { id: "desc" }],
        select: { version: true },
      });
      const version = (previa?.version ?? 0) + 1;

      await tx.moduloDatoEncabezado.updateMany({
        where: { clienteId: loteActual.clienteId, moduloCodigo: loteActual.moduloCodigo, periodo, esOficial: true },
        data: { esOficial: false },
      });
      const enc = await tx.moduloDatoEncabezado.create({
        data: {
          moduloCodigo: loteActual.moduloCodigo,
          loteId,
          clienteId: loteActual.clienteId,
          nombreCliente: cliente.name,
          periodo,
          // Nómina (D7): mes inicial del rango del cargue cuando no es el mismo mes final.
          periodoDesde: periodoDesdeDelLote(loteActual.moduloCodigo, loteActual.periodoInicial, periodo),
          version,
          esOficial: true,
          filas: promocion.filas,
          total: promocion.total,
          totalDeclarado: granTotalArchivo?.subtotalArchivo ?? null,
          filaTotalDeclarado: granTotalArchivo?.filaNum ?? null,
          archivosDelCargue: 1,
          archivosConTotal: granTotalArchivo ? 1 : 0,
          archivoNombre: loteActual.archivoNombre,
          archivoTam: loteActual.archivoTam,
          hoja: hojaLote,
          origenExtraccion: loteActual.origenExtraccion,
          observaciones,
          verificaciones: verificaciones as Prisma.InputJsonValue,
          ...(cartera
            ? {
              nivelSaldo: cartera.nivel,
              fechaCorte: fechaCorteCargue ? fechaCalendarioPrisma(fechaCorteCargue) : null,
              ...(cartera.trmCierre != null ? { trmCierre: new Prisma.Decimal(cartera.trmCierre.toFixed(4)) } : {}),
              // Los rótulos de los baldes se congelan aquí para que la pantalla sepa qué
              // columnas pintar sin abrir el JSON de cada una de las filas.
              rangosEdades: rotulosDeEdades(promocion.detalle) as Prisma.InputJsonValue,
              formatosCartera: [cartera.formato] as Prisma.InputJsonValue,
            }
            : {}),
          cargadoPor: user?.name ?? null,
          cargadoPorId: user?.id ?? null,
          ultimaCarga: ahora,
          detalles: {
            create: [
              ...promocion.detalle.map((d) => ({
                filaNum: d.filaNum,
                clasificador: d.clasificador,
                valor: d.valor,
                datos: d.datos as Prisma.InputJsonValue,
                ...columnasCartera(d, true),
              })),
              // Cabeceras de tercero: no imputan, pero sostienen el control.
              ...(cartera?.cabeceras ?? []).map((f) => ({
                filaNum: f.filaNum,
                clasificador: f.clasificador,
                valor: 0,
                datos: f.datos as Prisma.InputJsonValue,
                ...columnasCartera(f, false),
              })),
            ],
          },
        },
        select: { id: true },
      });

      if (cartera) {
        const sinAtribuir = await materializarCarteraEnTransaccion(tx, enc.id, loteId, cartera.nivel);
        exigirCarteraAtribuida(sinAtribuir);
      }

      await tx.comment.updateMany({
        where: { entityType: "modulos_borrador", entityId: loteActual.id },
        data: { entityType: "modulos_datos", entityId: enc.id },
      });
      const originalActualizado = await tx.archivoOriginalModulo.updateMany({
        where: { loteId },
        data: datosArchivoOriginalPromovido({ encabezadoId: enc.id, periodo, esAnexo: false }),
      });
      if (originalActualizado.count !== 1) {
        throw new Error("No se encontró la bitácora del archivo original; la promoción fue revertida.");
      }
      const stagingEliminado = await tx.moduloImportacionStaging.deleteMany({ where: { loteId } });
      if (stagingEliminado.count === 0) throw new Error("No se pudo consumir el detalle del borrador; la promoción fue revertida.");
      const loteEliminado = await tx.moduloImportacionLote.deleteMany({ where: { loteId } });
      if (loteEliminado.count !== 1) throw new Error("No se pudo consumir el encabezado del borrador; la promoción fue revertida.");

      return { encabezadoId: enc.id, version, filas: promocion.filas, total: promocion.total, aportados: promocion.filas, reutilizado: false, modo: "version" as const };
    }, { timeoutMs: TIMEOUT_TRANSACCION_MODULO_MS });

    const mensaje = resultado.modo === "agregar"
      ? `Agregado a ${descriptor.label} del período ${periodo} (${resultado.aportados} ítems nuevos, total ${resultado.filas}).`
      : `Nueva versión v${resultado.version} cargada (${resultado.filas} filas).`;
    if (!resultado.reutilizado) {
      await logAudit({
        user: user?.name ?? "Sistema",
        action: resultado.modo === "agregar" ? `AGREGÓ ítems a ${descriptor.label}` : `CARGÓ ${descriptor.label}`,
        entity: cliente.name,
        detail: resultado.modo === "agregar"
          ? `${periodo} · v${resultado.version} · +${resultado.aportados} filas (total ${resultado.filas}) · total $ ${resultado.total}`
          : `${periodo} · v${resultado.version} · ${resultado.filas} filas · total ${resultado.total}`,
        clientId: lote.clienteId,
      });
    }
    revalidarListadosModulo(lote.moduloCodigo);
    return { ok: true, encabezadoId: resultado.encabezadoId, modo: resultado.modo, message: mensaje };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("cargarBorradorModulo", e) };
  }
}

// ============================================================
// DESCARTAR el borrador (staging + lote).
// ============================================================
export async function descartarBorradorModulo(loteId: string): Promise<ActionState> {
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(loteId ?? "").trim();
  if (!id) return { ok: false, message: "Borrador inválido." };
  try {
    const lote = await prisma.moduloImportacionLote.findUnique({ where: { loteId: id }, select: { id: true, clienteId: true, moduloCodigo: true } });
    if (!lote) return { ok: true, message: "El borrador ya no existía." };
    if (lote.clienteId) {
      const scope = await authorizePermiso("modulos_datos:crear", { clientId: lote.clienteId });
      if (!scope.ok) return { ok: false, message: scope.message };
    }
    await prisma.$transaction(async (tx) => {
      // Primero se exige la bitácora durable. Si falta, toda la transacción revierte
      // y el borrador permanece intacto para no perder su única referencia al original.
      const originalActualizado = await tx.archivoOriginalModulo.updateMany({
        where: { loteId: id },
        data: datosArchivoOriginalDescartado(),
      });
      if (originalActualizado.count !== 1) {
        throw new Error("No se encontró la bitácora del archivo original; el descarte fue revertido.");
      }

      await tx.comment.deleteMany({ where: { entityType: "modulos_borrador", entityId: lote.id } });
      await tx.moduloImportacionStaging.deleteMany({ where: { loteId: id } });
      const loteEliminado = await tx.moduloImportacionLote.deleteMany({ where: { loteId: id } });
      if (loteEliminado.count !== 1) {
        throw new Error("No se pudo retirar el borrador; el descarte fue revertido.");
      }
    });
    revalidarListadosModulo(lote.moduloCodigo);
    return { ok: true, message: "Borrador descartado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("descartarBorradorModulo", e) };
  }
}

// ============================================================
// DOCUMENTACIÓN PROGRESIVA de la bitácora de originales.
// ============================================================
export async function actualizarDocumentacionArchivoModulo(input: {
  archivoId: number;
  softwareOrigen: string;
  ubicacionOrigen: string;
  reflejoContableEsperado: string;
}): Promise<ActionState> {
  const permiso = await authorizePermiso("modulos_datos:editar");
  if (!permiso.ok) return { ok: false, message: permiso.message };
  const archivoId = Number(input.archivoId);
  if (!Number.isSafeInteger(archivoId) || archivoId <= 0) {
    return { ok: false, message: "Archivo inválido." };
  }

  try {
    const archivo = await prisma.archivoOriginalModulo.findUnique({
      where: { id: archivoId },
      select: {
        id: true,
        clienteId: true,
        moduloCodigo: true,
        nombreArchivo: true,
        nombreCliente: true,
      },
    });
    if (!archivo) return { ok: false, message: "El archivo ya no existe en la bitácora." };
    const alcance = await authorizePermiso("modulos_datos:editar", { clientId: archivo.clienteId });
    if (!alcance.ok) return { ok: false, message: alcance.message };

    const parsed = DocumentacionArchivoModuloSchema.safeParse({
      softwareOrigen: input.softwareOrigen,
      ubicacionOrigen: input.ubicacionOrigen,
      reflejoContableEsperado: input.reflejoContableEsperado,
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "La documentación no es válida." };
    }

    await prisma.archivoOriginalModulo.update({
      where: { id: archivo.id },
      data: parsed.data,
    });
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "DOCUMENTÓ archivo original de módulo",
      entity: archivo.nombreCliente,
      detail: `${archivo.moduloCodigo} · ${archivo.nombreArchivo}`,
      clientId: archivo.clienteId,
    });
    return { ok: true, message: "Documentación del archivo actualizada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("actualizarDocumentacionArchivoModulo", e) };
  }
}

// ============================================================
// CONSOLIDACIÓN por cliente: clasificador → cuenta Russell (upsert / borrar).
// La cuenta es el subgrupo de 4 díg., o la cuenta completa de 6 en los módulos que
// cruzan a ese nivel (Nómina, `nivelCruce: 6`): ahí `cuenta_4` conserva el prefijo y
// `cuenta_6` la cuenta entera.
// ============================================================
/** Clave de una fila del cruce contable: una cuenta de 4/6 díg., una fila agrupada («130505+280505») o el saldo sin cuenta. */
function cuentaMarcable(v: string): string {
  return normalizarClaveCruce(v);
}

// Cédula contable del módulo (nivel, prefijos del prevalidador y ampliaciones del descriptor).
async function cedulaDelModulo(moduloCodigo: string, descriptor: DescriptorModulo): Promise<CedulaModulo> {
  return cedulaModulo(descriptor, prefijosCuentaModulo(moduloCodigo, await getCatalogoPrevalidador()));
}

// Valida que TODAS las cuentas del conjunto sean asignables en la cédula del módulo (una vez).
// Las de 6 dígitos tienen que existir además en el plan estándar.
async function validarCuentasModulo(moduloCodigo: string, cuentas: string[], cedula: CedulaModulo, entradas: number): Promise<ActionState | null> {
  const longitudes = [...longitudesCedula(cedula)].sort().join(" o ");
  if (cuentas.length !== entradas) return { ok: false, message: `Cada cuenta debe ser Russell de ${longitudes} dígitos.` };
  const fuera = cuentas.find((c) => !cuentaAsignableCedula(cedula, c));
  if (fuera) {
    const adicionales = [...cedula.adicionales.keys()];
    const listado = cedula.nivel === 6 && cedula.lista6
      ? [...cedula.lista6, ...adicionales].join(", ")
      : [...cedula.prefijos, ...adicionales].join(", ") || "—";
    const abierto = cedula.abiertos.has(fuera.slice(0, 4))
      ? ` Las cuentas de ${fuera.slice(0, 4)} no se asignan: salen de la relación con el activo.`
      : "";
    return { ok: false, message: `La cuenta ${fuera} no pertenece al módulo ${moduloCodigo}. Usa una cuenta de ${cedula.nivel === 6 && cedula.lista6 ? "estas" : "estos prefijos o cuentas"}: ${listado}.${abierto}` };
  }
  const seis = cuentas.filter((c) => c.length === 6);
  if (seis.length > 0) {
    const existentes = await prisma.standardAccount.findMany({ where: { code: { in: seis } }, select: { code: true } });
    const conocidas = new Set(existentes.map((e) => e.code));
    const inexistente = seis.find((c) => !conocidas.has(c));
    if (inexistente) return { ok: false, message: `La cuenta ${inexistente} no existe en el plan estándar Russell.` };
  }
  return null;
}

// Reemplaza el CONJUNTO de cuentas de un clasificador dentro de una transacción (tx):
// borra las que ya tenía y crea las nuevas. Conjunto vacío = deja el clasificador sin cuenta.
// `descripcion` es el nombre legible del clasificador (Nómina: el concepto detrás del
// código, cargado en /config/conceptos-nomina): se RE-ESCRIBE al recrear las filas para
// que editar las cuentas a mano no borre el nombre.
// En Nómina la fila lleva además el AGRUPADOR (centro de costo / clase del archivo, '' = a
// todos) y conserva lo que la carga masiva supo del concepto (grupo RF-NOM-02, subcuenta PUC,
// cuenta del cliente): editar la cuenta Russell a mano no borra esa memoria.
type MemoriaConcepto = { descripcion: string | null; grupo: string | null; subcuentaPuc: string | null; cuentaCliente: string };
function reemplazarCuentasTx(tx: Prisma.TransactionClient, clienteId: number, moduloCodigo: string, clasificador: string, cuentas: string[], actor: string | null, memoria: Partial<MemoriaConcepto> | null = null, agrupador = "") {
  const descripcion = memoria?.descripcion ?? null;
  return [
    tx.consolidacionModuloCliente.deleteMany({ where: { clienteId, moduloCodigo, clasificador, agrupador } }),
    ...(cuentas.length
      ? [tx.consolidacionModuloCliente.createMany({
          data: cuentas.map((cuenta) => ({
            clienteId, moduloCodigo, clasificador, agrupador, descripcion, actualizadoPor: actor,
            cuenta4: cuenta.slice(0, 4),
            cuenta6: cuenta.length === 6 ? cuenta : "",
            grupo: memoria?.grupo ?? null,
            subcuentaPuc: memoria?.subcuentaPuc ?? null,
            cuentaCliente: memoria?.cuentaCliente ?? "",
            origen: "manual",
          })),
        })]
      : []),
  ];
}

// Lo ya guardado de cada clasificador (nombre, grupo, subcuenta, cuenta del cliente), para no
// perderlo al reemplazar sus cuentas. Llave: la clave del consolidado («1» o «1 ∥ GYA»); las
// filas con agrupador heredan el nombre y el grupo de la memoria base del concepto.
async function memoriaGuardada(clienteId: number, moduloCodigo: string, claves: string[]): Promise<Map<string, MemoriaConcepto>> {
  const clasificadores = [...new Set(claves.map((k) => partirClaveConsolidado(k).clasificador))];
  const filas = await prisma.consolidacionModuloCliente.findMany({
    where: { clienteId, moduloCodigo, clasificador: { in: clasificadores } },
    select: { clasificador: true, agrupador: true, descripcion: true, grupo: true, subcuentaPuc: true, cuentaCliente: true },
  });
  const mapa = new Map<string, MemoriaConcepto>();
  const fundir = (clave: string, f: typeof filas[number]) => {
    const previa = mapa.get(clave) ?? { descripcion: null, grupo: null, subcuentaPuc: null, cuentaCliente: "" };
    mapa.set(clave, {
      descripcion: previa.descripcion ?? f.descripcion,
      grupo: previa.grupo ?? f.grupo,
      subcuentaPuc: previa.subcuentaPuc ?? f.subcuentaPuc,
      cuentaCliente: previa.cuentaCliente || f.cuentaCliente,
    });
  };
  // Primero la fila exacta, luego la base del concepto (sin agrupador) como respaldo.
  for (const f of filas) fundir(claveConsolidado(f.clasificador, f.agrupador), f);
  for (const clave of claves) {
    const { clasificador, agrupador } = partirClaveConsolidado(clave);
    if (!agrupador) continue;
    for (const f of filas) if (f.clasificador === clasificador && !f.agrupador) fundir(clave, { ...f, cuentaCliente: "" });
  }
  return mapa;
}

// Bitácora de la consolidación: una sola pulsación puede reescribir decenas de
// clasificadores (asignación masiva), así que queda registrado el alcance. Las cuentas que
// quedan solo para el período se nombran con su período.
async function auditarConsolidacion(
  clienteId: number,
  moduloCodigo: string,
  filas: { cuentas4: string[] }[],
  delPeriodo: { periodo: string; cuentas: string[] } | null = null,
) {
  const [user, cliente] = await Promise.all([
    getCurrentUser(),
    prisma.client.findUnique({ where: { id: clienteId }, select: { name: true } }),
  ]);
  const cuentas = filas.reduce((n, f) => n + f.cuentas4.length, 0);
  await logAudit({
    user: user?.name ?? "Sistema",
    action: "ACTUALIZÓ consolidación de módulo",
    entity: cliente?.name ?? `Cliente ${clienteId}`,
    detail: `${moduloCodigo} · ${filas.length} clasificador(es) · ${cuentas} cuenta(s)`
      + (delPeriodo && delPeriodo.cuentas.length ? ` · solo ${delPeriodo.periodo}: ${delPeriodo.cuentas.join(", ")}` : ""),
    clientId: clienteId,
  });
}

/**
 * Período del cargue desde el que se guarda el Consolidado. Sale del encabezado, nunca del
 * navegador; `null` cuando no se indica cargue (entonces no se admiten cuentas del período).
 */
async function periodoDelCargue(
  encabezadoId: number | null | undefined,
  clienteId: number,
  moduloCodigo: string,
): Promise<{ ok: true; periodo: string | null } | { ok: false; message: string }> {
  if (encabezadoId == null) return { ok: true, periodo: null };
  if (!Number.isInteger(encabezadoId) || encabezadoId <= 0) return { ok: false, message: "Cargue inválido." };
  const encabezado = await prisma.moduloDatoEncabezado.findUnique({
    where: { id: encabezadoId },
    select: { clienteId: true, moduloCodigo: true, periodo: true },
  });
  if (!encabezado || encabezado.clienteId !== clienteId || encabezado.moduloCodigo !== moduloCodigo) {
    return { ok: false, message: "El cargue no corresponde a este cliente y módulo. Recarga la página." };
  }
  return { ok: true, periodo: encabezado.periodo };
}

type FilaConsolidacionGuardar = { clave: string; clasificador: string; agrupador: string; cuentas: string[] };

/**
 * Guarda las cuentas de varios renglones del Consolidado. Por renglón:
 *  - solo cuentas de la cédula → memoria del cliente (todos los períodos), como siempre, y se
 *    retira la asignación del período que tuviera (vuelve a regir la memoria);
 *  - alguna cuenta del plan Russell fuera de la cédula → asignación SOLO del período del cargue
 *    (`asignacion_periodo_modulo`) con todas sus cuentas; la memoria del cliente no se toca.
 * Con la conciliación del período en firme no se crean, cambian ni quitan asignaciones del período.
 */
async function guardarConsolidacion(args: {
  clienteId: number;
  moduloCodigo: string;
  descriptor: DescriptorModulo;
  periodo: string | null;
  filas: FilaConsolidacionGuardar[];
  contexto: string;
}): Promise<ActionState> {
  const { clienteId, moduloCodigo, descriptor, periodo, filas } = args;
  const cedula = await cedulaDelModulo(moduloCodigo, descriptor);
  const longitudes = [...longitudesCedula(cedula)].sort().join(" o ");
  const separadas = filas.map((f) => ({ ...f, ...separarCuentasCedula(cedula, f.cuentas) }));

  const invalida = separadas.flatMap((f) => f.invalidas)[0];
  if (invalida) {
    return {
      ok: false,
      message: cedula.abiertos.has(invalida.slice(0, 4))
        ? `Las cuentas de ${invalida.slice(0, 4)} no se asignan: salen de la relación con el activo.`
        : `La cuenta ${invalida} no sirve: usa una cuenta Russell de ${longitudes} dígitos.`,
    };
  }
  const extras = [...new Set(separadas.flatMap((f) => f.extras))].sort();
  if (extras.length > 0 && !periodo) {
    return { ok: false, message: `La cuenta ${extras[0]} no es de la cédula de ${descriptor.label}: asígnala desde el cargue del período, donde vale solo para ese período.` };
  }
  const deCedula = [...new Set(separadas.flatMap((f) => f.deCedula))];
  const invalidaCedula = await validarCuentasModulo(moduloCodigo, deCedula, cedula, deCedula.length);
  if (invalidaCedula) return invalidaCedula;
  if (extras.length > 0) {
    const seis = extras.filter((c) => c.length === 6);
    const cuatro = extras.filter((c) => c.length === 4);
    const [plan, subgrupos] = await Promise.all([
      seis.length ? prisma.standardAccount.findMany({ where: { code: { in: seis } }, select: { code: true } }) : Promise.resolve([]),
      cuatro.length ? prisma.subgrupoEstandar.findMany({ where: { codigo: { in: cuatro } }, select: { codigo: true } }) : Promise.resolve([]),
    ]);
    const conocidas = new Set([...plan.map((p) => p.code), ...subgrupos.map((s) => s.codigo)]);
    const inexistente = extras.find((c) => !conocidas.has(c));
    if (inexistente) return { ok: false, message: `La cuenta ${inexistente} no existe en el plan estándar Russell.` };
  }

  try {
    const user = await getCurrentUser();
    const actor = user?.name ?? null;
    // Renglones que tocan la asignación del período: los que la crean o cambian, y los que la tenían.
    const conPeriodoPrevio = periodo
      ? await prisma.asignacionPeriodoModulo.findMany({
          where: { clienteId, moduloCodigo, periodo, OR: filas.map((f) => ({ clasificador: f.clasificador, agrupador: f.agrupador })) },
          select: { clasificador: true, agrupador: true },
        })
      : [];
    const previos = new Set(conPeriodoPrevio.map((p) => llaveAsignacion(p.clasificador, p.agrupador)));
    const tocanPeriodo = separadas.some((f) => f.extras.length > 0 || previos.has(llaveAsignacion(f.clasificador, f.agrupador)));
    if (periodo && tocanPeriodo) {
      const cierre = await prisma.conciliacionModuloCierre.findFirst({
        where: { clienteId, moduloCodigo, periodo, estado: ESTADO_CIERRE_FIRME },
        select: { id: true },
      });
      if (cierre) return { ok: false, message: `La conciliación de ${periodo} está en firme: desbloquéala para cambiar las cuentas que valen solo para ese período.` };
    }

    const memoria = await memoriaGuardada(clienteId, moduloCodigo, filas.map((f) => f.clave));
    await prisma.$transaction(
      separadas.flatMap((f) => {
        const delRenglon = periodo ? { clienteId, moduloCodigo, periodo, clasificador: f.clasificador, agrupador: f.agrupador } : null;
        if (f.extras.length === 0) {
          return [
            ...reemplazarCuentasTx(prisma, clienteId, moduloCodigo, f.clasificador, f.deCedula, actor, memoria.get(f.clave) ?? null, f.agrupador),
            ...(delRenglon && previos.has(llaveAsignacion(f.clasificador, f.agrupador)) ? [prisma.asignacionPeriodoModulo.deleteMany({ where: delRenglon })] : []),
          ];
        }
        return [
          prisma.asignacionPeriodoModulo.deleteMany({ where: delRenglon! }),
          prisma.asignacionPeriodoModulo.createMany({
            data: filasPeriodoDeCuentas(f.clasificador, f.agrupador, [...f.deCedula, ...f.extras]).map((fila) => ({
              ...fila,
              clienteId,
              moduloCodigo,
              periodo: periodo!,
              creadoPor: actor,
              creadoPorId: user?.id ?? null,
            })),
          }),
        ];
      }),
    );
    await auditarConsolidacion(
      clienteId,
      moduloCodigo,
      separadas.map((f) => ({ cuentas4: [...f.deCedula, ...f.extras] })),
      periodo ? { periodo, cuentas: extras } : null,
    );
    revalidatePath(rutaModulo(moduloCodigo));
    const base = filas.length === 1 ? "Consolidación guardada." : `${filas.length} consolidaciones guardadas.`;
    const aviso = extras.length === 0
      ? ""
      : ` ${extras.length === 1 ? `La cuenta ${extras[0]} vale` : `Las cuentas ${extras.join(", ")} valen`} solo para ${periodo}.`;
    return { ok: true, message: base + aviso };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD(args.contexto, e) };
  }
}

const digitosCuentas = (cuentas: readonly unknown[] | null | undefined): string[] =>
  [...new Set((cuentas ?? []).map((c) => String(c ?? "").replace(/\D/g, "")).filter(Boolean))];

/**
 * Guarda el conjunto de cuentas (1..N) de UN clasificador (reemplaza lo anterior). Con
 * `encabezadoId`, una cuenta del plan Russell fuera de la cédula vale solo para su período.
 */
export async function guardarConsolidacionModulo(input: { clienteId: number; moduloCodigo: string; clasificador: string; cuentas4: string[]; encabezadoId?: number | null }): Promise<ActionState> {
  const moduloCodigo = String(input.moduloCodigo ?? "").trim().toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) return { ok: false, message: "Módulo no soportado." };
  const authz = await authorizePermiso("modulos_datos:editar", { clientId: input.clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };
  const clave = String(input.clasificador ?? "").trim();
  // En Nómina la clave del renglón puede traer el agrupador («1 ∥ GYA»); en los demás módulos
  // el agrupador queda vacío y el clasificador es la clave entera.
  const { clasificador, agrupador } = descriptor.nomina ? partirClaveConsolidado(clave) : { clasificador: clave, agrupador: "" };
  if (!clasificador) return { ok: false, message: "Indica el clasificador." };
  const periodo = await periodoDelCargue(input.encabezadoId, input.clienteId, moduloCodigo);
  if (!periodo.ok) return periodo;
  return guardarConsolidacion({
    clienteId: input.clienteId,
    moduloCodigo,
    descriptor,
    periodo: periodo.periodo,
    filas: [{ clave, clasificador, agrupador, cuentas: digitosCuentas(input.cuentas4) }],
    contexto: "guardarConsolidacionModulo",
  });
}

/** Guarda de una vez el conjunto de cuentas de varios clasificadores (reemplaza cada uno). */
export async function guardarConsolidacionModuloLote(input: {
  clienteId: number;
  moduloCodigo: string;
  filas: { clasificador: string; cuentas4: string[] }[];
  encabezadoId?: number | null;
}): Promise<ActionState> {
  const moduloCodigo = String(input.moduloCodigo ?? "").trim().toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) return { ok: false, message: "Módulo no soportado." };
  const authz = await authorizePermiso("modulos_datos:editar", { clientId: input.clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };

  const partir = (clave: string) => (descriptor.nomina ? partirClaveConsolidado(clave) : { clasificador: clave, agrupador: "" });
  const filas = (input.filas ?? [])
    .map((f) => {
      const clave = String(f.clasificador ?? "").trim();
      return { clave, ...partir(clave), cuentas: digitosCuentas(f.cuentas4) };
    })
    .filter((f) => f.clave && f.clasificador);
  if (filas.length === 0) return { ok: false, message: "No hay cambios para guardar." };
  const periodo = await periodoDelCargue(input.encabezadoId, input.clienteId, moduloCodigo);
  if (!periodo.ok) return periodo;
  return guardarConsolidacion({
    clienteId: input.clienteId,
    moduloCodigo,
    descriptor,
    periodo: periodo.periodo,
    filas,
    contexto: "guardarConsolidacionModuloLote",
  });
}

/**
 * Busca en el plan estándar Russell (por código o nombre) las cuentas que se pueden asignar en el
 * Consolidado de un cargue: las de la longitud de su cédula. Marca las que ya son de la cédula;
 * las demás valdrían solo para el período del cargue.
 */
export async function consultarCuentasRussell(input: { encabezadoId: number; texto: string }): Promise<
  { ok: true; cuentas: { codigo: string; nombre: string; deCedula: boolean }[] } | { ok: false; message: string }
> {
  const encabezadoId = Number(input?.encabezadoId);
  if (!Number.isInteger(encabezadoId) || encabezadoId <= 0) return { ok: false, message: "Cargue inválido." };
  const encabezado = await prisma.moduloDatoEncabezado.findUnique({ where: { id: encabezadoId }, select: { clienteId: true, moduloCodigo: true } });
  if (!encabezado) return { ok: false, message: "El cargue ya no existe." };
  const authz = await authorizePermiso("modulos_datos:ver", { clientId: encabezado.clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };
  const descriptor = descriptorModulo(encabezado.moduloCodigo);
  if (!descriptor) return { ok: false, message: "Módulo no soportado." };
  const texto = String(input?.texto ?? "").trim().slice(0, 60);
  const digitos = texto.replace(/\D/g, "");
  const porCodigo = digitos.length >= 2 && digitos.length === texto.replace(/\s/g, "").length;
  if (!porCodigo && texto.length < 3) return { ok: true, cuentas: [] };
  try {
    const cedula = await cedulaDelModulo(encabezado.moduloCodigo, descriptor);
    const LIMITE = 30;
    const filas = cedula.nivel === 6
      ? (await prisma.standardAccount.findMany({
          where: porCodigo ? { code: { startsWith: digitos } } : { name: { contains: texto, mode: "insensitive" } },
          select: { code: true, name: true },
          orderBy: { code: "asc" },
          take: LIMITE * 2,
        })).map((c) => ({ codigo: c.code.replace(/\D/g, ""), nombre: c.name }))
      : (await prisma.subgrupoEstandar.findMany({
          where: porCodigo ? { codigo: { startsWith: digitos } } : { nombre: { contains: texto, mode: "insensitive" } },
          select: { codigo: true, nombre: true },
          orderBy: { codigo: "asc" },
          take: LIMITE * 2,
        }));
    const cuentas = filas
      .filter((c) => c.codigo.length === cedula.nivel)
      .map((c) => {
        const { deCedula, extras } = separarCuentasCedula(cedula, [c.codigo]);
        return { ...c, deCedula: deCedula.length > 0, asignable: deCedula.length > 0 || extras.length > 0 };
      })
      .filter((c) => c.asignable)
      .slice(0, LIMITE)
      .map(({ codigo, nombre, deCedula }) => ({ codigo, nombre, deCedula }));
    return { ok: true, cuentas };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("consultarCuentasRussell", e) };
  }
}

// ============================================================
// CLASE contable por AGRUPADOR (Nómina): «GYA → 51», «MOD → 72». Memoria del cliente que
// decide, con el concepto homologado, la cuenta Russell por centro de costo (RF-NOM-12).
// ============================================================
const ClaseAgrupadorSchema = z.object({
  clienteId: z.number().int().positive(),
  moduloCodigo: z.string().trim().toUpperCase(),
  agrupador: z.string().trim().min(1, "Indica el agrupador.").max(120),
  clase: z.enum(CLASES_NOMINA).nullable(),
});

/** Guarda (o quita, con `clase: null`) la clase contable de un agrupador del archivo. */
export async function guardarClaseAgrupador(input: { clienteId: number; moduloCodigo: string; agrupador: string; clase: string | null }): Promise<ActionState> {
  const parsed = ClaseAgrupadorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { clienteId, moduloCodigo, agrupador, clase } = parsed.data;
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor?.nomina) return { ok: false, message: "Las clases por agrupador solo aplican a Nómina." };
  const authz = await authorizePermiso("modulos_datos:editar", { clientId: clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };
  try {
    const user = await getCurrentUser();
    const actor = user?.name ?? null;
    if (clase == null) {
      await prisma.claseAgrupadorModulo.deleteMany({ where: { clienteId, moduloCodigo, agrupador } });
    } else {
      await prisma.claseAgrupadorModulo.upsert({
        where: { clienteId_moduloCodigo_agrupador: { clienteId, moduloCodigo, agrupador } },
        create: { clienteId, moduloCodigo, agrupador, clase, actualizadoPor: actor },
        update: { clase, actualizadoPor: actor },
      });
    }
    const cliente = await prisma.client.findUnique({ where: { id: clienteId }, select: { name: true } });
    await logAudit({
      user: actor ?? "Sistema",
      action: clase == null ? "QUITÓ clase de agrupador" : "FIJÓ clase de agrupador",
      entity: cliente?.name ?? `Cliente ${clienteId}`,
      detail: `${moduloCodigo} · «${agrupador}»${clase ? ` → ${clase}` : ""}`,
      clientId: clienteId,
    });
    revalidatePath(rutaModulo(moduloCodigo));
    return { ok: true, message: clase == null ? "Clase retirada." : `«${agrupador}» → clase ${clase}.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarClaseAgrupador", e) };
  }
}

// ============================================================
// REPARTO del cruce (Nómina, RF-NOM-12 / D4): la porción de un concepto homologado a varias
// cuentas Russell que va a cada una. Vive por (cliente, módulo, período, clave del
// consolidado); la sugerencia proporcional al balance la calcula el cruce y el auditor la
// confirma o la corrige aquí. La Σ del reparto debe cerrar con el total del concepto.
// ============================================================
const RepartoSchema = z.object({
  encabezadoId: z.number().int().positive(),
  clasificador: z.string().trim().min(1, "Indica el concepto."),
  valores: z.record(z.string().regex(/^\d{6}$/, "Cuenta Russell de 6 dígitos."), z.number().finite()),
});

/** Guarda (o quita, con `valores` vacío) el reparto de UN concepto del cruce de Nómina. */
export async function guardarRepartoCruce(input: { encabezadoId: number; clasificador: string; valores: Record<string, number> }): Promise<ActionState> {
  const parsed = RepartoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { encabezadoId, clasificador, valores } = parsed.data;
  const encabezado = await prisma.moduloDatoEncabezado.findUnique({ where: { id: encabezadoId }, select: { clienteId: true, moduloCodigo: true, periodo: true, nombreCliente: true } });
  if (!encabezado) return { ok: false, message: "El dato no existe." };
  const descriptor = descriptorModulo(encabezado.moduloCodigo);
  if (!descriptor?.nomina) return { ok: false, message: "El reparto del cruce solo aplica a Nómina." };
  const authz = await authorizePermiso("modulos_datos:editar", { clientId: encabezado.clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };
  try {
    const insumos = await cargarInsumosCruceModulo(encabezadoId);
    const cruce = insumos ? await construirCruceContableModulo(insumos) : null;
    const renglon = cruce?.nomina?.renglones.find((r) => r.clasificador === clasificador);
    if (!renglon) return { ok: false, message: `El concepto «${clasificador}» no está en el consolidado de este cargue.` };
    const limpios = Object.fromEntries(Object.entries(valores).filter(([, v]) => v !== 0));
    if (Object.keys(limpios).length > 0) {
      const invalido = validarReparto(renglon.total, limpios);
      if (invalido) return { ok: false, message: invalido };
      // Las cuentas del período (fuera de la cédula) también se pueden repartir en ese período.
      const cuentasRussell6 = cuentasCedula6(descriptor, cruce?.cuentasPeriodo ?? []);
      const fuera = Object.keys(limpios).find((c) => !cuentasRussell6.includes(c));
      if (fuera) return { ok: false, message: `La cuenta ${fuera} no pertenece al módulo de Nómina.` };
    }
    const user = await getCurrentUser();
    const actor = user?.name ?? null;
    const where = { clienteId: encabezado.clienteId, moduloCodigo: encabezado.moduloCodigo, periodo: encabezado.periodo, clasificador };
    await prisma.$transaction([
      prisma.repartoCruceModulo.deleteMany({ where }),
      ...(Object.keys(limpios).length > 0
        ? [prisma.repartoCruceModulo.createMany({ data: Object.entries(limpios).map(([cuentaRussell, valor]) => ({ ...where, cuentaRussell, valor: new Prisma.Decimal(valor.toFixed(2)), definidoPor: actor })) })]
        : []),
    ]);
    await logAudit({
      user: actor ?? "Sistema",
      action: Object.keys(limpios).length > 0 ? "DEFINIÓ reparto del cruce" : "QUITÓ reparto del cruce",
      entity: encabezado.nombreCliente,
      detail: `${encabezado.moduloCodigo} ${encabezado.periodo} · «${clasificador}» → ${Object.entries(limpios).map(([c, v]) => `${c}: ${v}`).join(", ") || "sin reparto"}`,
      clientId: encabezado.clienteId,
    });
    revalidatePath(rutaModulo(encabezado.moduloCodigo));
    return { ok: true, message: Object.keys(limpios).length > 0 ? "Reparto guardado." : "Reparto retirado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarRepartoCruce", e) };
  }
}

/**
 * Aplica de una vez el reparto SUGERIDO (proporcional al movimiento del balance, D4) a todos
 * los conceptos del cargue que cruzan contra varias cuentas y aún no tienen reparto.
 */
export async function aplicarRepartosSugeridos(input: { encabezadoId: number }): Promise<ActionState & { aplicados?: number }> {
  const encabezadoId = Number(input.encabezadoId);
  if (!Number.isInteger(encabezadoId)) return { ok: false, message: "Dato inválido." };
  const encabezado = await prisma.moduloDatoEncabezado.findUnique({ where: { id: encabezadoId }, select: { clienteId: true, moduloCodigo: true, periodo: true, nombreCliente: true } });
  if (!encabezado) return { ok: false, message: "El dato no existe." };
  if (!descriptorModulo(encabezado.moduloCodigo)?.nomina) return { ok: false, message: "El reparto del cruce solo aplica a Nómina." };
  const authz = await authorizePermiso("modulos_datos:editar", { clientId: encabezado.clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };
  try {
    const insumos = await cargarInsumosCruceModulo(encabezadoId);
    const cruce = insumos ? await construirCruceContableModulo(insumos) : null;
    if (!cruce?.nomina || cruce.bloqueo || !cruce.cruceContable) return { ok: false, message: cruce?.bloqueo ?? "El cruce no está disponible: hace falta el balance del período." };
    const pendientes = cruce.nomina.repartosPendientes.filter((p) => Object.values(p.sugerido).some((v) => v !== 0));
    if (pendientes.length === 0) return { ok: true, message: "No hay conceptos pendientes de reparto.", aplicados: 0 };
    const user = await getCurrentUser();
    const actor = user?.name ?? null;
    const base = { clienteId: encabezado.clienteId, moduloCodigo: encabezado.moduloCodigo, periodo: encabezado.periodo };
    await prisma.$transaction([
      prisma.repartoCruceModulo.deleteMany({ where: { ...base, clasificador: { in: pendientes.map((p) => p.clasificador) } } }),
      prisma.repartoCruceModulo.createMany({
        data: pendientes.flatMap((p) => Object.entries(p.sugerido).filter(([, v]) => v !== 0).map(([cuentaRussell, valor]) => ({ ...base, clasificador: p.clasificador, cuentaRussell, valor: new Prisma.Decimal(valor.toFixed(2)), definidoPor: actor }))),
      }),
    ]);
    await logAudit({
      user: actor ?? "Sistema",
      action: "APLICÓ repartos sugeridos del cruce",
      entity: encabezado.nombreCliente,
      detail: `${encabezado.moduloCodigo} ${encabezado.periodo} · ${pendientes.length} concepto(s) repartidos proporcionalmente al balance`,
      clientId: encabezado.clienteId,
    });
    revalidatePath(rutaModulo(encabezado.moduloCodigo));
    return { ok: true, message: `${pendientes.length} concepto(s) repartidos según el balance. Revísalos y ajusta los que haga falta.`, aplicados: pendientes.length };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("aplicarRepartosSugeridos", e) };
  }
}

// ============================================================
// MARCAS DE AUDITORÍA sobre las diferencias del CRUCE CONTABLE.
//
// Sustituyen a la antigua «justificación» escrita dentro de la celda: la cédula solo lleva
// la marca numerada y el detalle vive al pie, en observaciones, con referencia al anexo y
// soportes adjuntos.
//
// La marca vive por (cliente, módulo, período, cuenta Russell de 4 díg.) y no por cargue,
// así que sobrevive a las versiones nuevas del período. Exige la misma autorización que
// editar la consolidación (`modulos_datos:editar` + alcance de escritura sobre el cliente)
// y deja además el detalle en el hilo de comentarios de la cuenta (`cruce:XXXX`), para que
// quede a la vista de quien revisa. El comentario es un rastro: si se borra, la marca sigue
// (FK suave). Los soportes sí son FK dura: retirar la marca se lleva sus anexos.
// ============================================================

/** Encabezado + período al que pertenece una marca, con el permiso ya verificado. */
async function contextoMarcaCruce(encabezadoId: number) {
  if (!Number.isSafeInteger(encabezadoId)) return { ok: false as const, message: "Cargue inválido." };
  const encabezado = await prisma.moduloDatoEncabezado.findUnique({
    where: { id: encabezadoId },
    select: { id: true, clienteId: true, moduloCodigo: true, periodo: true, nombreCliente: true },
  });
  if (!encabezado) return { ok: false as const, message: "El cargue ya no existe." };
  const authz = await authorizePermiso("modulos_datos:editar", { clientId: encabezado.clienteId });
  if (!authz.ok) return { ok: false as const, message: authz.message };
  return { ok: true as const, encabezado, userId: authz.userId };
}

async function auditarMarcaCruce(
  encabezado: { clienteId: number; moduloCodigo: string; periodo: string; nombreCliente: string },
  accion: string,
  /** Qué explica la marca: «cuenta 1435» o «tercero 900123456». */
  objetivo: string,
  detalleExtra: string,
) {
  const user = await getCurrentUser();
  await logAudit({
    user: user?.name ?? "Sistema",
    action: accion,
    entity: encabezado.nombreCliente,
    detail: `${encabezado.moduloCodigo} · ${encabezado.periodo} · ${objetivo}${detalleExtra}`,
    clientId: encabezado.clienteId,
  });
}

/** Los archivos que vienen del formulario de la marca, ya filtrados. */
function soportesDelFormulario(formData: FormData): File[] {
  return formData.getAll("soportes").filter((v): v is File => v instanceof File && v.size > 0);
}

/**
 * Valida los soportes ANTES de tocar la BD (contenido real, no extensión) y los devuelve
 * listos para subir. Que un anexo inválido no deje la marca escrita a medias.
 */
async function prepararSoportesMarca(archivos: File[], yaGuardados: number) {
  if (archivos.length === 0) return { ok: true as const, soportes: [] };
  if (yaGuardados + archivos.length > SOPORTES_MARCA_MAX) {
    return {
      ok: false as const,
      message: `Una marca admite hasta ${SOPORTES_MARCA_MAX} soportes (ya tiene ${yaGuardados}).`,
    };
  }
  if (!almacenamientoDisponible()) {
    return {
      ok: false as const,
      message: "El almacenamiento de soportes no está configurado. Avisa al administrador o guarda la marca sin adjuntos.",
    };
  }

  const soportes: { bytes: Uint8Array; tipo: TipoSoporteMarca; contentType: string; nombre: string; tamano: number }[] = [];
  for (const archivo of archivos) {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const val = validarSoporteMarca(bytes, archivo.name);
    if (!val.ok) return { ok: false as const, message: val.error };
    soportes.push({
      bytes,
      tipo: val.tipo,
      contentType: val.contentType,
      nombre: nombreArchivoSeguro(archivo.name, val.tipo),
      tamano: bytes.length,
    });
  }
  return { ok: true as const, soportes };
}

/**
 * Guarda (o reescribe) la MARCA de una cuenta del cruce contable —o de un tercero del cruce por
 * tercero (`dimension=tercero` + `clave`)— y sube sus soportes.
 *
 * `diferencia` se congela para poder avisar después si el monto cambió. El número se
 * asigna una sola vez, al crear: reescribir el detalle no renumera la marca ni mueve su
 * lugar en las observaciones.
 */
export async function guardarMarcaCruce(formData: FormData): Promise<ActionState> {
  const encabezadoId = Number(formData.get("encabezadoId"));
  const ctx = await contextoMarcaCruce(encabezadoId);
  if (!ctx.ok) return { ok: false, message: ctx.message };

  const dimension: DimensionMarca = formData.get("dimension") === "tercero" ? "tercero" : "cuenta4";
  const cuenta4 = dimension === "cuenta4" ? cuentaMarcable(String(formData.get("cuenta4") ?? "")) : null;
  const clave = dimension === "tercero" ? normalizarClaveTercero(formData.get("clave")) : null;
  if (dimension === "cuenta4" && !cuenta4) return { ok: false, message: "Cuenta inválida." };
  if (dimension === "tercero" && !clave) return { ok: false, message: "Tercero inválido." };
  const nota = validarNotaMarca(String(formData.get("nota") ?? ""));
  if (!nota.ok) return { ok: false, message: nota.message };
  const anexo = validarReferenciaAnexo(String(formData.get("referenciaAnexo") ?? ""));
  if (!anexo.ok) return { ok: false, message: anexo.message };

  const { encabezado } = ctx;

  // Las cuentas no modulares solo existen en la cédula contable.
  let seleccionNoModular: string[] = [];
  if (cuenta4) {
    try {
      const crudo = String(formData.get("noModulares") ?? "").trim();
      if (crudo) {
        const parseado: unknown = JSON.parse(crudo);
        if (!Array.isArray(parseado)) return { ok: false, message: "Selección de cuentas no modulares inválida." };
        seleccionNoModular = parseado.map((c) => String(c));
      }
    } catch {
      return { ok: false, message: "Selección de cuentas no modulares inválida." };
    }
  }

  // La diferencia (y en la cédula, las cuentas no modulares) NO se toma del formulario: se
  // recalcula sobre el cruce vigente, la misma función que pinta la pestaña. Entre abrir el
  // modal y guardar pudo recargarse el módulo, cambiar la homologación o emparejarse un tercero.
  const insumosMarca = await cargarInsumosCruceModulo(encabezadoId);
  if (!insumosMarca) return { ok: false, message: "El cargue ya no existe." };
  const cruceVigente = await construirCruceContableModulo(insumosMarca);
  let diferencia: number;
  let excluidas: { cuenta8: string; nombre: string; valor: number }[] = [];
  // Saldo sin cuenta: lo que se excluye son clasificadores del lado del MÓDULO, no cuentas del cliente.
  let clasificadoresExcluidos: { clasificador: string; total: number }[] = [];
  if (cuenta4) {
    if (!cruceVigente.cruceContable) {
      return { ok: false, message: cruceVigente.bloqueo ?? "El cruce contable no está disponible en este momento." };
    }
    const filaVigente = cruceVigente.cruceContable.filas.find((f) => f.cuenta4 === cuenta4);
    if (!filaVigente) {
      return { ok: false, message: cuenta4 === CLAVE_SIN_CUENTA ? "Ya no hay saldo sin cuenta en el cruce. Recarga la pantalla." : "Esa cuenta ya no aparece en el cruce. Recarga la pantalla." };
    }
    if (cuenta4 === CLAVE_SIN_CUENTA) {
      const hijos = cruceVigente.detalleSinCuenta;
      const noModulares = validarClasificadoresNoModulares(seleccionNoModular, hijos);
      if (!noModulares.ok) return { ok: false, message: noModulares.message };
      clasificadoresExcluidos = hijos.filter((h) => noModulares.clasificadores.includes(h.clasificador));
      diferencia = diferenciaAjustadaModulo(filaVigente, hijos, noModulares.clasificadores);
    } else {
      const hijos = cruceVigente.detalleContablePorCuenta[cuenta4] ?? [];
      const noModulares = validarNoModulares(seleccionNoModular, hijos);
      if (!noModulares.ok) return { ok: false, message: noModulares.message };
      excluidas = hijos.filter((h) => noModulares.cuentas8.includes(h.cuenta8));
      diferencia = diferenciaAjustada(filaVigente, hijos, noModulares.cuentas8);
    }
  } else {
    const tercero = await cruceTerceroDeCargue(insumosMarca, cruceVigente);
    if (!tercero?.resumen) {
      return { ok: false, message: tercero?.mensaje ?? "El cruce por tercero no está disponible en este momento." };
    }
    const filaTercero = tercero.resumen.filas.find((f) => f.clave === clave);
    if (!filaTercero) return { ok: false, message: "Ese tercero ya no aparece en el cruce. Recarga la pantalla." };
    diferencia = filaTercero.diferencia;
  }

  const llaveMarca = cuenta4
    ? { dimension: "cuenta4" as const, cuenta4, clave: null }
    : { dimension: "tercero" as const, cuenta4: null, clave: clave as string };
  const objetivo = cuenta4 === CLAVE_SIN_CUENTA ? "saldo sin cuenta" : cuenta4 ? `cuenta ${cuenta4}` : `tercero ${clave}`;
  const cruceDeLaMarca = cuenta4 ? "cruce contable" : "cruce por tercero";

  try {
    const existente = await prisma.marcaCruceModulo.findFirst({
      where: {
        clienteId: encabezado.clienteId,
        moduloCodigo: encabezado.moduloCodigo,
        periodo: encabezado.periodo,
        dimension: llaveMarca.dimension,
        ...(llaveMarca.dimension === "cuenta4" ? { cuenta4: llaveMarca.cuenta4 } : { clave: llaveMarca.clave }),
      },
      select: { id: true, numero: true, _count: { select: { adjuntos: true } } },
    });

    const preparados = await prepararSoportesMarca(soportesDelFormulario(formData), existente?._count.adjuntos ?? 0);
    if (!preparados.ok) return { ok: false, message: preparados.message };

    const user = await getCurrentUser();
    // La marca NO publica un comentario en la conversación del renglón (decisión 17/Sep/2026):
    // su texto, su anexo, sus soportes y las cuentas no modulares viven en Observaciones, y la
    // conversación queda para lo que se escribe a mano. Las marcas anteriores conservan el suyo.
    const datosComunes = {
      nota: nota.nota,
      referenciaAnexo: anexo.referencia,
      diferencia: new Prisma.Decimal(diferencia.toFixed(2)),
      marcadoPor: user?.name ?? null,
      marcadoPorId: ctx.userId,
      marcadoEn: new Date(),
    };

    // El número se asigna dentro de una transacción serializable con candado del período:
    // dos personas marcando a la vez no pueden quedarse con el mismo número (el índice único lo
    // impediría, pero aquí ni siquiera llegan a chocar). Cuentas y terceros comparten la
    // numeración del período. Las cuentas no modulares se reemplazan en el MISMO commit que la
    // marca: nunca queda una exclusión a medias ni una marca cuyo texto no corresponda a lo restado.
    const filasNoModulares = excluidas.map((h) => ({
      cuenta8: h.cuenta8,
      nombreCuenta: h.nombre,
      valorAlMarcar: new Prisma.Decimal(h.valor.toFixed(2)),
    }));
    const marca = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, `marca-cruce:${encabezado.clienteId}:${encabezado.moduloCodigo}:${encabezado.periodo}`);
      const guardada = existente
        ? await tx.marcaCruceModulo.update({
            where: { id: existente.id },
            data: datosComunes,
            select: { id: true, numero: true },
          })
        : await (async () => {
            const usados = await tx.marcaCruceModulo.findMany({
              where: {
                clienteId: encabezado.clienteId,
                moduloCodigo: encabezado.moduloCodigo,
                periodo: encabezado.periodo,
              },
              select: { numero: true },
            });
            return tx.marcaCruceModulo.create({
              data: {
                clienteId: encabezado.clienteId,
                moduloCodigo: encabezado.moduloCodigo,
                periodo: encabezado.periodo,
                ...llaveMarca,
                ...datosComunes,
                numero: siguienteNumeroMarca(usados.map((u) => u.numero)),
              },
              select: { id: true, numero: true },
            });
          })();
      await tx.cuentaNoModularCruce.deleteMany({ where: { marcaId: guardada.id } });
      if (filasNoModulares.length > 0) {
        await tx.cuentaNoModularCruce.createMany({
          data: filasNoModulares.map((f) => ({ ...f, marcaId: guardada.id })),
        });
      }
      await tx.clasificadorNoModularCruce.deleteMany({ where: { marcaId: guardada.id } });
      if (clasificadoresExcluidos.length > 0) {
        await tx.clasificadorNoModularCruce.createMany({
          data: clasificadoresExcluidos.map((c) => ({
            marcaId: guardada.id,
            clasificador: c.clasificador,
            totalAlMarcar: new Prisma.Decimal(c.total.toFixed(2)),
          })),
        });
      }
      return guardada;
    });

    const subidos = await persistirSoportesMarca(marca.id, ctx.userId, preparados.soportes);

    await auditarMarcaCruce(
      encabezado,
      existente ? `EDITÓ la marca del ${cruceDeLaMarca}` : `MARCÓ una diferencia del ${cruceDeLaMarca}`,
      objetivo,
      ` · marca ${marca.numero} · ${diferencia.toFixed(2)}${subidos ? ` · ${subidos} soporte(s)` : ""}${excluidas.length ? ` · ${excluidas.length} cuenta(s) no modular(es)` : ""}${clasificadoresExcluidos.length ? ` · ${clasificadoresExcluidos.length} saldo(s) sin cuenta no modular(es)` : ""}`,
    );
    revalidatePath(`${rutaModulo(encabezado.moduloCodigo)}/${encabezado.id}`);
    return {
      ok: true,
      message: existente ? `Marca ${marca.numero} actualizada.` : `Marca ${marca.numero} registrada.`,
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarMarcaCruce", e) };
  }
}

/**
 * Sube los soportes y los registra. Si un archivo falla a mitad, se barre lo ya subido:
 * un objeto huérfano en el almacenamiento no le sirve a nadie. La marca en sí ya está
 * guardada — el detalle no se pierde porque el anexo no haya podido subir.
 */
async function persistirSoportesMarca(
  marcaId: number,
  userId: number | null,
  soportes: { bytes: Uint8Array; tipo: TipoSoporteMarca; contentType: string; nombre: string; tamano: number }[],
): Promise<number> {
  if (soportes.length === 0) return 0;
  const claves: string[] = [];
  try {
    for (const soporte of soportes) {
      const clave = claveSoporteMarca(marcaId, randomUUID().slice(0, 12), soporte.tipo);
      await subirObjeto({ key: clave, cuerpo: soporte.bytes, contentType: soporte.contentType });
      claves.push(clave);
      await prisma.adjuntoMarcaCruce.create({
        data: {
          marcaId,
          claveObjeto: clave,
          nombreArchivo: soporte.nombre,
          tipoContenido: soporte.contentType,
          tamanoBytes: soporte.tamano,
          subidoPorId: userId,
        },
      });
    }
    return soportes.length;
  } catch (e) {
    await Promise.allSettled(claves.map((clave) => eliminarObjeto(clave)));
    throw e;
  }
}

/** Retira la marca de una cuenta o de un tercero y sus soportes. Los comentarios del renglón no se tocan. */
export async function quitarMarcaCruce(input: {
  encabezadoId: number;
  cuenta4?: string;
  /** Clave del tercero, en las marcas del cruce por tercero. */
  clave?: string;
}): Promise<ActionState> {
  const ctx = await contextoMarcaCruce(input.encabezadoId);
  if (!ctx.ok) return { ok: false, message: ctx.message };

  const porTercero = input.clave != null;
  const clave = porTercero ? normalizarClaveTercero(input.clave) : null;
  const cuenta4 = porTercero ? null : cuentaMarcable(String(input.cuenta4 ?? ""));
  if (porTercero && !clave) return { ok: false, message: "Tercero inválido." };
  if (!porTercero && !cuenta4) return { ok: false, message: "Cuenta inválida." };

  const { encabezado } = ctx;
  try {
    const marca = await prisma.marcaCruceModulo.findFirst({
      where: {
        clienteId: encabezado.clienteId,
        moduloCodigo: encabezado.moduloCodigo,
        periodo: encabezado.periodo,
        ...(clave ? { dimension: "tercero", clave } : { dimension: "cuenta4", cuenta4: cuenta4 ?? undefined }),
      },
      select: { id: true, numero: true, adjuntos: { select: { claveObjeto: true } }, _count: { select: { noModulares: true, clasificadoresNoModulares: true } } },
    });
    if (!marca) return { ok: false, message: "Esa diferencia ya no estaba marcada." };

    // La BD manda: primero se borra la fila (cascada a los adjuntos) y después los
    // objetos. Al revés, un fallo dejaría registros apuntando a soportes inexistentes.
    await prisma.marcaCruceModulo.delete({ where: { id: marca.id } });
    await Promise.allSettled(marca.adjuntos.map((a) => eliminarObjeto(a.claveObjeto)));

    // La cascada de la FK se lleva las cuentas no modulares: la fila vuelve a su
    // diferencia bruta en el siguiente render.
    await auditarMarcaCruce(
      encabezado,
      clave ? "RETIRÓ la marca del cruce por tercero" : "RETIRÓ la marca del cruce contable",
      clave ? `tercero ${clave}` : cuenta4 === CLAVE_SIN_CUENTA ? "saldo sin cuenta" : `cuenta ${cuenta4}`,
      ` · marca ${marca.numero}${marca._count.noModulares ? ` · liberó ${marca._count.noModulares} cuenta(s) no modular(es)` : ""}`
        + (marca._count.clasificadoresNoModulares ? ` · liberó ${marca._count.clasificadoresNoModulares} saldo(s) sin cuenta no modular(es)` : ""),
    );
    revalidatePath(`${rutaModulo(encabezado.moduloCodigo)}/${encabezado.id}`);
    return { ok: true, message: `Marca ${marca.numero} retirada.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("quitarMarcaCruce", e) };
  }
}

/** Elimina UN soporte de una marca, sin tocar la observación. */
export async function eliminarSoporteMarca(input: {
  encabezadoId: number;
  soporteId: number;
}): Promise<ActionState> {
  const ctx = await contextoMarcaCruce(input.encabezadoId);
  if (!ctx.ok) return { ok: false, message: ctx.message };

  const soporteId = Number(input.soporteId);
  if (!Number.isSafeInteger(soporteId)) return { ok: false, message: "Soporte inválido." };

  const { encabezado } = ctx;
  try {
    const soporte = await prisma.adjuntoMarcaCruce.findUnique({
      where: { id: soporteId },
      select: {
        claveObjeto: true,
        nombreArchivo: true,
        marca: { select: { clienteId: true, moduloCodigo: true, periodo: true, dimension: true, cuenta4: true, clave: true, numero: true } },
      },
    });
    if (!soporte) return { ok: false, message: "Ese soporte ya no existe." };
    // El permiso se verificó sobre ESTE cargue: el soporte tiene que ser del mismo
    // cliente, módulo y período, o el id sería una puerta a los papeles de otro cliente.
    const m = soporte.marca;
    if (m.clienteId !== encabezado.clienteId || m.moduloCodigo !== encabezado.moduloCodigo || m.periodo !== encabezado.periodo) {
      return { ok: false, message: "Ese soporte no pertenece a este período." };
    }

    await prisma.adjuntoMarcaCruce.delete({ where: { id: soporteId } });
    await eliminarObjeto(soporte.claveObjeto).catch(() => {});

    const deTercero = m.dimension === "tercero";
    await auditarMarcaCruce(
      encabezado,
      `ELIMINÓ un soporte de la marca del cruce ${deTercero ? "por tercero" : "contable"}`,
      deTercero ? `tercero ${m.clave}` : `cuenta ${m.cuenta4}`,
      ` · marca ${m.numero} · ${soporte.nombreArchivo}`,
    );
    revalidatePath(`${rutaModulo(encabezado.moduloCodigo)}/${encabezado.id}`);
    return { ok: true, message: "Soporte eliminado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarSoporteMarca", e) };
  }
}

// ============================================================
// FECHA DE CORTE y TRM de cierre de un cargue (Cartera, CxP).
// ============================================================

/** TRM oficial de una fecha, para sugerirla como TRM de cierre al cargar. */
export async function sugerirTrmCierre(input: { fecha: string }): Promise<ActionState & { trm?: number }> {
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const fecha = fechaDeCelda(input?.fecha);
  if (!fecha) return { ok: false, message: "Fecha inválida." };
  try {
    return { ok: true, trm: await getTRM(new Date(`${fecha}T12:00:00-05:00`)) };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("sugerirTrmCierre", e) };
  }
}

/**
 * Cambia la fecha de corte de un cargue. No toca importes: es la fecha contra la que se miden los
 * días vencidos y las edades, que se recalculan al leer. No se cambia con la conciliación en firme.
 */
export async function actualizarFechaCorteModulo(input: { encabezadoId: number; fechaCorte: string }): Promise<ActionState> {
  const ctx = await contextoMarcaCruce(Number(input?.encabezadoId));
  if (!ctx.ok) return { ok: false, message: ctx.message };
  const fechaCorte = fechaDeCelda(input?.fechaCorte);
  if (!fechaCorte) return { ok: false, message: "Fecha de corte inválida." };
  const { encabezado } = ctx;
  if (!descriptorModulo(encabezado.moduloCodigo)?.crucePorTercero.detalleTercero) {
    return { ok: false, message: "Este módulo no maneja fecha de corte." };
  }
  try {
    const cierre = await prisma.conciliacionModuloCierre.findFirst({
      where: { clienteId: encabezado.clienteId, moduloCodigo: encabezado.moduloCodigo, periodo: encabezado.periodo, estado: ESTADO_CIERRE_FIRME },
      select: { id: true },
    });
    if (cierre) return { ok: false, message: "La conciliación del período está en firme: desbloquéala para cambiar la fecha de corte." };
    const anterior = await prisma.moduloDatoEncabezado.findUnique({ where: { id: encabezado.id }, select: { fechaCorte: true } });
    await prisma.moduloDatoEncabezado.update({ where: { id: encabezado.id }, data: { fechaCorte: fechaCalendarioPrisma(fechaCorte) } });
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CAMBIÓ la fecha de corte del cargue",
      entity: encabezado.nombreCliente,
      detail: `${encabezado.moduloCodigo} · ${encabezado.periodo} · cargue #${encabezado.id} · ${anterior?.fechaCorte ? fechaCalendarioISO(anterior.fechaCorte) : "fin del período"} → ${fechaCorte}`,
      clientId: encabezado.clienteId,
    });
    revalidatePath(`${rutaModulo(encabezado.moduloCodigo)}/${encabezado.id}`);
    return { ok: true, message: `Fecha de corte del cargue: ${fechaCorte.split("-").reverse().join("/")}.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("actualizarFechaCorteModulo", e) };
  }
}

// ============================================================
// EMPAREJAMIENTO MANUAL de terceros del cruce por tercero (RF-CXC-12; D4 de CxP).
//
// «El tercero X del auxiliar es el Y del balance». Es memoria del cliente: por defecto vale
// para todos sus períodos y se puede acotar al del cargue. Se valida contra el cruce vigente y
// no se toca donde la conciliación del módulo está en firme: cambiaría lo que se cerró.
// ============================================================

const EmparejarTerceroSchema = z.object({
  encabezadoId: z.coerce.number().int().positive(),
  claveModulo: z.string(),
  claveBalance: z.string(),
  alcance: z.enum(["todos", "periodo"]),
  origen: z.enum(["manual", "sugerido_nombre"]),
  nota: z.string().optional(),
});

/** Períodos en firme que el emparejamiento alteraría: el mensaje para quien empareja, o null. */
async function cierreQueImpideEmparejar(
  encabezado: { clienteId: number; moduloCodigo: string },
  periodo: string,
): Promise<string | null> {
  const cierres = await prisma.conciliacionModuloCierre.findMany({
    where: {
      clienteId: encabezado.clienteId,
      moduloCodigo: encabezado.moduloCodigo,
      estado: ESTADO_CIERRE_FIRME,
      ...(periodo ? { periodo } : {}),
    },
    select: { periodo: true },
    orderBy: { periodo: "asc" },
  });
  if (cierres.length === 0) return null;
  const lista = cierres.map((c) => c.periodo).join(", ");
  return periodo
    ? `La conciliación de ${lista} está en firme: desbloquéala para cambiar sus emparejamientos.`
    : `La conciliación de ${lista} está en firme y un emparejamiento para todos los períodos también la cambiaría: acótalo a este período o desbloquea esos períodos.`;
}

/** Empareja un tercero que solo está en el auxiliar con uno del balance (N:1). */
export async function emparejarTerceroCruce(input: z.input<typeof EmparejarTerceroSchema>): Promise<ActionState> {
  const parsed = EmparejarTerceroSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };
  const ctx = await contextoMarcaCruce(parsed.data.encabezadoId);
  if (!ctx.ok) return { ok: false, message: ctx.message };
  const claveModulo = normalizarClaveTercero(parsed.data.claveModulo);
  const claveBalance = normalizarClaveTercero(parsed.data.claveBalance);
  if (!claveModulo || !claveBalance) return { ok: false, message: "Tercero inválido." };
  const nota = (parsed.data.nota ?? "").trim();
  if (nota.length > MAX_NOTA_MARCA) return { ok: false, message: `La nota no puede superar ${MAX_NOTA_MARCA} caracteres.` };

  const { encabezado } = ctx;
  const periodo = parsed.data.alcance === "todos" ? "" : encabezado.periodo;
  try {
    const bloqueo = await cierreQueImpideEmparejar(encabezado, periodo);
    if (bloqueo) return { ok: false, message: bloqueo };

    const insumos = await cargarInsumosCruceModulo(encabezado.id);
    if (!insumos) return { ok: false, message: "El cargue ya no existe." };
    const tercero = await cruceTerceroDeCargue(insumos, await construirCruceContableModulo(insumos));
    if (!tercero?.resumen) {
      return { ok: false, message: tercero?.mensaje ?? "El cruce por tercero no está disponible en este momento." };
    }
    const valido = validarEmparejamientoTercero(tercero.resumen, claveModulo, claveBalance);
    if (!valido.ok) return { ok: false, message: valido.message };
    const nombreModulo = tercero.resumen.filas.find((f) => f.clave === claveModulo)?.nombre ?? null;
    const nombreBalance = tercero.resumen.filas.find((f) => f.clave === claveBalance)?.nombre ?? null;

    const user = await getCurrentUser();
    const datos = {
      claveBalance,
      nombreModulo,
      nombreBalance,
      origen: parsed.data.origen,
      nota: nota || null,
      creadoPor: user?.name ?? null,
      creadoPorId: ctx.userId,
      creadoEn: new Date(),
    };
    await prisma.emparejamientoTerceroModulo.upsert({
      where: {
        clienteId_moduloCodigo_periodo_claveModulo: {
          clienteId: encabezado.clienteId,
          moduloCodigo: encabezado.moduloCodigo,
          periodo,
          claveModulo,
        },
      },
      create: { clienteId: encabezado.clienteId, moduloCodigo: encabezado.moduloCodigo, periodo, claveModulo, ...datos },
      update: datos,
    });

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "EMPAREJÓ un tercero del cruce por tercero",
      entity: encabezado.nombreCliente,
      detail: `${encabezado.moduloCodigo} · ${periodo || "todos los períodos"} · ${claveModulo}${nombreModulo ? ` (${nombreModulo})` : ""} → ${claveBalance}${nombreBalance ? ` (${nombreBalance})` : ""}${parsed.data.origen === "sugerido_nombre" ? " · sugerido por nombre" : ""}${nota ? ` · ${nota}` : ""}`,
      clientId: encabezado.clienteId,
    });
    revalidatePath(`${rutaModulo(encabezado.moduloCodigo)}/${encabezado.id}`);
    return { ok: true, message: `Emparejado con ${nombreBalance ?? claveBalance}.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("emparejarTerceroCruce", e) };
  }
}

/** Deshace un emparejamiento: los dos terceros vuelven a verse por separado en el cruce. */
export async function quitarEmparejamientoTercero(input: { encabezadoId: number; emparejamientoId: number }): Promise<ActionState> {
  const ctx = await contextoMarcaCruce(Number(input?.encabezadoId));
  if (!ctx.ok) return { ok: false, message: ctx.message };
  const emparejamientoId = Number(input?.emparejamientoId);
  if (!Number.isSafeInteger(emparejamientoId) || emparejamientoId <= 0) return { ok: false, message: "Emparejamiento inválido." };

  const { encabezado } = ctx;
  try {
    const emparejamiento = await prisma.emparejamientoTerceroModulo.findUnique({ where: { id: emparejamientoId } });
    // El permiso se verificó sobre ESTE cargue: el emparejamiento tiene que ser de su cliente y
    // su módulo, y valer para su período; si no, el id sería una puerta a otro cliente.
    if (
      !emparejamiento
      || emparejamiento.clienteId !== encabezado.clienteId
      || emparejamiento.moduloCodigo !== encabezado.moduloCodigo
      || (emparejamiento.periodo !== "" && emparejamiento.periodo !== encabezado.periodo)
    ) {
      return { ok: false, message: "Ese emparejamiento ya no existe." };
    }
    const bloqueo = await cierreQueImpideEmparejar(encabezado, emparejamiento.periodo);
    if (bloqueo) return { ok: false, message: bloqueo };

    await prisma.emparejamientoTerceroModulo.delete({ where: { id: emparejamientoId } });
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "DESHIZO el emparejamiento de un tercero",
      entity: encabezado.nombreCliente,
      detail: `${encabezado.moduloCodigo} · ${emparejamiento.periodo || "todos los períodos"} · ${emparejamiento.claveModulo} → ${emparejamiento.claveBalance}`,
      clientId: encabezado.clienteId,
    });
    revalidatePath(`${rutaModulo(encabezado.moduloCodigo)}/${encabezado.id}`);
    return { ok: true, message: "Emparejamiento deshecho." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("quitarEmparejamientoTercero", e) };
  }
}

// ============================================================
// ELIMINAR datos CARGADOS del módulo (no borradores: eso es `descartarBorradorModulo`).
//
// Alcance explícito —una versión, todo el período o todo el historial del cliente
// junto con sus perfiles de formato—, resuelto en `alcance-eliminacion.ts` (puro).
// El permiso `modulos_datos:eliminar` es independiente de cargar/editar y se
// vuelve a comprobar con alcance sobre el cliente del cargue.
//
// NO se tocan: el cliente, sus borradores, sus preferencias de carga, sus
// correcciones por fila ni la consolidación clasificador→cuenta (configuración,
// no archivo). Sí caen con el período/cliente las marcas de auditoría del cruce
// —quedarían apuntando a una cédula sin datos— y sus soportes.
// ============================================================
export type EliminarDatosModuloState = ActionState & {
  cargasEliminadas?: number;
  marcasEliminadas?: number;
  perfilesEliminados?: number;
};

export async function eliminarDatosModulo(input: {
  encabezadoId: number;
  alcance: AlcanceEliminacionModulo;
}): Promise<EliminarDatosModuloState> {
  // Primer gate antes de validar o consultar nada enviado por el cliente.
  const authz = await authorizePermiso("modulos_datos:eliminar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const encabezadoId = Number(input?.encabezadoId);
  const alcance = parseAlcanceEliminacionModulo(input?.alcance);
  if (!Number.isInteger(encabezadoId) || encabezadoId <= 0 || !alcance) {
    return { ok: false, message: "Selecciona de nuevo qué información deseas eliminar." };
  }

  try {
    const referencia = await prisma.moduloDatoEncabezado.findUnique({
      where: { id: encabezadoId },
      select: {
        id: true,
        clienteId: true,
        moduloCodigo: true,
        nombreCliente: true,
        periodo: true,
        version: true,
        archivoNombre: true,
      },
    });
    if (!referencia) return { ok: false, message: "Ese cargue ya no existe." };

    const scope = await authorizePermiso("modulos_datos:eliminar", { clientId: referencia.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };

    const plan = resolverAlcanceEliminacionModulo(alcance, referencia);

    const resultado = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, `modulo-eliminar:${referencia.moduloCodigo}:${referencia.clienteId}`);

      // Se revalida dentro de la transacción: otra sesión pudo eliminarlo
      // mientras el modal estaba abierto.
      const vigente = await tx.moduloDatoEncabezado.findUnique({
        where: { id: encabezadoId },
        select: { id: true, clienteId: true, moduloCodigo: true, periodo: true },
      });
      if (!vigente || vigente.clienteId !== referencia.clienteId || vigente.moduloCodigo !== referencia.moduloCodigo) {
        return { ok: false as const, message: "Ese cargue ya no existe." };
      }

      const objetivos = await tx.moduloDatoEncabezado.findMany({
        where: plan.filtroEncabezado,
        select: { id: true },
      });
      const ids = objetivos.map((e) => e.id);
      if (ids.length === 0) return { ok: false as const, message: "No se encontraron cargues para eliminar." };

      // Marcas del cruce que quedan sin cédula, con sus soportes (los binarios se
      // borran DESPUÉS del commit: la BD manda).
      const marcas = plan.filtroMarcas
        ? await tx.marcaCruceModulo.findMany({
            where: plan.filtroMarcas,
            select: { id: true, adjuntos: { select: { claveObjeto: true } } },
          })
        : [];

      // El hilo de conversación del cargue es una referencia polimórfica suave:
      // se limpia explícitamente. El detalle sí cae por ON DELETE CASCADE.
      await tx.comment.deleteMany({ where: { entityType: "modulos_datos", entityId: { in: ids } } });
      if (marcas.length) {
        await tx.marcaCruceModulo.deleteMany({ where: { id: { in: marcas.map((m) => m.id) } } });
      }
      // El procesamiento se retira, pero los originales y su SHA-256 permanecen.
      const originalesConservados = await tx.archivoOriginalModulo.updateMany({
        where: { encabezadoId: { in: ids } },
        data: datosArchivoOriginalConCargueEliminado(),
      });
      const cargas = await tx.moduloDatoEncabezado.deleteMany({ where: { id: { in: ids } } });
      const perfiles = plan.eliminaPerfiles
        ? await tx.perfilCargaModulo.deleteMany({
            where: { clienteId: referencia.clienteId, moduloCodigo: referencia.moduloCodigo },
          })
        : { count: 0 };

      // Al borrar la versión vigente de un período que conserva otras, el período
      // se quedaría sin ninguna marcada como oficial (y el cruce contable no
      // tendría de dónde leer): asciende la versión más alta que sobrevive.
      let ascendida: number | null = null;
      if (alcance === "version") {
        const restantes = await tx.moduloDatoEncabezado.findMany({
          where: {
            clienteId: referencia.clienteId,
            moduloCodigo: referencia.moduloCodigo,
            periodo: referencia.periodo,
          },
          select: { id: true, version: true, esOficial: true },
          orderBy: { version: "desc" },
        });
        if (restantes.length > 0 && !restantes.some((r) => r.esOficial)) {
          await tx.moduloDatoEncabezado.update({ where: { id: restantes[0].id }, data: { esOficial: true } });
          ascendida = restantes[0].version;
        }
      }

      return {
        ok: true as const,
        cargasEliminadas: cargas.count,
        perfilesEliminados: perfiles.count,
        marcasEliminadas: marcas.length,
        originalesConservados: originalesConservados.count,
        claves: marcas.flatMap((m) => m.adjuntos.map((a) => a.claveObjeto)),
        ascendida,
      };
    }, { timeoutMs: TIMEOUT_TRANSACCION_MODULO_MS });

    if (!resultado.ok) return resultado;

    // Soportes de las marcas retiradas: best-effort, ya no hay fila que los use.
    if (resultado.claves.length) {
      await Promise.allSettled(resultado.claves.map((clave) => eliminarObjeto(clave)));
    }

    const user = await getCurrentUser();
    const descripcionAlcance =
      alcance === "version"
        ? `versión ${referencia.version} de ${referencia.periodo}`
        : alcance === "periodo"
          ? `todas las versiones de ${referencia.periodo}`
          : "todo el historial del módulo y sus perfiles de carga";
    await logAudit({
      user: user?.name ?? "Sistema",
      action:
        alcance === "cliente_perfiles"
          ? "ELIMINÓ DATOS Y PERFILES DE CARGA DE MÓDULO"
          : "ELIMINÓ DATOS DE MÓDULO",
      entity: referencia.nombreCliente,
      detail: `${referencia.moduloCodigo} · ${descripcionAlcance} · ${resultado.cargasEliminadas} cargue(s) · ${resultado.marcasEliminadas} marca(s) · ${resultado.perfilesEliminados} perfil(es) · ${resultado.originalesConservados} original(es) conservado(s)`,
      clientId: referencia.clienteId,
    });

    revalidarListadosModulo(referencia.moduloCodigo);
    revalidatePath("/dashboard");
    if (plan.eliminaPerfiles) revalidatePath(`/config/perfiles-carga/${referencia.moduloCodigo.toLowerCase()}`);

    const extras = [
      resultado.marcasEliminadas > 0 ? `${resultado.marcasEliminadas} marca(s) del cruce` : null,
      resultado.perfilesEliminados > 0 ? `${resultado.perfilesEliminados} perfil(es)` : null,
      resultado.ascendida != null ? `v${resultado.ascendida} quedó como vigente` : null,
    ].filter(Boolean);
    return {
      ok: true,
      message: `${resultado.cargasEliminadas} cargue(s) eliminado(s)${extras.length ? ` · ${extras.join(" · ")}` : ""}.`,
      cargasEliminadas: resultado.cargasEliminadas,
      marcasEliminadas: resultado.marcasEliminadas,
      perfilesEliminados: resultado.perfilesEliminados,
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarDatosModulo", e) };
  }
}

// ============================================================
// CONCILIACIÓN EN FIRME: cerrar el cruce contable de un módulo bloquea, para ese
// período, las cuentas del balance que pertenecen al módulo (ver
// `src/lib/conciliacion/`). Cerrar y desbloquear lo hacen el senior o gerente
// ASIGNADO al cliente (permisos `conciliaciones:cerrar` / `conciliaciones:desbloquear`
// + asignación vigente; el Superadministrador pasa por alcance global). El estado
// vive en `conciliacion_modulo_cierre` + `cuenta_bloqueada_conciliacion`; los
// eventos, en `registros_auditoria`.
// ============================================================

/** Cierra la conciliación del módulo: crea (o reactiva) el cierre y bloquea las cuentas. */
export async function cerrarConciliacionModulo(input: { encabezadoId: number }): Promise<ActionState> {
  const encabezadoId = Number(input?.encabezadoId);
  if (!Number.isSafeInteger(encabezadoId) || encabezadoId <= 0) return { ok: false, message: "Cargue inválido." };

  try {
    const insumos = await cargarInsumosCruceModulo(encabezadoId);
    if (!insumos) return { ok: false, message: "El cargue ya no existe." };
    const { encabezado } = insumos;

    const authz = await autorizarCierreConciliacion("conciliaciones:cerrar", encabezado.clienteId);
    if (!authz.ok) return { ok: false, message: authz.message };

    const cruce = await construirCruceContableModulo(insumos);
    if (cruce.bloqueo) return { ok: false, message: `No se puede cerrar: ${cruce.bloqueo}` };
    if (!cruce.balanceEmparejado || !cruce.cruceContable) {
      return { ok: false, message: "No hay balance de comprobación confirmado para este período: no hay nada que cerrar." };
    }
    // Donde el módulo lo exige (Cartera, CxP), el cruce por tercero también tiene que estar
    // conciliado: disponible y con marca en toda diferencia desde el umbral de descuadre.
    const descriptor = descriptorModulo(encabezado.moduloCodigo);
    const exigeTercero = descriptor?.crucePorTercero.habilitado === true && descriptor.crucePorTercero.exigidoParaCierre === true;
    const tercero = exigeTercero ? await cruceTerceroDeCargue(insumos, cruce) : null;
    const evaluacion = evaluarCierreConciliacion(
      cruce.cruceContable,
      cruce.resumenMarcas,
      exigeTercero
        ? { exigido: true, estado: tercero?.estado ?? "sin_balance", mensaje: tercero?.mensaje ?? null, resumenMarcas: tercero?.resumenMarcas ?? null }
        : null,
    );
    if (!evaluacion.ok) return { ok: false, message: `No se puede cerrar: ${evaluacion.motivo}` };

    const cuentasRussell = cuentasRussellDelCruce(cruce.cruceContable);
    // Con las cuentas de 6 dígitos del módulo, el bloqueo se limita a ellas (130515 no). Una
    // cédula mixta guarda ahí sus claves de 4 y de 6 (la 422005 en firme, no toda la 4220).
    // Es la cédula DEL PERÍODO: las cuentas asignadas solo para este período también quedan en firme.
    const cuentasRussell6 = descriptor
      ? alcanceExplicitoDelCruce(cedulaDelCargue(descriptor, encabezado.moduloCodigo, insumos.catalogoPrevalidador, insumos.asignacionesPeriodo).cedula, cruce.cruceContable)
      : null;
    const evidenciaTercero = tercero?.resumen ? evidenciaCruceTercero(tercero.resumen, tercero.resumenMarcas) : null;
    const balance = cruce.balanceEmparejado;
    const user = await getCurrentUser();
    const actor = user?.name ?? "Sistema";

    const resultado = await transaccionSerializable(async (tx) => {
      // Mismo candado que congelar/homologar el balance del período: el detalle que
      // se congela aquí no puede cambiar mientras se calcula el snapshot.
      await tomarCandadoTransaccion(tx, `balance-oficial:${encabezado.clienteId}:${balance.periodo}`);
      await tomarCandadoTransaccion(tx, `conciliacion-cierre:${encabezado.clienteId}:${encabezado.moduloCodigo}:${encabezado.periodo}`);

      const existente = await tx.conciliacionModuloCierre.findUnique({
        where: { clienteId_moduloCodigo_periodo: { clienteId: encabezado.clienteId, moduloCodigo: encabezado.moduloCodigo, periodo: encabezado.periodo } },
        select: { id: true, estado: true, cerradoPor: true, cerradoEn: true },
      });
      if (existente && existente.estado === ESTADO_CIERRE_FIRME) {
        return { ok: true as const, idempotente: true, cierreId: existente.id, cuentas: 0, cerradoPor: existente.cerradoPor };
      }

      // Detalle del balance conciliado (la fuente del cruce) + su detalle por tercero
      // ligado (mismas cuentas): el snapshot cubre ambos almacenes.
      const [detalle, terceroLigado] = await Promise.all([
        tx.balancePruebaDetalle.findMany({
          where: { encabezadoId: balance.id },
          select: { cuenta8: true, cuenta6Russell: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
        }),
        tx.balancePruebaEncabezado.findUnique({ where: { id: balance.id }, select: { loteId: true } }),
      ]);
      if (!terceroLigado) {
        return { ok: false as const, message: "El balance del período ya no existe. Vuelve a abrir el cruce." };
      }
      // Congelar el balance NO es requisito para conciliar: lo que vuelve inmutables las
      // cuentas del módulo es ESTE cierre. Como la versión sigue editable entre que se
      // calculó el cruce y este commit, se releen bajo el candado el prevalidador y su
      // huella (detalle, homologación, catálogo y overrides) y se exige que sean los mismos
      // que vio el usuario, con la aprobación todavía vigente.
      const contextoActual = await cargarContextoPrevalidadorBalance(balance.id, tx);
      if (cruce.huellaBalance == null || contextoActual.huella !== cruce.huellaBalance || !contextoActual.revision.vigente) {
        return { ok: false as const, message: "El balance del período cambió mientras se cerraba la conciliación. Vuelve a abrir el cruce." };
      }
      const filasTercero = terceroLigado.loteId
        ? await tx.balanceTerceroDetalle.findMany({
            where: { encabezado: { loteId: terceroLigado.loteId } },
            select: { cuenta8: true, cuenta6Russell: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
          })
        : [];
      const aFila = (f: { cuenta8: string; cuenta6Russell: string | null; saldoInicial: Prisma.Decimal; debitos: Prisma.Decimal; creditos: Prisma.Decimal; saldoFinal: Prisma.Decimal }) => ({
        cuenta8: f.cuenta8,
        cuenta6Russell: f.cuenta6Russell,
        saldoInicial: Number(f.saldoInicial),
        debitos: Number(f.debitos),
        creditos: Number(f.creditos),
        saldoFinal: Number(f.saldoFinal),
      });
      // El detalle principal manda (importes oficiales); el tercero solo aporta
      // cuentas que no estén ya en el principal.
      const bloqueadas = cuentasBloqueoDelModulo([...detalle.map(aFila), ...filasTercero.map(aFila)], cuentasRussell, cuentasRussell6);
      if (bloqueadas.length === 0) {
        return { ok: false as const, message: "Ninguna cuenta del balance está homologada a las cuentas del módulo: no hay nada que bloquear." };
      }

      const datosCierre = {
        balancePeriodo: balance.periodo,
        moduloDatoEncabezadoId: encabezado.id,
        balanceEncabezadoId: balance.id,
        cuentasRussell,
        cuentasRussell6: cuentasRussell6 ?? Prisma.DbNull,
        resumenCruceTercero: evidenciaTercero ? (evidenciaTercero as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        estado: ESTADO_CIERRE_FIRME,
        cerradoPorId: authz.userId,
        cerradoPor: actor,
        cerradoEn: new Date(),
        desbloqueadoPorId: null,
        desbloqueadoPor: null,
        desbloqueadoEn: null,
        justificacionDesbloqueo: null,
      };
      const cierre = existente
        ? await tx.conciliacionModuloCierre.update({ where: { id: existente.id }, data: datosCierre, select: { id: true } })
        : await tx.conciliacionModuloCierre.create({
            data: { clienteId: encabezado.clienteId, moduloCodigo: encabezado.moduloCodigo, periodo: encabezado.periodo, ...datosCierre },
            select: { id: true },
          });
      await tx.cuentaBloqueadaConciliacion.deleteMany({ where: { cierreId: cierre.id } });
      await tx.cuentaBloqueadaConciliacion.createMany({
        data: bloqueadas.map((b) => ({
          cierreId: cierre.id,
          clienteId: encabezado.clienteId,
          periodo: balance.periodo,
          cuenta: b.cuenta8,
          cuenta6Russell: b.cuenta6Russell,
          saldoInicial: new Prisma.Decimal(b.saldoInicial.toFixed(2)),
          debitos: new Prisma.Decimal(b.debitos.toFixed(2)),
          creditos: new Prisma.Decimal(b.creditos.toFixed(2)),
          saldoFinal: new Prisma.Decimal(b.saldoFinal.toFixed(2)),
          moduloCodigo: encabezado.moduloCodigo,
          moduloDatoEncabezadoId: encabezado.id,
        })),
      });
      return { ok: true as const, idempotente: false, cierreId: cierre.id, cuentas: bloqueadas.length, cerradoPor: actor };
    });
    if (!resultado.ok) return resultado;
    if (resultado.idempotente) {
      return { ok: true, message: `La conciliación ya estaba en firme (cerró ${resultado.cerradoPor}).` };
    }

    await logAudit({
      user: actor,
      action: "CERRÓ CONCILIACIÓN (EN FIRME)",
      entity: encabezado.nombreCliente,
      detail: `${encabezado.moduloCodigo} · ${encabezado.periodo} · cargue #${encabezado.id} · balance #${balance.id} ${balance.version} (${balance.periodo}) · ${resultado.cuentas} cuenta(s) bloqueada(s) · cuentas Russell ${(cuentasRussell6 ?? cuentasRussell).join(", ")}${evidenciaTercero ? ` · cruce por tercero: ${evidenciaTercero.terceros} tercero(s), ${evidenciaTercero.marcas.marcadas} marca(s), huella ${evidenciaTercero.huella.slice(0, 12)}` : ""}`,
      clientId: encabezado.clienteId,
    });
    revalidatePath(`${rutaModulo(encabezado.moduloCodigo)}/${encabezado.id}`);
    revalidatePath(`/balance/${balance.id}`);
    revalidatePath("/balance");
    return { ok: true, message: `Conciliación en firme: ${resultado.cuentas} cuenta(s) del balance ${balance.periodo} quedaron bloqueadas.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("cerrarConciliacionModulo", e) };
  }
}

const DesbloquearSchema = z.object({
  cierreId: z.coerce.number().int().positive(),
  justificacion: z.string(),
});

/** Desbloquea una conciliación en firme (senior/gerente asignado), con justificación obligatoria. */
export async function desbloquearConciliacion(input: { cierreId: number; justificacion: string }): Promise<ActionState> {
  const parsed = DesbloquearSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };
  const validacion = validarJustificacionDesbloqueo(parsed.data.justificacion);
  if (!validacion.ok) return { ok: false, message: validacion.message };
  const { cierreId } = parsed.data;

  try {
    const cierre = await prisma.conciliacionModuloCierre.findUnique({
      where: { id: cierreId },
      select: { id: true, clienteId: true, moduloCodigo: true, periodo: true, balancePeriodo: true, balanceEncabezadoId: true, moduloDatoEncabezadoId: true, estado: true, cerradoPor: true },
    });
    if (!cierre) return { ok: false, message: "El cierre ya no existe." };

    const authz = await autorizarCierreConciliacion("conciliaciones:desbloquear", cierre.clienteId);
    if (!authz.ok) return { ok: false, message: authz.message };

    const user = await getCurrentUser();
    const actor = user?.name ?? "Sistema";
    const resultado = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, `conciliacion-cierre:${cierre.clienteId}:${cierre.moduloCodigo}:${cierre.periodo}`);
      const actual = await tx.conciliacionModuloCierre.findUnique({ where: { id: cierreId }, select: { estado: true } });
      if (!actual) return { ok: false as const, message: "El cierre ya no existe." };
      if (actual.estado !== ESTADO_CIERRE_FIRME) return { ok: false as const, message: "La conciliación ya estaba desbloqueada." };
      const { count } = await tx.cuentaBloqueadaConciliacion.deleteMany({ where: { cierreId } });
      await tx.conciliacionModuloCierre.update({
        where: { id: cierreId },
        data: {
          estado: ESTADO_CIERRE_DESBLOQUEADO,
          desbloqueadoPorId: authz.userId,
          desbloqueadoPor: actor,
          desbloqueadoEn: new Date(),
          justificacionDesbloqueo: validacion.justificacion,
        },
      });
      return { ok: true as const, cuentas: count };
    });
    if (!resultado.ok) return resultado;

    const cliente = await prisma.client.findUnique({ where: { id: cierre.clienteId }, select: { name: true } });
    await logAudit({
      user: actor,
      action: "DESBLOQUEÓ CONCILIACIÓN",
      entity: cliente?.name ?? String(cierre.clienteId),
      detail: `${cierre.moduloCodigo} · ${cierre.periodo} · cargue #${cierre.moduloDatoEncabezadoId} · balance #${cierre.balanceEncabezadoId} (${cierre.balancePeriodo}) · ${resultado.cuentas} cuenta(s) liberada(s) · cerró ${cierre.cerradoPor} · Justificación: ${validacion.justificacion}`,
      clientId: cierre.clienteId,
    });
    revalidatePath(`${rutaModulo(cierre.moduloCodigo)}/${cierre.moduloDatoEncabezadoId}`);
    revalidatePath(`/balance/${cierre.balanceEncabezadoId}`);
    revalidatePath("/balance");
    return { ok: true, message: `Conciliación desbloqueada: ${resultado.cuentas} cuenta(s) liberada(s). La justificación quedó en la bitácora.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("desbloquearConciliacion", e) };
  }
}
