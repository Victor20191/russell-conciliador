"use server";

// ============================================================
// Server Actions de Conexiones e integraciones (/config/conexiones).
//
// Orden obligatorio del proyecto: autorizar → validar → mutar →
// auditar → revalidar. Los secretos se cifran antes de persistir y
// NUNCA se devuelven al cliente; la UI solo conoce las claves definidas.
// ============================================================

import * as z from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { parseId } from "@/lib/ids";
import type { ActionState } from "@/lib/definitions";
import {
  categoriaValida,
  entornoValido,
  proveedorPorClave,
  type ProveedorDefinicion,
} from "@/lib/conexiones/tipos";
import {
  cifrarCredenciales,
  clavesCredencialesDefinidas,
  descifrarCredenciales,
  fusionarCredenciales,
} from "@/lib/conexiones/credenciales";
import { ejecutarConexion, probarConexion } from "@/lib/conexiones/pruebas";

const PERMISO = "conexiones:administrar";
const PATH = "/config/conexiones";

export type ConexionActionState = ActionState & { estado?: "ok" | "error" | "omitida" };

const CodigoSchema = z
  .string()
  .trim()
  .min(2, { error: "El identificador es obligatorio." })
  .max(60, { error: "El identificador es demasiado largo." })
  .regex(/^[a-z0-9][a-z0-9_-]*$/, {
    error: "Usa solo minúsculas, números, guion y guion bajo (debe iniciar con letra o número).",
  });

const ConexionSchema = z.object({
  codigo: CodigoSchema,
  nombre: z
    .string()
    .trim()
    .min(1, { error: "El nombre es obligatorio." })
    .max(120, { error: "El nombre es demasiado largo." }),
  descripcion: z.preprocess(
    (valor) => (typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null),
    z.string().max(400, { error: "La descripción es demasiado larga." }).nullable(),
  ),
  categoria: z.string().trim(),
  proveedor: z.string().trim(),
  entorno: z.string().trim(),
  activa: z.boolean(),
});

type ConfiguracionCampos = Record<string, unknown>;

function leerBooleano(formData: FormData, campo: string): boolean {
  const valor = formData.get(campo);
  return valor === "on" || valor === "true" || valor === "1";
}

function construirConfiguracion(
  proveedor: ProveedorDefinicion,
  formData: FormData,
): { datos: ConfiguracionCampos; errores: Record<string, string[]> } {
  const datos: ConfiguracionCampos = {};
  const errores: Record<string, string[]> = {};
  for (const campo of proveedor.camposConfiguracion) {
    const nombre = `config_${campo.clave}`;
    if (campo.tipo === "booleano") {
      datos[campo.clave] = leerBooleano(formData, nombre);
      continue;
    }
    const bruto = String(formData.get(nombre) ?? "").trim();
    if (campo.tipo === "numero") {
      if (bruto === "") {
        if (campo.porDefecto !== undefined) datos[campo.clave] = Number(campo.porDefecto);
        else if (campo.requerido) errores[nombre] = ["Este campo es obligatorio."];
        continue;
      }
      const numero = Number(bruto);
      if (!Number.isFinite(numero)) errores[nombre] = ["Ingresa un número válido."];
      else datos[campo.clave] = numero;
      continue;
    }
    if (bruto === "") {
      if (campo.porDefecto !== undefined) datos[campo.clave] = campo.porDefecto;
      else if (campo.requerido) errores[nombre] = ["Este campo es obligatorio."];
      continue;
    }
    datos[campo.clave] = bruto;
  }
  return { datos, errores };
}

function leerCredencialesEnviadas(
  proveedor: ProveedorDefinicion,
  formData: FormData,
): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const campo of proveedor.camposCredenciales) {
    const valor = String(formData.get(`cred_${campo.clave}`) ?? "").trim();
    if (valor !== "") salida[campo.clave] = valor;
  }
  return salida;
}

function validarCredencialesRequeridas(
  proveedor: ProveedorDefinicion,
  enviadas: Record<string, string>,
  definidas: Set<string>,
): Record<string, string[]> {
  const errores: Record<string, string[]> = {};
  for (const campo of proveedor.camposCredenciales) {
    if (campo.requerido && !enviadas[campo.clave] && !definidas.has(campo.clave)) {
      errores[`cred_${campo.clave}`] = ["Este campo es obligatorio."];
    }
  }
  return errores;
}

/** Extrae y valida la forma común de una conexión desde el formulario. */
function validarFormulario(
  formData: FormData,
): { ok: true; data: z.infer<typeof ConexionSchema>; proveedor: ProveedorDefinicion } | { ok: false; state: ConexionActionState } {
  const parsed = ConexionSchema.safeParse({
    codigo: formData.get("codigo"),
    nombre: formData.get("nombre"),
    descripcion: formData.get("descripcion"),
    categoria: formData.get("categoria"),
    proveedor: formData.get("proveedor"),
    entorno: formData.get("entorno"),
    activa: leerBooleano(formData, "activa"),
  });
  if (!parsed.success) {
    return { ok: false, state: { ok: false, errors: z.flattenError(parsed.error).fieldErrors } };
  }
  if (!categoriaValida(parsed.data.categoria)) {
    return { ok: false, state: { ok: false, errors: { categoria: ["Selecciona una categoría válida."] } } };
  }
  if (!entornoValido(parsed.data.entorno)) {
    return { ok: false, state: { ok: false, errors: { entorno: ["Selecciona un entorno válido."] } } };
  }
  const proveedor = proveedorPorClave(parsed.data.proveedor);
  if (!proveedor) {
    return { ok: false, state: { ok: false, errors: { proveedor: ["Selecciona un proveedor válido."] } } };
  }
  if (proveedor.categoria !== parsed.data.categoria) {
    return {
      ok: false,
      state: { ok: false, errors: { proveedor: ["El proveedor no corresponde a la categoría seleccionada."] } },
    };
  }
  return { ok: true, data: parsed.data, proveedor };
}

export async function crearConexion(
  _prev: ConexionActionState | undefined,
  formData: FormData,
): Promise<ConexionActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const validado = validarFormulario(formData);
  if (!validado.ok) return validado.state;
  const { data, proveedor } = validado;

  const { datos, errores } = construirConfiguracion(proveedor, formData);
  const enviadas = leerCredencialesEnviadas(proveedor, formData);
  Object.assign(errores, validarCredencialesRequeridas(proveedor, enviadas, new Set()));
  if (Object.keys(errores).length > 0) return { ok: false, errors: errores };

  try {
    const duplicado = await prisma.conexionIntegracion.findUnique({
      where: { codigo: data.codigo },
      select: { id: true },
    });
    if (duplicado) {
      return { ok: false, errors: { codigo: ["Ya existe una conexión con ese identificador."] } };
    }

    const actor = await getCurrentUser();
    await prisma.conexionIntegracion.create({
      data: {
        codigo: data.codigo,
        nombre: data.nombre,
        descripcion: data.descripcion,
        categoria: data.categoria,
        proveedor: data.proveedor,
        entorno: data.entorno,
        activa: data.activa,
        configuracion: datos as Prisma.InputJsonValue,
        credenciales: cifrarCredenciales(enviadas) as Prisma.InputJsonValue,
        creadoPor: actor?.name ?? null,
        actualizadoPor: actor?.name ?? null,
      },
    });

    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "CREÓ CONEXIÓN",
      entity: `Configuración · ${data.codigo}`,
      detail: `${data.nombre} · ${data.categoria} · ${data.proveedor} · ${data.entorno}`,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Conexión creada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("crearConexion", e) };
  }
}

export async function actualizarConexion(
  _prev: ConexionActionState | undefined,
  formData: FormData,
): Promise<ConexionActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "La conexión no existe." };

  const validado = validarFormulario(formData);
  if (!validado.ok) return validado.state;
  const { data, proveedor } = validado;

  try {
    const actual = await prisma.conexionIntegracion.findUnique({ where: { id } });
    if (!actual) return { ok: false, message: "La conexión no existe." };

    const duplicado = await prisma.conexionIntegracion.findFirst({
      where: { codigo: data.codigo, NOT: { id } },
      select: { id: true },
    });
    if (duplicado) {
      return { ok: false, errors: { codigo: ["Ya existe otra conexión con ese identificador."] } };
    }

    const { datos, errores } = construirConfiguracion(proveedor, formData);
    const enviadas = leerCredencialesEnviadas(proveedor, formData);
    const definidas = new Set(clavesCredencialesDefinidas(actual.credenciales));
    Object.assign(errores, validarCredencialesRequeridas(proveedor, enviadas, definidas));
    if (Object.keys(errores).length > 0) return { ok: false, errors: errores };

    const actor = await getCurrentUser();
    await prisma.conexionIntegracion.update({
      where: { id },
      data: {
        codigo: data.codigo,
        nombre: data.nombre,
        descripcion: data.descripcion,
        categoria: data.categoria,
        proveedor: data.proveedor,
        entorno: data.entorno,
        activa: data.activa,
        configuracion: datos as Prisma.InputJsonValue,
        // Los campos de credenciales que llegan vacíos conservan el secreto
        // anterior; los que traen valor se vuelven a cifrar.
        credenciales: fusionarCredenciales(actual.credenciales, enviadas) as Prisma.InputJsonValue,
        actualizadoPor: actor?.name ?? null,
      },
    });

    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "EDITÓ CONEXIÓN",
      entity: `Configuración · ${data.codigo}`,
      detail: `${data.nombre} · ${data.categoria} · ${data.proveedor} · ${data.entorno}${enviadas && Object.keys(enviadas).length > 0 ? " · credenciales actualizadas" : ""}`,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Conexión actualizada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("actualizarConexion", e) };
  }
}

export async function eliminarConexion(
  _prev: ConexionActionState | undefined,
  formData: FormData,
): Promise<ConexionActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const id = parseId(formData.get("id"));
  if (!id) return { ok: false, message: "La conexión no existe." };

  try {
    const actual = await prisma.conexionIntegracion.findUnique({
      where: { id },
      select: { codigo: true, nombre: true },
    });
    if (!actual) return { ok: false, message: "La conexión no existe." };

    await prisma.conexionIntegracion.delete({ where: { id } });

    const actor = await getCurrentUser();
    await logAudit({
      user: actor?.name ?? "Sistema",
      action: "ELIMINÓ CONEXIÓN",
      entity: `Configuración · ${actual.codigo}`,
      detail: actual.nombre,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Conexión eliminada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarConexion", e) };
  }
}

/** Activa o desactiva una conexión (switch de la tarjeta). */
export async function cambiarEstadoConexion(
  id: number,
  activa: boolean,
): Promise<ConexionActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const conexionId = parseId(id);
  if (!conexionId) return { ok: false, message: "La conexión no existe." };

  try {
    const actual = await prisma.conexionIntegracion.findUnique({
      where: { id: conexionId },
      select: { codigo: true, nombre: true },
    });
    if (!actual) return { ok: false, message: "La conexión no existe." };

    const actor = await getCurrentUser();
    await prisma.conexionIntegracion.update({
      where: { id: conexionId },
      data: { activa, actualizadoPor: actor?.name ?? null },
    });

    await logAudit({
      user: actor?.name ?? "Sistema",
      action: activa ? "ACTIVÓ CONEXIÓN" : "DESACTIVÓ CONEXIÓN",
      entity: `Configuración · ${actual.codigo}`,
      detail: actual.nombre,
    });
    revalidatePath(PATH);
    return { ok: true, message: activa ? "Conexión activada." : "Conexión desactivada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("cambiarEstadoConexion", e) };
  }
}

/** Prueba las credenciales/destino de una conexión y registra el resultado. */
export async function probarConexionAction(id: number): Promise<ConexionActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const conexionId = parseId(id);
  if (!conexionId) return { ok: false, message: "La conexión no existe." };

  try {
    const conexion = await prisma.conexionIntegracion.findUnique({ where: { id: conexionId } });
    if (!conexion) return { ok: false, message: "La conexión no existe." };

    const resultado = await probarConexion({
      proveedor: conexion.proveedor,
      configuracion: (conexion.configuracion ?? {}) as Record<string, unknown>,
      credenciales: descifrarCredenciales(conexion.credenciales),
    });

    const actor = await getCurrentUser();
    const nombre = actor?.name ?? null;
    await prisma.$transaction([
      prisma.conexionIntegracion.update({
        where: { id: conexionId },
        data: {
          ultimaPruebaEn: new Date(),
          ultimaPruebaOk: resultado.ok,
          ultimaPruebaMensaje: resultado.mensaje,
          ultimaPruebaMs: resultado.duracionMs,
          actualizadoPor: nombre,
        },
      }),
      prisma.ejecucionConexion.create({
        data: {
          conexionId,
          tipo: "PRUEBA",
          estado: resultado.estado,
          mensaje: resultado.mensaje,
          duracionMs: resultado.duracionMs,
          ejecutadoPor: nombre,
        },
      }),
    ]);

    await logAudit({
      user: nombre ?? "Sistema",
      action: "PROBÓ CONEXIÓN",
      entity: `Configuración · ${conexion.codigo}`,
      detail: `${resultado.estado.toUpperCase()} · ${resultado.mensaje}`,
    });
    revalidatePath(PATH);
    return { ok: resultado.ok, estado: resultado.estado, message: resultado.mensaje };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("probarConexionAction", e) };
  }
}

/** Ejecuta la operación real de la conexión (hoy solo almacenamiento). */
export async function ejecutarConexionAction(id: number): Promise<ConexionActionState> {
  const authz = await authorizePermiso(PERMISO);
  if (!authz.ok) return { ok: false, message: authz.message };

  const conexionId = parseId(id);
  if (!conexionId) return { ok: false, message: "La conexión no existe." };

  try {
    const conexion = await prisma.conexionIntegracion.findUnique({ where: { id: conexionId } });
    if (!conexion) return { ok: false, message: "La conexión no existe." };

    const resultado = await ejecutarConexion({
      proveedor: conexion.proveedor,
      configuracion: (conexion.configuracion ?? {}) as Record<string, unknown>,
      credenciales: descifrarCredenciales(conexion.credenciales),
    });

    const actor = await getCurrentUser();
    const nombre = actor?.name ?? null;
    await prisma.$transaction([
      prisma.conexionIntegracion.update({
        where: { id: conexionId },
        data: {
          ...(resultado.estado !== "omitida" && resultado.ok ? { ultimoUsoEn: new Date() } : {}),
          ultimaEjecucionEstado: resultado.estado,
          ultimaEjecucionMensaje: resultado.mensaje,
          actualizadoPor: nombre,
        },
      }),
      prisma.ejecucionConexion.create({
        data: {
          conexionId,
          tipo: "EJECUCION",
          estado: resultado.estado,
          mensaje: resultado.mensaje,
          duracionMs: resultado.duracionMs,
          ejecutadoPor: nombre,
        },
      }),
    ]);

    await logAudit({
      user: nombre ?? "Sistema",
      action: "EJECUTÓ CONEXIÓN",
      entity: `Configuración · ${conexion.codigo}`,
      detail: `${resultado.estado.toUpperCase()} · ${resultado.mensaje}`,
    });
    revalidatePath(PATH);
    return { ok: resultado.ok, estado: resultado.estado, message: resultado.mensaje };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("ejecutarConexionAction", e) };
  }
}
