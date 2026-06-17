"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mensajeErrorBD } from "@/lib/errores";
import {
  parseMaestrosWorkbook,
  normalizarCedula,
  iniciales,
  ROLES_MAESTRO,
  type ErrorImport,
  type ImportMaestrosState,
} from "@/lib/import/maestros";

const PATH = "/config/usuarios";
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

/** Contraseña temporal del lote: cumple la política (≥10, con letra y número). */
function generarPasswordTemporal(): string {
  const aleatorio = randomBytes(18).toString("base64").replace(/[^a-zA-Z0-9]/g, "");
  return `Rb${aleatorio}7`.slice(0, 16);
}

const ORDEN_ROLES = ["Socio", "Gerente", "Senior", "Staff"];

export async function importarMaestros(
  _prev: ImportMaestrosState,
  formData: FormData,
): Promise<ImportMaestrosState> {
  // Crear personas = crear usuarios.
  const authz = await authorizePermiso("usuarios:crear");
  if (!authz.ok) return { ok: false, message: authz.message };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, message: "Adjunta el archivo Excel de maestros (.xlsx)." };
  }
  if (archivo.size > MAX_BYTES) {
    return { ok: false, message: "El archivo supera 4 MB." };
  }

  try {
    const { filas, errores } = await parseMaestrosWorkbook(await archivo.arrayBuffer());
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

    // ---- Validación contra BD + dentro del lote (nada se crea si hay errores) ----
    const erroresDB: ErrorImport[] = [];

    // Roles necesarios deben existir y estar activos.
    const rolesBD = await prisma.role.findMany({
      where: { code: { in: [...ROLES_MAESTRO] }, active: true },
      select: { code: true },
    });
    const rolesActivos = new Set(rolesBD.map((r) => r.code));
    for (const rol of ROLES_MAESTRO) {
      if (!rolesActivos.has(rol) && filas.some((f) => f.rol === rol)) {
        return { ok: false, message: `El rol «${rol}» no existe o está inactivo en el catálogo.` };
      }
    }

    const existentes = await prisma.user.findMany({
      select: { email: true, cedula: true, role: true },
    });
    const emailsExistentes = new Set(existentes.map((u) => u.email.toLowerCase()));
    const cedulasExistentes = new Set(
      existentes.filter((u) => u.cedula).map((u) => normalizarCedula(u.cedula!)),
    );
    // Cédula → rol (existentes con cédula + lote): para resolver al superior.
    const cedulaARol = new Map<string, string>();
    for (const u of existentes) if (u.cedula) cedulaARol.set(normalizarCedula(u.cedula), u.role);
    for (const f of filas) cedulaARol.set(normalizarCedula(f.cedula), f.rol);

    const emailsLote = new Set<string>();
    const cedulasLote = new Set<string>();
    for (const f of filas) {
      const email = f.email.toLowerCase();
      const ced = normalizarCedula(f.cedula);

      if (emailsExistentes.has(email))
        erroresDB.push({ hoja: f.hoja, fila: f.fila, mensaje: `Ya existe un usuario con el correo ${email}.` });
      if (emailsLote.has(email))
        erroresDB.push({ hoja: f.hoja, fila: f.fila, mensaje: `Correo repetido en el archivo: ${email}.` });
      emailsLote.add(email);

      if (cedulasExistentes.has(ced))
        erroresDB.push({ hoja: f.hoja, fila: f.fila, mensaje: `Ya existe un usuario con la cédula ${f.cedula}.` });
      if (cedulasLote.has(ced))
        erroresDB.push({ hoja: f.hoja, fila: f.fila, mensaje: `Cédula repetida en el archivo: ${f.cedula}.` });
      cedulasLote.add(ced);

      if (f.superiorRol) {
        const supCed = f.superiorCedula ? normalizarCedula(f.superiorCedula) : "";
        const rolSup = cedulaARol.get(supCed);
        if (!rolSup)
          erroresDB.push({
            hoja: f.hoja,
            fila: f.fila,
            mensaje: `No se encontró un ${f.superiorRol} con cédula ${f.superiorCedula} (cárgalo antes o en este mismo archivo).`,
          });
        else if (rolSup !== f.superiorRol)
          erroresDB.push({
            hoja: f.hoja,
            fila: f.fila,
            mensaje: `La cédula ${f.superiorCedula} no corresponde a un ${f.superiorRol} (es ${rolSup}).`,
          });
      }
    }
    if (erroresDB.length > 0) {
      return {
        ok: false,
        message: `${erroresDB.length} error(es) de validación. Nada se importó.`,
        errores: erroresDB,
      };
    }

    // ---- Commit: crear usuarios + jerarquía, en orden Socio→Gerente→Senior→Staff ----
    const passwordPlano = generarPasswordTemporal();
    const passwordHash = await bcrypt.hash(passwordPlano, 10);
    const porRol: Record<string, number> = {};
    const ordenadas = [...filas].sort(
      (a, b) => ORDEN_ROLES.indexOf(a.rol) - ORDEN_ROLES.indexOf(b.rol),
    );

    await prisma.$transaction(async (tx) => {
      // Cédula → id: precargar existentes (posibles superiores fuera del lote).
      const idPorCedula = new Map<string, number>();
      const existConCedula = await tx.user.findMany({
        where: { cedula: { not: null } },
        select: { id: true, cedula: true },
      });
      for (const u of existConCedula) idPorCedula.set(normalizarCedula(u.cedula!), u.id);

      for (const f of ordenadas) {
        const nuevo = await tx.user.create({
          data: {
            email: f.email.toLowerCase(),
            name: f.name,
            cedula: normalizarCedula(f.cedula),
            cargo: f.cargo,
            role: f.rol,
            initials: iniciales(f.name),
            password: passwordHash,
            mustChangePassword: true,
            active: f.activo,
          },
        });
        idPorCedula.set(normalizarCedula(f.cedula), nuevo.id);
        porRol[f.rol] = (porRol[f.rol] ?? 0) + 1;

        if (f.superiorRol && f.superiorCedula) {
          const superiorId = idPorCedula.get(normalizarCedula(f.superiorCedula));
          if (superiorId) {
            await tx.userHierarchy.create({
              data: { superiorId, subordinateId: nuevo.id },
            });
          }
        }
      }
    });

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "IMPORTÓ MAESTROS",
      entity: "usuarios",
      detail: `creados ${filas.length} · ${ORDEN_ROLES.map((r) => `${r}:${porRol[r] ?? 0}`).join(" / ")}`,
    });
    revalidatePath(PATH);
    return {
      ok: true,
      resumen: { creados: filas.length, porRol, passwordTemporal: passwordPlano },
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("importarMaestros", e) };
  }
}
