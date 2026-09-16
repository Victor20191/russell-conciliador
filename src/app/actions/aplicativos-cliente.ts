"use server";

// Aplicativos (ERP) del cliente vistos desde la CARGA de un módulo: qué aplicativos tiene el
// cliente en el campo del módulo (Contabilidad para Cartera, CxP e Ingresos) y el alta del que
// el analista confirme para el archivo. Si el cliente no lo tenía, se agrega a su ficha: queda
// «usando dos». «Otro» crea el aplicativo en el catálogo; «Archivo manual» es uno más del catálogo.
import { revalidatePath } from "next/cache";
import * as z from "zod";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mensajeErrorBD } from "@/lib/errores";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { ERP_MANUAL_CODE, nombreProcesoErp, procesoErpDeModulo, type CodigoProcesoErp } from "@/lib/erp-procesos";
import { resolverErp } from "@/lib/import/erp-sector-alias";

export type AplicativoOpcion = { id: number; nombre: string; manual: boolean };

export type AplicativosCargaModulo = {
  ok: boolean;
  message?: string;
  /** Nombre del campo de la ficha que usa el módulo («Contabilidad», «Nómina»…). */
  campoNombre?: string;
  delCliente: AplicativoOpcion[];
  /** Aplicativos activos del catálogo (incluye «Archivo manual»). */
  catalogo: AplicativoOpcion[];
};

type ErpFila = { id: number; code: string; name: string };
const opcion = (erp: ErpFila): AplicativoOpcion => ({ id: erp.id, nombre: erp.name, manual: erp.code === ERP_MANUAL_CODE });

function procesoDelModulo(moduloCodigo: string): CodigoProcesoErp | null {
  const codigo = String(moduloCodigo ?? "").trim().toUpperCase();
  return descriptorModulo(codigo) ? procesoErpDeModulo(codigo) : null;
}

export async function listarAplicativosCargaModulo(clienteId: number, moduloCodigo: string): Promise<AplicativosCargaModulo> {
  const vacio: AplicativosCargaModulo = { ok: false, delCliente: [], catalogo: [] };
  const proceso = procesoDelModulo(moduloCodigo);
  if (!proceso) return { ...vacio, message: "Módulo no soportado." };
  const cid = Number(clienteId);
  if (!Number.isInteger(cid) || cid <= 0) return { ...vacio, message: "Cliente inválido." };
  const authz = await authorizePermiso("modulos_datos:crear", { clientId: cid, modo: "lectura" });
  if (!authz.ok) return { ...vacio, message: authz.message };
  try {
    const [asignaciones, catalogo] = await Promise.all([
      prisma.clientErpProcess.findMany({
        where: { clientId: cid, process: { code: proceso } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { erp: { select: { id: true, code: true, name: true } } },
      }),
      prisma.erp.findMany({
        where: { active: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: { id: true, code: true, name: true },
      }),
    ]);
    return {
      ok: true,
      campoNombre: nombreProcesoErp(proceso),
      delCliente: asignaciones.map((asignacion) => opcion(asignacion.erp)),
      catalogo: catalogo.map(opcion),
    };
  } catch (e) {
    return { ...vacio, message: mensajeErrorBD("listarAplicativosCargaModulo", e) };
  }
}

const ConfirmarAplicativoSchema = z
  .object({
    clienteId: z.number().int().positive(),
    moduloCodigo: z.string().trim().min(1).max(20),
    erpId: z.number().int().positive().optional(),
    erpNuevo: z.string().trim().min(2, "Escribe el nombre del aplicativo.").max(80, "El nombre del aplicativo es demasiado largo.").optional(),
  })
  .refine((d) => (d.erpId != null) !== (d.erpNuevo != null), "Elige un aplicativo o escribe su nombre.");

export type ResultadoConfirmarAplicativo = {
  ok: boolean;
  message?: string;
  aplicativo?: AplicativoOpcion;
  /** El aplicativo no estaba en la ficha del cliente y se agregó. */
  agregado?: boolean;
  /** «Otro»: el aplicativo no existía y se creó en el catálogo. */
  creado?: boolean;
};

class ErrorAplicativo extends Error {}

export async function confirmarAplicativoCargaModulo(
  entrada: z.input<typeof ConfirmarAplicativoSchema>,
): Promise<ResultadoConfirmarAplicativo> {
  const permiso = await authorizePermiso("modulos_datos:crear");
  if (!permiso.ok) return { ok: false, message: permiso.message };
  const validacion = ConfirmarAplicativoSchema.safeParse(entrada);
  if (!validacion.success) return { ok: false, message: validacion.error.issues[0]?.message ?? "Elige el aplicativo del archivo." };
  const datos = validacion.data;
  const proceso = procesoDelModulo(datos.moduloCodigo);
  if (!proceso) return { ok: false, message: "Módulo no soportado." };
  // Agregar un aplicativo a la ficha es escribir sobre el cliente: exige alcance de escritura.
  const alcance = await authorizePermiso("modulos_datos:crear", { clientId: datos.clienteId });
  if (!alcance.ok) return { ok: false, message: alcance.message };

  try {
    const user = await getCurrentUser();
    const resultado = await prisma.$transaction(async (tx) => {
      const [cliente, procesoFila] = await Promise.all([
        tx.client.findUnique({ where: { id: datos.clienteId }, select: { name: true, erpId: true } }),
        tx.erpProcess.findUnique({ where: { code: proceso }, select: { id: true, active: true } }),
      ]);
      if (!cliente) throw new ErrorAplicativo("El cliente seleccionado ya no existe.");
      if (!procesoFila?.active) throw new ErrorAplicativo("El campo de aplicativo del módulo no está disponible todavía.");

      let erp: ErpFila;
      let creado = false;
      if (datos.erpNuevo != null) {
        const referencia = resolverErp(datos.erpNuevo);
        if (!referencia) throw new ErrorAplicativo("Escribe el nombre del aplicativo.");
        const existente = await tx.erp.findUnique({
          where: { code: referencia.code },
          select: { id: true, code: true, name: true, active: true },
        });
        if (existente && !existente.active) throw new ErrorAplicativo(`El aplicativo ${existente.name} está inactivo en el catálogo.`);
        erp = existente ?? await tx.erp.create({
          data: { code: referencia.code, name: referencia.name },
          select: { id: true, code: true, name: true },
        });
        creado = existente == null;
      } else {
        const elegido = await tx.erp.findUnique({
          where: { id: datos.erpId },
          select: { id: true, code: true, name: true, active: true },
        });
        if (!elegido?.active) throw new ErrorAplicativo("Elige un aplicativo activo del catálogo.");
        erp = elegido;
      }

      const yaAsignado = await tx.clientErpProcess.findUnique({
        where: { clientId_processId_erpId: { clientId: datos.clienteId, processId: procesoFila.id, erpId: erp.id } },
        select: { id: true },
      });
      if (!yaAsignado) {
        await tx.clientErpProcess.create({
          data: { clientId: datos.clienteId, processId: procesoFila.id, erpId: erp.id, status: "confirmado", source: "carga" },
        });
        // El ERP «único» legado del cliente es el primero de Contabilidad.
        if (proceso === "CONT" && cliente.erpId == null) {
          await tx.client.update({ where: { id: datos.clienteId }, data: { erpId: erp.id } });
        }
      }
      return { cliente: cliente.name, erp, creado, agregado: !yaAsignado };
    });

    if (resultado.agregado || resultado.creado) {
      await logAudit({
        user: user?.name ?? "Sistema",
        action: "AGREGÓ APLICATIVO DESDE LA CARGA",
        entity: resultado.cliente,
        detail: `${resultado.erp.name} en ${nombreProcesoErp(proceso)} (módulo ${datos.moduloCodigo.toUpperCase()})${resultado.creado ? " · creado en el catálogo" : ""}`,
        clientId: datos.clienteId,
      });
      revalidatePath("/config/clientes");
      if (resultado.creado) revalidatePath("/config/maestros");
    }
    return { ok: true, aplicativo: opcion(resultado.erp), agregado: resultado.agregado, creado: resultado.creado };
  } catch (e) {
    if (e instanceof ErrorAplicativo) return { ok: false, message: e.message };
    return { ok: false, message: mensajeErrorBD("confirmarAplicativoCargaModulo", e) };
  }
}
