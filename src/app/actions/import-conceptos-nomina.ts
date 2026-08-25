"use server";

// Carga MASIVA de los conceptos de nómina (cliente / código / concepto / cuenta).
//
// Escribe en `consolidacion_modulo_cliente` del módulo NOM, que es la misma tabla que
// alimenta la pestaña «Consolidado» y el cruce contable: el CÓDIGO del concepto queda
// como `clasificador` (la llave con la que se homologa el archivo de nómina), el nombre
// del concepto como `descripcion` y cada cuenta de 4 dígitos como una fila.
//
// Reglas del cargue:
//  - Todo o nada: si una sola fila falla (cliente inexistente, cuenta ajena al módulo,
//    código repetido), no se escribe nada.
//  - Cada concepto REEMPLAZA sus cuentas anteriores; los conceptos que el archivo no
//    menciona quedan intactos (la carga no borra lo que no nombra).
//  - Alcance por cliente: se exige `modulos_datos:editar` sobre CADA cliente del archivo.

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mensajeErrorBD } from "@/lib/errores";
import { claveNit } from "@/lib/nit";
import { normalizar } from "@/lib/import/xlsx";
import type { ErrorImport } from "@/lib/import/maestros";
import {
  parseConceptosNominaWorkbook,
  HOJA_CONCEPTOS,
  MODULO_CONCEPTOS_NOMINA,
  type FilaConceptoNomina,
  type ImportConceptosNominaState,
} from "@/lib/import/conceptos-nomina";
import { cuenta4DelModulo, prefijosCuentaModulo } from "@/lib/modulos/cuentas-modulo";
import { getCatalogoPrevalidador } from "@/lib/parametros/prevalidador";

const PATH = "/config/conceptos-nomina";
const RUTA_MODULO = `/modulos/${MODULO_CONCEPTOS_NOMINA.toLowerCase()}`;
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

type FilaResuelta = FilaConceptoNomina & { clienteId: number; nombreCliente: string };

export async function importarConceptosNomina(
  _prev: ImportConceptosNominaState,
  formData: FormData,
): Promise<ImportConceptosNominaState> {
  const authz = await authorizePermiso("modulos_datos:editar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, message: "Adjunta el archivo Excel de conceptos (.xlsx)." };
  }
  if (archivo.size > MAX_BYTES) return { ok: false, message: "El archivo supera 4 MB." };

  try {
    const { filas, errores } = await parseConceptosNominaWorkbook(await archivo.arrayBuffer());
    if (errores.length > 0) {
      return {
        ok: false,
        message: `${errores.length} error(es) de formato. Corrige el archivo y reinténtalo.`,
        errores,
      };
    }
    if (filas.length === 0) {
      return { ok: false, message: "No hay conceptos para importar (¿quedaron solo los ejemplos?)." };
    }

    // ---- Resolver el cliente de cada fila (por NIT o por código) ----
    const clientes = await prisma.client.findMany({ select: { id: true, code: true, name: true, nit: true } });
    const porNit = new Map<string, { id: number; name: string }>();
    const porCodigo = new Map<string, { id: number; name: string }>();
    for (const c of clientes) {
      const nit = claveNit(c.nit);
      if (nit) porNit.set(nit, { id: c.id, name: c.name });
      porCodigo.set(normalizar(c.code), { id: c.id, name: c.name });
    }

    const problemas: ErrorImport[] = [];
    const resueltas: FilaResuelta[] = [];
    for (const f of filas) {
      const digitos = claveNit(f.cliente);
      const cliente = (digitos ? porNit.get(digitos) : undefined) ?? porCodigo.get(normalizar(f.cliente));
      if (!cliente) {
        problemas.push({
          hoja: HOJA_CONCEPTOS,
          fila: f.fila,
          mensaje: `No existe un cliente con NIT o código «${f.cliente}».`,
        });
        continue;
      }
      resueltas.push({ ...f, clienteId: cliente.id, nombreCliente: cliente.name });
    }

    // ---- Cuentas: 4 dígitos y del módulo de Nómina ----
    const prefijos = prefijosCuentaModulo(MODULO_CONCEPTOS_NOMINA, await getCatalogoPrevalidador());
    const listado = prefijos.length ? prefijos.join(", ") : "—";
    for (const f of resueltas) {
      for (const cuenta of f.cuentas4) {
        if (!cuenta4DelModulo(cuenta, prefijos)) {
          problemas.push({
            hoja: HOJA_CONCEPTOS,
            fila: f.fila,
            mensaje: `La cuenta ${cuenta} no pertenece al módulo de Nómina. Usa una cuenta de estos prefijos: ${listado}.`,
          });
        }
      }
    }

    // ---- Alcance de escritura sobre CADA cliente del archivo (fail-closed) ----
    const clienteIds = [...new Set(resueltas.map((f) => f.clienteId))];
    const alcance = await Promise.all(
      clienteIds.map(async (clienteId) => ({
        clienteId,
        ok: (await authorizePermiso("modulos_datos:editar", { clientId: clienteId })).ok,
      })),
    );
    const sinAlcance = new Set(alcance.filter((a) => !a.ok).map((a) => a.clienteId));
    for (const f of resueltas) {
      if (sinAlcance.has(f.clienteId)) {
        problemas.push({
          hoja: HOJA_CONCEPTOS,
          fila: f.fila,
          mensaje: `No tienes permiso para configurar «${f.nombreCliente}».`,
        });
      }
    }

    if (problemas.length > 0) {
      return {
        ok: false,
        message: `${problemas.length} problema(s) encontrados. No se importó nada.`,
        errores: problemas,
      };
    }

    // ---- Cuántos ya existían (para el resumen del modal) ----
    const previas = await prisma.consolidacionModuloCliente.findMany({
      where: {
        moduloCodigo: MODULO_CONCEPTOS_NOMINA,
        clienteId: { in: clienteIds },
        clasificador: { in: [...new Set(resueltas.map((f) => f.codigo))] },
      },
      select: { clienteId: true, clasificador: true },
    });
    const yaExistian = new Set(previas.map((p) => `${p.clienteId}|${p.clasificador}`));
    const actualizados = resueltas.filter((f) => yaExistian.has(`${f.clienteId}|${f.codigo}`)).length;

    // ---- Escritura: cada concepto reemplaza su conjunto de cuentas ----
    const user = await getCurrentUser();
    const actor = user?.name ?? null;
    await prisma.$transaction(
      resueltas.flatMap((f) => [
        prisma.consolidacionModuloCliente.deleteMany({
          where: {
            clienteId: f.clienteId,
            moduloCodigo: MODULO_CONCEPTOS_NOMINA,
            clasificador: f.codigo,
          },
        }),
        prisma.consolidacionModuloCliente.createMany({
          data: f.cuentas4.map((cuenta4) => ({
            clienteId: f.clienteId,
            moduloCodigo: MODULO_CONCEPTOS_NOMINA,
            clasificador: f.codigo,
            descripcion: f.concepto,
            cuenta4,
            actualizadoPor: actor,
          })),
        }),
      ]),
    );

    const cuentas = resueltas.reduce((n, f) => n + f.cuentas4.length, 0);
    await logAudit({
      user: actor ?? "Sistema",
      action: "IMPORTÓ conceptos de nómina",
      entity: clienteIds.length === 1 ? resueltas[0].nombreCliente : `${clienteIds.length} clientes`,
      detail: `${resueltas.length} concepto(s) · ${cuentas} cuenta(s) · ${actualizados} actualizado(s)`,
      clientId: clienteIds.length === 1 ? clienteIds[0] : undefined,
    });

    revalidatePath(PATH);
    revalidatePath(RUTA_MODULO);

    return {
      ok: true,
      message: `${resueltas.length} concepto(s) importados.`,
      resumen: { clientes: clienteIds.length, conceptos: resueltas.length, cuentas, actualizados },
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("importarConceptosNomina", e) };
  }
}

/** Borra un concepto (todas sus cuentas) de un cliente. */
export async function eliminarConceptoNomina(input: {
  clienteId: number;
  codigo: string;
}): Promise<{ ok: boolean; message: string }> {
  const authz = await authorizePermiso("modulos_datos:editar", { clientId: input.clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };
  const codigo = String(input.codigo ?? "").trim();
  if (!codigo) return { ok: false, message: "Indica el código del concepto." };

  try {
    const { count } = await prisma.consolidacionModuloCliente.deleteMany({
      where: { clienteId: input.clienteId, moduloCodigo: MODULO_CONCEPTOS_NOMINA, clasificador: codigo },
    });
    if (count === 0) return { ok: false, message: "El concepto ya no existe." };

    const [user, cliente] = await Promise.all([
      getCurrentUser(),
      prisma.client.findUnique({ where: { id: input.clienteId }, select: { name: true } }),
    ]);
    await logAudit({
      user: user?.name ?? "Sistema",
      action: "ELIMINÓ concepto de nómina",
      entity: cliente?.name ?? `Cliente ${input.clienteId}`,
      detail: `${codigo} · ${count} cuenta(s)`,
      clientId: input.clienteId,
    });

    revalidatePath(PATH);
    revalidatePath(RUTA_MODULO);
    return { ok: true, message: "Concepto eliminado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarConceptoNomina", e) };
  }
}
