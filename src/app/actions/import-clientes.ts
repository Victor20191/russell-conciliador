"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mensajeErrorBD } from "@/lib/errores";
import { nextClientCode } from "@/lib/client-code";
import { ROL_POR_FUNCION, ROL_SOCIO } from "@/lib/rbac/jerarquia";
import {
  parseClientesWorkbook,
  type ImportClientesState,
} from "@/lib/import/clientes";
import { normalizar } from "@/lib/import/xlsx";
import type { ErrorImport } from "@/lib/import/maestros";

const PATH = "/config/clientes";
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

type Resuelta = {
  fila: number;
  name: string;
  nit: string;
  tipo: string;
  erp: string;
  sector: string;
  socioId: number;
  gerenteId: number;
  seniorId: number;
  staffIds: number[];
  moduleIds: number[];
  dianFormIds: number[];
};

export async function importarClientes(
  _prev: ImportClientesState,
  formData: FormData,
): Promise<ImportClientesState> {
  const authz = await authorizePermiso("clientes:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  // Parametrizar módulos/DIAN exige el mismo permiso de configuración que al crear.
  const configAuthz = await authorizePermiso("clientes:configurar");
  if (!configAuthz.ok) return { ok: false, message: configAuthz.message };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, message: "Adjunta el archivo Excel de clientes (.xlsx)." };
  }
  if (archivo.size > MAX_BYTES) return { ok: false, message: "El archivo supera 4 MB." };

  try {
    const { filas, errores } = await parseClientesWorkbook(await archivo.arrayBuffer());
    if (errores.length > 0) {
      return {
        ok: false,
        message: `${errores.length} error(es) de formato. Corrige el archivo y reinténtalo.`,
        errores,
      };
    }
    if (filas.length === 0) {
      return { ok: false, message: "No hay filas para importar (¿quedaron solo los ejemplos?)." };
    }

    // ---- Catálogos para resolver nombres/códigos ----
    const [usuarios, aristasBD, modulos, dianForms, clientes] = await Promise.all([
      prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true } }),
      prisma.userHierarchy.findMany({ select: { superiorId: true, subordinateId: true } }),
      prisma.module.findMany({ select: { id: true, name: true } }),
      prisma.dianForm.findMany({ select: { id: true, code: true } }),
      prisma.client.findMany({ select: { code: true, nit: true } }),
    ]);

    // Nombre (normalizado) → ids, por rol. Detecta homónimos (ambigüedad).
    const porRolNombre = new Map<string, Map<string, number[]>>();
    for (const u of usuarios) {
      if (!porRolNombre.has(u.role)) porRolNombre.set(u.role, new Map());
      const m = porRolNombre.get(u.role)!;
      const key = normalizar(u.name);
      const arr = m.get(key) ?? [];
      arr.push(u.id);
      m.set(key, arr);
    }
    const resolver = (rol: string, nombre: string): { id?: number; err?: string } => {
      const ids = porRolNombre.get(rol)?.get(normalizar(nombre));
      if (!ids || ids.length === 0) return { err: `no existe un ${rol} activo llamado «${nombre}»` };
      if (ids.length > 1) return { err: `hay varios ${rol} activos llamados «${nombre}»` };
      return { id: ids[0] };
    };
    const moduloId = new Map(modulos.map((m) => [normalizar(m.name), m.id]));
    const dianId = new Map(dianForms.map((d) => [d.code.toUpperCase(), d.id]));
    // Por defecto, un cliente trae TODOS los módulos y formatos DIAN: si la fila
    // deja el bloque en blanco, se activan todos.
    const todosModuleIds = modulos.map((m) => m.id);
    const todosDianIds = dianForms.map((d) => d.id);
    const edges = new Set(aristasBD.map((a) => `${a.superiorId}:${a.subordinateId}`));
    const nitsExistentes = new Set(clientes.map((c) => c.nit));

    // ---- Validación fila por fila (nada se crea si hay errores) ----
    const erroresDB: ErrorImport[] = [];
    const resueltas: Resuelta[] = [];
    const nitsLote = new Set<string>();

    for (const f of filas) {
      const errs: string[] = [];
      const push = (m: string) => errs.push(m);

      if (nitsExistentes.has(f.nit)) push(`Ya existe un cliente con NIT ${f.nit}.`);
      if (nitsLote.has(f.nit)) push(`NIT repetido en el archivo: ${f.nit}.`);
      nitsLote.add(f.nit);

      const socio = resolver(ROL_SOCIO, f.socio);
      const gerente = resolver(ROL_POR_FUNCION.gerente, f.gerente);
      const senior = resolver(ROL_POR_FUNCION.senior, f.senior);
      if (socio.err) push(`Socio: ${socio.err}.`);
      if (gerente.err) push(`Gerente: ${gerente.err}.`);
      if (senior.err) push(`Senior: ${senior.err}.`);

      const staffIds: number[] = [];
      for (const nombre of f.staff) {
        const st = resolver(ROL_POR_FUNCION.staff, nombre);
        if (st.err) push(`Staff: ${st.err}.`);
        else if (!staffIds.includes(st.id!)) staffIds.push(st.id!);
      }

      // Jerarquía: senior reporta al gerente y cada staff al senior.
      if (gerente.id && senior.id && !edges.has(`${gerente.id}:${senior.id}`))
        push(`El senior «${f.senior}» no reporta al gerente «${f.gerente}».`);
      if (senior.id)
        for (let i = 0; i < f.staff.length; i++) {
          const id = staffIds[i] ?? null;
          if (id && !edges.has(`${senior.id}:${id}`))
            push(`El staff «${f.staff[i]}» no reporta al senior «${f.senior}».`);
        }

      // Responsables distintos entre sí (gerente/senior/staff).
      const ids = [gerente.id, senior.id, ...staffIds].filter((x): x is number => x != null);
      if (new Set(ids).size !== ids.length) push("Los responsables deben ser personas distintas.");

      // Módulos y formatos DIAN. Bloque en blanco ⇒ todos por defecto; si la
      // fila marca algo (Sí/No), se respeta exactamente lo marcado con «Sí».
      let moduleIds: number[];
      if (f.modulosEnBlanco) {
        moduleIds = todosModuleIds;
      } else {
        moduleIds = [];
        for (const nombre of f.modulos) {
          const id = moduloId.get(normalizar(nombre));
          if (!id) push(`Módulo desconocido: «${nombre}».`);
          else moduleIds.push(id);
        }
      }
      let dianFormIds: number[];
      if (f.dianEnBlanco) {
        dianFormIds = todosDianIds;
      } else {
        dianFormIds = [];
        for (const code of f.dianCodes) {
          const id = dianId.get(code.toUpperCase());
          if (!id) push(`Formato DIAN desconocido: «${code}».`);
          else dianFormIds.push(id);
        }
      }

      if (errs.length > 0) {
        for (const m of errs) erroresDB.push({ hoja: "Clientes", fila: f.fila, mensaje: m });
        continue;
      }
      resueltas.push({
        fila: f.fila,
        name: f.name,
        nit: f.nit,
        tipo: f.tipo,
        erp: f.erp,
        sector: f.sector,
        socioId: socio.id!,
        gerenteId: gerente.id!,
        seniorId: senior.id!,
        staffIds,
        moduleIds,
        dianFormIds,
      });
    }
    if (erroresDB.length > 0) {
      return {
        ok: false,
        message: `${erroresDB.length} error(es) de validación. Nada se importó.`,
        errores: erroresDB,
      };
    }

    // ---- Commit: crear clientes + parametrizaciones + responsables ----
    const codigosUsados = clientes.map((c) => c.code);
    const codigosNuevos: string[] = [];
    await prisma.$transaction(async (tx) => {
      for (const c of resueltas) {
        const code = nextClientCode(codigosUsados);
        codigosUsados.push(code);
        codigosNuevos.push(code);

        const cliente = await tx.client.create({
          data: {
            code,
            name: c.name,
            nit: c.nit,
            tipo: c.tipo,
            erp: c.erp,
            sector: c.sector,
            socioId: c.socioId,
            modules: c.moduleIds.length
              ? { create: c.moduleIds.map((moduleId) => ({ moduleId, status: "pending" })) }
              : undefined,
            dianForms: c.dianFormIds.length
              ? { create: c.dianFormIds.map((formId) => ({ formId })) }
              : undefined,
          },
        });
        await tx.clientAssignment.createMany({
          data: [
            ...c.staffIds.map((userId) => ({
              clientId: cliente.id,
              userId,
              role: "staff",
              readScope: true,
              writeScope: true,
              assignedById: authz.userId,
            })),
            {
              clientId: cliente.id,
              userId: c.seniorId,
              role: "senior",
              readScope: true,
              writeScope: false,
              assignedById: authz.userId,
            },
            {
              clientId: cliente.id,
              userId: c.gerenteId,
              role: "gerente",
              readScope: true,
              writeScope: false,
              assignedById: authz.userId,
            },
          ],
        });
      }
    });

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "IMPORTÓ CLIENTES",
      entity: "clientes",
      detail: `creados ${codigosNuevos.length}: ${codigosNuevos.join(", ")}`,
    });
    revalidatePath(PATH);
    return { ok: true, resumen: { creados: codigosNuevos.length, codigos: codigosNuevos } };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("importarClientes", e) };
  }
}
