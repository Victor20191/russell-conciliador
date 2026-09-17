"use server";

// Server Actions de los PATRONES DE ARCHIVO por aplicativo (ERP) y módulo: la parametrización con
// que se lee el archivo de cada aplicativo. Ver `/modulos/[codigo]/patrones`. Todas exigen
// `perfiles_carga:administrar` (Administrador): la lista se ve con el permiso de cargar módulos.
import { revalidatePath } from "next/cache";
import * as z from "zod";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { authorizePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mensajeErrorBD, registrarError } from "@/lib/errores";
import { tomarCandadoTransaccion, transaccionSerializable } from "@/lib/concurrency";
import { ingerir, type GridHoja } from "@/lib/balance/extraccion/ingesta";
import { ERP_MANUAL_CODE } from "@/lib/erp-procesos";
import { descriptorModulo, type DescriptorModulo } from "@/lib/modulos/descriptores";
import { SpecModuloSchema, type SpecModulo } from "@/lib/modulos/extraccion/esquema";
import { invalidarValorAmbiguoIngresos, sugerirSpec } from "@/lib/modulos/extraccion/sugerir";
import { seleccionarHojaModulo } from "@/lib/modulos/extraccion/seleccion-hoja";
import { transformarModulo } from "@/lib/modulos/extraccion/transformar";
import { vistaAnalisisHoja } from "@/lib/modulos/extraccion/vista-analisis";
import { normalizarSpecModulo, normalizarSpecModuloArchivo, validarSpecModulo } from "@/lib/modulos/perfil-modulo";
import { aplicarPatronASpec } from "@/lib/modulos/patrones/aplicar";
import { mejorVersion, type VersionCandidata } from "@/lib/modulos/patrones/mejor-version";
import { encabezadoParaGuardar, normalizarRotulo } from "@/lib/modulos/patrones/rotulos";
import {
  esVersionEditable,
  motivoNoAprobable,
  siguienteVersionPatron,
  transicionPatronPermitida,
} from "@/lib/modulos/patrones/version";
import {
  claveMuestraPatronModulo,
  huellaSha256Archivo,
  tipoContenidoArchivo,
} from "@/lib/modulos/archivo-original";
import { almacenamientoDisponible, eliminarObjeto, obtenerObjeto, subirObjeto } from "@/lib/storage/objetos";
import { INFO_TIPO_FORMATO, nivelCarteraDeSpec, tipoFormatoCartera } from "@/lib/modulos/cartera/tipo-formato";
import type { ActionState } from "@/lib/definitions";
import type { AnalisisModulo } from "@/app/actions/modulos-datos";

const MAX_BYTES_MUESTRA = 30 * 1024 * 1024;
const PERMISO = "perfiles_carga:administrar";

const rutaPatrones = (moduloCodigo: string) => `/modulos/${moduloCodigo.toLowerCase()}/patrones`;

export type AnalisisPatron = AnalisisModulo & {
  /** Con un mapeo de partida: cuánto se parece este archivo al archivo de donde salió. */
  coincidenciaBase?: number;
  /** Referencia leída del archivo de un cliente (no es la muestra). */
  referencia?: { nombreArchivo: string; cliente: string };
};

class ErrorPatron extends Error {}

function descriptorDe(moduloCodigo: unknown): DescriptorModulo {
  const descriptor = descriptorModulo(String(moduloCodigo ?? "").trim().toUpperCase());
  if (!descriptor) throw new ErrorPatron("Módulo no soportado.");
  return descriptor;
}

async function aplicativoDePatron(erpIdCrudo: unknown) {
  const erpId = Number(erpIdCrudo);
  if (!Number.isInteger(erpId) || erpId <= 0) throw new ErrorPatron("Elige el aplicativo del patrón.");
  const erp = await prisma.erp.findUnique({ where: { id: erpId }, select: { id: true, code: true, name: true, active: true } });
  if (!erp) throw new ErrorPatron("El aplicativo ya no existe.");
  if (erp.code === ERP_MANUAL_CODE) throw new ErrorPatron("«Archivo manual» no tiene patrones: se mapea en cada carga.");
  if (!erp.active) throw new ErrorPatron(`El aplicativo ${erp.name} está inactivo en el catálogo.`);
  return erp;
}

async function bytesDeArchivo(archivo: FormDataEntryValue | null): Promise<{ archivo: File; bytes: Uint8Array }> {
  if (!(archivo instanceof File) || archivo.size === 0) throw new ErrorPatron("Adjunta el archivo de muestra.");
  if (archivo.size > MAX_BYTES_MUESTRA) throw new ErrorPatron("La muestra supera 30 MB: usa un archivo con menos filas.");
  return { archivo, bytes: new Uint8Array(await archivo.arrayBuffer()).slice() };
}

async function hojasDe(bytes: Uint8Array, nombreArchivo: string): Promise<GridHoja[]> {
  let ingesta: Awaited<ReturnType<typeof ingerir>>;
  try {
    ingesta = await ingerir(bytes.slice().buffer as ArrayBuffer, nombreArchivo);
  } catch (e) {
    registrarError("patronesModulo.ingerir", e);
    throw new ErrorPatron("No se pudo leer el archivo. Si es un Excel, ábrelo, guárdalo nuevamente como .xlsx e intenta otra vez.");
  }
  if (ingesta.modo !== "tabular") throw new ErrorPatron("Los patrones solo admiten archivos tabulares (Excel/CSV).");
  return ingesta.hojas;
}

function specDeFormulario(descriptor: DescriptorModulo, crudo: unknown): SpecModulo | null {
  if (typeof crudo !== "string" || !crudo.trim()) return null;
  let valor: unknown;
  try {
    valor = JSON.parse(crudo);
  } catch {
    throw new ErrorPatron("El mapeo de columnas no es válido.");
  }
  const parsed = SpecModuloSchema.safeParse(valor);
  if (!parsed.success) throw new ErrorPatron("El mapeo de columnas no es válido.");
  return normalizarSpecModulo(descriptor, parsed.data);
}

/** Versión «de partida» (un mapeo y el encabezado de donde salió) para trasladarlo a otro archivo. */
function baseComparable(spec: SpecModulo, encabezado: readonly unknown[]): VersionCandidata {
  return {
    id: 0, version: 0, estado: "aprobada", clienteOrigenId: null, hoja: spec.hoja,
    filaEncabezado: spec.filaEncabezado, primeraFilaDatos: spec.primeraFilaDatos, encabezado, spec,
  };
}

/** Vista para el editor: hoja elegida (o la que propone el contenido) con el mapeo dado o sugerido. */
function analisisDeHojas(
  descriptor: DescriptorModulo,
  hojas: GridHoja[],
  opciones: { hojaElegida?: string | null; base?: { spec: SpecModulo; encabezado: readonly unknown[] } | null },
): { analisis: AnalisisPatron } {
  const seleccion = descriptor.crucePorTercero.detalleTercero === true || descriptor.nomina != null
    ? seleccionarHojaModulo(descriptor, hojas)
    : null;
  const elegida = opciones.hojaElegida ? hojas.find((h) => h.nombre === opciones.hojaElegida) : undefined;
  let hoja = elegida
    ?? hojas.find((h) => h.nombre === seleccion?.propuesta)
    ?? hojas.find((h) => !h.oculta)
    ?? hojas[0];
  if (!hoja) throw new ErrorPatron("El archivo no tiene hojas legibles.");

  let spec: SpecModulo = sugerirSpec(descriptor, hoja);
  let coincidenciaBase: number | undefined;
  if (opciones.base) {
    const ubicacion = mejorVersion(descriptor, hojas, [baseComparable(opciones.base.spec, opciones.base.encabezado)], {
      hojaElegida: elegida?.nombre ?? null,
      hojaPropuesta: hoja.nombre,
    });
    if (ubicacion && ubicacion.coincidencia.porcentaje > 0) {
      hoja = hojas.find((h) => h.nombre === ubicacion.hoja) ?? hoja;
      spec = aplicarPatronASpec(descriptor, ubicacion).spec;
      coincidenciaBase = ubicacion.coincidencia.porcentaje;
    }
  }
  spec = normalizarSpecModulo(descriptor, spec);
  return {
    analisis: {
      ok: true,
      modo: "manual",
      ...vistaAnalisisHoja(descriptor, hojas, hoja, spec, seleccion),
      spec,
      ...(coincidenciaBase != null ? { coincidenciaBase } : {}),
    },
  };
}

const MENSAJE_TIPO_FORMATO = "Elige el tipo de formato del archivo: por documento, por edades o por documento y edades.";

/**
 * Valida un mapeo contra la muestra y devuelve lo que se guarda: el mapeo reutilizable y los
 * rótulos del encabezado con que se reconocerán los archivos.
 */
function prepararVersion(
  descriptor: DescriptorModulo,
  hojas: GridHoja[],
  specEntrada: SpecModulo,
  opciones: { exigirTipoFormato: boolean },
) {
  const spec = normalizarSpecModulo(descriptor, specEntrada);
  // Cartera y CxP: el tipo de formato decide qué controles se validan en cada cargue.
  if (opciones.exigirTipoFormato && descriptor.crucePorTercero.detalleTercero && !spec.tipoFormato) {
    throw new ErrorPatron(MENSAJE_TIPO_FORMATO);
  }
  const error = validarSpecModulo(descriptor, spec);
  if (error) throw new ErrorPatron(error);
  const hoja = hojas.find((h) => h.nombre === spec.hoja);
  if (!hoja) throw new ErrorPatron(`La muestra no tiene la hoja «${spec.hoja}».`);
  const filaEncabezado = hoja.filas[spec.filaEncabezado - 1] ?? [];
  const encabezado = encabezadoParaGuardar(filaEncabezado);
  if (encabezado.filter((rotulo) => normalizarRotulo(rotulo) !== "").length < 2) {
    throw new ErrorPatron("La fila de encabezado de la muestra no tiene rótulos suficientes para reconocer el archivo.");
  }
  if (invalidarValorAmbiguoIngresos(descriptor, hoja, spec).invalidado) {
    throw new ErrorPatron("Ingresos no admite una columna de total de factura como valor. Mapea ingreso neto sin IVA/impuestos, subtotal o base gravable.");
  }
  const lectura = transformarModulo(descriptor, normalizarSpecModuloArchivo(descriptor, spec), hoja);
  if (!lectura.filas.some((f) => f.tipoFila === "movimiento")) {
    throw new ErrorPatron("Con este mapeo la muestra no produce ninguna fila. Revisa las filas y las columnas.");
  }
  return { spec, hoja, encabezado };
}

function respuestaError(contexto: string, e: unknown): { ok: false; message: string } {
  if (e instanceof ErrorPatron) return { ok: false, message: e.message };
  return { ok: false, message: mensajeErrorBD(contexto, e) };
}

// ============================================================
// ANALIZAR: la muestra que sube el administrador, la muestra guardada de una versión, o el
// archivo de un cliente como referencia para prellenar el mapeo.
// ============================================================

export async function analizarMuestraPatron(formData: FormData): Promise<AnalisisPatron> {
  const permiso = await authorizePermiso(PERMISO);
  if (!permiso.ok) return { ok: false, message: permiso.message };
  try {
    const descriptor = descriptorDe(formData.get("moduloCodigo"));
    const { archivo, bytes } = await bytesDeArchivo(formData.get("archivo"));
    const hojas = await hojasDe(bytes, archivo.name);
    const specBase = specDeFormulario(descriptor, formData.get("baseSpecJson"));
    const encabezadoCrudo = formData.get("baseEncabezadoJson");
    const encabezadoBase = typeof encabezadoCrudo === "string" && encabezadoCrudo ? (JSON.parse(encabezadoCrudo) as unknown) : null;
    const base = specBase && Array.isArray(encabezadoBase) ? { spec: specBase, encabezado: encabezadoBase } : null;
    const hojaElegida = String(formData.get("hoja") ?? "").trim() || null;
    return analisisDeHojas(descriptor, hojas, { hojaElegida, base }).analisis;
  } catch (e) {
    return respuestaError("analizarMuestraPatron", e);
  }
}

export async function analizarMuestraDeVersion(input: { id: number; hoja?: string | null }): Promise<AnalisisPatron> {
  const permiso = await authorizePermiso(PERMISO);
  if (!permiso.ok) return { ok: false, message: permiso.message };
  try {
    const version = await prisma.versionPatronArchivoModulo.findUnique({ where: { id: Number(input.id) } });
    if (!version) throw new ErrorPatron("La versión ya no existe.");
    const descriptor = descriptorDe(version.moduloCodigo);
    if (!version.muestraClaveObjeto) throw new ErrorPatron("La versión no tiene muestra: súbela primero.");
    const objeto = await obtenerObjeto(version.muestraClaveObjeto);
    if (!objeto || (version.muestraSha256 && huellaSha256Archivo(objeto.cuerpo) !== version.muestraSha256)) {
      throw new ErrorPatron("La muestra de la versión no está disponible o no supera la verificación de integridad.");
    }
    const hojas = await hojasDe(objeto.cuerpo, version.muestraNombre ?? "muestra.xlsx");
    const parsed = SpecModuloSchema.safeParse(version.specJson);
    if (!parsed.success) throw new ErrorPatron("El mapeo guardado de la versión es ilegible.");
    const spec = normalizarSpecModulo(descriptor, parsed.data);
    const hoja = hojas.find((h) => h.nombre === (input.hoja || spec.hoja));
    if (!hoja) throw new ErrorPatron(`La muestra no tiene la hoja «${spec.hoja}».`);
    const specHoja = hoja.nombre === spec.hoja ? spec : sugerirSpec(descriptor, hoja);
    const seleccion = descriptor.crucePorTercero.detalleTercero === true || descriptor.nomina != null
      ? seleccionarHojaModulo(descriptor, hojas)
      : null;
    return { ok: true, modo: "manual", ...vistaAnalisisHoja(descriptor, hojas, hoja, specHoja, seleccion), spec: specHoja };
  } catch (e) {
    return respuestaError("analizarMuestraDeVersion", e);
  }
}

export async function analizarOriginalParaPatron(input: { recepcionLoteId: string; moduloCodigo: string }): Promise<AnalisisPatron> {
  const permiso = await authorizePermiso(PERMISO);
  if (!permiso.ok) return { ok: false, message: permiso.message };
  try {
    const descriptor = descriptorDe(input.moduloCodigo);
    const loteId = z.string().uuid().safeParse(input.recepcionLoteId);
    if (!loteId.success) throw new ErrorPatron("El archivo de referencia no es válido.");
    const original = await prisma.archivoOriginalModulo.findUnique({
      where: { loteId: loteId.data },
      select: { clienteId: true, moduloCodigo: true, nombreArchivo: true, nombreCliente: true, claveObjeto: true, disponible: true, huellaSha256: true },
    });
    if (!original || original.moduloCodigo !== descriptor.codigo || !original.disponible || !original.claveObjeto) {
      throw new ErrorPatron("El archivo de referencia ya no está disponible.");
    }
    const alcance = await authorizePermiso(PERMISO, { clientId: original.clienteId, modo: "lectura" });
    if (!alcance.ok) return { ok: false, message: alcance.message };
    const objeto = await obtenerObjeto(original.claveObjeto);
    if (!objeto || huellaSha256Archivo(objeto.cuerpo) !== original.huellaSha256) {
      throw new ErrorPatron("El archivo de referencia no supera la verificación de integridad.");
    }
    const hojas = await hojasDe(objeto.cuerpo, original.nombreArchivo);
    const { analisis } = analisisDeHojas(descriptor, hojas, {});
    return { ...analisis, referencia: { nombreArchivo: original.nombreArchivo, cliente: original.nombreCliente } };
  } catch (e) {
    return respuestaError("analizarOriginalParaPatron", e);
  }
}

// ============================================================
// CREAR / EDITAR versiones
// ============================================================

const NotaSchema = z.string().trim().max(2000, "La nota no puede superar 2.000 caracteres.");

export async function crearVersionPatron(formData: FormData): Promise<ActionState & { versionId?: number; version?: number }> {
  const permiso = await authorizePermiso(PERMISO);
  if (!permiso.ok) return { ok: false, message: permiso.message };
  if (!almacenamientoDisponible()) return { ok: false, message: "El almacenamiento de objetos no está configurado: no se puede guardar la muestra." };
  let claveSubida: string | null = null;
  try {
    const descriptor = descriptorDe(formData.get("moduloCodigo"));
    const erp = await aplicativoDePatron(formData.get("erpId"));
    const { archivo, bytes } = await bytesDeArchivo(formData.get("archivo"));
    const specEntrada = specDeFormulario(descriptor, formData.get("specJson"));
    if (!specEntrada) throw new ErrorPatron("Falta el mapeo de columnas.");
    const nota = NotaSchema.safeParse(formData.get("nota") ?? "");
    if (!nota.success) throw new ErrorPatron(nota.error.issues[0]?.message ?? "La nota no es válida.");
    const aprobar = formData.get("aprobar") === "1";
    const hojas = await hojasDe(bytes, archivo.name);
    const { spec, encabezado } = prepararVersion(descriptor, hojas, specEntrada, { exigirTipoFormato: true });
    const user = await getCurrentUser();

    const creada = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, `patron-archivo:${erp.id}:${descriptor.codigo}`);
      const existentes = await tx.versionPatronArchivoModulo.findMany({
        where: { erpId: erp.id, moduloCodigo: descriptor.codigo },
        select: { version: true },
      });
      const version = siguienteVersionPatron(existentes.map((v) => v.version));
      const clave = claveMuestraPatronModulo({ moduloCodigo: descriptor.codigo, erpCode: erp.code, version, nombreArchivo: archivo.name });
      await subirObjeto({ key: clave, cuerpo: bytes, contentType: tipoContenidoArchivo(archivo.name, archivo.type) });
      claveSubida = clave;
      const ahora = new Date();
      return tx.versionPatronArchivoModulo.create({
        data: {
          erpId: erp.id,
          moduloCodigo: descriptor.codigo,
          version,
          estado: aprobar ? "aprobada" : "pendiente",
          hoja: spec.hoja,
          filaEncabezado: spec.filaEncabezado,
          primeraFilaDatos: spec.primeraFilaDatos,
          encabezadoJson: encabezado,
          specJson: spec as Prisma.InputJsonValue,
          muestraClaveObjeto: clave,
          muestraNombre: archivo.name,
          muestraTamanoBytes: bytes.byteLength,
          muestraSha256: huellaSha256Archivo(bytes),
          nota: nota.data || null,
          creadoPor: user?.name ?? null,
          creadoPorId: user?.id ?? null,
          ...(aprobar ? { aprobadoPor: user?.name ?? null, aprobadoPorId: user?.id ?? null, aprobadoEn: ahora } : {}),
        },
        select: { id: true, version: true },
      });
    });
    claveSubida = null;

    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CREÓ PATRÓN DE ARCHIVO",
      entity: `${descriptor.label} · ${erp.name} v${creada.version}`,
      detail: `${aprobar ? "aprobada" : "pendiente"} · muestra ${archivo.name} · hoja «${spec.hoja}» · ${encabezado.filter(Boolean).length} rótulos`,
    });
    revalidatePath(rutaPatrones(descriptor.codigo));
    return { ok: true, versionId: creada.id, version: creada.version, message: `Versión ${creada.version} de ${erp.name} ${aprobar ? "aprobada" : "guardada como pendiente"}.` };
  } catch (e) {
    if (claveSubida) await eliminarObjeto(claveSubida).catch((error) => registrarError("crearVersionPatron.limpiarMuestra", error));
    return respuestaError("crearVersionPatron", e);
  }
}

/**
 * Sube (o reemplaza) la muestra de una versión PENDIENTE —típicamente una migrada del perfil de un
 * cliente, que nació sin muestra—. La muestra debe coincidir con la versión; el mapeo se traslada
 * a sus columnas y su encabezado pasa a ser la referencia de la versión.
 */
export async function subirMuestraVersionPatron(formData: FormData): Promise<ActionState> {
  const permiso = await authorizePermiso(PERMISO);
  if (!permiso.ok) return { ok: false, message: permiso.message };
  if (!almacenamientoDisponible()) return { ok: false, message: "El almacenamiento de objetos no está configurado: no se puede guardar la muestra." };
  try {
    const id = Number(formData.get("versionId"));
    const version = await prisma.versionPatronArchivoModulo.findUnique({ where: { id }, include: { erp: { select: { code: true, name: true } } } });
    if (!version) throw new ErrorPatron("La versión ya no existe.");
    if (!esVersionEditable(version)) throw new ErrorPatron("Solo se cambia la muestra de una versión pendiente. Para otro formato crea una versión nueva.");
    const descriptor = descriptorDe(version.moduloCodigo);
    const { archivo, bytes } = await bytesDeArchivo(formData.get("archivo"));
    const hojas = await hojasDe(bytes, archivo.name);
    const parsed = SpecModuloSchema.safeParse(version.specJson);
    if (!parsed.success || !Array.isArray(version.encabezadoJson)) throw new ErrorPatron("El mapeo guardado de la versión es ilegible.");
    const ubicacion = mejorVersion(descriptor, hojas, [baseComparable(normalizarSpecModulo(descriptor, parsed.data), version.encabezadoJson as unknown[])]);
    if (!ubicacion?.coincidencia.elegible) {
      throw new ErrorPatron(`La muestra no coincide con esta versión (${ubicacion?.coincidencia.porcentaje ?? 0} %). Para ese formato crea una versión nueva.`);
    }
    // Una versión migrada puede no declarar aún su tipo: se declara al editarla o al aprobarla.
    const { spec, encabezado } = prepararVersion(descriptor, hojas, aplicarPatronASpec(descriptor, ubicacion).spec, { exigirTipoFormato: false });
    const clave = claveMuestraPatronModulo({ moduloCodigo: version.moduloCodigo, erpCode: version.erp.code, version: version.version, nombreArchivo: archivo.name });
    await subirObjeto({ key: clave, cuerpo: bytes, contentType: tipoContenidoArchivo(archivo.name, archivo.type) });
    const actualizada = await prisma.versionPatronArchivoModulo.updateMany({
      where: { id, estado: "pendiente", actualizadoEn: version.actualizadoEn },
      data: {
        hoja: spec.hoja,
        filaEncabezado: spec.filaEncabezado,
        primeraFilaDatos: spec.primeraFilaDatos,
        encabezadoJson: encabezado,
        specJson: spec as Prisma.InputJsonValue,
        muestraClaveObjeto: clave,
        muestraNombre: archivo.name,
        muestraTamanoBytes: bytes.byteLength,
        muestraSha256: huellaSha256Archivo(bytes),
      },
    });
    if (actualizada.count !== 1) throw new ErrorPatron("La versión cambió mientras se subía la muestra. Recarga la página.");
    if (version.muestraClaveObjeto && version.muestraClaveObjeto !== clave) {
      await eliminarObjeto(version.muestraClaveObjeto).catch((error) => registrarError("subirMuestraVersionPatron.limpiar", error));
    }
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "SUBIÓ MUESTRA DE PATRÓN",
      entity: `${descriptor.label} · ${version.erp.name} v${version.version}`,
      detail: `${archivo.name} · coincidencia ${ubicacion.coincidencia.porcentaje} %`,
    });
    revalidatePath(rutaPatrones(version.moduloCodigo));
    return { ok: true, message: `Muestra guardada (${ubicacion.coincidencia.porcentaje} % de coincidencia).` };
  } catch (e) {
    return respuestaError("subirMuestraVersionPatron", e);
  }
}

const ActualizarVersionSchema = z.object({
  id: z.number().int().positive(),
  actualizadoEn: z.string().min(1),
  specJson: z.string().min(2),
  nota: NotaSchema.optional(),
});

/** Edita el mapeo de una versión PENDIENTE sobre su muestra (una aprobada no se edita en sitio). */
export async function actualizarVersionPatron(input: z.input<typeof ActualizarVersionSchema>): Promise<ActionState> {
  const permiso = await authorizePermiso(PERMISO);
  if (!permiso.ok) return { ok: false, message: permiso.message };
  const validacion = ActualizarVersionSchema.safeParse(input);
  if (!validacion.success) return { ok: false, message: validacion.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    const datos = validacion.data;
    const version = await prisma.versionPatronArchivoModulo.findUnique({ where: { id: datos.id }, include: { erp: { select: { name: true } } } });
    if (!version) throw new ErrorPatron("La versión ya no existe.");
    if (!esVersionEditable(version)) throw new ErrorPatron("Una versión aprobada no se edita: crea una versión nueva a partir de ella.");
    if (version.actualizadoEn.toISOString() !== datos.actualizadoEn) throw new ErrorPatron("La versión cambió desde que la abriste. Recarga la página.");
    if (!version.muestraClaveObjeto) throw new ErrorPatron("Sube primero la muestra de la versión.");
    const descriptor = descriptorDe(version.moduloCodigo);
    const specEntrada = specDeFormulario(descriptor, datos.specJson);
    if (!specEntrada) throw new ErrorPatron("Falta el mapeo de columnas.");
    const objeto = await obtenerObjeto(version.muestraClaveObjeto);
    if (!objeto || (version.muestraSha256 && huellaSha256Archivo(objeto.cuerpo) !== version.muestraSha256)) {
      throw new ErrorPatron("La muestra de la versión no está disponible o no supera la verificación de integridad.");
    }
    const hojas = await hojasDe(objeto.cuerpo, version.muestraNombre ?? "muestra.xlsx");
    const { spec, encabezado } = prepararVersion(descriptor, hojas, specEntrada, { exigirTipoFormato: true });
    const actualizada = await prisma.versionPatronArchivoModulo.updateMany({
      where: { id: datos.id, estado: "pendiente", actualizadoEn: version.actualizadoEn },
      data: {
        hoja: spec.hoja,
        filaEncabezado: spec.filaEncabezado,
        primeraFilaDatos: spec.primeraFilaDatos,
        encabezadoJson: encabezado,
        specJson: spec as Prisma.InputJsonValue,
        ...(datos.nota !== undefined ? { nota: datos.nota || null } : {}),
      },
    });
    if (actualizada.count !== 1) throw new ErrorPatron("La versión cambió desde que la abriste. Recarga la página.");
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "EDITÓ PATRÓN DE ARCHIVO",
      entity: `${descriptor.label} · ${version.erp.name} v${version.version}`,
      detail: `hoja «${spec.hoja}» · encabezado fila ${spec.filaEncabezado}`,
    });
    revalidatePath(rutaPatrones(version.moduloCodigo));
    return { ok: true, message: "Versión actualizada." };
  } catch (e) {
    return respuestaError("actualizarVersionPatron", e);
  }
}

const DeclararTipoSchema = z.object({
  id: z.number().int().positive(),
  actualizadoEn: z.string().min(1),
  tipoFormato: z.enum(["documento", "edades", "documento_edades"]),
});

/**
 * Declara el TIPO DE FORMATO de una versión de Cartera o CxP sin tocar su mapeo de columnas. En
 * una pendiente se puede cambiar cuantas veces haga falta; en una aprobada o inactiva solo se
 * declara si aún no lo tenía (las versiones anteriores a la declaración): para cambiarlo después
 * se crea una versión nueva. Los cargues ya hechos conservan su propio mapeo; lo declarado rige
 * desde el próximo archivo (qué se valida y, si el nivel cambia, cómo se lee cada fila).
 */
export async function declararTipoFormatoVersion(input: z.input<typeof DeclararTipoSchema>): Promise<ActionState> {
  const permiso = await authorizePermiso(PERMISO);
  if (!permiso.ok) return { ok: false, message: permiso.message };
  const validacion = DeclararTipoSchema.safeParse(input);
  if (!validacion.success) return { ok: false, message: "Elige un tipo de formato válido." };
  try {
    const datos = validacion.data;
    const version = await prisma.versionPatronArchivoModulo.findUnique({ where: { id: datos.id }, include: { erp: { select: { name: true } } } });
    if (!version) throw new ErrorPatron("La versión ya no existe.");
    const descriptor = descriptorDe(version.moduloCodigo);
    if (!descriptor.crucePorTercero.detalleTercero) throw new ErrorPatron("El tipo de formato solo aplica a Cartera y Cuentas por pagar.");
    if (version.actualizadoEn.toISOString() !== datos.actualizadoEn) throw new ErrorPatron("La versión cambió desde que la abriste. Recarga la página.");
    const guardado = SpecModuloSchema.safeParse(version.specJson);
    if (!guardado.success) throw new ErrorPatron("El mapeo guardado de la versión es ilegible.");
    const anterior = tipoFormatoCartera(guardado.data);
    if (anterior.declarado && anterior.tipo === datos.tipoFormato) {
      return { ok: true, message: `La versión ${version.version} ya es ${INFO_TIPO_FORMATO[datos.tipoFormato].etiqueta.toLowerCase()}.` };
    }
    if (anterior.declarado && !esVersionEditable(version)) {
      throw new ErrorPatron("Esta versión ya tiene su tipo declarado y no está pendiente: para cambiarlo crea una versión nueva a partir de ella.");
    }
    const spec = normalizarSpecModulo(descriptor, { ...guardado.data, tipoFormato: datos.tipoFormato });
    const error = validarSpecModulo(descriptor, spec);
    if (error) throw new ErrorPatron(error);
    const actualizada = await prisma.versionPatronArchivoModulo.updateMany({
      where: { id: datos.id, estado: version.estado, actualizadoEn: version.actualizadoEn },
      data: { specJson: spec as Prisma.InputJsonValue },
    });
    if (actualizada.count !== 1) throw new ErrorPatron("La versión cambió desde que la abriste. Recarga la página.");

    const nivelAntes = nivelCarteraDeSpec(guardado.data);
    const nivelAhora = nivelCarteraDeSpec(spec);
    const antes = anterior.declarado
      ? INFO_TIPO_FORMATO[anterior.tipo].etiqueta
      : `sin declarar (parecía ${INFO_TIPO_FORMATO[anterior.tipo].etiqueta.toLowerCase()})`;
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "DECLARÓ TIPO DE FORMATO DEL PATRÓN",
      entity: `${descriptor.label} · ${version.erp.name} v${version.version}`,
      detail: `${INFO_TIPO_FORMATO[datos.tipoFormato].etiqueta} · antes: ${antes} · versión ${version.estado}`
        + (nivelAntes !== nivelAhora ? ` · cada fila pasa de ${nivelAntes} a ${nivelAhora}` : ""),
    });
    revalidatePath(rutaPatrones(version.moduloCodigo));
    return { ok: true, message: `Versión ${version.version}: ${INFO_TIPO_FORMATO[datos.tipoFormato].etiqueta.toLowerCase()}.` };
  } catch (e) {
    return respuestaError("declararTipoFormatoVersion", e);
  }
}

const EstadoSchema = z.object({
  id: z.number().int().positive(),
  estado: z.enum(["aprobada", "inactiva"]),
});

/** Aprueba (exige muestra), desactiva o reactiva una versión. */
export async function cambiarEstadoVersionPatron(input: z.input<typeof EstadoSchema>): Promise<ActionState> {
  const permiso = await authorizePermiso(PERMISO);
  if (!permiso.ok) return { ok: false, message: permiso.message };
  const validacion = EstadoSchema.safeParse(input);
  if (!validacion.success) return { ok: false, message: "Datos inválidos." };
  try {
    const { id, estado } = validacion.data;
    const version = await prisma.versionPatronArchivoModulo.findUnique({ where: { id }, include: { erp: { select: { name: true } } } });
    if (!version) throw new ErrorPatron("La versión ya no existe.");
    if (!transicionPatronPermitida(version.estado, estado)) {
      throw new ErrorPatron(estado === "aprobada" ? "La versión ya está aprobada." : "La versión ya está inactiva.");
    }
    if (estado === "aprobada") {
      const motivo = motivoNoAprobable(version);
      if (motivo) throw new ErrorPatron(motivo);
      if (version.estado === "pendiente" && descriptorDe(version.moduloCodigo).crucePorTercero.detalleTercero) {
        const spec = SpecModuloSchema.safeParse(version.specJson);
        if (!spec.success || !spec.data.tipoFormato) throw new ErrorPatron(`${MENSAJE_TIPO_FORMATO} Edita la versión antes de aprobarla.`);
      }
    }
    const user = await getCurrentUser();
    const actualizada = await prisma.versionPatronArchivoModulo.updateMany({
      where: { id, estado: version.estado },
      data: estado === "aprobada"
        ? { estado, aprobadoPor: user?.name ?? null, aprobadoPorId: user?.id ?? null, aprobadoEn: new Date() }
        : { estado },
    });
    if (actualizada.count !== 1) throw new ErrorPatron("La versión cambió mientras se actualizaba. Recarga la página.");
    const accion = estado === "aprobada" ? (version.estado === "inactiva" ? "REACTIVÓ" : "APROBÓ") : "DESACTIVÓ";
    await logAudit({
      user: user?.name ?? "Sistema",
      action: `${accion} PATRÓN DE ARCHIVO`,
      entity: `${version.moduloCodigo} · ${version.erp.name} v${version.version}`,
      detail: `${version.estado} → ${estado}`,
    });
    revalidatePath(rutaPatrones(version.moduloCodigo));
    return { ok: true, message: estado === "aprobada" ? `Versión ${version.version} aprobada.` : `Versión ${version.version} desactivada.` };
  } catch (e) {
    return respuestaError("cambiarEstadoVersionPatron", e);
  }
}
