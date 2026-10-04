"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { authorizePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { registrarError } from "@/lib/errores";
import { transaccionSerializable, tomarCandadoTransaccion } from "@/lib/concurrency";
import { obtenerObjeto } from "@/lib/storage/objetos";
import { registrarConsumoIA } from "@/lib/ia/uso";
import { ingerir, type GridHoja } from "@/lib/balance/extraccion/ingesta";
import { calcularHuella } from "@/lib/balance/extraccion/huella";
import { descriptorModulo, bloqueoAnexoPorVerificacionesCriticasModulo } from "@/lib/modulos/descriptores";
import { huellaSha256Archivo } from "@/lib/modulos/archivo-original";
import { SpecModuloSchema } from "@/lib/modulos/extraccion/esquema";
import { transformarModulo, resultadoAReconciliacion } from "@/lib/modulos/extraccion/transformar";
import { vistaAnalisisHoja } from "@/lib/modulos/extraccion/vista-analisis";
import { aplicativoConfirmadoDeCarga, versionesPatronCandidatas } from "@/lib/modulos/patrones/servidor";
import { mejorVersion } from "@/lib/modulos/patrones/mejor-version";
import { aplicarPatronASpec } from "@/lib/modulos/patrones/aplicar";
import { resolverLecturaInventario, resolverLecturaPorEjemplo } from "@/lib/modulos/asistencia/resolver";
import { claveModelo, ModeloUsuarioSchema } from "@/lib/modulos/asistencia/modelo-usuario";
import { construirVentanaMuestra, type VentanaMuestra } from "@/lib/modulos/asistencia/ventana-muestra";
import { validarLecturaInventario } from "@/lib/modulos/asistencia/validar";
import type { ResultadoAsistenciaInventario } from "@/lib/modulos/asistencia/tipos";
import { compararLecturasInventario, conservarEdicionesInventario, intentoInventarioVigente, leerAsistenciaInventario, type AsistenciaInventarioGuardada } from "@/lib/modulos/asistencia-inventario-estado";

const INV = descriptorModulo("INV")!;
const COLUMNAS_NUMERICAS = INV.columnas.filter((c) => c.tipo === "numero" || c.tipo === "moneda").map((c) => c.nombre);
const ConsultaSchema = z.object({ recepcionLoteId: z.string().uuid() });
const EntradaSchema = ConsultaSchema.extend({
  revisionEsperada: z.number().int().nonnegative().optional(),
  erpId: z.number().int().positive().optional(),
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  hoja: z.string().trim().max(120).optional(),
  instrucciones: z.string().trim().max(4000).optional(),
  respuestas: z.record(z.string().max(100), z.string().max(1000)).optional(),
  specManual: SpecModuloSchema.optional(),
  /** Lectura por ejemplo: los productos armados sobre la grilla del original. */
  modelo: ModeloUsuarioSchema.optional(),
  aplicarPropuesta: z.boolean().optional(),
  descartarEdicionesIncompatibles: z.boolean().optional(),
  anexoEncabezadoId: z.number().int().positive().optional(),
});

const json = (valor: unknown) => JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue;
class ErrorAsistencia extends Error {}
const errorRespuesta = (message: string, revision?: number) => ({ ok: false as const, estado: "error_recuperable" as const, message, revision });

async function originalAutorizado(loteId: string) {
  const permiso = await authorizePermiso("modulos_datos:crear");
  if (!permiso.ok) throw new ErrorAsistencia(permiso.message ?? "No autorizado.");
  const original = await prisma.archivoOriginalModulo.findUnique({ where: { loteId } });
  if (!original || original.moduloCodigo !== "INV") throw new ErrorAsistencia("La recepción de inventarios no existe.");
  const alcance = await authorizePermiso("modulos_datos:crear", { clientId: original.clienteId });
  if (!alcance.ok) throw new ErrorAsistencia(alcance.message ?? "No autorizado para este cliente.");
  if (!["recibido", "no_procesable", "borrador"].includes(original.estado)) {
    throw new ErrorAsistencia("El archivo ya fue confirmado o descartado. Su lectura no se puede sustituir.");
  }
  return original;
}

async function hojasDelOriginal(original: Awaited<ReturnType<typeof originalAutorizado>>) {
  if (!original.disponible || !original.claveObjeto || !original.huellaSha256) throw new ErrorAsistencia("El original no está disponible. Puedes reintentar cuando se recupere el almacenamiento.");
  const objeto = await obtenerObjeto(original.claveObjeto);
  if (!objeto || objeto.cuerpo.byteLength !== original.tamanoBytes || huellaSha256Archivo(objeto.cuerpo) !== original.huellaSha256) {
    throw new ErrorAsistencia("El original no supera la verificación de integridad. No se modificó el borrador.");
  }
  const ingesta = await ingerir(objeto.cuerpo.slice().buffer as ArrayBuffer, original.nombreArchivo);
  if (ingesta.modo !== "tabular") throw new ErrorAsistencia("La asistencia de inventarios admite archivos tabulares Excel/CSV.");
  return ingesta.hojas;
}

function respuesta(asistencia: AsistenciaInventarioGuardada, revision: number, loteId: string, hojas?: GridHoja[]) {
  const resultado = asistencia.resultado;
  const spec = resultado?.spec ?? asistencia.aplicado?.spec;
  const hoja = hojas?.find((h) => h.nombre === spec?.hoja);
  return {
    ok: asistencia.estado !== "error_recuperable",
    estado: asistencia.estado,
    revision,
    loteId,
    periodo: asistencia.periodo,
    resumen: resultado?.resumen ?? asistencia.aplicado?.resumen ?? null,
    resumenAnterior: asistencia.aplicado?.resumen,
    preguntas: resultado?.preguntas ?? [],
    ejemplosLectura: resultado?.ejemplosLectura ?? [],
    ...(resultado?.modeloSugerido ? { modeloSugerido: resultado.modeloSugerido } : {}),
    ...(resultado?.filasSugeridas?.length ? { filasSugeridas: resultado.filasSugeridas } : {}),
    advertencias: [...(resultado?.advertencias ?? []), ...(resultado?.errores ?? [])],
    spec: spec ?? undefined,
    message: asistencia.error ?? (asistencia.estado === "analizando" ? "La lectura está en curso. Consulta su avance sin volver a subir el archivo." : undefined),
    ...(hoja && spec && hojas ? { analisis: { ok: true, spec, ...vistaAnalisisHoja(INV, hojas, hoja, spec, null) } } : {}),
  };
}

/** Consultar nunca invoca IA ni cambia la revisión. Sólo el editor abierto relee la muestra. */
export async function consultarAsistenciaInventario(entrada: z.input<typeof ConsultaSchema>) {
  const parsed = ConsultaSchema.safeParse(entrada);
  if (!parsed.success) return errorRespuesta("Recepción inválida.");
  try {
    const original = await originalAutorizado(parsed.data.recepcionLoteId);
    const guardada = leerAsistenciaInventario(original.asistenciaJson);
    if (!guardada) return errorRespuesta("Esta lectura todavía no tiene asistencia guardada.", original.revisionAsistencia);
    if (guardada.estado === "analizando" && !intentoInventarioVigente(guardada)) {
      return errorRespuesta("El intento anterior agotó su tiempo. Puedes reintentar conservando el original y el borrador.", original.revisionAsistencia);
    }
    const hojas = guardada.estado === "analizando" ? undefined : await hojasDelOriginal(original);
    if (guardada.estado === "propuesta_lista" && guardada.aplicado && guardada.resultado?.spec && hojas) {
      const hojaAnterior = hojas.find((h) => h.nombre === guardada.aplicado!.spec.hoja);
      const hojaNueva = hojas.find((h) => h.nombre === guardada.resultado!.spec!.hoja);
      if (hojaAnterior && hojaNueva) {
        const actuales = await prisma.moduloImportacionStaging.findMany({ where: { loteId: parsed.data.recepcionLoteId }, orderBy: { filaNum: "asc" } });
        return { ...respuesta(guardada, original.revisionAsistencia, parsed.data.recepcionLoteId, hojas),
          ...compararLecturasInventario(actuales, transformarModulo(INV, guardada.aplicado.spec, hojaAnterior).filas,
            transformarModulo(INV, guardada.resultado.spec, hojaNueva).filas, guardada.aplicado.resumen, guardada.resultado.resumen, COLUMNAS_NUMERICAS) };
      }
    }
    return respuesta(guardada, original.revisionAsistencia, parsed.data.recepcionLoteId, hojas);
  } catch (error) {
    if (!(error instanceof ErrorAsistencia)) registrarError("consultarAsistenciaInventario", error);
    return errorRespuesta(error instanceof ErrorAsistencia ? error.message : "No se pudo consultar la lectura. Puedes reintentar.");
  }
}

/** Descarta sólo la propuesta pendiente; conserva todas las filas y ajustes del borrador. */
export async function conservarLecturaInventario(entrada: { recepcionLoteId: string; revisionEsperada: number }) {
  const parsed = ConsultaSchema.extend({ revisionEsperada: z.number().int().nonnegative() }).safeParse(entrada);
  if (!parsed.success) return errorRespuesta("Recepción inválida.");
  try {
    const original = await originalAutorizado(parsed.data.recepcionLoteId);
    const guardada = leerAsistenciaInventario(original.asistenciaJson);
    if (!guardada?.aplicado || original.estado !== "borrador") throw new ErrorAsistencia("No hay una lectura aplicada para conservar.");
    if (original.revisionAsistencia !== parsed.data.revisionEsperada) throw new ErrorAsistencia("La lectura cambió. Consulta su avance antes de continuar.");
    if (intentoInventarioVigente(guardada)) return respuesta(guardada, original.revisionAsistencia, parsed.data.recepcionLoteId);
    if (guardada.estado === "borrador_preparado") return respuesta(guardada, original.revisionAsistencia, parsed.data.recepcionLoteId);
    const aplicada = guardada.aplicado;
    const revision = original.revisionAsistencia + 1;
    const restaurada: AsistenciaInventarioGuardada = {
      ...guardada, estado: "borrador_preparado", operacionId: randomUUID(), venceEn: new Date().toISOString(), error: undefined,
      instrucciones: "", respuestas: {}, encabezado: aplicada.encabezado, versionBaseId: aplicada.versionBaseId,
      aplicado: { ...aplicada, revision },
      resultado: { spec: aplicada.spec, resumen: aplicada.resumen, origen: aplicada.origen, preguntas: [], advertencias: [], errores: [], usos: [], estructuraValida: true, listoParaBorrador: true },
    };
    await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, `modulo-borrador:${parsed.data.recepcionLoteId}`);
      const lote = await tx.moduloImportacionLote.findUnique({ where: { loteId: parsed.data.recepcionLoteId } });
      if (!lote || lote.clienteId !== original.clienteId || lote.moduloCodigo !== "INV"
        || (lote.specJson as Record<string, unknown> | null)?.asistenciaRevision !== aplicada.revision) throw new ErrorAsistencia("El borrador cambió. Vuelve a consultar su lectura.");
      restaurada.periodo = lote.periodoFinal?.toISOString().slice(0, 7) ?? guardada.periodo;
      const actualizado = await tx.archivoOriginalModulo.updateMany({
        where: { id: original.id, revisionAsistencia: parsed.data.revisionEsperada, estado: "borrador" },
        data: { revisionAsistencia: revision, asistenciaJson: json(restaurada), periodo: restaurada.periodo },
      });
      if (actualizado.count !== 1) throw new ErrorAsistencia("Otra operación cambió la lectura. No se modificó el borrador.");
      await tx.moduloImportacionLote.update({ where: { id: lote.id }, data: { specJson: json({ ...(lote.specJson as Record<string, unknown>), asistenciaRevision: revision }) } });
    });
    revalidar(parsed.data.recepcionLoteId);
    return respuesta(restaurada, revision, parsed.data.recepcionLoteId);
  } catch (error) {
    if (!(error instanceof ErrorAsistencia)) registrarError("conservarLecturaInventario", error);
    return errorRespuesta(error instanceof ErrorAsistencia ? error.message : "No se pudo conservar la lectura. Consulta el borrador e inténtalo nuevamente.");
  }
}

/** Un original, una revisión vigente y un staging. La IA se ejecuta fuera de cualquier transacción. */
export async function prepararBorradorInventario(entrada: z.input<typeof EntradaSchema>) {
  const parsed = EntradaSchema.safeParse(entrada);
  if (!parsed.success) return errorRespuesta("Revisa el período, las respuestas y la estructura de lectura.");
  const datos = parsed.data;
  let revision: number | undefined;
  let asistencia: AsistenciaInventarioGuardada | null = null;
  let aplicadoAnterior: AsistenciaInventarioGuardada["aplicado"] = null;
  let borradorPersistido = false;
  try {
    const original = await originalAutorizado(datos.recepcionLoteId);
    const anterior = leerAsistenciaInventario(original.asistenciaJson);
    aplicadoAnterior = anterior?.aplicado ?? null;
    if (intentoInventarioVigente(anterior)) return respuesta(anterior!, original.revisionAsistencia, datos.recepcionLoteId);
    if (datos.revisionEsperada == null && anterior && !datos.instrucciones && !datos.respuestas && !datos.specManual && !datos.modelo && !datos.aplicarPropuesta) {
      if (anterior.estado !== "analizando" && anterior.estado !== "error_recuperable") return respuesta(anterior, original.revisionAsistencia, datos.recepcionLoteId);
    }
    if (datos.revisionEsperada != null && datos.revisionEsperada !== original.revisionAsistencia) {
      return errorRespuesta("La lectura cambió en otra operación. Consulta el avance antes de continuar.", original.revisionAsistencia);
    }
    const erpId = anterior?.erpId ?? datos.erpId;
    const aplicativo = await aplicativoConfirmadoDeCarga(original.clienteId, "INV", erpId);
    if (!aplicativo.ok) throw new ErrorAsistencia(aplicativo.message);
    if (aplicativo.aplicativo.manual) throw new ErrorAsistencia("Los archivos manuales conservan su editor y memoria de carga.");
    if (original.softwareOrigen !== aplicativo.aplicativo.name || (datos.erpId != null && datos.erpId !== aplicativo.aplicativo.id)) {
      throw new ErrorAsistencia("El aplicativo no corresponde al archivo recibido. Vuelve a analizarlo con el aplicativo correcto.");
    }
    if (datos.aplicarPropuesta && (anterior?.estado !== "propuesta_lista" || !anterior.resultado?.listoParaBorrador)) {
      throw new ErrorAsistencia("Primero prepara y revisa una propuesta de lectura válida.");
    }
    const user = await getCurrentUser();
    const lote = await prisma.moduloImportacionLote.findUnique({ where: { loteId: datos.recepcionLoteId } });
    if (lote && (lote.clienteId !== original.clienteId || lote.moduloCodigo !== "INV")) throw new ErrorAsistencia("El borrador no corresponde a esta recepción.");
    const periodo = lote?.periodoFinal ? lote.periodoFinal.toISOString().slice(0, 7) : datos.periodo;
    const anexoId = lote?.anexoEncabezadoId ?? anterior?.anexoEncabezadoId ?? datos.anexoEncabezadoId ?? null;
    if (anexoId != null) {
      const destino = await prisma.moduloDatoEncabezado.findUnique({ where: { id: anexoId } });
      if (!destino || destino.clienteId !== original.clienteId || destino.moduloCodigo !== "INV" || !destino.esOficial || destino.estaCongelado) throw new ErrorAsistencia("El cargue de destino ya no admite este archivo adicional.");
      const bloqueo = bloqueoAnexoPorVerificacionesCriticasModulo(INV, destino.verificaciones as Record<string, { respuesta: "si" | "no" | "na" } | undefined>);
      if (bloqueo) throw new ErrorAsistencia(bloqueo);
      if (destino.periodo !== periodo) throw new ErrorAsistencia("El archivo adicional debe corresponder al período del cargue de destino.");
    }
    revision = original.revisionAsistencia + 1;
    asistencia = {
      version: 1, estado: "analizando", operacionId: randomUUID(), venceEn: new Date(Date.now() + 30 * 60_000).toISOString(),
      erpId: aplicativo.aplicativo.id, periodo, anexoEncabezadoId: anexoId,
      instrucciones: datos.instrucciones ?? anterior?.instrucciones ?? "",
      // Un ejemplo nuevo, como un mapa manual, retira las decisiones estructurales anteriores
      // (la regla deducida se vuelve a confirmar); su hoja manda.
      respuestas: datos.aplicarPropuesta ? anterior!.respuestas : datos.specManual ? {} : datos.modelo ? { hoja: datos.modelo.hoja } : {
        ...(datos.instrucciones?.trim() ? {} : anterior?.respuestas), ...datos.respuestas, ...(datos.hoja ? { hoja: datos.hoja } : {}),
      },
      ...(anterior?.huellaModelo ? { huellaModelo: anterior.huellaModelo } : {}),
      resultado: anterior?.resultado ?? null, aplicado: anterior?.aplicado ?? null,
      versionBaseId: anterior?.versionBaseId ?? null, encabezado: anterior?.encabezado ?? [],
    };
    const reservado = await prisma.archivoOriginalModulo.updateMany({
      where: { id: original.id, revisionAsistencia: original.revisionAsistencia, estado: original.estado },
      data: { revisionAsistencia: revision, asistenciaJson: json(asistencia) },
    });
    if (reservado.count !== 1) return errorRespuesta("Otra operación inició la lectura. Consulta su avance.", original.revisionAsistencia);
    const hojas = await hojasDelOriginal(original);
    let resultado: ResultadoAsistenciaInventario;
    let coincidencia: number | null = null;
    if (datos.aplicarPropuesta) {
      resultado = validarLecturaInventario({ hojas, spec: anterior!.resultado!.spec!, respuestas: asistencia.respuestas, origen: anterior!.resultado!.origen });
    } else if (datos.specManual) {
      resultado = validarLecturaInventario({ hojas, spec: datos.specManual, respuestas: asistencia.respuestas, origen: "manual" });
    } else if (datos.modelo) {
      const huella = createHash("sha256").update(claveModelo(datos.modelo)).digest("hex").slice(0, 32);
      const porEjemplo = await resolverLecturaPorEjemplo({
        hojas, modelo: datos.modelo, nombreArchivo: original.nombreArchivo, aplicativo: aplicativo.aplicativo.name,
        respuestas: asistencia.respuestas, respuestasNuevas: {}, preguntasPendientes: anterior?.resultado?.preguntas,
        instrucciones: asistencia.instrucciones || undefined, specPrevio: anterior?.resultado?.spec ?? anterior?.aplicado?.spec,
        // El mismo ejemplo que ya se consultó no vuelve a gastar IA, salvo que el proveedor falló.
        repetido: huella === anterior?.huellaModelo && anterior?.resultado?.errorProveedorIA !== true,
      });
      asistencia.huellaModelo = huella;
      if (porEjemplo) {
        resultado = porEjemplo;
        await registrarConsumoIA(resultado.usos, { modulo: "INV", clienteId: original.clienteId, usuarioId: user?.id, usuarioNombre: user?.name, archivoNombre: original.nombreArchivo });
      } else if (anterior?.resultado) resultado = { ...anterior.resultado, usos: [] };
      else throw new ErrorAsistencia("No hay una lectura anterior con la cual comparar este ejemplo. Vuelve a reprocesar.");
    } else {
      let base = anterior?.resultado?.spec ?? null;
      if (!base) {
        const { versiones } = await versionesPatronCandidatas(INV, aplicativo.aplicativo.id, original.clienteId);
        const ubicacion = mejorVersion(INV, hojas, versiones, { hojaElegida: asistencia.respuestas.hoja || null });
        const hojaPatron = hojas.find((h) => h.nombre === ubicacion?.hoja);
        if (ubicacion?.coincidencia.elegible && hojaPatron) {
          base = aplicarPatronASpec(INV, ubicacion, hojaPatron).spec;
          asistencia.versionBaseId = ubicacion.version.id;
          coincidencia = ubicacion.coincidencia.porcentaje;
        } else asistencia.versionBaseId = null;
      } else coincidencia = lote?.patronCoincidencia ?? null;
      const reintentarProveedor = anterior?.resultado?.errorProveedorIA === true;
      resultado = await resolverLecturaInventario({
        hojas, specBase: base, origenBase: anterior?.resultado?.spec ? anterior.resultado.origen : "patron",
        preguntasPendientes: anterior?.resultado?.preguntas,
        respuestasNuevas: Object.fromEntries(Object.entries(datos.respuestas ?? {}).filter(([clave, valor]) => valor !== anterior?.respuestas?.[clave])),
        instrucciones: datos.instrucciones?.trim() || (reintentarProveedor ? asistencia.instrucciones : ""), respuestas: asistencia.respuestas,
        forzarIA: Boolean(datos.instrucciones?.trim()) || reintentarProveedor, nombreArchivo: original.nombreArchivo, aplicativo: aplicativo.aplicativo.name,
      });
      await registrarConsumoIA(resultado.usos, { modulo: "INV", clienteId: original.clienteId, usuarioId: user?.id, usuarioNombre: user?.name, archivoNombre: original.nombreArchivo });
    }
    asistencia.resultado = resultado;
    const hoja = hojas.find((h) => h.nombre === resultado.spec?.hoja);
    asistencia.encabezado = hoja && resultado.spec ? [...(hoja.filas[resultado.spec.filaEncabezado - 1] ?? [])] : [];
    const transformado = resultado.listoParaBorrador && resultado.spec && hoja ? transformarModulo(INV, resultado.spec, hoja) : null;
    if (transformado?.erroresLectura?.length) {
      resultado.errores = [...new Set([...resultado.errores, ...transformado.erroresLectura])];
      resultado.estructuraValida = false;
      resultado.listoParaBorrador = false;
    }
    if (!resultado.listoParaBorrador || !resultado.spec || !hoja || !transformado) {
      asistencia.estado = resultado.preguntas.length ? "requiere_respuesta" : "error_recuperable";
      asistencia.error = resultado.errores.join(" ") || (resultado.preguntas.length ? undefined : "La lectura necesita una indicación o un ajuste de columnas.");
      await guardarResultado(original.id, revision, asistencia);
      return respuesta(asistencia, revision, datos.recepcionLoteId, hojas);
    }
    const actuales = lote ? await prisma.moduloImportacionStaging.findMany({ where: { loteId: datos.recepcionLoteId }, orderBy: { filaNum: "asc" } }) : [];
    const specAnterior = asistencia.aplicado?.spec ?? (lote?.specJson ? SpecModuloSchema.parse(lote.specJson) : null);
    const hojaAnterior = hojas.find((h) => h.nombre === specAnterior?.hoja);
    const lecturaAnterior = specAnterior && hojaAnterior ? transformarModulo(INV, specAnterior, hojaAnterior).filas : [];
    const ediciones = conservarEdicionesInventario(actuales, lecturaAnterior, transformado.filas, hojaAnterior?.nombre ?? "", hoja.nombre);
    const comparacion = asistencia.aplicado ? compararLecturasInventario(actuales, lecturaAnterior, transformado.filas,
      asistencia.aplicado.resumen, resultado.resumen, COLUMNAS_NUMERICAS) : {};
    if (lote && !datos.aplicarPropuesta) {
      asistencia.estado = "propuesta_lista";
      await guardarResultado(original.id, revision, asistencia);
      return { ...respuesta(asistencia, revision, datos.recepcionLoteId, hojas), ...comparacion };
    }
    if (ediciones.incompatibles.length && !datos.descartarEdicionesIncompatibles) {
      asistencia.estado = "propuesta_lista";
      await guardarResultado(original.id, revision, asistencia);
      return { ...respuesta(asistencia, revision, datos.recepcionLoteId, hojas), ...comparacion, hayEdicionesIncompatibles: true, message: `Hay ajustes manuales en ${ediciones.incompatibles.length} filas que no corresponden a la nueva lectura. Confirma su descarte para aplicar.` };
    }
    const [ano, mes] = periodo.split("-").map(Number);
    const specConEvidencia = { ...resultado.spec, ...(resultadoAReconciliacion(transformado) ? { reconciliacion: resultadoAReconciliacion(transformado) } : {}), asistenciaRevision: revision };
    asistencia.estado = "borrador_preparado";
    asistencia.aplicado = { spec: resultado.spec, resumen: resultado.resumen, revision, origen: resultado.origen, encabezado: asistencia.encabezado, versionBaseId: asistencia.versionBaseId };
    await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, `modulo-borrador:${datos.recepcionLoteId}`);
      const vigente = await tx.archivoOriginalModulo.findUnique({ where: { id: original.id } });
      if (!vigente || vigente.revisionAsistencia !== revision || !["recibido", "no_procesable", "borrador"].includes(vigente.estado)) throw new ErrorAsistencia("La recepción cambió mientras se preparaba el borrador.");
      const loteActual = await tx.moduloImportacionLote.findUnique({ where: { loteId: datos.recepcionLoteId } });
      if ((loteActual?.actualizadoEn.getTime() ?? null) !== (lote?.actualizadoEn.getTime() ?? null)) throw new ErrorAsistencia("El borrador recibió cambios mientras se preparaba la lectura. Revisa y vuelve a aplicar.");
      const filasActuales = await tx.moduloImportacionStaging.findMany({ where: { loteId: datos.recepcionLoteId }, orderBy: { filaNum: "asc" } });
      if (JSON.stringify(filasActuales) !== JSON.stringify(actuales)) throw new ErrorAsistencia("Se editaron filas mientras se aplicaba la lectura. Los ajustes se conservaron; revisa la propuesta nuevamente.");
      await tx.moduloImportacionStaging.deleteMany({ where: { loteId: datos.recepcionLoteId } });
      for (let i = 0; i < transformado.filas.length; i += 2000) {
        await tx.moduloImportacionStaging.createMany({ data: transformado.filas.slice(i, i + 2000).map((fila) => {
          const cambio = ediciones.cambios.get(fila.filaNum);
          return {
            loteId: datos.recepcionLoteId, moduloCodigo: "INV", clienteId: original.clienteId, hoja: hoja.nombre, filaNum: fila.filaNum,
            clasificador: cambio && "clasificador" in cambio ? cambio.clasificador : fila.clasificador,
            valor: cambio?.valor != null ? Number(cambio.valor) : fila.valor,
            datos: json({ ...fila.datos, ...(cambio?.datos as Record<string, unknown> | undefined) }), tipoFila: cambio?.tipoFilaForzado ?? fila.tipoFila,
            tipoFilaForzado: cambio?.tipoFilaForzado ?? null, padreManual: cambio?.padreManual ?? null,
            omitida: cambio && "omitida" in cambio ? cambio.omitida : fila.omitida ?? null, motivoTipoFila: fila.motivo ?? null,
          };
        }) });
      }
      const campos = {
        specJson: json(specConEvidencia), origenExtraccion: resultado.origen,
        huella: calcularHuella(hoja.nombre, hoja.filas[resultado.spec!.filaEncabezado - 1] ?? []), filasLeidas: transformado.filasLeidas, filasExcluidas: transformado.filasExcluidas,
        patronVersionId: resultado.origen === "patron" ? asistencia!.versionBaseId : null,
        patronCoincidencia: resultado.origen === "patron" ? coincidencia : null,
      };
      if (loteActual) await tx.moduloImportacionLote.update({ where: { id: loteActual.id }, data: campos });
      else await tx.moduloImportacionLote.create({ data: {
        ...campos, loteId: datos.recepcionLoteId, moduloCodigo: "INV", clienteId: original.clienteId, archivoNombre: original.nombreArchivo,
        archivoTam: `${Math.ceil((original.tamanoBytes ?? 0) / 1024)} KB`, periodoInicial: new Date(Date.UTC(ano, mes - 1, 1)), periodoFinal: new Date(Date.UTC(ano, mes, 0)),
        anexoEncabezadoId: anexoId, cargadoPor: user?.name ?? null, cargadoPorId: user?.id ?? null,
      } });
      const guardado = await tx.archivoOriginalModulo.updateMany({ where: { id: original.id, revisionAsistencia: revision }, data: { estado: "borrador", periodo, esAnexo: anexoId != null, asistenciaJson: json(asistencia) } });
      if (guardado.count !== 1) throw new ErrorAsistencia("Otra lectura se adelantó. No se sustituyó el borrador.");
      if (!loteActual && campos.patronVersionId) await tx.versionPatronArchivoModulo.updateMany({ where: { id: campos.patronVersionId }, data: { vecesUsado: { increment: 1 }, ultimoUsoEn: new Date() } });
    }, { timeoutMs: 120_000 });
    borradorPersistido = true;
    await logAudit({ user: user?.name ?? "Sistema", action: lote ? "CORRIGIÓ LECTURA DE INVENTARIOS" : "PREPARÓ BORRADOR DE INVENTARIOS", entity: original.nombreCliente,
      detail: `${original.nombreArchivo} · ${resultado.origen} · ${resultado.resumen.filasIncluidas} ítems · revisión ${revision} · ${ediciones.conservables.length} ajustes conservados · ${datos.descartarEdicionesIncompatibles ? ediciones.incompatibles.length : 0} ajustes incompatibles descartados`, clientId: original.clienteId }).catch((e) => registrarError("prepararBorradorInventario.auditoria", e));
    revalidar(datos.recepcionLoteId);
    return { ...respuesta(asistencia, revision, datos.recepcionLoteId, hojas), edicionesManuales: ediciones.conservables.length };
  } catch (error) {
    if (!(error instanceof ErrorAsistencia)) registrarError("prepararBorradorInventario", error);
    const mensaje = error instanceof ErrorAsistencia ? error.message : "No se pudo completar la lectura. El original y el último borrador se conservaron; puedes reintentar.";
    if (revision != null && asistencia) {
      if (borradorPersistido) return respuesta(asistencia, revision, datos.recepcionLoteId);
      if (!borradorPersistido) asistencia.aplicado = aplicadoAnterior;
      asistencia.estado = "error_recuperable";
      asistencia.error = mensaje;
      await prisma.archivoOriginalModulo.updateMany({ where: { loteId: datos.recepcionLoteId, revisionAsistencia: revision, estado: { in: ["recibido", "no_procesable", "borrador"] } }, data: { asistenciaJson: json(asistencia) } }).catch((e) => registrarError("prepararBorradorInventario.guardarError", e));
      revalidar(datos.recepcionLoteId);
    }
    return errorRespuesta(mensaje, revision);
  }
}

const VentanaSchema = ConsultaSchema.extend({
  hoja: z.string().trim().max(120).optional(),
  filaDesde: z.number().int().min(1).max(1_048_576).optional(),
  spec: SpecModuloSchema.nullish(),
});

/**
 * Un tramo de la grilla del ORIGINAL conservado para armar productos de ejemplo, con lo que la
 * lectura en curso reconoce en ese tramo. Mismo permiso y alcance que la asistencia; solo lectura.
 */
export async function ventanaOriginalInventario(entrada: z.input<typeof VentanaSchema>): Promise<{ ok: true; ventana: VentanaMuestra } | { ok: false; message: string }> {
  const parsed = VentanaSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, message: "Consulta inválida." };
  try {
    const original = await originalAutorizado(parsed.data.recepcionLoteId);
    const hojas = await hojasDelOriginal(original);
    const ventana = construirVentanaMuestra(hojas, { hoja: parsed.data.hoja, filaDesde: parsed.data.filaDesde, spec: parsed.data.spec ?? null });
    if (!ventana) throw new ErrorAsistencia("El original no tiene hojas legibles.");
    return { ok: true, ventana };
  } catch (error) {
    if (!(error instanceof ErrorAsistencia)) registrarError("ventanaOriginalInventario", error);
    return { ok: false, message: error instanceof ErrorAsistencia ? error.message : "No se pudo mostrar el original. Puedes reintentar." };
  }
}

async function guardarResultado(id: number, revision: number, asistencia: AsistenciaInventarioGuardada) {
  const guardado = await prisma.archivoOriginalModulo.updateMany({ where: { id, revisionAsistencia: revision, estado: { in: ["recibido", "no_procesable", "borrador"] } }, data: { asistenciaJson: json(asistencia) } });
  if (guardado.count !== 1) throw new ErrorAsistencia("La lectura cambió en otra operación. Consulta su avance.");
  revalidatePath("/modulos/inv");
  revalidatePath("/modulos/inv/borradores");
}

function revalidar(loteId: string) {
  revalidatePath("/modulos/inv");
  revalidatePath("/modulos/inv/borradores");
  revalidatePath(`/modulos/inv/borradores/${loteId}`);
  revalidatePath("/modulos/inv/patrones");
}
