"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma, type FormularioDianCargado } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { iaDisponible } from "@/lib/anthropic";
import { registrarConsumoIA } from "@/lib/ia/uso";
import { almacenamientoDisponible, subirObjeto } from "@/lib/storage/objetos";
import { fechaCalendarioISO, fechaCalendarioPrisma } from "@/lib/fecha-hora";
import { CLAVE_MARCA_IMPUESTO, ConfirmarFormularioDianSchema, ConfirmarFormulariosDianSchema, MarcaImpuestoSchema, PeriodoSinFormularioSchema, RevisionImpuestoSchema, type ActionState } from "@/lib/definitions";
import { tomarCandadoTransaccion } from "@/lib/candados";
import { siguienteNumeroMarca } from "@/lib/modulos/marcas-cruce";
import { cargarRevision, type RevisionVista } from "@/lib/impuestos/retencion/revision-servidor";
import { resultadosEnVivo } from "@/lib/impuestos/retencion/resultados-servidor";
import { etiquetaPeriodoRevision } from "@/lib/impuestos/retencion/periodos-revision";
import { construirCopiaRetencion } from "@/lib/impuestos/retencion/copia-cierre";
import { CLAVE_MARCA_SALDO_INICIAL, cuentasDeFilaCruce, prefijosRetencion } from "@/lib/impuestos/retencion/cruce";
import { cuentasBloqueoDelModulo, ESTADO_CIERRE_DESBLOQUEADO, ESTADO_CIERRE_FIRME, validarJustificacionDesbloqueo } from "@/lib/conciliacion/cuentas-bloqueo";
import { autorizarCierreConciliacion } from "@/lib/conciliacion/verificar-bloqueo";
import { cargarContextoPrevalidadorBalance } from "@/lib/balance/prevalidador/servidor";
import { transaccionSerializable } from "@/lib/concurrency";
import { cargarCruceRetencion } from "@/lib/impuestos/retencion/cruce-servidor";
import { cargarCandidatosBalanceCruce, guardarEleccionBalanceCruce } from "@/lib/modulos/balance-cruce-servidor";
import { balancesQueSirvenCruce, describirBalanceCruce } from "@/lib/modulos/compuerta-cruce";
import { NOMBRES_MES } from "@/lib/impuestos/calendario";
import { CONTROLES_QUE_RECHAZAN, controlesLectura, lecturaConErrores, normalizarLectura, renglonesCorregidos, resumenConfirmacion, type CodigoFormulario, type LecturaCruda, type LecturaFormulario } from "@/lib/impuestos/retencion/lectura";
import { leerFormularioDianConIA } from "@/lib/impuestos/retencion/lectura-servidor";
import { claveObjetoFormulario, MAX_BYTES_FORMULARIO, type ResultadoImportacion, type ResultadoRevision } from "@/lib/impuestos/retencion/tipos";
import { impuestoPorClave, RETENCION, type ImpuestoDian } from "@/lib/impuestos/impuestos-dian";
import { mesesCorteValidos, validarPeriodicidad } from "@/lib/impuestos/periodicidad";

// Impuestos · DIAN: revisiones de Retención en la fuente (350 + 490) e IVA (300 + 490). El impuesto
// sale de la revisión (al crearla, del formulario). Cargar, confirmar y registrar causales:
// `impuestos:cargar` + alcance de ESCRITURA sobre el cliente (staff o senior asignado); corregir
// importes leídos: además `impuestos:editar`; descartar un formulario ya confirmado o una revisión:
// `impuestos:eliminar`. Nada de esto se permite con la revisión en firme. Cada consulta de
// formularios filtra por el impuesto: el 490 lo comparten los dos.
const PREFIJOS_RETENCION = prefijosRetencion();

const primerError = (issues: { message: string }[]) => issues[0]?.message ?? "Datos inválidos.";
/** El mes del corte («Septiembre»). */
const etiquetaMes = (p: number) => NOMBRES_MES[p - 1] ?? `Período ${p}`;
/** Un período de la revisión: el mes en Retención; el bimestre, cuatrimestre o año en IVA. */
const periodoDe = (r: { periodicidad: string }, p: number) => etiquetaPeriodoRevision(r.periodicidad, p);
const impuestoDe = (clave: string): ImpuestoDian => impuestoPorClave(clave) ?? RETENCION;
const rutaDe = (imp: ImpuestoDian) => `/impuestos/${imp.slug}`;

async function revisionConAlcance(revisionId: number, permiso: string) {
  const revision = await prisma.revisionImpuesto.findUnique({ where: { id: revisionId } });
  if (!revision) return { ok: false as const, message: "La revisión no existe." };
  const authz = await authorizePermiso(permiso, { clientId: revision.clienteId, modo: "escritura" });
  if (!authz.ok) return { ok: false as const, message: authz.message };
  if (revision.estado === "en_firme") return { ok: false as const, message: "La revisión está en firme: no se puede cambiar." };
  return { ok: true as const, revision, impuesto: impuestoDe(revision.impuesto) };
}

type PeriodicidadRevision =
  | { ok: true; valor: string; guardarEnFicha: { formId: number } | null }
  | { ok: false; message: string };

/**
 * La periodicidad de una revisión nueva: Retención, siempre mensual; IVA, la de la ficha del cliente
 * o, si no la tiene, la que se eligió en «Nueva revisión» (y se guarda en la ficha).
 */
async function periodicidadDeLaRevision(imp: ImpuestoDian, clienteId: number, elegida: string): Promise<PeriodicidadRevision> {
  if (imp.periodicidades.length === 1) return { ok: true, valor: imp.periodicidades[0], guardarEnFicha: null };
  const formato = await prisma.dianForm.findUnique({ where: { key: imp.claveFormularioCliente }, select: { id: true } });
  if (!formato) return { ok: false, message: `El formato ${imp.claveFormularioCliente} no está en el catálogo de formatos DIAN.` };
  const ficha = await prisma.clientDianForm.findUnique({ where: { clientId_formId: { clientId: clienteId, formId: formato.id } }, select: { periodicidad: true } });
  const propia = ficha?.periodicidad ?? null;
  if (propia && (imp.periodicidades as readonly string[]).includes(propia)) return { ok: true, valor: propia, guardarEnFicha: null };
  const validada = validarPeriodicidad(imp.claveFormularioCliente, elegida);
  if (!validada.ok) return { ok: false, message: validada.message };
  if (!validada.periodicidad) return { ok: false, message: `El cliente no tiene periodicidad de ${imp.nombre} en su ficha: elígela.` };
  return { ok: true, valor: validada.periodicidad, guardarEnFicha: { formId: formato.id } };
}

/**
 * «Nueva revisión»: impuesto, cliente, año y corte. Retención en la fuente es siempre mensual. IVA
 * toma la periodicidad de la ficha del cliente; si no la tiene, la pide y la guarda en la ficha. El
 * corte tiene que cerrar un período de la periodicidad. Si ya existe, devuelve la existente.
 */
export async function crearRevisionImpuesto(_prev: ResultadoRevision, formData: FormData): Promise<ResultadoRevision> {
  const parsed = RevisionImpuestoSchema.safeParse({
    impuesto: formData.get("impuesto") ?? "RET",
    clienteId: formData.get("clienteId"),
    anio: formData.get("anio"),
    mesCorte: formData.get("mesCorte"),
    periodicidad: formData.get("periodicidad") ?? "",
  });
  if (!parsed.success) return { ok: false, message: primerError(parsed.error.issues) };
  const { clienteId, anio, mesCorte } = parsed.data;
  const imp = impuestoDe(parsed.data.impuesto);
  const authz = await authorizePermiso("impuestos:cargar", { clientId: clienteId, modo: "escritura" });
  if (!authz.ok) return { ok: false, message: authz.message };

  try {
    const cliente = await prisma.client.findUnique({ where: { id: clienteId }, select: { name: true, nit: true, code: true } });
    if (!cliente) return { ok: false, message: "El cliente no existe." };
    const existente = await prisma.revisionImpuesto.findUnique({ where: { clienteId_impuesto_anio_mesCorte: { clienteId, impuesto: imp.clave, anio, mesCorte } }, select: { id: true } });
    if (existente) return { ok: true, id: existente.id, message: "La revisión ya existía." };

    const periodicidad = await periodicidadDeLaRevision(imp, clienteId, parsed.data.periodicidad);
    if (!periodicidad.ok) return { ok: false, message: periodicidad.message };
    if (!mesesCorteValidos(periodicidad.valor).includes(mesCorte)) {
      return { ok: false, message: `Con periodicidad ${periodicidad.valor.toLowerCase()} el corte tiene que cerrar un período: ${mesesCorteValidos(periodicidad.valor).map(etiquetaMes).join(", ").toLowerCase()}.` };
    }

    const user = await getCurrentUser();
    const revision = await prisma.$transaction(async (tx) => {
      // La periodicidad que se pidió en «Nueva revisión» queda en la ficha del cliente.
      if (periodicidad.guardarEnFicha) {
        await tx.clientDianForm.upsert({
          where: { clientId_formId: { clientId: clienteId, formId: periodicidad.guardarEnFicha.formId } },
          create: { clientId: clienteId, formId: periodicidad.guardarEnFicha.formId, periodicidad: periodicidad.valor },
          update: { periodicidad: periodicidad.valor },
        });
      }
      return tx.revisionImpuesto.create({
        data: {
          impuesto: imp.clave,
          clienteId,
          nombreCliente: cliente.name,
          nitCliente: cliente.nit,
          anio,
          mesCorte,
          periodo: `${anio}-${String(mesCorte).padStart(2, "0")}`,
          periodicidad: periodicidad.valor,
          creadoPor: user?.name ?? null,
          creadoPorId: user?.id ?? null,
        },
      });
    });
    if (periodicidad.guardarEnFicha) {
      await logAudit({
        user: user?.name ?? "Sistema",
        action: "EDITÓ PERIODICIDAD DIAN DEL CLIENTE",
        entity: `Cliente · ${cliente.name} · formato ${imp.claveFormularioCliente}`,
        detail: `Periodicidad ${periodicidad.valor}, elegida al crear la revisión de ${imp.nombre} ${anio}`,
        clientId: clienteId,
      });
    }
    await logAudit({
      user: user?.name ?? "Sistema",
      action: `CREÓ REVISIÓN DE ${imp.nombreCorto.toUpperCase()}`,
      entity: `${imp.nombre} · ${cliente.name} · ${anio} corte ${etiquetaMes(mesCorte)}`,
      detail: `Periodicidad ${periodicidad.valor}`,
      clientId: clienteId,
    });
    revalidatePath(rutaDe(imp));
    return { ok: true, id: revision.id, message: "Revisión creada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("crearRevisionImpuesto", e) };
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
  const { revision, impuesto: imp } = acceso;
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
    const ctx = { nitCliente: revision.nitCliente, anio: revision.anio, mesCorte: revision.mesCorte, impuesto: imp.clave, periodicidad: revision.periodicidad };
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
    for (const clave of CONTROLES_QUE_RECHAZAN) {
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
      claveObjeto = claveObjetoFormulario(revision.clienteId, revision.anio, huella, imp.slug);
      await subirObjeto({ key: claveObjeto, cuerpo: bytes, contentType: "application/pdf" });
    }
    const datos = {
      impuesto: imp.clave,
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
      entity: `${imp.nombre} · ${revision.nombreCliente} · F${lectura.formulario} ${numero}`,
      detail: `${periodoDe(revision, lectura.periodo as number)} ${lectura.anio} · ${archivo.name} · leído con ${leida.modelo}${pendientes ? ` · ${pendientes} control(es) por corregir` : ""}${claveObjeto ? "" : " · sin original (almacén no disponible)"}`,
      clientId: revision.clienteId,
    });
    revalidatePath(`${rutaDe(imp)}/${revision.id}`);
    return {
      ok: true,
      message: `${archivo.name}: formulario ${lectura.formulario} de ${periodoDe(revision, lectura.periodo as number)}${pendientes ? `, con ${pendientes} control(es) por corregir` : ""}. Revísalo y confírmalo.`,
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

type RevisionEscritura = Extract<Awaited<ReturnType<typeof revisionConAlcance>>, { ok: true }>["revision"];
type DatosConfirmacion = Pick<LecturaFormulario, "fechaSello" | "codigoCorreccion" | "numeroAnterior" | "concepto" | "numeroPagado" | "valores">;

/**
 * Confirma un formulario con estos datos: lo del modal «Revisar» o, en bloque, lo ya leído. Las dos
 * vías pasan por los mismos controles. Devuelve el motivo si no se puede; null si quedó confirmado.
 */
async function confirmarFila(revision: RevisionEscritura, fila: FormularioDianCargado, datos: DatosConfirmacion, enBloque = false): Promise<string | null> {
  const imp = impuestoDe(revision.impuesto);
  const codigo = imp.declaracion.codigo as CodigoFormulario;
  const leido = normalizarLectura(fila.lecturaJson as unknown as LecturaCruda);
  const corregidos = renglonesCorregidos(leido.valores, datos.valores);
  if (corregidos.length > 0) {
    const editar = await authorizePermiso("impuestos:editar", { clientId: revision.clienteId, modo: "escritura" });
    if (!editar.ok) return editar.message;
  }
  const esCorreccion = fila.formulario === codigo && datos.codigoCorreccion === 1;
  const final: LecturaFormulario = {
    ...leido,
    formulario: fila.formulario === "490" ? "490" : codigo,
    anio: fila.anio,
    periodo: fila.periodo,
    numero: fila.numero,
    fechaSello: datos.fechaSello,
    codigoCorreccion: esCorreccion ? 1 : null,
    numeroAnterior: esCorreccion ? datos.numeroAnterior : null,
    concepto: fila.formulario === "490" ? datos.concepto : null,
    numeroPagado: fila.formulario === "490" ? datos.numeroPagado : null,
    valores: datos.valores,
  };
  const controles = controlesLectura(final, { nitCliente: revision.nitCliente, anio: revision.anio, mesCorte: revision.mesCorte, impuesto: imp.clave, periodicidad: revision.periodicidad });
  if (lecturaConErrores(controles)) {
    return controles.filter((c) => c.bloquea && !c.ok).map((c) => c.mensaje).join(" ");
  }
  const user = await getCurrentUser();
  await prisma.$transaction(async (tx) => {
    await tx.renglonFormularioDian.deleteMany({ where: { formularioId: fila.id } });
    await tx.formularioDianCargado.update({
      where: { id: fila.id },
      data: {
        estado: "confirmado",
        fechaSello: fechaCalendarioPrisma(final.fechaSello as string),
        codigoCorreccion: final.codigoCorreccion,
        numeroAnterior: final.numeroAnterior,
        concepto: final.concepto,
        numeroPagado: final.numeroPagado,
        controlesJson: controles as unknown as Prisma.InputJsonValue,
        corregidoAMano: corregidos.length ? (corregidos as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        confirmadoPor: user?.name ?? null,
        confirmadoPorId: user?.id ?? null,
        confirmadoEn: new Date(),
        renglones: { create: filasRenglones(datos.valores) },
      },
    });
  });
  await logAudit({
    user: user?.name ?? "Sistema",
    action: "CONFIRMÓ FORMULARIO DIAN",
    entity: `${imp.nombre} · ${revision.nombreCliente} · F${fila.formulario} ${fila.numero}`,
    detail: `${periodoDe(revision, fila.periodo)} ${fila.anio}${final.codigoCorreccion === 1 ? ` · corrige al ${final.numeroAnterior}` : ""}${final.concepto ? ` · concepto ${final.concepto}` : ""}${corregidos.length ? ` · corregidos a mano: ${corregidos.join(", ")}` : ""}${enBloque ? " · confirmado en bloque" : ""}`,
    clientId: revision.clienteId,
  });
  return null;
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
  const { revision, impuesto: imp } = acceso;

  try {
    const fila = await prisma.formularioDianCargado.findUnique({ where: { id: p.id } });
    if (!fila || fila.clienteId !== revision.clienteId || fila.anio !== revision.anio || fila.impuesto !== imp.clave) return { ok: false, message: "El formulario no es de esta revisión." };
    if (fila.estado === "descartado") return { ok: false, message: "El formulario fue descartado." };

    const valores = Object.fromEntries(Object.entries(p.valores).map(([r, v]) => [Number(r), v]));
    const motivo = await confirmarFila(revision, fila, {
      fechaSello: p.fechaSello,
      codigoCorreccion: p.codigoCorreccion === "1" ? 1 : null,
      numeroAnterior: p.numeroAnterior || null,
      concepto: p.concepto || null,
      numeroPagado: p.numeroPagado || null,
      valores,
    });
    if (motivo) return { ok: false, message: motivo };
    revalidatePath(`${rutaDe(imp)}/${revision.id}`);
    return { ok: true, message: "Formulario confirmado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("confirmarFormularioDian", e) };
  }
}

/**
 * Confirma de una vez los formularios seleccionados, tal como los leyó la IA. Cada uno pasa por los
 * mismos controles que en «Revisar» y se guarda aparte: si uno falla, los demás quedan confirmados.
 */
export async function confirmarFormulariosDian(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ConfirmarFormulariosDianSchema.safeParse({ revisionId: formData.get("revisionId"), ids: formData.getAll("id") });
  if (!parsed.success) return { ok: false, message: primerError(parsed.error.issues) };
  const { revisionId, ids } = parsed.data;
  const acceso = await revisionConAlcance(revisionId, "impuestos:cargar");
  if (!acceso.ok) return { ok: false, message: acceso.message };
  const { revision, impuesto: imp } = acceso;

  try {
    const filas = await prisma.formularioDianCargado.findMany({
      where: { id: { in: ids }, clienteId: revision.clienteId, impuesto: imp.clave, anio: revision.anio, estado: "por_confirmar" },
      include: { renglones: { select: { renglon: true, valor: true } } },
      orderBy: [{ periodo: "asc" }, { formulario: "asc" }, { id: "asc" }],
    });
    const fallos: string[] = [];
    let confirmados = 0;
    for (const fila of filas) {
      const titulo = `F${fila.formulario} ${periodoDe(revision, fila.periodo)}`;
      try {
        const motivo = await confirmarFila(revision, fila, {
          fechaSello: fila.fechaSello ? fechaCalendarioISO(fila.fechaSello) : null,
          codigoCorreccion: fila.codigoCorreccion,
          numeroAnterior: fila.numeroAnterior,
          concepto: fila.concepto,
          numeroPagado: fila.numeroPagado,
          valores: Object.fromEntries(fila.renglones.map((r) => [r.renglon, Number(r.valor)])),
        }, true);
        if (motivo) fallos.push(`${titulo}: ${motivo}`);
        else confirmados += 1;
      } catch (e) {
        fallos.push(`${titulo}: ${mensajeErrorBD("confirmarFormulariosDian", e)}`);
      }
    }
    if (confirmados > 0) revalidatePath(`${rutaDe(imp)}/${revision.id}`);
    return resumenConfirmacion({ pedidos: ids.length, confirmados, fallos });
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("confirmarFormulariosDian", e) };
  }
}

/** Descarta un formulario: el original se conserva; deja de contar en todas las revisiones del año. */
export async function descartarFormularioDian(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = Number(formData.get("id"));
  const revisionId = Number(formData.get("revisionId"));
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(revisionId) || revisionId <= 0) return { ok: false, message: "Formulario inválido." };
  const acceso = await revisionConAlcance(revisionId, "impuestos:cargar");
  if (!acceso.ok) return { ok: false, message: acceso.message };
  const { revision, impuesto: imp } = acceso;

  try {
    const fila = await prisma.formularioDianCargado.findUnique({ where: { id }, select: { id: true, impuesto: true, clienteId: true, anio: true, estado: true, formulario: true, numero: true, periodo: true } });
    if (!fila || fila.clienteId !== revision.clienteId || fila.anio !== revision.anio || fila.impuesto !== imp.clave) return { ok: false, message: "El formulario no es de esta revisión." };
    if (fila.estado === "descartado") return { ok: true, message: "Ya estaba descartado." };
    if (fila.estado === "confirmado") {
      const eliminar = await authorizePermiso("impuestos:eliminar", { clientId: revision.clienteId, modo: "escritura" });
      if (!eliminar.ok) return { ok: false, message: "Un formulario confirmado solo lo descarta el senior del cliente." };
      const enFirme = await prisma.revisionImpuesto.count({ where: { clienteId: revision.clienteId, impuesto: imp.clave, anio: revision.anio, estado: "en_firme" } });
      if (enFirme > 0) return { ok: false, message: "Hay una revisión de este año en firme que usa los formularios confirmados." };
    }
    const user = await getCurrentUser();
    await prisma.formularioDianCargado.update({ where: { id }, data: { estado: "descartado", descartadoPor: user?.name ?? null, descartadoEn: new Date() } });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "DESCARTÓ FORMULARIO DIAN",
      entity: `${imp.nombre} · ${revision.nombreCliente} · F${fila.formulario} ${fila.numero}`,
      detail: `${periodoDe(revision, fila.periodo)} ${fila.anio} · estaba ${fila.estado === "confirmado" ? "confirmado" : "por confirmar"}`,
      clientId: revision.clienteId,
    });
    revalidatePath(`${rutaDe(imp)}/${revision.id}`);
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
  const { revision, impuesto: imp } = acceso;

  try {
    const codigo = imp.declaracion.codigo;
    const conDeclaracion = await prisma.formularioDianCargado.count({ where: { clienteId: revision.clienteId, impuesto: imp.clave, anio: revision.anio, periodo, formulario: codigo, estado: "confirmado" } });
    if (conDeclaracion > 0) return { ok: false, message: `${periodoDe(revision, periodo)} ya tiene un ${codigo} confirmado.` };
    const user = await getCurrentUser();
    await prisma.periodoSinFormulario.upsert({
      where: { clienteId_anio_periodo_formulario: { clienteId: revision.clienteId, anio: revision.anio, periodo, formulario: codigo } },
      create: { clienteId: revision.clienteId, anio: revision.anio, periodo, formulario: codigo, causal, registradoPor: user?.name ?? null, registradoPorId: user?.id ?? null },
      update: { causal, registradoPor: user?.name ?? null, registradoPorId: user?.id ?? null, registradoEn: new Date() },
    });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "REGISTRÓ MES SIN FORMULARIO DIAN",
      entity: `${imp.nombre} · ${revision.nombreCliente} · ${periodoDe(revision, periodo)} ${revision.anio}`,
      detail: causal,
      clientId: revision.clienteId,
    });
    revalidatePath(`${rutaDe(imp)}/${revision.id}`);
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
  const { revision, impuesto: imp } = acceso;

  try {
    const user = await getCurrentUser();
    const borradas = await prisma.periodoSinFormulario.deleteMany({ where: { clienteId: revision.clienteId, anio: revision.anio, periodo, formulario: imp.declaracion.codigo } });
    if (borradas.count > 0) {
      await logAudit({
        user: user?.name ?? "Sistema",
        action: "QUITÓ MES SIN FORMULARIO DIAN",
        entity: `${imp.nombre} · ${revision.nombreCliente} · ${periodoDe(revision, periodo)} ${revision.anio}`,
        detail: `Se espera de nuevo el ${imp.declaracion.codigo} del período`,
        clientId: revision.clienteId,
      });
    }
    revalidatePath(`${rutaDe(imp)}/${revision.id}`);
    return { ok: true, message: "Causal quitada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("quitarPeriodoSinFormulario", e) };
  }
}

/** Elimina una revisión sin firme. Los formularios del año se conservan (los usan otras revisiones). */
export async function eliminarRevisionImpuesto(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = Number(formData.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: "Revisión inválida." };
  const acceso = await revisionConAlcance(id, "impuestos:eliminar");
  if (!acceso.ok) return { ok: false, message: acceso.message };
  const { revision, impuesto: imp } = acceso;

  try {
    const user = await getCurrentUser();
    await prisma.revisionImpuesto.delete({ where: { id } });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: `ELIMINÓ REVISIÓN DE ${imp.nombreCorto.toUpperCase()}`,
      entity: `${imp.nombre} · ${revision.nombreCliente} · ${revision.anio} corte ${etiquetaMes(revision.mesCorte)}`,
      detail: "Los formularios del año se conservan",
      clientId: revision.clienteId,
    });
    revalidatePath(rutaDe(imp));
    return { ok: true, message: "Revisión eliminada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarRevisionImpuesto", e) };
  }
}

/**
 * Marca de auditoría (tabla de marcas de los módulos, código RET, período de la revisión) de una
 * fila del cruce contable (dimensión `cuenta4`, la clave es la cuenta Russell o `sin_cuenta:…`), de
 * un mes con diferencia en el pago (`pago:2026-02`), de un mes cuya corrección llegó sin el
 * original (`oportunidad:2026-01`) o de lo restado como saldo inicial (`saldo_inicial`, guarda el
 * total), estas tres en la dimensión `control`. Guarda la diferencia del momento: si después cambia,
 * la marca queda desactualizada y la fila vuelve a pedirla.
 */
export async function guardarMarcaImpuesto(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = MarcaImpuestoSchema.safeParse({
    revisionId: formData.get("revisionId"),
    clave: formData.get("clave"),
    nota: formData.get("nota"),
    referenciaAnexo: formData.get("referenciaAnexo") ?? "",
  });
  if (!parsed.success) return { ok: false, message: primerError(parsed.error.issues) };
  const { revisionId, clave, nota, referenciaAnexo } = parsed.data;
  const acceso = await revisionConAlcance(revisionId, "impuestos:editar");
  if (!acceso.ok) return { ok: false, message: acceso.message };
  const { revision, impuesto: imp } = acceso;

  try {
    const vista = await cargarRevision(revision.id);
    if (!vista) return { ok: false, message: "La revisión no existe." };
    const objetivo = await objetivoDeMarca(vista, clave);
    if (!objetivo.ok) return { ok: false, message: objetivo.message };
    const { dimension, diferencia, etiqueta } = objetivo;

    const user = await getCurrentUser();
    const numero = await prisma.$transaction(async (tx) => {
      await tomarCandadoTransaccion(tx, `marca-${imp.slug}:${revision.clienteId}:${revision.periodo}`);
      const delPeriodo = await tx.marcaCruceModulo.findMany({
        where: { clienteId: revision.clienteId, moduloCodigo: imp.clave, periodo: revision.periodo },
        select: { id: true, numero: true, cuenta4: true, clave: true, dimension: true },
      });
      const existente = delPeriodo.find((m) => m.dimension === dimension && (dimension === "cuenta4" ? m.cuenta4 : m.clave) === clave);
      const datos = { nota, referenciaAnexo: referenciaAnexo || null, diferencia, marcadoPor: user?.name ?? null, marcadoPorId: user?.id ?? null, marcadoEn: new Date() };
      if (existente) {
        await tx.marcaCruceModulo.update({ where: { id: existente.id }, data: datos });
        return existente.numero;
      }
      const siguiente = siguienteNumeroMarca(delPeriodo.map((m) => m.numero));
      await tx.marcaCruceModulo.create({
        data: {
          clienteId: revision.clienteId, moduloCodigo: imp.clave, periodo: revision.periodo, numero: siguiente, dimension,
          ...(dimension === "cuenta4" ? { cuenta4: clave } : { clave }),
          ...datos,
        },
      });
      return siguiente;
    });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: `MARCÓ DIFERENCIA DE ${imp.nombreCorto.toUpperCase()}`,
      entity: `${imp.nombre} · ${revision.nombreCliente} · ${revision.anio} corte ${etiquetaMes(revision.mesCorte)}`,
      detail: `Marca ${numero} · ${etiqueta} · diferencia ${diferencia} · ${nota}`,
      clientId: revision.clienteId,
    });
    revalidatePath(`${rutaDe(imp)}/${revision.id}`);
    return { ok: true, message: `Marca ${numero} guardada.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarMarcaImpuesto", e) };
  }
}

type ObjetivoMarca = { ok: true; dimension: "cuenta4" | "control"; diferencia: number; etiqueta: string } | { ok: false; message: string };

/** Qué se marca con la clave: la fila del cruce, el mes de pagos, el mes de oportunidad o el saldo inicial restado, con su cifra de hoy. */
async function objetivoDeMarca(vista: RevisionVista, clave: string): Promise<ObjetivoMarca> {
  if (clave === CLAVE_MARCA_SALDO_INICIAL) {
    const cruce = await cargarCruceRetencion(vista);
    if (cruce.estado !== "listo") return { ok: false, message: cruce.mensaje };
    const inicial = cruce.resultado.saldoInicial;
    if (!inicial?.restado) return { ok: false, message: "El cruce no está restando el saldo inicial: no hay nada que marcar." };
    return { ok: true, dimension: "control", diferencia: inicial.monto, etiqueta: "Novedades · Saldos restados (NITs con saldo inicial a enero)" };
  }
  if (clave.startsWith("pago:") || clave.startsWith("oportunidad:")) {
    const resultados = await resultadosEnVivo(vista);
    if (clave.startsWith("pago:")) {
      const fila = resultados.pagos.filas.find((f) => f.clave === clave);
      if (!fila) return { ok: false, message: "Ese período ya no está en la revisión." };
      if (!fila.requiereMarca) return { ok: false, message: "Ese período no tiene nada que marcar en el pago." };
      return { ok: true, dimension: "control", diferencia: fila.diferencia, etiqueta: `Pagos · ${etiquetaPeriodoRevision(vista.periodicidad, fila.periodo)}` };
    }
    const fila = resultados.oportunidad.find((f) => f.clave === clave);
    if (!fila) return { ok: false, message: "Ese período ya no está en la revisión." };
    if (!fila.admiteMarca) return { ok: false, message: `Ese período ya tiene su ${impuestoDe(vista.impuesto).declaracion.codigo} original: no hace falta la marca.` };
    return { ok: true, dimension: "control", diferencia: 0, etiqueta: `Oportunidad · ${etiquetaPeriodoRevision(vista.periodicidad, fila.periodo)}` };
  }
  const cruce = await cargarCruceRetencion(vista);
  if (cruce.estado !== "listo") return { ok: false, message: cruce.mensaje };
  const fila = cruce.resultado.grupos.flatMap((g) => g.filas).find((f) => f.clave === clave);
  if (!fila) return { ok: false, message: "Esa fila ya no está en el cruce." };
  if (fila.diferencia === 0) return { ok: false, message: "La fila no tiene diferencia que marcar." };
  return { ok: true, dimension: "cuenta4", diferencia: fila.diferencia, etiqueta: `Cruce · ${fila.cuentaRussell ?? fila.conceptos.map((c) => c.etiqueta).join(", ")}` };
}

/** Quita la marca de una fila del cruce o de un mes (la fila vuelve a pedirla si su diferencia lo exige). */
export async function quitarMarcaImpuesto(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const revisionId = Number(formData.get("revisionId"));
  const clave = String(formData.get("clave") ?? "");
  if (!Number.isSafeInteger(revisionId) || revisionId <= 0 || !CLAVE_MARCA_IMPUESTO.test(clave)) return { ok: false, message: "Marca inválida." };
  const acceso = await revisionConAlcance(revisionId, "impuestos:editar");
  if (!acceso.ok) return { ok: false, message: acceso.message };
  const { revision, impuesto: imp } = acceso;
  const control = clave.startsWith("pago:") || clave.startsWith("oportunidad:") || clave === CLAVE_MARCA_SALDO_INICIAL;

  try {
    const user = await getCurrentUser();
    const marca = await prisma.marcaCruceModulo.findFirst({
      where: {
        clienteId: revision.clienteId, moduloCodigo: imp.clave, periodo: revision.periodo,
        ...(control ? { dimension: "control", clave } : { dimension: "cuenta4", cuenta4: clave }),
      },
      select: { id: true, numero: true, nota: true },
    });
    if (!marca) return { ok: true, message: "La fila ya no tenía marca." };
    await prisma.marcaCruceModulo.delete({ where: { id: marca.id } });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: `QUITÓ MARCA DE ${imp.nombreCorto.toUpperCase()}`,
      entity: `${imp.nombre} · ${revision.nombreCliente} · ${revision.anio} corte ${etiquetaMes(revision.mesCorte)}`,
      detail: `Marca ${marca.numero} · ${clave} · ${marca.nota}`,
      clientId: revision.clienteId,
    });
    revalidatePath(`${rutaDe(imp)}/${revision.id}`);
    return { ok: true, message: "Marca quitada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("quitarMarcaImpuesto", e) };
  }
}

/**
 * «Conciliar contra este» (7/Nov/2026): cuando varios balances cerrados del corte sirven para el cruce,
 * el usuario escoge uno. Se guarda por cliente y período con el código RET (como las marcas y el
 * cierre). `impuestos:editar` con alcance de escritura, con la revisión abierta.
 */
export async function escogerBalanceImpuesto(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const revisionId = Number(formData.get("revisionId"));
  const balanceId = Number(formData.get("balanceId"));
  if (!Number.isSafeInteger(revisionId) || revisionId <= 0 || !Number.isSafeInteger(balanceId) || balanceId <= 0) {
    return { ok: false, message: "Datos inválidos." };
  }
  const acceso = await revisionConAlcance(revisionId, "impuestos:editar");
  if (!acceso.ok) return { ok: false, message: acceso.message };
  const { revision, impuesto: imp } = acceso;

  try {
    const { candidatos, vigentes } = await cargarCandidatosBalanceCruce(revision.clienteId, true);
    const sirven = balancesQueSirvenCruce(candidatos, revision.periodo, { exigirDetalleTercero: true, vigentes });
    const balance = sirven.find((b) => b.id === balanceId);
    if (!balance) return { ok: false, message: "Ese balance ya no sirve para este cruce (se abrió, otra versión lo reemplazó o no termina en la fecha de corte). Recarga la página." };

    const user = await getCurrentUser();
    const guardado = await prisma.$transaction(async (tx) => {
      // El mismo candado que el cierre: no se cambia el balance mientras la revisión se pone en firme.
      await tomarCandadoTransaccion(tx, `conciliacion-cierre:${revision.clienteId}:${imp.clave}:${revision.periodo}`);
      const actual = await tx.revisionImpuesto.findUnique({ where: { id: revision.id }, select: { estado: true } });
      if (!actual || actual.estado === "en_firme") return false;
      await guardarEleccionBalanceCruce(tx, {
        clienteId: revision.clienteId,
        moduloCodigo: imp.clave,
        periodo: revision.periodo,
        balanceId,
        usuario: user ? { id: user.id, name: user.name } : null,
      });
      return true;
    });
    if (!guardado) return { ok: false, message: "La revisión está en firme: no se puede cambiar." };
    await logAudit({
      user: user?.name ?? "Sistema",
      action: `ESCOGIÓ EL BALANCE DEL CRUCE DE ${imp.nombreCorto.toUpperCase()}`,
      entity: `${imp.nombre} · ${revision.nombreCliente} · ${revision.anio} corte ${etiquetaMes(revision.mesCorte)}`,
      detail: `Revisión #${revision.id} · balance #${balance.id} ${describirBalanceCruce(balance)} (${sirven.length} balances servían)`,
      clientId: revision.clienteId,
    });
    revalidatePath(`${rutaDe(imp)}/${revision.id}`);
    return { ok: true, message: `El cruce se concilia contra el balance ${describirBalanceCruce(balance)}.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("escogerBalanceImpuesto", e) };
  }
}

/** Huella de lo que el cierre evaluó: formularios del año, causales y marcas de la revisión. */
async function firmaParaCierre(db: Pick<typeof prisma, "formularioDianCargado" | "periodoSinFormulario" | "marcaCruceModulo">, r: { id: number; impuesto: string; clienteId: number; anio: number; periodo: string }): Promise<string> {
  const imp = impuestoDe(r.impuesto);
  const [formularios, causales, marcas] = await Promise.all([
    db.formularioDianCargado.findMany({ where: { clienteId: r.clienteId, impuesto: imp.clave, anio: r.anio }, select: { id: true, estado: true, actualizadoEn: true }, orderBy: { id: "asc" } }),
    db.periodoSinFormulario.findMany({ where: { clienteId: r.clienteId, anio: r.anio, formulario: imp.declaracion.codigo }, select: { periodo: true, causal: true }, orderBy: { periodo: "asc" } }),
    db.marcaCruceModulo.findMany({ where: { clienteId: r.clienteId, moduloCodigo: imp.clave, periodo: r.periodo }, select: { id: true, diferencia: true, marcadoEn: true }, orderBy: { id: "asc" } }),
  ]);
  return createHash("sha256")
    .update(JSON.stringify([
      formularios.map((f) => [f.id, f.estado, f.actualizadoEn.getTime()]),
      causales.map((c) => [c.periodo, c.causal]),
      marcas.map((m) => [m.id, m.diferencia.toString(), m.marcadoEn.getTime()]),
    ]))
    .digest("hex");
}

/**
 * «Cerrar en firme» (senior o gerente asignado, `conciliaciones:cerrar`): exige lo que dice
 * `evaluarCierreRetencion` (cada período resuelto, nada por confirmar, el cruce disponible y marcas
 * en las diferencias que las piden). Bloquea el saldo final y la homologación de las cuentas del
 * cliente homologadas a las cuentas Russell del cruce, en el balance del corte; deja la revisión de
 * solo lectura y guarda la copia congelada (con el `slug` del impuesto como tipo). Usa
 * `conciliacion_modulo_cierre` con el código del impuesto (RET o IVA) y el id de la revisión en
 * `modulo_dato_encabezado_id`. IVA bloquea también las cuentas de ingresos (41 y 42) del cruce,
 * que el módulo de Ingresos puede tener bloqueadas por su propio cierre.
 */
export async function cerrarRevisionImpuesto(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const revisionId = Number(formData.get("revisionId"));
  if (!Number.isSafeInteger(revisionId) || revisionId <= 0) return { ok: false, message: "Revisión inválida." };

  try {
    const vista = await cargarRevision(revisionId);
    if (!vista) return { ok: false, message: "La revisión no existe." };
    const imp = impuestoDe(vista.impuesto);
    const authz = await autorizarCierreConciliacion("conciliaciones:cerrar", vista.clienteId);
    if (!authz.ok) return { ok: false, message: authz.message };
    if (vista.estado === "en_firme") return { ok: true, message: "La revisión ya estaba en firme." };

    const firma = await firmaParaCierre(prisma, vista);
    const resultados = await resultadosEnVivo(vista);
    const { pendientes } = resultados.evaluacion;
    if (pendientes.length > 0) {
      return { ok: false, message: `No se puede cerrar: ${pendientes[0].texto}${pendientes.length > 1 ? ` (y ${pendientes.length - 1} pendiente(s) más; míralos en Novedades)` : ""}` };
    }
    const { eleccionBalance: _eleccion, ...cruce } = resultados.cruce;
    void _eleccion; // La lista para escoger el balance no va en la copia congelada.
    if (cruce.estado !== "listo") return { ok: false, message: `No se puede cerrar: ${cruce.mensaje}` };
    const balance = cruce.balance;
    // El balance contra el que el usuario vio el cruce: si entretanto alguien escogió otro, no se cierra.
    const balanceVisto = Number(formData.get("balanceId"));
    if (Number.isSafeInteger(balanceVisto) && balanceVisto > 0 && balanceVisto !== balance.id) {
      return { ok: false, message: `El balance del cruce cambió: ahora es el ${balance.descripcion}. Recarga la página y revisa el cruce antes de cerrar.` };
    }
    // Cada cuenta Russell del cruce (una fila de varias cuentas, como el renglón 40 de IVA, aporta todas).
    const cuentasRussell6 = [...new Set(cruce.resultado.grupos.flatMap((g) => g.filas).flatMap(cuentasDeFilaCruce))].sort();
    // Retención guarda sus prefijos de siempre; IVA, los de 4 dígitos de sus cuentas (2408, 1355, 41xx, 42xx).
    const cuentasRussell = imp.clave === RETENCION.clave
      ? PREFIJOS_RETENCION
      : [...new Set((cuentasRussell6.length > 0 ? cuentasRussell6 : imp.cruce.prefijosTercero).map((c) => c.slice(0, 4)))].sort();
    const copia = construirCopiaRetencion({
      tipo: imp.slug === "iva" ? "iva" : "retencion", tomadaEn: new Date(), periodos: vista.periodos, cruce, oportunidad: resultados.oportunidad, pagos: resultados.pagos,
    });
    const user = await getCurrentUser();
    const actor = user?.name ?? "Sistema";

    const resultado = await transaccionSerializable(async (tx) => {
      // Los mismos candados que cerrar los módulos: el balance del corte no cambia mientras se congela.
      await tomarCandadoTransaccion(tx, `balance-oficial:${vista.clienteId}:${balance.periodo}`);
      await tomarCandadoTransaccion(tx, `conciliacion-cierre:${vista.clienteId}:${imp.clave}:${vista.periodo}`);
      const actual = await tx.revisionImpuesto.findUnique({ where: { id: vista.id }, select: { estado: true } });
      if (!actual) return { ok: false as const, message: "La revisión ya no existe." };
      if (actual.estado === "en_firme") return { ok: true as const, idempotente: true, cuentas: 0 };

      const encabezado = await tx.balancePruebaEncabezado.findUnique({ where: { id: balance.id }, select: { loteId: true, estaCongelado: true } });
      if (!encabezado?.estaCongelado) {
        return { ok: false as const, message: "El balance del corte se abrió o ya no existe: ciérralo de nuevo en /balance y vuelve a revisar el cruce." };
      }
      const contexto = await cargarContextoPrevalidadorBalance(balance.id, tx);
      if (!cruce.huellaBalance || contexto.huella !== cruce.huellaBalance || !contexto.revision.vigente) {
        return { ok: false as const, message: "El balance del corte cambió mientras se cerraba. Vuelve a abrir el cruce." };
      }
      if ((await firmaParaCierre(tx, vista)) !== firma) {
        return { ok: false as const, message: "Los formularios, las causales, las marcas o la resta del saldo inicial cambiaron mientras se cerraba. Vuelve a revisar la revisión." };
      }

      const [detalle, filasTercero] = await Promise.all([
        tx.balancePruebaDetalle.findMany({
          where: { encabezadoId: balance.id },
          select: { cuenta8: true, cuenta6Russell: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
        }),
        encabezado.loteId
          ? tx.balanceTerceroDetalle.findMany({
              where: { encabezado: { loteId: encabezado.loteId } },
              select: { cuenta8: true, cuenta6Russell: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true },
            })
          : Promise.resolve([]),
      ]);
      const aFila = (f: (typeof detalle)[number]) => ({
        cuenta8: f.cuenta8, cuenta6Russell: f.cuenta6Russell,
        saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
      });
      // El detalle principal manda (importes oficiales); el de tercero solo aporta cuentas que falten.
      const bloqueadas = cuentasBloqueoDelModulo([...detalle.map(aFila), ...filasTercero.map(aFila)], cuentasRussell, cuentasRussell6);

      const datosCierre = {
        balancePeriodo: balance.periodo,
        moduloDatoEncabezadoId: vista.id,
        balanceEncabezadoId: balance.id,
        cuentasRussell,
        cuentasRussell6,
        resumenCruceTercero: Prisma.DbNull,
        cuentasConciliacion: Prisma.DbNull,
        subgruposConciliacion: Prisma.DbNull,
        paresDepreciacion: Prisma.DbNull,
        copiaCongelada: copia as unknown as Prisma.InputJsonValue,
        estado: ESTADO_CIERRE_FIRME,
        cerradoPorId: authz.userId,
        cerradoPor: actor,
        cerradoEn: new Date(),
        desbloqueadoPorId: null,
        desbloqueadoPor: null,
        desbloqueadoEn: null,
        justificacionDesbloqueo: null,
      };
      const existente = await tx.conciliacionModuloCierre.findUnique({
        where: { clienteId_moduloCodigo_periodo: { clienteId: vista.clienteId, moduloCodigo: imp.clave, periodo: vista.periodo } },
        select: { id: true },
      });
      const cierre = existente
        ? await tx.conciliacionModuloCierre.update({ where: { id: existente.id }, data: datosCierre, select: { id: true } })
        : await tx.conciliacionModuloCierre.create({ data: { clienteId: vista.clienteId, moduloCodigo: imp.clave, periodo: vista.periodo, ...datosCierre }, select: { id: true } });
      await tx.cuentaBloqueadaConciliacion.deleteMany({ where: { cierreId: cierre.id } });
      if (bloqueadas.length > 0) {
        await tx.cuentaBloqueadaConciliacion.createMany({
          data: bloqueadas.map((b) => ({
            cierreId: cierre.id,
            clienteId: vista.clienteId,
            periodo: balance.periodo,
            cuenta: b.cuenta8,
            cuenta6Russell: b.cuenta6Russell,
            saldoInicial: new Prisma.Decimal(b.saldoInicial.toFixed(2)),
            debitos: new Prisma.Decimal(b.debitos.toFixed(2)),
            creditos: new Prisma.Decimal(b.creditos.toFixed(2)),
            saldoFinal: new Prisma.Decimal(b.saldoFinal.toFixed(2)),
            moduloCodigo: imp.clave,
            moduloDatoEncabezadoId: vista.id,
          })),
        });
      }
      await tx.revisionImpuesto.update({ where: { id: vista.id }, data: { estado: "en_firme" } });
      return { ok: true as const, idempotente: false, cuentas: bloqueadas.length };
    });
    if (!resultado.ok) return resultado;
    if (resultado.idempotente) return { ok: true, message: "La revisión ya estaba en firme." };

    await logAudit({
      user: actor,
      action: `CERRÓ ${imp.nombre.toUpperCase()} (EN FIRME)`,
      entity: `${imp.nombre} · ${vista.nombreCliente} · ${vista.anio} corte ${etiquetaMes(vista.mesCorte)}`,
      detail: `Revisión #${vista.id} · balance #${balance.id} ${balance.descripcion} (${balance.periodo}) · ${resultado.cuentas} cuenta(s) bloqueada(s) · cuentas Russell ${cuentasRussell6.join(", ")} · copia congelada ${copia.huella.slice(0, 12)}`,
      clientId: vista.clienteId,
    });
    revalidatePath(`${rutaDe(imp)}/${vista.id}`);
    revalidatePath(rutaDe(imp));
    revalidatePath(`/balance/${balance.id}`);
    revalidatePath("/balance");
    return { ok: true, message: `Revisión en firme: quedó bloqueado el saldo final de ${resultado.cuentas} cuenta(s) del balance ${balance.periodo}.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("cerrarRevisionImpuesto", e) };
  }
}

/** «Desbloquear» (senior o gerente asignado, `conciliaciones:desbloquear`), con justificación obligatoria. */
export async function desbloquearRevisionImpuesto(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const revisionId = Number(formData.get("revisionId"));
  if (!Number.isSafeInteger(revisionId) || revisionId <= 0) return { ok: false, message: "Revisión inválida." };
  const validacion = validarJustificacionDesbloqueo(String(formData.get("justificacion") ?? ""));
  if (!validacion.ok) return { ok: false, message: validacion.message };

  try {
    const revision = await prisma.revisionImpuesto.findUnique({ where: { id: revisionId } });
    if (!revision) return { ok: false, message: "La revisión no existe." };
    const imp = impuestoDe(revision.impuesto);
    const authz = await autorizarCierreConciliacion("conciliaciones:desbloquear", revision.clienteId);
    if (!authz.ok) return { ok: false, message: authz.message };
    const user = await getCurrentUser();
    const actor = user?.name ?? "Sistema";

    const resultado = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, `conciliacion-cierre:${revision.clienteId}:${imp.clave}:${revision.periodo}`);
      const cierre = await tx.conciliacionModuloCierre.findUnique({
        where: { clienteId_moduloCodigo_periodo: { clienteId: revision.clienteId, moduloCodigo: imp.clave, periodo: revision.periodo } },
        select: { id: true, estado: true, balanceEncabezadoId: true, balancePeriodo: true, cerradoPor: true },
      });
      const actual = await tx.revisionImpuesto.findUnique({ where: { id: revisionId }, select: { estado: true } });
      if (!actual || actual.estado !== "en_firme") return { ok: false as const, message: "La revisión no está en firme." };
      let cuentas = 0;
      if (cierre && cierre.estado === ESTADO_CIERRE_FIRME) {
        cuentas = (await tx.cuentaBloqueadaConciliacion.deleteMany({ where: { cierreId: cierre.id } })).count;
        await tx.conciliacionModuloCierre.update({
          where: { id: cierre.id },
          data: { estado: ESTADO_CIERRE_DESBLOQUEADO, desbloqueadoPorId: authz.userId, desbloqueadoPor: actor, desbloqueadoEn: new Date(), justificacionDesbloqueo: validacion.justificacion },
        });
      }
      await tx.revisionImpuesto.update({ where: { id: revisionId }, data: { estado: "en_proceso" } });
      return { ok: true as const, cuentas, cierre };
    });
    if (!resultado.ok) return resultado;

    await logAudit({
      user: actor,
      action: `DESBLOQUEÓ ${imp.nombre.toUpperCase()}`,
      entity: `${imp.nombre} · ${revision.nombreCliente} · ${revision.anio} corte ${etiquetaMes(revision.mesCorte)}`,
      detail: `Revisión #${revision.id}${resultado.cierre ? ` · balance #${resultado.cierre.balanceEncabezadoId} (${resultado.cierre.balancePeriodo}) · cerró ${resultado.cierre.cerradoPor}` : ""} · ${resultado.cuentas} cuenta(s) liberada(s) · Justificación: ${validacion.justificacion}`,
      clientId: revision.clienteId,
    });
    revalidatePath(`${rutaDe(imp)}/${revision.id}`);
    revalidatePath(rutaDe(imp));
    if (resultado.cierre) revalidatePath(`/balance/${resultado.cierre.balanceEncabezadoId}`);
    revalidatePath("/balance");
    return { ok: true, message: `Revisión desbloqueada: ${resultado.cuentas} cuenta(s) liberada(s). La justificación quedó en la bitácora.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("desbloquearRevisionImpuesto", e) };
  }
}
