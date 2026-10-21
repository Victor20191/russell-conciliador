import "server-only";

// «Patrones manuales» del cliente (21/Oct/2026): lecturas y escritura de `perfiles_carga_modulo`.
// La lógica (llave, coincidencia, qué hacer al confirmar) vive en `formatos-manuales.ts`, puro.
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { tomarCandadoTransaccion, transaccionSerializable, type TransactionClient } from "@/lib/concurrency";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import type { DescriptorModulo } from "./descriptores";
import {
  debeGuardarFormatoManual,
  planFormatoManual,
  specDeFormato,
  type EstadoFormatoManual,
  type FormatoManualBorrador,
  type FormatoManualGuardado,
  type PropuestaFormatoManual,
} from "./formatos-manuales";
import { normalizarSpecModulo, resumenColumnasModulo } from "./perfil-modulo";

const SELECT_FORMATO = {
  id: true, huella: true, encabezadoJson: true, specJson: true, archivoEjemplo: true, vecesUsado: true,
  ultimoUsoEn: true, guardadoEn: true, guardadoPor: true, creadoEn: true, creadoPor: true,
} as const;

type FilaFormato = Prisma.PerfilCargaModuloGetPayload<{ select: typeof SELECT_FORMATO }>;

const aFormato = (f: FilaFormato): FormatoManualGuardado => ({
  id: f.id,
  huella: f.huella,
  encabezado: Array.isArray(f.encabezadoJson) ? (f.encabezadoJson as unknown[]) : null,
  specJson: f.specJson,
  archivoEjemplo: f.archivoEjemplo,
  vecesUsado: f.vecesUsado,
  ultimoUsoEn: f.ultimoUsoEn,
  guardadoEn: f.guardadoEn,
  guardadoPor: f.guardadoPor,
  creadoEn: f.creadoEn,
  creadoPor: f.creadoPor,
});

/** Los patrones manuales del cliente en un módulo. */
export async function formatosManualesDelCliente(
  clienteId: number,
  moduloCodigo: string,
  db: Pick<TransactionClient, "perfilCargaModulo"> = prisma,
): Promise<FormatoManualGuardado[]> {
  const filas = await db.perfilCargaModulo.findMany({ where: { clienteId, moduloCodigo }, select: SELECT_FORMATO });
  return filas.map(aFormato);
}

/** Lo que el borrador muestra junto a la casilla «Guardar este patrón manual para {cliente}». */
export async function formatoManualDelBorrador(
  descriptor: DescriptorModulo,
  clienteId: number,
  clienteNombre: string,
  propuesta: PropuestaFormatoManual,
): Promise<FormatoManualBorrador> {
  const plan = planFormatoManual(descriptor, propuesta, await formatosManualesDelCliente(clienteId, descriptor.codigo));
  return {
    estado: plan.estado,
    cliente: clienteNombre,
    motivo: plan.motivo,
    existente: plan.existente
      ? {
          archivoEjemplo: plan.existente.archivoEjemplo,
          guardadoEn: (plan.existente.guardadoEn ?? plan.existente.creadoEn).toISOString(),
          guardadoPor: plan.existente.guardadoPor ?? plan.existente.creadoPor,
        }
      : null,
  };
}

export type ResultadoGuardadoFormato = {
  estado: EstadoFormatoManual;
  /** Qué se hizo; null = nada (casilla desmarcada o no guardable). */
  hecho: "creó" | "sumó un uso" | "reemplazó" | "actualizó" | null;
};

/**
 * Guarda (o cuenta el uso de) el patrón manual al CONFIRMAR un cargue con «Archivo manual». Con el
 * candado `formato-manual:{cliente}:{módulo}` decide sobre lo guardado en ese instante. Título,
 * mapeo y archivo de ejemplo se escriben siempre juntos: los números de columna del mapeo apuntan a
 * ese encabezado. «Guardado el / por» cambia solo cuando cambia el mapeo.
 */
export async function guardarFormatoManualConfirmado(args: {
  descriptor: DescriptorModulo;
  clienteId: number;
  propuesta: PropuestaFormatoManual;
  archivoEjemplo: string | null;
  casilla: unknown;
  usuario: { id: number; name: string } | null;
}): Promise<ResultadoGuardadoFormato> {
  const { descriptor, clienteId, propuesta } = args;
  const moduloCodigo = descriptor.codigo;
  return transaccionSerializable(async (tx) => {
    await tomarCandadoTransaccion(tx, `formato-manual:${clienteId}:${moduloCodigo}`);
    const plan = planFormatoManual(descriptor, propuesta, await formatosManualesDelCliente(clienteId, moduloCodigo, tx));
    if (!plan.accion || !plan.huella || !debeGuardarFormatoManual(plan.estado, args.casilla)) return { estado: plan.estado, hecho: null };
    const ahora = new Date();
    const spec = normalizarSpecModulo(descriptor, propuesta.spec) as Prisma.InputJsonValue;
    const guardado = { guardadoEn: ahora, guardadoPor: args.usuario?.name ?? null, guardadoPorId: args.usuario?.id ?? null };
    const contenido = {
      huella: plan.huella,
      encabezadoJson: propuesta.encabezado as Prisma.InputJsonValue,
      specJson: spec,
      archivoEjemplo: args.archivoEjemplo,
      origen: "manual",
    };
    const crear = async (): Promise<ResultadoGuardadoFormato> => {
      await tx.perfilCargaModulo.create({
        data: {
          clienteId, moduloCodigo, ...contenido, ...guardado, vecesUsado: 1, ultimoUsoEn: ahora,
          creadoPor: args.usuario?.name ?? null, creadoPorId: args.usuario?.id ?? null,
        },
      });
      return { estado: plan.estado, hecho: "creó" };
    };

    if (plan.accion.tipo === "crear") return crear();
    if (plan.accion.tipo === "sumar_uso") {
      // Solo el uso: el mapeo guardado no se toca. Si lo borraron en este instante, no pasa nada.
      await tx.perfilCargaModulo.updateMany({ where: { id: plan.accion.id }, data: { vecesUsado: { increment: 1 }, ultimoUsoEn: ahora } });
      return { estado: plan.estado, hecho: "sumó un uso" };
    }
    const actualizado = await tx.perfilCargaModulo.updateMany({
      where: { id: plan.accion.id },
      data: { ...contenido, ...(plan.accion.cambiaMapeo ? guardado : {}), vecesUsado: { increment: 1 }, ultimoUsoEn: ahora },
    });
    // Borrado mientras tanto: quien confirmó pidió guardarlo, así que se crea de nuevo.
    if (actualizado.count !== 1) return crear();
    return { estado: plan.estado, hecho: plan.accion.cambiaMapeo ? "reemplazó" : "actualizó" };
  });
}

/** Un patrón manual en la pestaña «Patrones manuales» del módulo. */
export type FormatoManualVm = {
  id: number;
  titulos: string[];
  /** Perfil anterior: sin títulos guardados, solo se reconoce por la huella exacta. */
  anterior: boolean;
  hojaEjemplo: string | null;
  resumenColumnas: string;
  archivoEjemplo: string | null;
  guardadoEn: string;
  guardadoPor: string | null;
  vecesUsado: number;
  ultimoUsoEn: string | null;
};

export type ClienteFormatosManualesVm = { clienteId: number; cliente: string; nit: string | null; formatos: FormatoManualVm[] };

/** Patrones manuales del módulo, agrupados por cliente, dentro del alcance de quien consulta. */
export async function listarFormatosManualesDeModulo(descriptor: DescriptorModulo): Promise<ClienteFormatosManualesVm[]> {
  const alcance = await alcanceLecturaUsuario();
  const filas = await prisma.perfilCargaModulo.findMany({
    where: { moduloCodigo: descriptor.codigo, ...(alcance.todos ? {} : { clienteId: { in: alcance.clientIds } }) },
    select: { ...SELECT_FORMATO, clienteId: true },
  });
  if (filas.length === 0) return [];
  const clientes = await prisma.client.findMany({ where: { id: { in: [...new Set(filas.map((f) => f.clienteId))] } }, select: { id: true, name: true, nit: true } });
  const porCliente = new Map<number, ClienteFormatosManualesVm>();
  for (const cliente of clientes) porCliente.set(cliente.id, { clienteId: cliente.id, cliente: cliente.name, nit: cliente.nit, formatos: [] });
  const recientes = [...filas].sort((a, b) => (b.ultimoUsoEn ?? b.guardadoEn ?? b.creadoEn).getTime() - (a.ultimoUsoEn ?? a.guardadoEn ?? a.creadoEn).getTime());
  for (const fila of recientes) {
    const grupo = porCliente.get(fila.clienteId);
    if (!grupo) continue;
    const formato = aFormato(fila);
    const spec = specDeFormato(descriptor, formato);
    grupo.formatos.push({
      id: formato.id,
      titulos: (formato.encabezado ?? []).map((t) => String(t ?? "").trim()).filter(Boolean),
      anterior: formato.encabezado == null,
      hojaEjemplo: spec?.hoja ?? null,
      resumenColumnas: spec ? resumenColumnasModulo(descriptor, spec) : "Mapeo ilegible",
      archivoEjemplo: formato.archivoEjemplo,
      guardadoEn: (formato.guardadoEn ?? formato.creadoEn).toISOString(),
      guardadoPor: formato.guardadoPor ?? formato.creadoPor,
      vecesUsado: formato.vecesUsado,
      ultimoUsoEn: formato.ultimoUsoEn?.toISOString() ?? null,
    });
  }
  return [...porCliente.values()].filter((g) => g.formatos.length > 0).sort((a, b) => a.cliente.localeCompare(b.cliente, "es"));
}
