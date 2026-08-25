"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD } from "@/lib/errores";
import { AjustesCargaModuloSchema, EditarPerfilCargaModuloSchema, type ActionState } from "@/lib/definitions";
import { descriptorModulo, type DescriptorModulo } from "@/lib/modulos/descriptores";
import { SpecModuloSchema, type SpecModulo } from "@/lib/modulos/extraccion/esquema";
import {
  modoClasificadorDe,
  normalizarSpecModulo,
  resumenColumnasModulo,
  validarSpecModulo,
} from "@/lib/modulos/perfil-modulo";

// Gestión de la MEMORIA DE CARGA de los MÓDULOS (Inventarios, Cartera, CxP, Ingresos,
// Activos Fijos, Nómina) por cliente — la contraparte de `perfiles-carga.ts` (balance):
//   - Perfiles de formato (`perfiles_carga_modulo`): el mapeo de columnas memorizado
//     por huella del layout, que el motor genérico (`modulos-datos.ts`) crea/actualiza
//     en cada lectura y re-aplica sin IA. Se listan, editan y eliminan aquí.
//   - Preferencias de carga (`ajustes_carga_modulo`): hoja preferida y notas por
//     (cliente, módulo), que el asistente de carga aplica al elegir el cliente.
// Los módulos NO memorizan correcciones por fila (la tabla `correcciones_carga_modulo`
// existe pero el flujo del borrador de módulo no la alimenta), así que aquí no se
// administran; el borrado total sí la limpia por si algún día llegara a poblarse.
// Gate: `perfiles_carga:administrar` (Administrador y Superadministrador) con la doble
// verificación de alcance por cliente. Todos los módulos se administran EXACTAMENTE
// igual: la única diferencia entre ellos es el descriptor (`descriptores.ts`).
const PATH = "/config/perfiles-carga";

export type RolPerfilModulo = {
  nombre: string;
  etiqueta: string;
  tipo: string;
  requerido: boolean;
};

export type PerfilCargaModuloResumen = {
  id: number;
  huella: string;
  hoja: string;
  origen: string; // ia | manual | perfil
  vecesUsado: number;
  ultimoUsoEn: string | null; // ISO
  archivoEjemplo: string | null;
  resumenColumnas: string; // "tipo de inventario B · referencia A · valor total F"
  estructura: SpecModulo;
  actualizadoEn: string; // ISO
};

export type AjustesCargaModuloResumen = {
  hojaPreferida: string | null;
  observaciones: string | null;
};

export type PerfilesCargaModuloState = {
  ok: boolean;
  message?: string;
  moduloCodigo: string;
  moduloLabel: string;
  roles: RolPerfilModulo[];
  clasificadorRol: string;
  perfiles: PerfilCargaModuloResumen[];
  ajustes: AjustesCargaModuloResumen | null;
};

function estadoVacio(moduloCodigo: string, descriptor: DescriptorModulo | null): PerfilesCargaModuloState {
  return {
    ok: false,
    moduloCodigo,
    moduloLabel: descriptor?.label ?? moduloCodigo,
    roles: descriptor?.columnas.map((c) => ({ nombre: c.nombre, etiqueta: c.etiqueta, tipo: c.tipo, requerido: c.requerido })) ?? [],
    clasificadorRol: descriptor?.clasificador ?? "",
    perfiles: [],
    ajustes: null,
  };
}

/** Código de módulo saneado (mayúsculas) o `null` si no es un módulo con importación soportada. */
function moduloDe(codigo: unknown): { codigo: string; descriptor: DescriptorModulo } | null {
  const c = String(codigo ?? "").trim().toUpperCase();
  const descriptor = descriptorModulo(c);
  return descriptor ? { codigo: c, descriptor } : null;
}

/**
 * Lista los perfiles de formato y las preferencias de UN cliente en UN módulo (lectura
 * lazy desde el modal de Configuración › Perfiles de carga).
 */
export async function listarPerfilesCargaModulo(clienteId: number, moduloCodigo: string): Promise<PerfilesCargaModuloState> {
  const modulo = moduloDe(moduloCodigo);
  const vacio = estadoVacio(String(moduloCodigo ?? "").toUpperCase(), modulo?.descriptor ?? null);
  if (!modulo) return { ...vacio, message: "Módulo no soportado." };
  const authz = await authorizePermiso("perfiles_carga:administrar");
  if (!authz.ok) return { ...vacio, message: authz.message };
  const cid = Number(clienteId);
  if (!Number.isInteger(cid) || cid <= 0) return { ...vacio, message: "Cliente inválido." };
  const scope = await authorizePermiso("perfiles_carga:administrar", { clientId: cid, modo: "lectura" });
  if (!scope.ok) return { ...vacio, message: scope.message };
  try {
    const [filas, ajustes] = await Promise.all([
      prisma.perfilCargaModulo.findMany({
        where: { clienteId: cid, moduloCodigo: modulo.codigo },
        // Creación y edición comparten `actualizadoEn` (@updatedAt); el más reciente
        // va primero para que el admin vea de inmediato lo que tocó.
        orderBy: [{ actualizadoEn: "desc" }, { creadoEn: "desc" }],
      }),
      prisma.ajustesCargaModulo.findUnique({
        where: { clienteId_moduloCodigo: { clienteId: cid, moduloCodigo: modulo.codigo } },
        select: { hojaPreferida: true, observaciones: true },
      }),
    ]);
    const perfiles: PerfilCargaModuloResumen[] = [];
    for (const p of filas) {
      const parsed = SpecModuloSchema.safeParse(p.specJson);
      // Un perfil ilegible (JSON corrupto o de una versión incompatible) se muestra
      // con la estructura vacía para que al menos se pueda eliminar.
      const estructura = normalizarSpecModulo(
        modulo.descriptor,
        parsed.success ? parsed.data : { hoja: "", filaEncabezado: 1, primeraFilaDatos: 2, columnas: {} },
      );
      perfiles.push({
        id: p.id,
        huella: p.huella,
        hoja: estructura.hoja,
        origen: p.origen,
        vecesUsado: p.vecesUsado,
        ultimoUsoEn: p.ultimoUsoEn?.toISOString() ?? null,
        archivoEjemplo: p.archivoEjemplo,
        resumenColumnas: resumenColumnasModulo(modulo.descriptor, estructura),
        estructura,
        actualizadoEn: p.actualizadoEn.toISOString(),
      });
    }
    return { ...vacio, ok: true, perfiles, ajustes };
  } catch (e) {
    return { ...vacio, message: mensajeErrorBD("listarPerfilesCargaModulo", e) };
  }
}

export type EditarPerfilCargaModuloInput = {
  id: number;
  actualizadoEn: string;
  estructura: SpecModulo;
};

/**
 * Actualiza directamente el mapeo de columnas de UN perfil de módulo.
 *
 * El `actualizadoEn` recibido funciona como control de concurrencia: si otra persona
 * cambió el perfil mientras estaba abierto, no se pisan sus ajustes. Una edición
 * humana deja el perfil en `origen: "manual"`, que el motor nunca degrada a «ia».
 */
export async function actualizarPerfilCargaModulo(input: EditarPerfilCargaModuloInput): Promise<ActionState> {
  const authz = await authorizePermiso("perfiles_carga:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const parsed = EditarPerfilCargaModuloSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "La estructura del perfil no es válida." };
  }
  const { id, actualizadoEn } = parsed.data;

  try {
    const perfil = await prisma.perfilCargaModulo.findUnique({
      where: { id },
      select: { clienteId: true, moduloCodigo: true, huella: true, specJson: true, actualizadoEn: true },
    });
    if (!perfil) return { ok: false, message: "El perfil ya no existe." };
    const modulo = moduloDe(perfil.moduloCodigo);
    if (!modulo) return { ok: false, message: "El módulo de este perfil ya no está soportado." };

    const scope = await authorizePermiso("perfiles_carga:administrar", { clientId: perfil.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };

    // La coherencia con el descriptor depende del módulo de la fila: por eso se valida
    // aquí y no en el esquema Zod genérico.
    const estructura = normalizarSpecModulo(modulo.descriptor, parsed.data.estructura);
    const error = validarSpecModulo(modulo.descriptor, estructura);
    if (error) return { ok: false, message: error };

    const versionEsperada = new Date(actualizadoEn);
    if (perfil.actualizadoEn.getTime() !== versionEsperada.getTime()) {
      return {
        ok: false,
        message: "Este perfil cambió mientras lo estabas revisando. Ciérralo y vuelve a abrirlo para ver la versión más reciente.",
      };
    }

    const actualizado = await prisma.perfilCargaModulo.updateMany({
      where: { id, clienteId: perfil.clienteId, actualizadoEn: versionEsperada },
      data: {
        specJson: estructura,
        // Una edición humana blinda el perfil frente a futuras detecciones automáticas:
        // las cargas solo registrarán su uso, no pisarán su mapa con la heurística.
        origen: "manual",
      },
    });
    if (actualizado.count !== 1) {
      return {
        ok: false,
        message: "Este perfil cambió mientras lo estabas guardando. Vuelve a abrirlo antes de intentar de nuevo.",
      };
    }

    const anterior = SpecModuloSchema.safeParse(perfil.specJson);
    const hojaAnterior = anterior.success ? anterior.data.hoja : "?";
    const clasificador = modulo.descriptor.columnas.find((c) => c.nombre === modulo.descriptor.clasificador);
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: `EDITÓ PERFIL de carga de ${modulo.descriptor.label}`,
      entity: `cliente ${perfil.clienteId}`,
      detail: [
        `huella ${perfil.huella}`,
        `hoja «${hojaAnterior}» → «${estructura.hoja}»`,
        `filas ${estructura.filaEncabezado}/${estructura.primeraFilaDatos}`,
        resumenColumnasModulo(modulo.descriptor, estructura) || "sin columnas mapeadas",
        `${(clasificador?.etiqueta ?? "clasificador").toLowerCase()} ${modoClasificadorDe(estructura)}`,
      ].join(" · "),
      clientId: perfil.clienteId,
    });
    revalidatePath(PATH);
    return {
      ok: true,
      message: "Perfil actualizado. Las próximas cargas de este formato usarán este mapeo de columnas.",
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("actualizarPerfilCargaModulo", e) };
  }
}

/** Elimina un perfil de formato de módulo (la próxima carga con ese layout volverá a la heurística). */
export async function eliminarPerfilCargaModulo(id: number): Promise<ActionState> {
  const authz = await authorizePermiso("perfiles_carga:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const perfilId = Number(id);
  if (!Number.isInteger(perfilId) || perfilId <= 0) return { ok: false, message: "Perfil inválido." };
  try {
    const perfil = await prisma.perfilCargaModulo.findUnique({
      where: { id: perfilId },
      select: { clienteId: true, moduloCodigo: true, huella: true, archivoEjemplo: true, specJson: true },
    });
    if (!perfil) return { ok: false, message: "El perfil ya no existe." };
    const scope = await authorizePermiso("perfiles_carga:administrar", { clientId: perfil.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };
    await prisma.perfilCargaModulo.delete({ where: { id: perfilId } });
    const spec = SpecModuloSchema.safeParse(perfil.specJson);
    const etiquetaModulo = descriptorModulo(perfil.moduloCodigo)?.label ?? perfil.moduloCodigo;
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: `ELIMINÓ PERFIL de carga de ${etiquetaModulo}`,
      entity: `cliente ${perfil.clienteId}`,
      detail: `huella ${perfil.huella}${spec.success ? ` · hoja «${spec.data.hoja}»` : ""}${perfil.archivoEjemplo ? ` · ${perfil.archivoEjemplo}` : ""}`,
      clientId: perfil.clienteId,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Perfil eliminado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarPerfilCargaModulo", e) };
  }
}

/** Guarda (upsert) las preferencias de carga del cliente en un módulo. */
export async function guardarAjustesCargaModulo(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const authz = await authorizePermiso("perfiles_carga:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const parsed = AjustesCargaModuloSchema.safeParse({
    clienteId: formData.get("clienteId"),
    moduloCodigo: formData.get("moduloCodigo"),
    hojaPreferida: formData.get("hojaPreferida"),
    observaciones: formData.get("observaciones"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { clienteId, hojaPreferida, observaciones } = parsed.data;
  const modulo = moduloDe(parsed.data.moduloCodigo);
  if (!modulo) return { ok: false, message: "Módulo no soportado." };
  const scope = await authorizePermiso("perfiles_carga:administrar", { clientId: clienteId });
  if (!scope.ok) return { ok: false, message: scope.message };
  try {
    const cliente = await prisma.client.findUnique({ where: { id: clienteId }, select: { name: true } });
    if (!cliente) return { ok: false, message: "El cliente seleccionado ya no existe." };
    const user = await getCurrentUser();
    const datos = { hojaPreferida, observaciones, actualizadoPor: user?.name ?? null };
    await prisma.ajustesCargaModulo.upsert({
      where: { clienteId_moduloCodigo: { clienteId, moduloCodigo: modulo.codigo } },
      create: { clienteId, moduloCodigo: modulo.codigo, ...datos },
      update: datos,
    });
    await logAudit({
      user: user?.name ?? "Sistema",
      action: `GUARDÓ PREFERENCIAS de carga de ${modulo.descriptor.label}`,
      entity: cliente.name,
      detail: [
        hojaPreferida ? `hoja «${hojaPreferida}»` : null,
        observaciones ? "con notas" : null,
      ].filter(Boolean).join(" · ") || "todo en auto",
      clientId: clienteId,
    });
    revalidatePath(PATH);
    return { ok: true, message: "Preferencias guardadas." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarAjustesCargaModulo", e) };
  }
}

/**
 * Borra TODA la memoria de carga del cliente en UN módulo de una sola vez: formatos por
 * huella y preferencias (y las correcciones por fila, si alguna vez existieran). Deja al
 * cliente como si nunca se le hubiera cargado ese módulo — la próxima carga vuelve a
 * detectar el mapeo con la heurística. No toca los lotes, borradores ni datos ya
 * cargados: solo la memoria que condiciona las lecturas futuras.
 */
export async function limpiarMemoriaCargaModuloCliente(clienteId: number, moduloCodigo: string): Promise<ActionState> {
  const authz = await authorizePermiso("perfiles_carga:administrar");
  if (!authz.ok) return { ok: false, message: authz.message };
  const cid = Number(clienteId);
  if (!Number.isInteger(cid) || cid <= 0) return { ok: false, message: "Cliente inválido." };
  const modulo = moduloDe(moduloCodigo);
  if (!modulo) return { ok: false, message: "Módulo no soportado." };
  const scope = await authorizePermiso("perfiles_carga:administrar", { clientId: cid });
  if (!scope.ok) return { ok: false, message: scope.message };
  try {
    const cliente = await prisma.client.findUnique({ where: { id: cid }, select: { name: true } });
    if (!cliente) return { ok: false, message: "El cliente seleccionado ya no existe." };
    const where = { clienteId: cid, moduloCodigo: modulo.codigo };
    const [perfiles, correcciones, ajustes] = await prisma.$transaction([
      prisma.perfilCargaModulo.deleteMany({ where }),
      prisma.correccionCargaModulo.deleteMany({ where }),
      prisma.ajustesCargaModulo.deleteMany({ where }),
    ]);
    const partes = [
      `${perfiles.count} formato(s)`,
      correcciones.count > 0 ? `${correcciones.count} corrección(es)` : null,
      ajustes.count > 0 ? "preferencias" : null,
    ].filter(Boolean).join(" · ");
    const user = await getCurrentUser();
    await logAudit({
      user: user?.name ?? "Sistema",
      action: `BORRÓ LA MEMORIA de carga de ${modulo.descriptor.label}`,
      entity: cliente.name,
      detail: partes,
      clientId: cid,
    });
    revalidatePath(PATH);
    return {
      ok: true,
      message: ajustes.count > 0
        ? `Memoria de ${modulo.descriptor.label} borrada: ${perfiles.count} formato(s) y las preferencias.`
        : `Memoria de ${modulo.descriptor.label} borrada: ${perfiles.count} formato(s).`,
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("limpiarMemoriaCargaModuloCliente", e) };
  }
}
