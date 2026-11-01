"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { iaDisponible } from "@/lib/anthropic";
import { registrarConsumoIA } from "@/lib/ia/uso";
import { almacenamientoDisponible, subirObjeto } from "@/lib/storage/objetos";
import { fechaCalendarioPrisma } from "@/lib/fecha-hora";
import { ConfirmarFormularioDianSchema, PeriodoSinFormularioSchema, RevisionRetencionSchema, type ActionState } from "@/lib/definitions";
import { validarPeriodicidad } from "@/lib/impuestos/periodicidad";
import { NOMBRES_MES } from "@/lib/impuestos/calendario";
import { controlesLectura, lecturaConErrores, normalizarLectura, renglonesCorregidos, type LecturaCruda, type LecturaFormulario } from "@/lib/impuestos/retencion/lectura";
import { leerFormularioDianConIA } from "@/lib/impuestos/retencion/lectura-servidor";
import { claveObjetoFormulario, MAX_BYTES_FORMULARIO, type ResultadoImportacion, type ResultadoRevision } from "@/lib/impuestos/retencion/tipos";

// Impuestos · Retención en la fuente (Fase 2: cargue de formularios). Cargar, confirmar y registrar
// causales: `impuestos:cargar` + alcance de ESCRITURA sobre el cliente (staff o senior asignado);
// corregir importes leídos: además `impuestos:editar`; descartar un formulario ya confirmado o una
// revisión: `impuestos:eliminar`. Nada de esto se permite con la revisión en firme.
const RUTA = "/impuestos/retencion";

const primerError = (issues: { message: string }[]) => issues[0]?.message ?? "Datos inválidos.";
const etiquetaPeriodo = (p: number) => NOMBRES_MES[p - 1] ?? `Período ${p}`;

async function revisionConAlcance(revisionId: number, permiso: string) {
  const revision = await prisma.revisionRetencion.findUnique({ where: { id: revisionId } });
  if (!revision) return { ok: false as const, message: "La revisión no existe." };
  const authz = await authorizePermiso(permiso, { clientId: revision.clienteId, modo: "escritura" });
  if (!authz.ok) return { ok: false as const, message: authz.message };
  if (revision.estado === "en_firme") return { ok: false as const, message: "La revisión está en firme: no se puede cambiar." };
  return { ok: true as const, revision };
}

/** «Nueva revisión»: cliente, año, corte y periodicidad. Si ya existe, devuelve la existente. */
export async function crearRevisionRetencion(_prev: ResultadoRevision, formData: FormData): Promise<ResultadoRevision> {
  const parsed = RevisionRetencionSchema.safeParse({
    clienteId: formData.get("clienteId"),
    anio: formData.get("anio"),
    mesCorte: formData.get("mesCorte"),
    periodicidad: formData.get("periodicidad"),
  });
  if (!parsed.success) return { ok: false, message: primerError(parsed.error.issues) };
  const { clienteId, anio, mesCorte } = parsed.data;
  const authz = await authorizePermiso("impuestos:cargar", { clientId: clienteId, modo: "escritura" });
  if (!authz.ok) return { ok: false, message: authz.message };
  const periodicidad = validarPeriodicidad("RETEFUENTE", parsed.data.periodicidad);
  if (!periodicidad.ok || !periodicidad.periodicidad) return { ok: false, message: "Elige una periodicidad válida." };

  try {
    const cliente = await prisma.client.findUnique({ where: { id: clienteId }, select: { name: true, nit: true, code: true } });
    if (!cliente) return { ok: false, message: "El cliente no existe." };
    const existente = await prisma.revisionRetencion.findUnique({ where: { clienteId_anio_mesCorte: { clienteId, anio, mesCorte } }, select: { id: true } });
    if (existente) return { ok: true, id: existente.id, message: "La revisión ya existía." };

    const user = await getCurrentUser();
    const revision = await prisma.revisionRetencion.create({
      data: {
        clienteId,
        nombreCliente: cliente.name,
        nitCliente: cliente.nit,
        anio,
        mesCorte,
        periodo: `${anio}-${String(mesCorte).padStart(2, "0")}`,
        periodicidad: periodicidad.periodicidad,
        creadoPor: user?.name ?? null,
        creadoPorId: user?.id ?? null,
      },
    });
    // La periodicidad confirmada queda también en la ficha del cliente, si quien crea puede editarla.
    const formulario = await prisma.dianForm.findUnique({ where: { key: "RETEFUENTE" }, select: { id: true } });
    const puedeFicha = (await authorizePermiso("clientes:editar", { clientId: clienteId, modo: "lectura" })).ok;
    if (formulario && puedeFicha) {
      await prisma.clientDianForm.updateMany({ where: { clientId: clienteId, formId: formulario.id }, data: { periodicidad: periodicidad.periodicidad } });
    }
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CREÓ REVISIÓN DE RETENCIÓN",
      entity: `Retención en la fuente · ${cliente.name} · ${anio} corte ${etiquetaPeriodo(mesCorte)}`,
      detail: `Periodicidad ${periodicidad.periodicidad}`,
      clientId: clienteId,
    });
    revalidatePath(RUTA);
    return { ok: true, id: revision.id, message: "Revisión creada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("crearRevisionRetencion", e) };
  }
}

/** Datos de la lectura que van a las columnas del formulario. */
function columnasLectura(l: LecturaFormulario) {
  return {
    codigoCorreccion: l.codigoCorreccion,
    numeroAnterior: l.numeroAnterior,
    concepto: l.concepto,
    numeroPagado: l.numeroPagado,
    cuota: l.cuota,
    deCuotas: l.deCuotas,
    fechaLimitePago: l.fechaLimitePago ? fechaCalendarioPrisma(l.fechaLimitePago) : null,
    fechaSello: l.fechaSello ? fechaCalendarioPrisma(l.fechaSello) : null,
    autoadhesivo: l.autoadhesivo,
    nitLeido: l.nit,
    dvLeido: l.dv,
    razonSocial: l.razonSocial,
    anexoExterior: l.exterior.length ? (l.exterior as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
  };
}

const filasRenglones = (valores: Record<number, number>) => Object.entries(valores).map(([renglon, valor]) => ({ renglon: Number(renglon), valor }));

/**
 * Importa UN PDF (la pantalla manda los archivos de a uno): guarda el original, lo lee con IA,
 * lo controla y lo deja «por confirmar». Rechaza (sin guardar) un formulario de otro cliente u
 * otro año, uno ya cargado o uno al que no se le pudo leer el número o el período.
 */
export async function importarFormularioDian(formData: FormData): Promise<ResultadoImportacion> {
  const revisionId = Number(formData.get("revisionId"));
  if (!Number.isSafeInteger(revisionId) || revisionId <= 0) return { ok: false, message: "Revisión inválida." };
  const acceso = await revisionConAlcance(revisionId, "impuestos:cargar");
  if (!acceso.ok) return { ok: false, message: acceso.message };
  const { revision } = acceso;
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, message: "Elige un PDF." };
  if (archivo.size > MAX_BYTES_FORMULARIO) return { ok: false, message: `${archivo.name}: supera 10 MB.` };
  const bytes = Buffer.from(await archivo.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return { ok: false, message: `${archivo.name}: no es un PDF.` };
  const huella = createHash("sha256").update(bytes).digest("hex");

  try {
    const repetido = await prisma.formularioDianCargado.findFirst({
      where: { clienteId: revision.clienteId, huellaSha256: huella, estado: { not: "descartado" } },
      select: { numero: true, estado: true },
    });
    if (repetido) return { ok: false, message: `${archivo.name}: ya está cargado (formulario ${repetido.numero}).` };
    if (!(await iaDisponible())) return { ok: false, message: "La lectura con IA no está disponible. Revisa la conexión de Anthropic." };

    const user = await getCurrentUser();
    const ctx = { nitCliente: revision.nitCliente, anio: revision.anio, mesCorte: revision.mesCorte };
    const leida = await leerFormularioDianConIA(bytes.toString("base64"), ctx);
    await registrarConsumoIA(leida.usos, {
      clienteId: revision.clienteId,
      usuarioId: user?.id ?? null,
      usuarioNombre: user?.name ?? null,
      archivoNombre: archivo.name,
      modulo: "impuestos",
    });
    const { lectura, controles } = leida;
    const fallo = (clave: string) => controles.find((c) => c.clave === clave && !c.ok);
    for (const clave of ["formulario", "numero", "nit", "anio", "periodo"]) {
      const c = fallo(clave);
      if (c) return { ok: false, message: `${archivo.name}: ${c.mensaje}` };
    }
    const numero = lectura.numero as string;
    const existente = await prisma.formularioDianCargado.findUnique({ where: { numero }, select: { id: true, estado: true, clienteId: true } });
    if (existente && existente.estado !== "descartado") {
      return { ok: false, message: `${archivo.name}: el formulario ${numero} ya está cargado${existente.estado === "por_confirmar" ? " y espera confirmación" : ""}.` };
    }
    if (existente && existente.clienteId !== revision.clienteId) return { ok: false, message: `${archivo.name}: el formulario ${numero} pertenece a otro cliente.` };

    let claveObjeto: string | null = null;
    if (almacenamientoDisponible()) {
      claveObjeto = claveObjetoFormulario(revision.clienteId, revision.anio, huella);
      await subirObjeto({ key: claveObjeto, cuerpo: bytes, contentType: "application/pdf" });
    }
    const datos = {
      clienteId: revision.clienteId,
      anio: lectura.anio as number,
      periodo: lectura.periodo as number,
      formulario: lectura.formulario as string,
      estado: "por_confirmar",
      ...columnasLectura(lectura),
      nombreArchivo: archivo.name,
      claveObjeto,
      huellaSha256: huella,
      tamanoBytes: archivo.size,
      lecturaJson: leida.cruda as unknown as Prisma.InputJsonValue,
      modeloLectura: leida.modelo,
      controlesJson: controles as unknown as Prisma.InputJsonValue,
      corregidoAMano: Prisma.JsonNull,
      cargadoPor: user?.name ?? null,
      cargadoPorId: user?.id ?? null,
      confirmadoPor: null,
      confirmadoPorId: null,
      confirmadoEn: null,
      descartadoPor: null,
      descartadoEn: null,
    };
    const formulario = await prisma.$transaction(async (tx) => {
      if (existente) {
        await tx.renglonFormularioDian.deleteMany({ where: { formularioId: existente.id } });
        return tx.formularioDianCargado.update({ where: { id: existente.id }, data: { ...datos, renglones: { create: filasRenglones(lectura.valores) } } });
      }
      return tx.formularioDianCargado.create({ data: { numero, ...datos, renglones: { create: filasRenglones(lectura.valores) } } });
    });
    const pendientes = controles.filter((c) => c.bloquea && !c.ok).length;
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "IMPORTÓ FORMULARIO DIAN",
      entity: `Retención en la fuente · ${revision.nombreCliente} · F${lectura.formulario} ${numero}`,
      detail: `${etiquetaPeriodo(lectura.periodo as number)} ${lectura.anio} · ${archivo.name} · leído con ${leida.modelo}${pendientes ? ` · ${pendientes} control(es) por corregir` : ""}${claveObjeto ? "" : " · sin original (almacén no disponible)"}`,
      clientId: revision.clienteId,
    });
    revalidatePath(`${RUTA}/${revision.id}`);
    return {
      ok: true,
      message: `${archivo.name}: formulario ${lectura.formulario} de ${etiquetaPeriodo(lectura.periodo as number)}${pendientes ? `, con ${pendientes} control(es) por corregir` : ""}. Revísalo y confírmalo.`,
      formularioId: formulario.id,
      formulario: lectura.formulario as string,
      numero,
      periodo: lectura.periodo as number,
      pendientes,
    };
  } catch (e) {
    return { ok: false, message: `${archivo.name}: ${mensajeErrorBD("importarFormularioDian", e)}` };
  }
}

/** Confirma un formulario leído, con lo que el usuario haya corregido. Solo si todos los controles que bloquean pasan. */
export async function confirmarFormularioDian(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ConfirmarFormularioDianSchema.safeParse({
    id: formData.get("id"),
    revisionId: formData.get("revisionId"),
    fechaSello: formData.get("fechaSello") ?? "",
    codigoCorreccion: formData.get("codigoCorreccion") ?? "",
    numeroAnterior: formData.get("numeroAnterior") ?? "",
    concepto: formData.get("concepto") ?? "",
    numeroPagado: formData.get("numeroPagado") ?? "",
    valores: formData.get("valores"),
  });
  if (!parsed.success) return { ok: false, message: primerError(parsed.error.issues) };
  const p = parsed.data;
  const acceso = await revisionConAlcance(p.revisionId, "impuestos:cargar");
  if (!acceso.ok) return { ok: false, message: acceso.message };
  const { revision } = acceso;

  try {
    const fila = await prisma.formularioDianCargado.findUnique({ where: { id: p.id } });
    if (!fila || fila.clienteId !== revision.clienteId || fila.anio !== revision.anio) return { ok: false, message: "El formulario no es de esta revisión." };
    if (fila.estado === "descartado") return { ok: false, message: "El formulario fue descartado." };

    const leido = normalizarLectura(fila.lecturaJson as unknown as LecturaCruda);
    const valores = Object.fromEntries(Object.entries(p.valores).map(([r, v]) => [Number(r), v]));
    const corregidos = renglonesCorregidos(leido.valores, valores);
    if (corregidos.length > 0) {
      const editar = await authorizePermiso("impuestos:editar", { clientId: revision.clienteId, modo: "escritura" });
      if (!editar.ok) return { ok: false, message: editar.message };
    }
    const final: LecturaFormulario = {
      ...leido,
      formulario: fila.formulario === "490" ? "490" : "350",
      anio: fila.anio,
      periodo: fila.periodo,
      numero: fila.numero,
      fechaSello: p.fechaSello,
      codigoCorreccion: fila.formulario === "350" ? (p.codigoCorreccion === "1" ? 1 : null) : null,
      numeroAnterior: fila.formulario === "350" && p.codigoCorreccion === "1" ? p.numeroAnterior || null : null,
      concepto: fila.formulario === "490" ? p.concepto || null : null,
      numeroPagado: fila.formulario === "490" ? p.numeroPagado || null : null,
      valores,
    };
    const controles = controlesLectura(final, { nitCliente: revision.nitCliente, anio: revision.anio, mesCorte: revision.mesCorte });
    if (lecturaConErrores(controles)) {
      return { ok: false, message: controles.filter((c) => c.bloquea && !c.ok).map((c) => c.mensaje).join(" ") };
    }
    const user = await getCurrentUser();
    await prisma.$transaction(async (tx) => {
      await tx.renglonFormularioDian.deleteMany({ where: { formularioId: fila.id } });
      await tx.formularioDianCargado.update({
        where: { id: fila.id },
        data: {
          estado: "confirmado",
          fechaSello: fechaCalendarioPrisma(p.fechaSello),
          codigoCorreccion: final.codigoCorreccion,
          numeroAnterior: final.numeroAnterior,
          concepto: final.concepto,
          numeroPagado: final.numeroPagado,
          controlesJson: controles as unknown as Prisma.InputJsonValue,
          corregidoAMano: corregidos.length ? (corregidos as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          confirmadoPor: user?.name ?? null,
          confirmadoPorId: user?.id ?? null,
          confirmadoEn: new Date(),
          renglones: { create: filasRenglones(valores) },
        },
      });
    });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "CONFIRMÓ FORMULARIO DIAN",
      entity: `Retención en la fuente · ${revision.nombreCliente} · F${fila.formulario} ${fila.numero}`,
      detail: `${etiquetaPeriodo(fila.periodo)} ${fila.anio}${final.codigoCorreccion === 1 ? ` · corrige al ${final.numeroAnterior}` : ""}${final.concepto ? ` · concepto ${final.concepto}` : ""}${corregidos.length ? ` · corregidos a mano: ${corregidos.join(", ")}` : ""}`,
      clientId: revision.clienteId,
    });
    revalidatePath(`${RUTA}/${revision.id}`);
    return { ok: true, message: "Formulario confirmado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("confirmarFormularioDian", e) };
  }
}

/** Descarta un formulario: el original se conserva; deja de contar en todas las revisiones del año. */
export async function descartarFormularioDian(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = Number(formData.get("id"));
  const revisionId = Number(formData.get("revisionId"));
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(revisionId) || revisionId <= 0) return { ok: false, message: "Formulario inválido." };
  const acceso = await revisionConAlcance(revisionId, "impuestos:cargar");
  if (!acceso.ok) return { ok: false, message: acceso.message };
  const { revision } = acceso;

  try {
    const fila = await prisma.formularioDianCargado.findUnique({ where: { id }, select: { id: true, clienteId: true, anio: true, estado: true, formulario: true, numero: true, periodo: true } });
    if (!fila || fila.clienteId !== revision.clienteId || fila.anio !== revision.anio) return { ok: false, message: "El formulario no es de esta revisión." };
    if (fila.estado === "descartado") return { ok: true, message: "Ya estaba descartado." };
    if (fila.estado === "confirmado") {
      const eliminar = await authorizePermiso("impuestos:eliminar", { clientId: revision.clienteId, modo: "escritura" });
      if (!eliminar.ok) return { ok: false, message: "Un formulario confirmado solo lo descarta el senior del cliente." };
      const enFirme = await prisma.revisionRetencion.count({ where: { clienteId: revision.clienteId, anio: revision.anio, estado: "en_firme" } });
      if (enFirme > 0) return { ok: false, message: "Hay una revisión de este año en firme que usa los formularios confirmados." };
    }
    const user = await getCurrentUser();
    await prisma.formularioDianCargado.update({ where: { id }, data: { estado: "descartado", descartadoPor: user?.name ?? null, descartadoEn: new Date() } });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "DESCARTÓ FORMULARIO DIAN",
      entity: `Retención en la fuente · ${revision.nombreCliente} · F${fila.formulario} ${fila.numero}`,
      detail: `${etiquetaPeriodo(fila.periodo)} ${fila.anio} · estaba ${fila.estado === "confirmado" ? "confirmado" : "por confirmar"}`,
      clientId: revision.clienteId,
    });
    revalidatePath(`${RUTA}/${revision.id}`);
    return { ok: true, message: "Formulario descartado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("descartarFormularioDian", e) };
  }
}

/** «No hubo formulario»: registra la causal de un período sin 350. */
export async function registrarPeriodoSinFormulario(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = PeriodoSinFormularioSchema.safeParse({ revisionId: formData.get("revisionId"), periodo: formData.get("periodo"), causal: formData.get("causal") });
  if (!parsed.success) return { ok: false, message: primerError(parsed.error.issues) };
  const { revisionId, periodo, causal } = parsed.data;
  const acceso = await revisionConAlcance(revisionId, "impuestos:cargar");
  if (!acceso.ok) return { ok: false, message: acceso.message };
  const { revision } = acceso;

  try {
    const con350 = await prisma.formularioDianCargado.count({ where: { clienteId: revision.clienteId, anio: revision.anio, periodo, formulario: "350", estado: "confirmado" } });
    if (con350 > 0) return { ok: false, message: `${etiquetaPeriodo(periodo)} ya tiene un 350 confirmado.` };
    const user = await getCurrentUser();
    await prisma.periodoSinFormulario.upsert({
      where: { clienteId_anio_periodo_formulario: { clienteId: revision.clienteId, anio: revision.anio, periodo, formulario: "350" } },
      create: { clienteId: revision.clienteId, anio: revision.anio, periodo, formulario: "350", causal, registradoPor: user?.name ?? null, registradoPorId: user?.id ?? null },
      update: { causal, registradoPor: user?.name ?? null, registradoPorId: user?.id ?? null, registradoEn: new Date() },
    });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "REGISTRÓ MES SIN FORMULARIO DIAN",
      entity: `Retención en la fuente · ${revision.nombreCliente} · ${etiquetaPeriodo(periodo)} ${revision.anio}`,
      detail: causal,
      clientId: revision.clienteId,
    });
    revalidatePath(`${RUTA}/${revision.id}`);
    return { ok: true, message: "Causal registrada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("registrarPeriodoSinFormulario", e) };
  }
}

/** Deshace «No hubo formulario» de un período. */
export async function quitarPeriodoSinFormulario(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const revisionId = Number(formData.get("revisionId"));
  const periodo = Number(formData.get("periodo"));
  if (!Number.isSafeInteger(revisionId) || !Number.isInteger(periodo) || periodo < 1 || periodo > 12) return { ok: false, message: "Período inválido." };
  const acceso = await revisionConAlcance(revisionId, "impuestos:cargar");
  if (!acceso.ok) return { ok: false, message: acceso.message };
  const { revision } = acceso;

  try {
    const user = await getCurrentUser();
    const borradas = await prisma.periodoSinFormulario.deleteMany({ where: { clienteId: revision.clienteId, anio: revision.anio, periodo, formulario: "350" } });
    if (borradas.count > 0) {
      await logAudit({
        user: user?.name ?? "Sistema",
        action: "QUITÓ MES SIN FORMULARIO DIAN",
        entity: `Retención en la fuente · ${revision.nombreCliente} · ${etiquetaPeriodo(periodo)} ${revision.anio}`,
        detail: "Se espera de nuevo el 350 del período",
        clientId: revision.clienteId,
      });
    }
    revalidatePath(`${RUTA}/${revision.id}`);
    return { ok: true, message: "Causal quitada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("quitarPeriodoSinFormulario", e) };
  }
}

/** Elimina una revisión sin firme. Los formularios del año se conservan (los usan otras revisiones). */
export async function eliminarRevisionRetencion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = Number(formData.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: "Revisión inválida." };
  const acceso = await revisionConAlcance(id, "impuestos:eliminar");
  if (!acceso.ok) return { ok: false, message: acceso.message };
  const { revision } = acceso;

  try {
    const user = await getCurrentUser();
    await prisma.revisionRetencion.delete({ where: { id } });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ REVISIÓN DE RETENCIÓN",
      entity: `Retención en la fuente · ${revision.nombreCliente} · ${revision.anio} corte ${etiquetaPeriodo(revision.mesCorte)}`,
      detail: "Los formularios del año se conservan",
      clientId: revision.clienteId,
    });
    revalidatePath(RUTA);
    return { ok: true, message: "Revisión eliminada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarRevisionRetencion", e) };
  }
}
