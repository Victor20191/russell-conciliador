"use server";

// Comentario de una ALERTA del archivo que lo exige para cerrar la conciliación del módulo
// (`src/lib/modulos/comentarios-alertas.ts`). Uno por tipo de alerta y período: guardarlo de nuevo
// lo reemplaza y vuelve a congelar cómo está hoy la alerta (así se confirma uno «por revisar»).
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mensajeErrorBD } from "@/lib/errores";
import { fmt } from "@/lib/format";
import type { ActionState } from "@/lib/definitions";
import { descriptorModulo, type DescriptorModulo } from "@/lib/modulos/descriptores";
import {
  alertasQueExigenComentario,
  alertasTerceroQueExigenComentario,
  contarAlerta,
  esTipoAlertaComentario,
  validarComentarioAlerta,
  type AlertaComentable,
  type TipoAlertaComentario,
} from "@/lib/modulos/comentarios-alertas";
import { cargarValidacionesTercero, filasValidablesDelCargue } from "@/lib/modulos/comentarios-alertas-servidor";
import { cargarInsumosCruceModulo, construirCruceContableModulo } from "@/lib/modulos/cruce-contable-servidor";
import { cruceTerceroDeCargue } from "@/lib/modulos/cruce-tercero-servidor";
import { autorizarComentarioAlertaModulo, exigirPeriodoAbierto, respuestaPeriodoEnFirme } from "@/lib/conciliacion/verificar-bloqueo";

const OPERACION = "comentar las alertas del archivo";

/**
 * Las alertas del cargue tal como están hoy, recalculadas en el servidor. En Cartera y CxP salen del
 * auxiliar por tercero; solo el saldo contrario necesita el cruce por tercero (el balance), así que
 * solo para él se calcula.
 */
async function alertasActuales(descriptor: DescriptorModulo, encabezadoId: number, tipo: TipoAlertaComentario): Promise<AlertaComentable[]> {
  if (!descriptor.crucePorTercero.detalleTercero) {
    return alertasQueExigenComentario(descriptor, await filasValidablesDelCargue(encabezadoId));
  }
  let cruce = null;
  if (tipo === "saldo_contrario_tercero") {
    const insumos = await cargarInsumosCruceModulo(encabezadoId);
    if (insumos) cruce = (await cruceTerceroDeCargue(insumos, await construirCruceContableModulo(insumos)))?.resumen ?? null;
  }
  const validaciones = await cargarValidacionesTercero(descriptor, encabezadoId, cruce);
  return validaciones ? alertasTerceroQueExigenComentario(descriptor, validaciones) : [];
}

export async function guardarComentarioAlerta(input: { encabezadoId: number; tipo: string; comentario: string }): Promise<ActionState> {
  if (!Number.isSafeInteger(input.encabezadoId)) return { ok: false, message: "Cargue inválido." };
  if (!esTipoAlertaComentario(input.tipo)) return { ok: false, message: "Alerta desconocida." };
  const tipo = input.tipo;

  const encabezado = await prisma.moduloDatoEncabezado.findUnique({
    where: { id: input.encabezadoId },
    select: { id: true, clienteId: true, moduloCodigo: true, periodo: true, nombreCliente: true },
  });
  if (!encabezado) return { ok: false, message: "El cargue ya no existe." };

  const authz = await autorizarComentarioAlertaModulo(encabezado.clienteId);
  if (!authz.ok) return { ok: false, message: authz.message };

  const validado = validarComentarioAlerta(input.comentario);
  if (!validado.ok) return { ok: false, message: validado.message };

  const descriptor = descriptorModulo(encabezado.moduloCodigo);
  if (!descriptor?.alertasConComentario?.includes(tipo)) {
    return { ok: false, message: "Esta alerta no exige comentario en este módulo." };
  }

  try {
    // La alerta se recalcula del detalle en el servidor: lo que se congela es lo que hay hoy.
    const alerta = (await alertasActuales(descriptor, encabezado.id, tipo)).find((a) => a.tipo === tipo);
    if (!alerta) return { ok: false, message: "Esa alerta ya no aparece en el cargue. Recarga la pantalla." };

    const user = await getCurrentUser();
    const previo = await prisma.$transaction(async (tx) => {
      await exigirPeriodoAbierto(tx, encabezado, { operacion: OPERACION, enTransaccion: true });
      const clave = { clienteId: encabezado.clienteId, moduloCodigo: encabezado.moduloCodigo, periodo: encabezado.periodo, tipo };
      const anterior = await tx.comentarioAlertaModulo.findUnique({
        where: { clienteId_moduloCodigo_periodo_tipo: clave },
        select: { comentario: true },
      });
      const datos = {
        comentario: validado.texto,
        referencias: alerta.referencias,
        valor: alerta.valor,
        comentadoPor: user?.name ?? null,
        comentadoPorId: authz.userId,
        comentadoEn: new Date(),
      };
      await tx.comentarioAlertaModulo.upsert({
        where: { clienteId_moduloCodigo_periodo_tipo: clave },
        create: { ...clave, ...datos },
        update: datos,
      });
      return anterior;
    });

    await logAudit({
      user: user?.name ?? "Sistema",
      action: previo ? "EDITÓ COMENTARIO DE ALERTA" : "COMENTÓ ALERTA",
      entity: encabezado.nombreCliente,
      detail: `${encabezado.moduloCodigo} · ${encabezado.periodo} · «${alerta.etiqueta}» (${alerta.detalle ?? contarAlerta(alerta.referencias, alerta.unidad)}${alerta.muestraValor ? `, ${fmt(alerta.valor)}` : ""})`
        + (previo && previo.comentario !== validado.texto ? ` · antes: «${previo.comentario}»` : ""),
      clientId: encabezado.clienteId,
    });
    revalidatePath(`/modulos/${encabezado.moduloCodigo.toLowerCase()}/${encabezado.id}`);
    return { ok: true, message: previo ? "Comentario actualizado." : "Comentario guardado." };
  } catch (e) {
    const enFirme = await respuestaPeriodoEnFirme(e, { entidad: encabezado.nombreCliente });
    if (enFirme) return enFirme;
    return { ok: false, message: mensajeErrorBD("guardarComentarioAlerta", e) };
  }
}
