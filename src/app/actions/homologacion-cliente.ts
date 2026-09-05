"use server";

// Homologación manual del PUC ACUMULADO del cliente (`/config/mapeo`, vista
// editable completa) contra el plan estándar Russell. A diferencia de
// `asignarCuentaEstandar`/`marcarCuentaPendiente` (que solo tocan el balance
// que se está viendo), aquí el usuario puede decidir, por cada homologación,
// si además de memorizarla para las próximas cargas ("cuentas_cliente"),
// también se APLICA A LOS BALANCES YA CARGADOS (todos los períodos/versiones
// del cliente que no estén congelados). Gate: `balance:crear` (Staff y
// Admin), con alcance por cliente (cartera).
//
// La lógica de migración/memoria vive en `homologacion-cliente-servidor.ts`
// (testeable sin mockear módulos: recibe el cliente Prisma como parámetro).
// Esta acción solo autoriza, valida, ordena los candados y confirma/audita.

import { revalidatePath } from "next/cache";
import * as z from "zod";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { tomarCandadoTransaccion, transaccionSerializable } from "@/lib/concurrency";
import type { AlcanceHomologacion } from "@/lib/balance/alcance-homologacion";
import {
  calcularImpactoHomologacionCliente,
  encabezadosNoCongeladosPorAlcance,
  escribirMemoriaHomologacionCliente,
  filtroDetallePorAlcanceCliente,
  migrarHomologacionClienteEnTransaccion,
  nombreRecienteDetalleCliente,
  normalizarAlcanceHomologacionCliente,
} from "@/lib/balance/homologacion-cliente-servidor";
import type { ActionState } from "@/lib/definitions";

const PATH_MAPEO = "/config/mapeo";
const PATH_BALANCE = "/balance";
const PATH_MODULOS = "/modulos";

const AlcanceSchema = z.enum(["solo", "grupo"], {
  error: "Confirma si deseas homologar solo esta cuenta o todo el grupo.",
});

const GuardarHomologacionSchema = z.object({
  clienteId: z.coerce.number().int().positive(),
  cuentaCliente: z
    .string()
    .trim()
    .regex(/^\d{4,30}$/, { error: "La cuenta del cliente debe tener entre 4 y 30 dígitos." }),
  codigo: z.string().trim().regex(/^\d{6}$/, { error: "Selecciona una cuenta estándar (6 dígitos)." }),
  alcance: AlcanceSchema,
});

/**
 * Homologa manualmente una cuenta del PUC acumulado del cliente contra el plan
 * estándar. SIEMPRE memoriza la regla en `cuentas_cliente` para las próximas
 * cargas; si `aplicarExistentes=1`, además migra los balances YA CARGADOS que
 * no estén congelados (cualquier período/versión), sin tocar montos.
 */
export async function guardarHomologacionCliente(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = GuardarHomologacionSchema.safeParse({
    clienteId: formData.get("clienteId"),
    cuentaCliente: formData.get("cuentaCliente"),
    codigo: formData.get("codigo"),
    alcance: formData.get("alcance"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { clienteId, cuentaCliente, codigo } = parsed.data;
  const alcanceSolicitado = parsed.data.alcance;
  // Ausente (checkbox sin marcar) = false; solo "1" activa la migración.
  const aplicarExistentes = formData.get("aplicarExistentes") === "1";

  const normalizado = normalizarAlcanceHomologacionCliente(cuentaCliente, alcanceSolicitado);
  if (!normalizado.ok) return { ok: false, message: normalizado.message };
  const { alcance, codigoMemoria, origen, propagaGrupo } = normalizado;

  // Alcance de escritura sobre el cliente (cartera), antes de cualquier lectura.
  const scope = await authorizePermiso("balance:crear", { clientId: clienteId });
  if (!scope.ok) return { ok: false, message: scope.message };

  try {
    const [cliente, standard] = await Promise.all([
      prisma.client.findUnique({ where: { id: clienteId }, select: { name: true, nit: true } }),
      prisma.standardAccount.findUnique({ where: { code: codigo }, select: { code: true } }),
    ]);
    if (!cliente) return { ok: false, message: "El cliente seleccionado ya no existe." };
    if (!standard) return { ok: false, message: "La cuenta estándar seleccionada no existe." };

    const user = await getCurrentUser();
    const actualizadoPor = user?.name ?? null;

    const resultado = await transaccionSerializable(async (tx) => {
      // Mismo candado y mismo orden que usa la carga (`persistirCargue`) para
      // escribir el PUC del cliente: primero PUC, luego (si aplica) el/los
      // período(s) del balance oficial — coherente con cómo se serializa hoy
      // una carga nueva contra una homologación manual.
      await tomarCandadoTransaccion(tx, `balance-puc:${clienteId}`);

      let encabezados: { id: number; periodo: string; loteId: string | null }[] = [];
      if (aplicarExistentes) {
        // Descubre los períodos dentro de cada intento de la transacción: una
        // lista anterior al candado podría omitir un balance recién cargado.
        const candidatos = await encabezadosNoCongeladosPorAlcance(tx, { clienteId, alcance, codigoMemoria, cuentaCliente });
        const periodos = [...new Set(candidatos.map((e) => e.periodo))].sort();
        // Orden determinístico (ascendente) entre transacciones concurrentes
        // de esta misma acción sobre el mismo cliente, para no generar
        // deadlocks cruzados por tomar los candados de período en órdenes
        // distintos.
        for (const periodo of periodos) {
          await tomarCandadoTransaccion(tx, `balance-oficial:${clienteId}:${periodo}`);
        }
        // Revalida bajo los candados qué encabezados siguen sin
        // congelar (un `freezeBalance` concurrente comparte este mismo
        // candado de período). Solo se conservan los de un período
        // efectivamente bloqueado por esta transacción.
        const periodosBloqueados = new Set(periodos);
        const frescos = await encabezadosNoCongeladosPorAlcance(tx, {
          clienteId,
          alcance,
          codigoMemoria,
          cuentaCliente,
        });
        encabezados = frescos.filter((e) => periodosBloqueados.has(e.periodo));
      }

      const migracion = aplicarExistentes
        ? await migrarHomologacionClienteEnTransaccion(tx, { codigo, alcance, codigoMemoria, cuentaCliente, encabezados })
        : { filasActualizadas: 0, filasTerceroActualizadas: 0, encabezadosActualizados: 0 };

      const nombreDetectado = await nombreRecienteDetalleCliente(tx, { clienteId, alcance, codigoMemoria, cuentaCliente });
      const nombre = nombreDetectado || codigoMemoria;

      const memoria = await escribirMemoriaHomologacionCliente(tx, {
        clienteId,
        clientName: cliente.name,
        nit: cliente.nit,
        codigoMemoria,
        codigo,
        origen,
        propagaGrupo,
        actualizadoPor,
        nombre,
      });

      // Congelados que quedaron siempre fuera (informativo para el mensaje),
      // bajo el mismo candado de PUC que ya sostiene esta transacción. Cuenta
      // directa (no reutiliza `calcularImpactoHomologacionCliente`: a esta
      // altura la memoria ya reescribió las excepciones del grupo, así que ese
      // otro campo del impacto ya no reflejaría el estado previo al guardado).
      const filtroCongelados = filtroDetallePorAlcanceCliente(alcance, codigoMemoria, cuentaCliente);
      const congelados = await tx.balancePruebaEncabezado.count({
        where: { clienteId, estaCongelado: true, detalles: { some: filtroCongelados } },
      });

      return {
        ok: true as const,
        encabezadosIds: encabezados.map((e) => e.id),
        ...migracion,
        congelados,
        excepcionesAfectadas: memoria.excepcionesAfectadas,
      };
    }, { timeoutMs: 60_000 });

    const detalleAlcance = alcance === "grupo" ? `${codigoMemoria} (grupo)` : `${cuentaCliente} (solo esta cuenta)`;
    const partesDetalle = [`${detalleAlcance} → ${codigo}`];
    if (aplicarExistentes) {
      partesDetalle.push(`${resultado.encabezadosActualizados} balance(s)/${resultado.filasActualizadas} fila(s) migrado(s)`);
      if (resultado.filasTerceroActualizadas > 0) partesDetalle.push(`${resultado.filasTerceroActualizadas} fila(s) de tercero`);
      if (resultado.congelados > 0) partesDetalle.push(`${resultado.congelados} balance(s) congelado(s) omitido(s)`);
    } else {
      partesDetalle.push("solo memoria (sin migrar balances ya cargados)");
    }
    if (resultado.excepcionesAfectadas > 0) partesDetalle.push(`${resultado.excepcionesAfectadas} excepción(es) de cuenta pisada(s) por la regla del grupo`);

    await logAudit({
      user: actualizadoPor ?? "Sistema",
      action: "HOMOLOGÓ CUENTA CLIENTE (PUC)",
      entity: codigoMemoria,
      detail: partesDetalle.join(" · "),
      clientId: clienteId,
    });

    revalidatePath(PATH_MAPEO);
    revalidatePath(PATH_BALANCE, "layout");
    for (const id of resultado.encabezadosIds) revalidatePath(`/balance/${id}`);
    revalidatePath(PATH_MODULOS, "layout");

    const mensaje = aplicarExistentes
      ? `${resultado.encabezadosActualizados} balance(s) (${resultado.filasActualizadas} fila(s)) actualizados a ${codigo}.` +
        (resultado.congelados > 0
          ? ` ${resultado.congelados} balance(s) congelado(s) no se modificaron.`
          : "") +
        " Se recordará para las próximas cargas del cliente."
      : `Regla guardada para las próximas cargas del cliente (${codigoMemoria} → ${codigo}). No se modificó ningún balance ya cargado.`;

    return { ok: true, message: mensaje };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarHomologacionCliente", e) };
  }
}

const ConsultarImpactoSchema = z.object({
  clienteId: z.coerce.number().int().positive(),
  cuentaCliente: z
    .string()
    .trim()
    .regex(/^\d{4,30}$/, { error: "La cuenta del cliente debe tener entre 4 y 30 dígitos." }),
  alcance: AlcanceSchema,
});

export type ImpactoHomologacionClienteResultado =
  | { ok: true; balances: number; filas: number; congelados: number; excepciones: number }
  | { ok: false; message: string };

/**
 * Preview de SOLO LECTURA para el modal de homologación: cuántos balances/
 * filas ya cargados coinciden con la cuenta/grupo (y cuántos quedarían fuera
 * por estar congelados), antes de que el usuario decida `aplicarExistentes`.
 * No muta nada.
 */
export async function consultarImpactoHomologacionCliente(input: {
  clienteId: number;
  cuentaCliente: string;
  alcance: AlcanceHomologacion;
}): Promise<ImpactoHomologacionClienteResultado> {
  const authz = await authorizePermiso("balance:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = ConsultarImpactoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { clienteId, cuentaCliente } = parsed.data;
  const alcanceSolicitado = parsed.data.alcance;

  const scope = await authorizePermiso("balance:crear", { clientId: clienteId });
  if (!scope.ok) return { ok: false, message: scope.message };

  const normalizado = normalizarAlcanceHomologacionCliente(cuentaCliente, alcanceSolicitado);
  if (!normalizado.ok) return { ok: false, message: normalizado.message };

  try {
    const impacto = await calcularImpactoHomologacionCliente(prisma, {
      clienteId,
      alcance: normalizado.alcance,
      codigoMemoria: normalizado.codigoMemoria,
      cuentaCliente,
    });
    return { ok: true, ...impacto };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("consultarImpactoHomologacionCliente", e) };
  }
}
