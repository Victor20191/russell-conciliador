"use server";

// Server Actions del MOTOR genérico de importación de módulos (Inventarios piloto).
// Flujo: leer archivo → staging editable (borrador) → promover a oficial (detalle) →
// purga. Todo dirigido por el descriptor del módulo. Sin PUC ni partida doble.
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import * as z from "zod";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { mensajeErrorBD, registrarError } from "@/lib/errores";
import type { ActionState } from "@/lib/definitions";
import { ingerir, type CeldaCruda } from "@/lib/balance/extraccion/ingesta";
import { calcularHuella, huellasCandidatas } from "@/lib/balance/extraccion/huella";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import {
  parseAlcanceEliminacionModulo,
  resolverAlcanceEliminacionModulo,
  type AlcanceEliminacionModulo,
} from "@/lib/modulos/alcance-eliminacion";
import { cuenta4DelModulo, prefijosCuentaModulo } from "@/lib/modulos/cuentas-modulo";
import { SpecModuloSchema, type SpecModulo } from "@/lib/modulos/extraccion/esquema";
import { sugerirSpec } from "@/lib/modulos/extraccion/sugerir";
import { seleccionarSugerenciasPerfil, type PerfilCandidato } from "@/lib/modulos/sugerencias-perfil";
import { transformarModulo, resultadoAReconciliacion } from "@/lib/modulos/extraccion/transformar";
import { promoverStaging, type FilaStagingModulo } from "@/lib/modulos/promocion";
import {
  anclaCruce,
  normalizarCuenta4 as cuenta4Marcable,
  siguienteNumeroMarca,
  validarNotaMarca,
  validarReferenciaAnexo,
} from "@/lib/modulos/marcas-cruce";
import {
  claveSoporteMarca,
  nombreArchivoSeguro,
  SOPORTES_MARCA_MAX,
  validarSoporteMarca,
  type TipoSoporteMarca,
} from "@/lib/modulos/marcas-adjuntos";
import { almacenamientoDisponible, eliminarObjeto, subirObjeto } from "@/lib/storage/objetos";
import { refRolDe, clavesDeDetalle, decidirCarga, remapFilas } from "@/lib/modulos/fraccionamiento";
import { getCatalogoPrevalidador } from "@/lib/parametros/prevalidador";
import { tomarCandadoTransaccion, transaccionSerializable } from "@/lib/concurrency";

const rutaModulo = (codigo: string) => `/modulos/${codigo.toLowerCase()}`;
// Marca de idempotencia de un anexo (modo "agregar"): se guarda al final de las
// observaciones del encabezado vigente para poder detectar un reintento del mismo
// `loteId` (el anexo NO crea un encabezado propio, así que no puede reutilizar la
// idempotencia por `ModuloDatoEncabezado.loteId` que sí tiene el modo "version").
const marcaAnexoModulo = (loteId: string) => `[lote:${loteId}]`;
const LOTE_STAGING_MODULO = 2_000;
const TIMEOUT_TRANSACCION_MODULO_MS = 15 * 60 * 1000;
const tamArchivo = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};
const fechaISO = (v: FormDataEntryValue | null): Date | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : null;
};

function mensajeErrorLecturaArchivoModulo(contexto: string, e: unknown): string {
  registrarError(contexto, e);
  const mensaje = e instanceof Error ? e.message.trim() : "";
  if (/^(No se pudo leer|El formato|Formato de archivo)/i.test(mensaje)) return mensaje;
  return "No se pudo leer el archivo. Si es un Excel, ábrelo, guárdalo nuevamente como .xlsx e intenta otra vez.";
}

// Datos para el editor de mapeo: encabezado + filas de muestra (alineadas por columna)
// de la MISMA grilla del servidor, para etiquetar los selectores y previsualizar el mapeo.
export type CeldaMuestra = string | number | null;
export type AnalisisModulo = {
  ok: boolean;
  message?: string;
  hoja?: string;
  hojas?: string[];
  totalFilas?: number;
  ancho?: number;
  encabezado?: CeldaMuestra[];
  muestraFilas?: CeldaMuestra[][];
  spec?: SpecModulo;
  // "sugerido" = spec exacto de otro cliente del mismo ERP (huella idéntica), NO propio.
  origen?: "perfil" | "sugerido" | "ia";
  // Presente solo cuando NO hay perfil propio del cliente pero sí candidatos de su ERP
  // (con huella exacta y/o como punto de partida). Puramente indicativo: nunca obliga.
  sugerencias?: {
    erpName: string;
    exacto: { clienteNombre: string; archivoEjemplo: string | null } | null;
    lista: { clienteNombre: string; huella: string; archivoEjemplo: string | null; vecesUsado: number; spec: SpecModulo }[];
  };
};

async function specPerfilModulo(
  clienteId: number,
  moduloCodigo: string,
  candidatas: { huella: string }[],
): Promise<SpecModulo | null> {
  if (candidatas.length === 0) return null;
  const perfiles = await prisma.perfilCargaModulo.findMany({
    where: { clienteId, moduloCodigo, huella: { in: candidatas.map((c) => c.huella) } },
    select: { huella: true, specJson: true },
  });
  const porHuella = new Map(perfiles.map((perfil) => [perfil.huella, perfil.specJson]));
  for (const candidata of candidatas) {
    const perfil = porHuella.get(candidata.huella);
    if (perfil == null) continue;
    const parsed = SpecModuloSchema.safeParse(perfil);
    if (parsed.success) return parsed.data;
  }
  return null;
}

const mismoSpecModulo = (a: SpecModulo, b: SpecModulo): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Sugerencias de parametrización de OTROS clientes con el MISMO ERP, para cuando este
 * cliente no tiene perfil propio guardado en este módulo. Es INDICATIVO: nunca sustituye
 * al perfil del cliente ni obliga a nada (ver `src/lib/modulos/sugerencias-perfil.ts`).
 * `null` si el cliente no tiene ERP o ningún otro cliente del mismo ERP tiene perfiles.
 */
async function sugerenciasPerfilPorErp(
  clienteId: number,
  erpId: number,
  moduloCodigo: string,
  candidatas: { huella: string }[],
): Promise<{ erpName: string; sugerencias: ReturnType<typeof seleccionarSugerenciasPerfil> } | null> {
  const [erp, otrosClientes] = await Promise.all([
    prisma.erp.findUnique({ where: { id: erpId }, select: { name: true } }),
    prisma.client.findMany({ where: { erpId, id: { not: clienteId } }, select: { id: true, name: true } }),
  ]);
  if (!erp || otrosClientes.length === 0) return null;

  const perfiles = await prisma.perfilCargaModulo.findMany({
    where: { moduloCodigo, clienteId: { in: otrosClientes.map((c) => c.id) } },
    select: { clienteId: true, huella: true, specJson: true, archivoEjemplo: true, vecesUsado: true },
  });
  if (perfiles.length === 0) return null;

  const nombrePorCliente = new Map(otrosClientes.map((c) => [c.id, c.name]));
  const candidatosPerfil: PerfilCandidato[] = perfiles.map((p) => ({
    clienteId: p.clienteId,
    clienteNombre: nombrePorCliente.get(p.clienteId) ?? `Cliente ${p.clienteId}`,
    huella: p.huella,
    spec: p.specJson,
    archivoEjemplo: p.archivoEjemplo,
    vecesUsado: p.vecesUsado,
  }));
  const sugerencias = seleccionarSugerenciasPerfil(candidatosPerfil, candidatas.map((c) => c.huella));
  if (!sugerencias.exacto && sugerencias.lista.length === 0) return null;
  return { erpName: erp.name, sugerencias };
}

/**
 * Hoja a importar: la elegida explícitamente por el usuario; si no eligió ninguna,
 * la HOJA PREFERIDA del cliente para este módulo (Configuración › Perfiles de carga)
 * cuando existe en el libro; y si no, la primera. Mismo criterio que la carga de
 * balance con `ajustes_carga_balance.hojaPreferida`.
 */
async function resolverHojaModulo(
  hojas: { nombre: string }[],
  hojaElegida: string,
  clienteId: number,
  moduloCodigo: string,
): Promise<string | null> {
  if (hojaElegida && hojas.some((h) => h.nombre === hojaElegida)) return hojaElegida;
  if (!hojaElegida) {
    const ajustes = await prisma.ajustesCargaModulo.findUnique({
      where: { clienteId_moduloCodigo: { clienteId, moduloCodigo } },
      select: { hojaPreferida: true },
    });
    const preferida = ajustes?.hojaPreferida?.trim();
    if (preferida && hojas.some((h) => h.nombre === preferida)) return preferida;
  }
  return hojas[0]?.nombre ?? null;
}

export type PreferenciasCargaModulo = {
  ok: boolean;
  message?: string;
  hojaPreferida: string | null;
  observaciones: string | null;
};

/**
 * Preferencias de carga del cliente en un módulo (`ajustes_carga_modulo`), para que el
 * modal de carga preseleccione la hoja preferida y muestre las notas del equipo al
 * elegir el cliente. Se editan en Configuración › Perfiles de carga (admin-only); aquí
 * solo se LEEN con el permiso operativo del módulo y alcance de lectura sobre el cliente.
 */
export async function preferenciasCargaModulo(clienteId: number, moduloCodigo: string): Promise<PreferenciasCargaModulo> {
  const vacio: PreferenciasCargaModulo = { ok: false, hojaPreferida: null, observaciones: null };
  const codigo = String(moduloCodigo ?? "").trim().toUpperCase();
  if (!descriptorModulo(codigo)) return { ...vacio, message: "Módulo no soportado." };
  const cid = Number(clienteId);
  if (!Number.isInteger(cid) || cid <= 0) return { ...vacio, message: "Cliente inválido." };
  const authz = await authorizePermiso("modulos_datos:crear", { clientId: cid, modo: "lectura" });
  if (!authz.ok) return { ...vacio, message: authz.message };
  try {
    const ajustes = await prisma.ajustesCargaModulo.findUnique({
      where: { clienteId_moduloCodigo: { clienteId: cid, moduloCodigo: codigo } },
      select: { hojaPreferida: true, observaciones: true },
    });
    return {
      ok: true,
      hojaPreferida: ajustes?.hojaPreferida?.trim() || null,
      observaciones: ajustes?.observaciones?.trim() || null,
    };
  } catch (e) {
    return { ...vacio, message: mensajeErrorBD("preferenciasCargaModulo", e) };
  }
}

// ============================================================
// ANALIZAR: lee el archivo (SIN escribir) y devuelve la grilla del servidor + spec
// sugerido para que el modal edite el mapeo de columnas sobre la MISMA grilla que
// luego usará el transform (cero riesgo de desalineación de índices).
// ============================================================
export async function analizarArchivoModulo(formData: FormData): Promise<AnalisisModulo> {
  const moduloCodigo = String(formData.get("moduloCodigo") ?? "").trim().toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) return { ok: false, message: "Módulo no soportado." };
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const clienteId = Number(formData.get("clienteId"));
  if (!Number.isInteger(clienteId) || clienteId <= 0) return { ok: false, message: "Selecciona el cliente." };
  const scope = await authorizePermiso("modulos_datos:crear", { clientId: clienteId });
  if (!scope.ok) return { ok: false, message: scope.message };
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, message: "Adjunta el archivo del módulo." };

  try {
    let ingesta: Awaited<ReturnType<typeof ingerir>>;
    try {
      ingesta = await ingerir(await archivo.arrayBuffer(), archivo.name);
    } catch (e) {
      return { ok: false, message: mensajeErrorLecturaArchivoModulo("analizarArchivoModulo.ingerir", e) };
    }
    if (ingesta.modo !== "tabular") return { ok: false, message: "Por ahora solo se admiten archivos tabulares (Excel/CSV)." };
    const hojaElegida = String(formData.get("hoja") ?? "").trim();
    const nombreHoja = await resolverHojaModulo(ingesta.hojas, hojaElegida, clienteId, moduloCodigo);
    const hoja = ingesta.hojas.find((h) => h.nombre === nombreHoja);
    if (!hoja) return { ok: false, message: "El archivo no tiene hojas legibles." };

    // Spec de partida: perfil PROPIO por huella si existe; si no, sugerencia INDICATIVA de
    // otro cliente del mismo ERP (huella exacta) o, en último caso, el heurístico de IA.
    const candidatas = huellasCandidatas([hoja]);
    const perfilSpec = await specPerfilModulo(clienteId, moduloCodigo, candidatas);
    let spec: SpecModulo;
    let origen: "perfil" | "sugerido" | "ia";
    let sugerencias: AnalisisModulo["sugerencias"];
    if (perfilSpec) {
      spec = perfilSpec;
      origen = "perfil";
    } else {
      const cliente = await prisma.client.findUnique({ where: { id: clienteId }, select: { erpId: true } });
      const porErp = cliente?.erpId
        ? await sugerenciasPerfilPorErp(clienteId, cliente.erpId, moduloCodigo, candidatas)
        : null;
      if (porErp?.sugerencias.exacto) {
        spec = SpecModuloSchema.parse(porErp.sugerencias.exacto.spec);
        origen = "sugerido";
      } else {
        spec = sugerirSpec(descriptor, hoja);
        origen = "ia";
      }
      if (porErp) {
        sugerencias = {
          erpName: porErp.erpName,
          exacto: porErp.sugerencias.exacto
            ? { clienteNombre: porErp.sugerencias.exacto.clienteNombre, archivoEjemplo: porErp.sugerencias.exacto.archivoEjemplo }
            : null,
          lista: porErp.sugerencias.lista.map((p) => ({
            clienteNombre: p.clienteNombre,
            huella: p.huella,
            archivoEjemplo: p.archivoEjemplo,
            vecesUsado: p.vecesUsado,
            spec: SpecModuloSchema.parse(p.spec),
          })),
        };
      }
    }

    // Encabezado + primeras filas de datos (todas las columnas) para el editor y el preview.
    const ancho = hoja.filas.reduce((m, f) => Math.max(m, f?.length ?? 0), 0);
    const aCelda = (v: CeldaCruda): CeldaMuestra => (v == null ? null : typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : String(v).replace(/\s+/g, " ").trim() || null);
    const rellena = (fila: CeldaCruda[] | undefined): CeldaMuestra[] => Array.from({ length: ancho }, (_, c) => aCelda(fila?.[c] ?? null));
    const encabezado = rellena(hoja.filas[spec.filaEncabezado - 1]);
    const muestraFilas = hoja.filas.slice(spec.primeraFilaDatos - 1, spec.primeraFilaDatos - 1 + 12).map(rellena);

    return { ok: true, hoja: hoja.nombre, hojas: ingesta.hojas.map((h) => h.nombre), totalFilas: hoja.filas.length, ancho, encabezado, muestraFilas, spec, origen, sugerencias };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("analizarArchivoModulo", e) };
  }
}

// ============================================================
// LEER: archivo → staging (borrador). Cliente OBLIGATORIO (los módulos no detectan NIT).
// ============================================================
export async function leerDatosModulo(_prev: ActionState | undefined, formData: FormData): Promise<ActionState & { loteId?: string }> {
  const moduloCodigo = String(formData.get("moduloCodigo") ?? "").trim().toUpperCase();
  const descriptor = descriptorModulo(moduloCodigo);
  if (!descriptor) return { ok: false, message: "Módulo no soportado." };

  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const clienteId = Number(formData.get("clienteId"));
  if (!Number.isInteger(clienteId) || clienteId <= 0) return { ok: false, message: "Selecciona el cliente." };
  const scope = await authorizePermiso("modulos_datos:crear", { clientId: clienteId });
  if (!scope.ok) return { ok: false, message: scope.message };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, message: "Adjunta el archivo del módulo." };

  try {
    const cliente = await prisma.client.findUnique({ where: { id: clienteId }, select: { name: true } });
    if (!cliente) return { ok: false, message: "El cliente seleccionado ya no existe." };

    let ingesta: Awaited<ReturnType<typeof ingerir>>;
    try {
      ingesta = await ingerir(await archivo.arrayBuffer(), archivo.name);
    } catch (e) {
      return { ok: false, message: mensajeErrorLecturaArchivoModulo("leerDatosModulo.ingerir", e) };
    }
    if (ingesta.modo !== "tabular") return { ok: false, message: "Por ahora solo se admiten archivos tabulares (Excel/CSV) para módulos." };
    const hojaElegida = String(formData.get("hoja") ?? "").trim();
    const nombreHoja = await resolverHojaModulo(ingesta.hojas, hojaElegida, clienteId, moduloCodigo);
    const hoja = ingesta.hojas.find((h) => h.nombre === nombreHoja);
    if (!hoja) return { ok: false, message: "El archivo no tiene hojas legibles." };

    // Spec: (1) editado a mano → manual · (2) perfil por huella → perfil · (3) heurístico → auto.
    const specEditadoRaw = formData.get("specJson");
    let spec: SpecModulo;
    let origen: "manual" | "perfil" | "ia";
    if (typeof specEditadoRaw === "string" && specEditadoRaw.trim()) {
      const parsed = SpecModuloSchema.safeParse(JSON.parse(specEditadoRaw));
      if (!parsed.success) return { ok: false, message: "El mapeo de columnas no es válido." };
      spec = parsed.data;
      // El origen es metadata de auditoría: se recompone contra fuentes del
      // servidor y nunca se acepta una etiqueta arbitraria enviada por el navegador.
      const perfilSpec = await specPerfilModulo(clienteId, moduloCodigo, huellasCandidatas([hoja]));
      if (perfilSpec && mismoSpecModulo(spec, perfilSpec)) origen = "perfil";
      else if (mismoSpecModulo(spec, sugerirSpec(descriptor, hoja))) origen = "ia";
      else origen = "manual";
    } else {
      const candidatas = huellasCandidatas([hoja]);
      const perfilSpec = await specPerfilModulo(clienteId, moduloCodigo, candidatas);
      if (perfilSpec) { spec = perfilSpec; origen = "perfil"; }
      else { spec = sugerirSpec(descriptor, hoja); origen = "ia"; }
    }

    const resultado = transformarModulo(descriptor, spec, hoja);
    if (resultado.filas.length === 0) return { ok: false, message: "No se leyeron filas con el mapeo actual. Ajusta las columnas." };

    const loteId = randomUUID();
    const huella = calcularHuella(hoja.nombre, hoja.filas[spec.filaEncabezado - 1] ?? []);
    const user = await getCurrentUser();
    // Reconciliación (red de seguridad de integridad): si quedaron filas con valor real por
    // encima del inicio efectivo, se guarda junto al spec del LOTE (JSON libre, sin migración)
    // para que el borrador pueda avisarlo. El perfil reutilizable (`perfilCargaModulo`) NO
    // lleva esta marca: es información de ESTE archivo, no del layout que se memoriza.
    const reconciliacion = resultadoAReconciliacion(resultado);
    const specConReconciliacion = reconciliacion ? { ...spec, reconciliacion } : spec;

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < resultado.filas.length; i += LOTE_STAGING_MODULO) {
        await tx.moduloImportacionStaging.createMany({
          data: resultado.filas.slice(i, i + LOTE_STAGING_MODULO).map((f) => ({
            loteId, moduloCodigo, clienteId, hoja: hoja.nombre, filaNum: f.filaNum,
            clasificador: f.clasificador, valor: f.valor, datos: f.datos, tipoFila: f.tipoFila,
          })),
        });
      }
      await tx.moduloImportacionLote.create({
        data: {
          moduloCodigo, loteId, clienteId, archivoNombre: archivo.name, archivoTam: tamArchivo(archivo.size),
          periodoInicial: fechaISO(formData.get("periodoInicio")), periodoFinal: fechaISO(formData.get("periodoFin")),
          filasLeidas: resultado.filasLeidas, filasExcluidas: resultado.filasExcluidas,
          huella, origenExtraccion: origen, specJson: specConReconciliacion,
          cargadoPor: user?.name ?? null, cargadoPorId: user?.id ?? null,
        },
      });
      // Perfil del layout por cliente+módulo: se guarda/actualiza para las próximas cargas.
      if (huella) {
        await tx.perfilCargaModulo.upsert({
          where: { clienteId_moduloCodigo_huella: { clienteId, moduloCodigo, huella } },
          create: { clienteId, moduloCodigo, huella, specJson: spec, origen, vecesUsado: 1, ultimoUsoEn: new Date(), archivoEjemplo: archivo.name, creadoPor: user?.name ?? null, creadoPorId: user?.id ?? null },
          update: { specJson: spec, vecesUsado: { increment: 1 }, ultimoUsoEn: new Date(), archivoEjemplo: archivo.name, ...(origen === "manual" ? { origen: "manual" } : {}) },
        });
      }
    }, {
      maxWait: 5_000,
      timeout: TIMEOUT_TRANSACCION_MODULO_MS,
    });

    await logAudit({ user: user?.name ?? "Sistema", action: `LEYÓ archivo de ${descriptor.label}`, entity: cliente.name, detail: `${resultado.filas.length} filas · ${archivo.name}` });
    revalidatePath(rutaModulo(moduloCodigo));
    return { ok: true, loteId, message: "Archivo leído. Revisa el borrador." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("leerDatosModulo", e) };
  }
}

// ============================================================
// EDITAR el borrador: marcar agrupador / omitir por fila (se guarda en el staging).
// ============================================================
export async function aplicarCambiosBorradorModulo(
  loteId: string,
  cambios: { filaNum: number; tipoFila?: string; omitida?: boolean | null; clasificador?: string | null }[],
  periodo?: string,
): Promise<ActionState> {
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(loteId ?? "").trim();
  if (!id) return { ok: false, message: "Borrador inválido." };
  try {
    const lote = await prisma.moduloImportacionLote.findUnique({ where: { loteId: id }, select: { clienteId: true, moduloCodigo: true } });
    if (!lote?.clienteId) return { ok: false, message: "El borrador ya no existe o no tiene cliente." };
    const scope = await authorizePermiso("modulos_datos:crear", { clientId: lote.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };
    const periodoNormalizado = periodo?.trim() ?? "";
    if (periodo !== undefined && !/^\d{4}-\d{2}$/.test(periodoNormalizado)) {
      return { ok: false, message: "Indica el período en formato AAAA-MM." };
    }
    await prisma.$transaction([
      ...cambios.filter((c) => Number.isInteger(c.filaNum)).map((c) =>
        prisma.moduloImportacionStaging.updateMany({
          where: { loteId: id, filaNum: c.filaNum },
          data: {
            ...(c.tipoFila === "agrupadora" || c.tipoFila === "movimiento" ? { tipoFila: c.tipoFila, tipoFilaForzado: c.tipoFila } : {}),
            ...(c.omitida !== undefined ? { omitida: c.omitida } : {}),
            // Agrupador manual: reasigna el clasificador de la fila (vacío → sin clasificar).
            ...(c.clasificador !== undefined ? { clasificador: c.clasificador?.trim() ? c.clasificador.trim() : null } : {}),
          },
        }),
      ),
      ...(periodo !== undefined
        ? [prisma.moduloImportacionLote.update({
            where: { loteId: id },
            data: {
              periodoInicial: new Date(`${periodoNormalizado}-01T00:00:00`),
              periodoFinal: new Date(`${periodoNormalizado}-01T00:00:00`),
            },
          })]
        : []),
    ]);
    revalidatePath(`${rutaModulo(lote.moduloCodigo)}/borradores/${id}`);
    return { ok: true, message: "Cambios guardados." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("aplicarCambiosBorradorModulo", e) };
  }
}

// ============================================================
// PROMOVER el borrador a oficial (staging → detalle) + purga.
// ============================================================
export async function cargarBorradorModulo(_prev: ActionState | undefined, formData: FormData): Promise<ActionState & { encabezadoId?: number; modo?: "agregar" | "version" }> {
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const loteId = String(formData.get("loteId") ?? "").trim();
  if (!loteId) return { ok: false, message: "Borrador inválido." };
  const periodo = String(formData.get("periodo") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(periodo)) return { ok: false, message: "Indica el período (p. ej. 2026-03)." };
  const observaciones = String(formData.get("observaciones") ?? "").trim().slice(0, 4000) || null;
  try {
    // Reintento idempotente: si el navegador perdió la respuesta después del
    // commit, el lote ya no existe pero su encabezado conserva el mismo UUID.
    const yaPromovido = await prisma.moduloDatoEncabezado.findUnique({
      where: { loteId },
      select: { id: true, clienteId: true, version: true },
    });
    if (yaPromovido) {
      const scope = await authorizePermiso("modulos_datos:crear", { clientId: yaPromovido.clienteId });
      if (!scope.ok) return { ok: false, message: scope.message };
      return { ok: true, encabezadoId: yaPromovido.id, message: `La versión v${yaPromovido.version} ya había sido cargada.` };
    }
    // Mismo reintento, pero para un anexo (modo "agregar"): el detalle ya se sumó al
    // vigente en un intento previo, aunque este loteId no bautizó ningún encabezado.
    const yaFusionado = await prisma.moduloDatoEncabezado.findFirst({
      where: { observaciones: { contains: marcaAnexoModulo(loteId) } },
      select: { id: true, clienteId: true, version: true, periodo: true },
    });
    if (yaFusionado) {
      const scope = await authorizePermiso("modulos_datos:crear", { clientId: yaFusionado.clienteId });
      if (!scope.ok) return { ok: false, message: scope.message };
      return { ok: true, encabezadoId: yaFusionado.id, message: `Ese archivo ya se había agregado a la v${yaFusionado.version} del período ${yaFusionado.periodo}.` };
    }

    const lote = await prisma.moduloImportacionLote.findUnique({
      where: { loteId },
      select: { clienteId: true, moduloCodigo: true },
    });
    if (!lote?.clienteId) return { ok: false, message: "El borrador ya no existe o no tiene cliente." };
    const scope = await authorizePermiso("modulos_datos:crear", { clientId: lote.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };
    const descriptor = descriptorModulo(lote.moduloCodigo);
    if (!descriptor) return { ok: false, message: "Módulo no soportado." };

    // Checklist de verificación (novedades): TODAS las preguntas del descriptor deben venir
    // respondidas (si | no | na). Se guarda id → { respuesta, nota }.
    const verifSchema = z.record(z.string(), z.object({ respuesta: z.enum(["si", "no", "na"]), nota: z.string().max(1000).optional() }));
    let verificaciones: Record<string, { respuesta: "si" | "no" | "na"; nota?: string }> = {};
    const verifRaw = formData.get("verificaciones");
    if (typeof verifRaw === "string" && verifRaw.trim()) {
      const parsed = verifSchema.safeParse(JSON.parse(verifRaw));
      if (!parsed.success) return { ok: false, message: "Respuestas de verificación inválidas." };
      verificaciones = parsed.data;
    }
    const faltan = (descriptor.verificaciones ?? []).filter((v) => !verificaciones[v.id]);
    if (faltan.length) return { ok: false, message: "Responde todas las verificaciones antes de cargar." };

    const cliente = await prisma.client.findUnique({ where: { id: lote.clienteId }, select: { name: true } });
    if (!cliente) return { ok: false, message: "El cliente ya no existe." };
    const user = await getCurrentUser();

    const resultado = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, `modulo-promocion:${loteId}`);

      const existente = await tx.moduloDatoEncabezado.findUnique({
        where: { loteId },
        select: { id: true, version: true, filas: true, total: true },
      });
      if (existente) return { encabezadoId: existente.id, version: existente.version, filas: existente.filas, total: Number(existente.total), aportados: existente.filas, reutilizado: true, modo: "version" as const };

      await tomarCandadoTransaccion(tx, `modulo-borrador:${loteId}`);
      const loteActual = await tx.moduloImportacionLote.findUnique({
        where: { loteId },
        select: {
          id: true,
          clienteId: true,
          moduloCodigo: true,
          archivoNombre: true,
          archivoTam: true,
          origenExtraccion: true,
        },
      });
      if (!loteActual || loteActual.clienteId == null || loteActual.clienteId !== lote.clienteId || loteActual.moduloCodigo !== lote.moduloCodigo) {
        throw new Error("El borrador cambió durante la carga o ya no existe; no se creó ninguna versión.");
      }

      const filasBD = await tx.moduloImportacionStaging.findMany({ where: { loteId }, orderBy: { filaNum: "asc" } });
      if (filasBD.length === 0) throw new Error("El borrador no tiene filas.");
      const filas: FilaStagingModulo[] = filasBD.map((f) => ({
        filaNum: f.filaNum,
        clasificador: f.clasificador,
        valor: Number(f.valor),
        datos: (f.datos ?? {}) as Record<string, unknown>,
        tipoFila: f.tipoFila,
        omitida: f.omitida,
      }));
      const columnasNumericas = descriptor.columnas
        .filter((c) => c.tipo === "numero" || c.tipo === "moneda")
        .map((c) => c.nombre);
      // Todas las filas del lote comparten hoja (una sola por archivo importado).
      const hojaLote = filasBD.find((f) => f.hoja)?.hoja ?? null;
      const promocion = promoverStaging(filas, columnasNumericas);
      if (promocion.filas === 0) {
        throw new Error("No hay filas imputables para cargar (todas omitidas, agrupadoras o en cero).");
      }

      // Serializa el consecutivo y el cambio de versión vigente para este grupo (también
      // serializa dos anexos concurrentes al mismo vigente: el segundo espera al primero).
      await tomarCandadoTransaccion(tx, `modulo-cargue:${loteActual.clienteId}:${loteActual.moduloCodigo}:${periodo}`);
      const ahora = new Date();

      // Fraccionamiento: el vigente del período (si lo hay) decide si el archivo se
      // AGREGA (ítems nuevos → misma versión, se acumula) o si crea una VERSIÓN nueva
      // completa (re-subida de algún ítem ya cargado, o el vigente está congelado).
      const vigente = await tx.moduloDatoEncabezado.findFirst({
        where: { clienteId: loteActual.clienteId, moduloCodigo: loteActual.moduloCodigo, periodo, esOficial: true },
        select: { id: true, version: true, filas: true, total: true, observaciones: true, estaCongelado: true },
      });
      const refRol = refRolDe(descriptor);
      const clavesNuevas = clavesDeDetalle(promocion.detalle, refRol);
      let clavesExistentes = new Set<string>();
      let maxFilaExistente = 0;
      if (vigente) {
        const detalleVigente = await tx.moduloDatoDetalle.findMany({
          where: { encabezadoId: vigente.id },
          select: { filaNum: true, clasificador: true, datos: true },
        });
        clavesExistentes = clavesDeDetalle(
          detalleVigente.map((d) => ({ clasificador: d.clasificador, datos: (d.datos ?? {}) as Record<string, unknown> })),
          refRol,
        );
        maxFilaExistente = detalleVigente.reduce((m, d) => Math.max(m, d.filaNum), 0);
      }
      const decision = decidirCarga({
        hayVigente: !!vigente,
        vigenteCongelado: vigente?.estaCongelado ?? false,
        clavesNuevas,
        clavesExistentes,
      });

      if (decision.modo === "agregar" && vigente) {
        const { filas: detalleRemapeado, remap } = remapFilas(promocion.detalle, maxFilaExistente);
        await tx.moduloDatoDetalle.createMany({
          data: detalleRemapeado.map((d) => ({
            encabezadoId: vigente.id,
            filaNum: d.filaNum,
            clasificador: d.clasificador,
            valor: d.valor,
            datos: d.datos as Prisma.InputJsonValue,
          })),
        });

        // No toca `hoja` del encabezado (es la del archivo principal); la del anexo
        // queda en la propia línea de observaciones, junto al resto de la evidencia.
        const hojaTxt = hojaLote ? ` · hoja: ${hojaLote}` : "";
        const linea = `Anexo: ${loteActual.archivoNombre}${hojaTxt} (+${promocion.filas} ítems) · ${ahora.toISOString().slice(0, 10)}${observaciones ? ` — ${observaciones}` : ""} ${marcaAnexoModulo(loteId)}`;
        const observacionesFinal = vigente.observaciones ? `${vigente.observaciones}\n${linea}` : linea;

        await tx.moduloDatoEncabezado.update({
          where: { id: vigente.id },
          data: {
            filas: { increment: promocion.filas },
            total: { increment: promocion.total },
            ultimaCarga: ahora,
            cargadoPor: user?.name ?? null,
            cargadoPorId: user?.id ?? null,
            observaciones: observacionesFinal,
            verificaciones: verificaciones as Prisma.InputJsonValue,
          },
        });

        // Reancla SOLO los comentarios `fila:<n>` cuyo renglón se promovió (está en el
        // remap); los de otras anclas, o de filas que no llegaron al oficial, migran tal cual.
        const comentarios = await tx.comment.findMany({ where: { entityType: "modulos_borrador", entityId: loteActual.id } });
        for (const c of comentarios) {
          const m = /^fila:(\d+)$/.exec(c.anchor ?? "");
          const nuevaFila = m ? remap.get(Number(m[1])) : undefined;
          await tx.comment.update({
            where: { id: c.id },
            data: { entityType: "modulos_datos", entityId: vigente.id, ...(nuevaFila != null ? { anchor: `fila:${nuevaFila}` } : {}) },
          });
        }

        const stagingEliminado = await tx.moduloImportacionStaging.deleteMany({ where: { loteId } });
        if (stagingEliminado.count === 0) throw new Error("No se pudo consumir el detalle del borrador; la promoción fue revertida.");
        const loteEliminado = await tx.moduloImportacionLote.deleteMany({ where: { loteId } });
        if (loteEliminado.count !== 1) throw new Error("No se pudo consumir el encabezado del borrador; la promoción fue revertida.");

        return {
          encabezadoId: vigente.id,
          version: vigente.version,
          filas: vigente.filas + promocion.filas,
          total: Number(vigente.total) + promocion.total,
          aportados: promocion.filas,
          reutilizado: false,
          modo: "agregar" as const,
        };
      }

      // VERSIÓN nueva completa (sin vigente, vigente congelado, o re-subida de un ítem):
      // cada confirmación en este modo es una fotografía independiente. Ningún detalle se
      // anexa a una versión anterior: las anteriores quedan como historial.
      const previa = await tx.moduloDatoEncabezado.findFirst({
        where: { clienteId: loteActual.clienteId, moduloCodigo: loteActual.moduloCodigo, periodo },
        orderBy: [{ version: "desc" }, { id: "desc" }],
        select: { version: true },
      });
      const version = (previa?.version ?? 0) + 1;

      await tx.moduloDatoEncabezado.updateMany({
        where: { clienteId: loteActual.clienteId, moduloCodigo: loteActual.moduloCodigo, periodo, esOficial: true },
        data: { esOficial: false },
      });
      const enc = await tx.moduloDatoEncabezado.create({
        data: {
          moduloCodigo: loteActual.moduloCodigo,
          loteId,
          clienteId: loteActual.clienteId,
          nombreCliente: cliente.name,
          periodo,
          version,
          esOficial: true,
          filas: promocion.filas,
          total: promocion.total,
          archivoNombre: loteActual.archivoNombre,
          archivoTam: loteActual.archivoTam,
          hoja: hojaLote,
          origenExtraccion: loteActual.origenExtraccion,
          observaciones,
          verificaciones: verificaciones as Prisma.InputJsonValue,
          cargadoPor: user?.name ?? null,
          cargadoPorId: user?.id ?? null,
          ultimaCarga: ahora,
          detalles: {
            create: promocion.detalle.map((d) => ({
              filaNum: d.filaNum,
              clasificador: d.clasificador,
              valor: d.valor,
              datos: d.datos as Prisma.InputJsonValue,
            })),
          },
        },
        select: { id: true },
      });

      await tx.comment.updateMany({
        where: { entityType: "modulos_borrador", entityId: loteActual.id },
        data: { entityType: "modulos_datos", entityId: enc.id },
      });
      const stagingEliminado = await tx.moduloImportacionStaging.deleteMany({ where: { loteId } });
      if (stagingEliminado.count === 0) throw new Error("No se pudo consumir el detalle del borrador; la promoción fue revertida.");
      const loteEliminado = await tx.moduloImportacionLote.deleteMany({ where: { loteId } });
      if (loteEliminado.count !== 1) throw new Error("No se pudo consumir el encabezado del borrador; la promoción fue revertida.");

      return { encabezadoId: enc.id, version, filas: promocion.filas, total: promocion.total, aportados: promocion.filas, reutilizado: false, modo: "version" as const };
    }, { timeoutMs: TIMEOUT_TRANSACCION_MODULO_MS });

    const mensaje = resultado.modo === "agregar"
      ? `Agregado a ${descriptor.label} del período ${periodo} (${resultado.aportados} ítems nuevos, total ${resultado.filas}).`
      : `Nueva versión v${resultado.version} cargada (${resultado.filas} filas).`;
    if (!resultado.reutilizado) {
      await logAudit({
        user: user?.name ?? "Sistema",
        action: resultado.modo === "agregar" ? `AGREGÓ ítems a ${descriptor.label}` : `CARGÓ ${descriptor.label}`,
        entity: cliente.name,
        detail: resultado.modo === "agregar"
          ? `${periodo} · v${resultado.version} · +${resultado.aportados} filas (total ${resultado.filas}) · total $ ${resultado.total}`
          : `${periodo} · v${resultado.version} · ${resultado.filas} filas · total ${resultado.total}`,
        clientId: lote.clienteId,
      });
    }
    revalidatePath(rutaModulo(lote.moduloCodigo));
    return { ok: true, encabezadoId: resultado.encabezadoId, modo: resultado.modo, message: mensaje };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("cargarBorradorModulo", e) };
  }
}

// ============================================================
// DESCARTAR el borrador (staging + lote).
// ============================================================
export async function descartarBorradorModulo(loteId: string): Promise<ActionState> {
  const authz = await authorizePermiso("modulos_datos:crear");
  if (!authz.ok) return { ok: false, message: authz.message };
  const id = String(loteId ?? "").trim();
  if (!id) return { ok: false, message: "Borrador inválido." };
  try {
    const lote = await prisma.moduloImportacionLote.findUnique({ where: { loteId: id }, select: { id: true, clienteId: true, moduloCodigo: true } });
    if (!lote) return { ok: true, message: "El borrador ya no existía." };
    if (lote.clienteId) {
      const scope = await authorizePermiso("modulos_datos:crear", { clientId: lote.clienteId });
      if (!scope.ok) return { ok: false, message: scope.message };
    }
    await prisma.$transaction([
      prisma.comment.deleteMany({ where: { entityType: "modulos_borrador", entityId: lote.id } }),
      prisma.moduloImportacionStaging.deleteMany({ where: { loteId: id } }),
      prisma.moduloImportacionLote.deleteMany({ where: { loteId: id } }),
    ]);
    revalidatePath(rutaModulo(lote.moduloCodigo));
    return { ok: true, message: "Borrador descartado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("descartarBorradorModulo", e) };
  }
}

// ============================================================
// CONSOLIDACIÓN por cliente: clasificador → cuenta de 4 díg (upsert / borrar).
// ============================================================
function normalizarCuenta4(v: string): string {
  return String(v ?? "").replace(/\D/g, "").slice(0, 4);
}


// Normaliza + deduplica un conjunto de cuentas de 4 díg de un clasificador.
function normalizarCuentas4(cuentas: string[]): string[] {
  return [...new Set((cuentas ?? []).map(normalizarCuenta4).filter((c) => c.length === 4))];
}

// Valida que TODAS las cuentas del conjunto sean de 4 díg y del módulo (una vez).
async function validarCuentas4Modulo(moduloCodigo: string, cuentas: string[]): Promise<ActionState | null> {
  const invalidaLargo = cuentas.find((c) => c.length !== 4);
  if (invalidaLargo) return { ok: false, message: "Cada cuenta debe ser de 4 dígitos." };
  const prefijos = prefijosCuentaModulo(moduloCodigo, await getCatalogoPrevalidador());
  const fuera = cuentas.find((c) => !cuenta4DelModulo(c, prefijos));
  if (fuera) {
    const listado = prefijos.length ? prefijos.join(", ") : "—";
    return { ok: false, message: `La cuenta ${fuera} no pertenece al módulo ${moduloCodigo}. Usa una cuenta de estos prefijos: ${listado}.` };
  }
  return null;
}

// Reemplaza el CONJUNTO de cuentas de un clasificador dentro de una transacción (tx):
// borra las que ya tenía y crea las nuevas. Conjunto vacío = deja el clasificador sin cuenta.
// `descripcion` es el nombre legible del clasificador (Nómina: el concepto detrás del
// código, cargado en /config/conceptos-nomina): se RE-ESCRIBE al recrear las filas para
// que editar las cuentas a mano no borre el nombre.
function reemplazarCuentasTx(tx: Prisma.TransactionClient, clienteId: number, moduloCodigo: string, clasificador: string, cuentas: string[], actor: string | null, descripcion: string | null = null) {
  return [
    tx.consolidacionModuloCliente.deleteMany({ where: { clienteId, moduloCodigo, clasificador } }),
    ...(cuentas.length
      ? [tx.consolidacionModuloCliente.createMany({ data: cuentas.map((cuenta4) => ({ clienteId, moduloCodigo, clasificador, descripcion, cuenta4, actualizadoPor: actor })) })]
      : []),
  ];
}

// Nombre legible ya guardado de cada clasificador, para no perderlo al reemplazar sus cuentas.
async function descripcionesGuardadas(clienteId: number, moduloCodigo: string, clasificadores: string[]): Promise<Map<string, string>> {
  const filas = await prisma.consolidacionModuloCliente.findMany({
    where: { clienteId, moduloCodigo, clasificador: { in: clasificadores } },
    select: { clasificador: true, descripcion: true },
  });
  const mapa = new Map<string, string>();
  for (const f of filas) if (f.descripcion && !mapa.has(f.clasificador)) mapa.set(f.clasificador, f.descripcion);
  return mapa;
}

// Bitácora de la consolidación: una sola pulsación puede reescribir decenas de
// clasificadores (asignación masiva), así que queda registrado el alcance.
async function auditarConsolidacion(clienteId: number, moduloCodigo: string, filas: { cuentas4: string[] }[]) {
  const [user, cliente] = await Promise.all([
    getCurrentUser(),
    prisma.client.findUnique({ where: { id: clienteId }, select: { name: true } }),
  ]);
  const cuentas = filas.reduce((n, f) => n + f.cuentas4.length, 0);
  await logAudit({
    user: user?.name ?? "Sistema",
    action: "ACTUALIZÓ consolidación de módulo",
    entity: cliente?.name ?? `Cliente ${clienteId}`,
    detail: `${moduloCodigo} · ${filas.length} clasificador(es) · ${cuentas} cuenta(s)`,
    clientId: clienteId,
  });
}

/** Guarda el conjunto de cuentas (1..N) de UN clasificador (reemplaza lo anterior). */
export async function guardarConsolidacionModulo(input: { clienteId: number; moduloCodigo: string; clasificador: string; cuentas4: string[] }): Promise<ActionState> {
  const moduloCodigo = String(input.moduloCodigo ?? "").trim().toUpperCase();
  if (!descriptorModulo(moduloCodigo)) return { ok: false, message: "Módulo no soportado." };
  const authz = await authorizePermiso("modulos_datos:editar", { clientId: input.clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };
  const clasificador = String(input.clasificador ?? "").trim();
  if (!clasificador) return { ok: false, message: "Indica el clasificador." };
  const cuentas4 = normalizarCuentas4(input.cuentas4);
  const invalida = await validarCuentas4Modulo(moduloCodigo, cuentas4);
  if (invalida) return invalida;
  try {
    const user = await getCurrentUser();
    const descripciones = await descripcionesGuardadas(input.clienteId, moduloCodigo, [clasificador]);
    await prisma.$transaction(
      reemplazarCuentasTx(prisma, input.clienteId, moduloCodigo, clasificador, cuentas4, user?.name ?? null, descripciones.get(clasificador) ?? null),
    );
    await auditarConsolidacion(input.clienteId, moduloCodigo, [{ cuentas4 }]);
    revalidatePath(rutaModulo(moduloCodigo));
    return { ok: true, message: "Consolidación guardada." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarConsolidacionModulo", e) };
  }
}

/** Guarda de una vez el conjunto de cuentas de varios clasificadores (reemplaza cada uno). */
export async function guardarConsolidacionModuloLote(input: {
  clienteId: number;
  moduloCodigo: string;
  filas: { clasificador: string; cuentas4: string[] }[];
}): Promise<ActionState> {
  const moduloCodigo = String(input.moduloCodigo ?? "").trim().toUpperCase();
  if (!descriptorModulo(moduloCodigo)) return { ok: false, message: "Módulo no soportado." };
  const authz = await authorizePermiso("modulos_datos:editar", { clientId: input.clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };

  const filas = (input.filas ?? [])
    .map((f) => ({ clasificador: String(f.clasificador ?? "").trim(), cuentas4: normalizarCuentas4(f.cuentas4) }))
    .filter((f) => f.clasificador);
  if (filas.length === 0) return { ok: false, message: "No hay cambios para guardar." };

  const invalida = await validarCuentas4Modulo(moduloCodigo, filas.flatMap((f) => f.cuentas4));
  if (invalida) return invalida;

  try {
    const user = await getCurrentUser();
    const actor = user?.name ?? null;
    const descripciones = await descripcionesGuardadas(input.clienteId, moduloCodigo, filas.map((f) => f.clasificador));
    await prisma.$transaction(
      filas.flatMap((f) =>
        reemplazarCuentasTx(prisma, input.clienteId, moduloCodigo, f.clasificador, f.cuentas4, actor, descripciones.get(f.clasificador) ?? null),
      ),
    );
    await auditarConsolidacion(input.clienteId, moduloCodigo, filas);
    revalidatePath(rutaModulo(moduloCodigo));
    return { ok: true, message: filas.length === 1 ? "Consolidación guardada." : `${filas.length} consolidaciones guardadas.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarConsolidacionModuloLote", e) };
  }
}

// ============================================================
// MARCAS DE AUDITORÍA sobre las diferencias del CRUCE CONTABLE.
//
// Sustituyen a la antigua «justificación» escrita dentro de la celda: la cédula solo lleva
// la marca numerada y el detalle vive al pie, en observaciones, con referencia al anexo y
// soportes adjuntos.
//
// La marca vive por (cliente, módulo, período, cuenta Russell de 4 díg.) y no por cargue,
// así que sobrevive a las versiones nuevas del período. Exige la misma autorización que
// editar la consolidación (`modulos_datos:editar` + alcance de escritura sobre el cliente)
// y deja además el detalle en el hilo de comentarios de la cuenta (`cruce:XXXX`), para que
// quede a la vista de quien revisa. El comentario es un rastro: si se borra, la marca sigue
// (FK suave). Los soportes sí son FK dura: retirar la marca se lleva sus anexos.
// ============================================================

/** Encabezado + período al que pertenece una marca, con el permiso ya verificado. */
async function contextoMarcaCruce(encabezadoId: number) {
  if (!Number.isSafeInteger(encabezadoId)) return { ok: false as const, message: "Cargue inválido." };
  const encabezado = await prisma.moduloDatoEncabezado.findUnique({
    where: { id: encabezadoId },
    select: { id: true, clienteId: true, moduloCodigo: true, periodo: true, nombreCliente: true },
  });
  if (!encabezado) return { ok: false as const, message: "El cargue ya no existe." };
  const authz = await authorizePermiso("modulos_datos:editar", { clientId: encabezado.clienteId });
  if (!authz.ok) return { ok: false as const, message: authz.message };
  return { ok: true as const, encabezado, userId: authz.userId };
}

async function auditarMarcaCruce(
  encabezado: { clienteId: number; moduloCodigo: string; periodo: string; nombreCliente: string },
  accion: string,
  cuenta4: string,
  detalleExtra: string,
) {
  const user = await getCurrentUser();
  await logAudit({
    user: user?.name ?? "Sistema",
    action: accion,
    entity: encabezado.nombreCliente,
    detail: `${encabezado.moduloCodigo} · ${encabezado.periodo} · cuenta ${cuenta4}${detalleExtra}`,
    clientId: encabezado.clienteId,
  });
}

/** Los archivos que vienen del formulario de la marca, ya filtrados. */
function soportesDelFormulario(formData: FormData): File[] {
  return formData.getAll("soportes").filter((v): v is File => v instanceof File && v.size > 0);
}

/**
 * Valida los soportes ANTES de tocar la BD (contenido real, no extensión) y los devuelve
 * listos para subir. Que un anexo inválido no deje la marca escrita a medias.
 */
async function prepararSoportesMarca(archivos: File[], yaGuardados: number) {
  if (archivos.length === 0) return { ok: true as const, soportes: [] };
  if (yaGuardados + archivos.length > SOPORTES_MARCA_MAX) {
    return {
      ok: false as const,
      message: `Una marca admite hasta ${SOPORTES_MARCA_MAX} soportes (ya tiene ${yaGuardados}).`,
    };
  }
  if (!almacenamientoDisponible()) {
    return {
      ok: false as const,
      message: "El almacenamiento de soportes no está configurado. Avisa al administrador o guarda la marca sin adjuntos.",
    };
  }

  const soportes: { bytes: Uint8Array; tipo: TipoSoporteMarca; contentType: string; nombre: string; tamano: number }[] = [];
  for (const archivo of archivos) {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const val = validarSoporteMarca(bytes, archivo.name);
    if (!val.ok) return { ok: false as const, message: val.error };
    soportes.push({
      bytes,
      tipo: val.tipo,
      contentType: val.contentType,
      nombre: nombreArchivoSeguro(archivo.name, val.tipo),
      tamano: bytes.length,
    });
  }
  return { ok: true as const, soportes };
}

/**
 * Guarda (o reescribe) la MARCA de una cuenta del cruce y sube sus soportes.
 *
 * `diferencia` se congela para poder avisar después si el monto cambió. El número se
 * asigna una sola vez, al crear: reescribir el detalle no renumera la marca ni mueve su
 * lugar en las observaciones.
 */
export async function guardarMarcaCruce(formData: FormData): Promise<ActionState> {
  const encabezadoId = Number(formData.get("encabezadoId"));
  const ctx = await contextoMarcaCruce(encabezadoId);
  if (!ctx.ok) return { ok: false, message: ctx.message };

  const cuenta4 = cuenta4Marcable(String(formData.get("cuenta4") ?? ""));
  if (!cuenta4) return { ok: false, message: "Cuenta inválida." };
  const nota = validarNotaMarca(String(formData.get("nota") ?? ""));
  if (!nota.ok) return { ok: false, message: nota.message };
  const anexo = validarReferenciaAnexo(String(formData.get("referenciaAnexo") ?? ""));
  if (!anexo.ok) return { ok: false, message: anexo.message };
  const diferencia = Number(formData.get("diferencia"));
  if (!Number.isFinite(diferencia)) return { ok: false, message: "Diferencia inválida." };

  const { encabezado } = ctx;
  const llave = {
    clienteId: encabezado.clienteId,
    moduloCodigo: encabezado.moduloCodigo,
    periodo: encabezado.periodo,
    cuenta4,
  };

  try {
    const existente = await prisma.marcaCruceModulo.findUnique({
      where: { clienteId_moduloCodigo_periodo_cuenta4: llave },
      select: { id: true, numero: true, _count: { select: { adjuntos: true } } },
    });

    const preparados = await prepararSoportesMarca(soportesDelFormulario(formData), existente?._count.adjuntos ?? 0);
    if (!preparados.ok) return { ok: false, message: preparados.message };

    const user = await getCurrentUser();
    // El rastro en el hilo de la cuenta va primero: si falla, no se guarda una marca que
    // dice apuntar a un comentario inexistente.
    const comentario = await prisma.comment.create({
      data: {
        entityType: "modulos_datos",
        entityId: encabezado.id,
        anchor: anclaCruce(cuenta4),
        authorId: ctx.userId,
        body: anexo.referencia ? `${nota.nota}\n\nAnexo: ${anexo.referencia}` : nota.nota,
      },
      select: { id: true },
    });

    const datosComunes = {
      nota: nota.nota,
      referenciaAnexo: anexo.referencia,
      diferencia: new Prisma.Decimal(diferencia.toFixed(2)),
      comentarioId: comentario.id,
      marcadoPor: user?.name ?? null,
      marcadoPorId: ctx.userId,
      marcadoEn: new Date(),
    };

    // El número se asigna dentro de una transacción serializable con candado del período:
    // dos personas marcando cuentas distintas a la vez no pueden quedarse con el mismo
    // número (el índice único lo impediría, pero aquí ni siquiera llegan a chocar).
    const marca = existente
      ? await prisma.marcaCruceModulo.update({
          where: { id: existente.id },
          data: datosComunes,
          select: { id: true, numero: true },
        })
      : await transaccionSerializable(async (tx) => {
          await tomarCandadoTransaccion(tx, `marca-cruce:${encabezado.clienteId}:${encabezado.moduloCodigo}:${encabezado.periodo}`);
          const usados = await tx.marcaCruceModulo.findMany({
            where: {
              clienteId: encabezado.clienteId,
              moduloCodigo: encabezado.moduloCodigo,
              periodo: encabezado.periodo,
            },
            select: { numero: true },
          });
          return tx.marcaCruceModulo.create({
            data: { ...llave, ...datosComunes, numero: siguienteNumeroMarca(usados.map((u) => u.numero)) },
            select: { id: true, numero: true },
          });
        });

    const subidos = await persistirSoportesMarca(marca.id, ctx.userId, preparados.soportes);

    await auditarMarcaCruce(
      encabezado,
      existente ? "EDITÓ la marca del cruce contable" : "MARCÓ una diferencia del cruce contable",
      cuenta4,
      ` · marca ${marca.numero} · ${diferencia.toFixed(2)}${subidos ? ` · ${subidos} soporte(s)` : ""}`,
    );
    revalidatePath(`${rutaModulo(encabezado.moduloCodigo)}/${encabezado.id}`);
    return {
      ok: true,
      message: existente ? `Marca ${marca.numero} actualizada.` : `Marca ${marca.numero} registrada.`,
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarMarcaCruce", e) };
  }
}

/**
 * Sube los soportes y los registra. Si un archivo falla a mitad, se barre lo ya subido:
 * un objeto huérfano en el almacenamiento no le sirve a nadie. La marca en sí ya está
 * guardada — el detalle no se pierde porque el anexo no haya podido subir.
 */
async function persistirSoportesMarca(
  marcaId: number,
  userId: number | null,
  soportes: { bytes: Uint8Array; tipo: TipoSoporteMarca; contentType: string; nombre: string; tamano: number }[],
): Promise<number> {
  if (soportes.length === 0) return 0;
  const claves: string[] = [];
  try {
    for (const soporte of soportes) {
      const clave = claveSoporteMarca(marcaId, randomUUID().slice(0, 12), soporte.tipo);
      await subirObjeto({ key: clave, cuerpo: soporte.bytes, contentType: soporte.contentType });
      claves.push(clave);
      await prisma.adjuntoMarcaCruce.create({
        data: {
          marcaId,
          claveObjeto: clave,
          nombreArchivo: soporte.nombre,
          tipoContenido: soporte.contentType,
          tamanoBytes: soporte.tamano,
          subidoPorId: userId,
        },
      });
    }
    return soportes.length;
  } catch (e) {
    await Promise.allSettled(claves.map((clave) => eliminarObjeto(clave)));
    throw e;
  }
}

/** Retira la marca de una cuenta y sus soportes. El comentario del hilo se conserva. */
export async function quitarMarcaCruce(input: {
  encabezadoId: number;
  cuenta4: string;
}): Promise<ActionState> {
  const ctx = await contextoMarcaCruce(input.encabezadoId);
  if (!ctx.ok) return { ok: false, message: ctx.message };

  const cuenta4 = cuenta4Marcable(String(input.cuenta4 ?? ""));
  if (!cuenta4) return { ok: false, message: "Cuenta inválida." };

  const { encabezado } = ctx;
  try {
    const marca = await prisma.marcaCruceModulo.findUnique({
      where: {
        clienteId_moduloCodigo_periodo_cuenta4: {
          clienteId: encabezado.clienteId,
          moduloCodigo: encabezado.moduloCodigo,
          periodo: encabezado.periodo,
          cuenta4,
        },
      },
      select: { id: true, numero: true, adjuntos: { select: { claveObjeto: true } } },
    });
    if (!marca) return { ok: false, message: "Esa diferencia ya no estaba marcada." };

    // La BD manda: primero se borra la fila (cascada a los adjuntos) y después los
    // objetos. Al revés, un fallo dejaría registros apuntando a soportes inexistentes.
    await prisma.marcaCruceModulo.delete({ where: { id: marca.id } });
    await Promise.allSettled(marca.adjuntos.map((a) => eliminarObjeto(a.claveObjeto)));

    await auditarMarcaCruce(encabezado, "RETIRÓ la marca del cruce contable", cuenta4, ` · marca ${marca.numero}`);
    revalidatePath(`${rutaModulo(encabezado.moduloCodigo)}/${encabezado.id}`);
    return { ok: true, message: `Marca ${marca.numero} retirada.` };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("quitarMarcaCruce", e) };
  }
}

/** Elimina UN soporte de una marca, sin tocar la observación. */
export async function eliminarSoporteMarca(input: {
  encabezadoId: number;
  soporteId: number;
}): Promise<ActionState> {
  const ctx = await contextoMarcaCruce(input.encabezadoId);
  if (!ctx.ok) return { ok: false, message: ctx.message };

  const soporteId = Number(input.soporteId);
  if (!Number.isSafeInteger(soporteId)) return { ok: false, message: "Soporte inválido." };

  const { encabezado } = ctx;
  try {
    const soporte = await prisma.adjuntoMarcaCruce.findUnique({
      where: { id: soporteId },
      select: {
        claveObjeto: true,
        nombreArchivo: true,
        marca: { select: { clienteId: true, moduloCodigo: true, periodo: true, cuenta4: true, numero: true } },
      },
    });
    if (!soporte) return { ok: false, message: "Ese soporte ya no existe." };
    // El permiso se verificó sobre ESTE cargue: el soporte tiene que ser del mismo
    // cliente, módulo y período, o el id sería una puerta a los papeles de otro cliente.
    const m = soporte.marca;
    if (m.clienteId !== encabezado.clienteId || m.moduloCodigo !== encabezado.moduloCodigo || m.periodo !== encabezado.periodo) {
      return { ok: false, message: "Ese soporte no pertenece a este período." };
    }

    await prisma.adjuntoMarcaCruce.delete({ where: { id: soporteId } });
    await eliminarObjeto(soporte.claveObjeto).catch(() => {});

    await auditarMarcaCruce(encabezado, "ELIMINÓ un soporte de la marca del cruce contable", m.cuenta4, ` · marca ${m.numero} · ${soporte.nombreArchivo}`);
    revalidatePath(`${rutaModulo(encabezado.moduloCodigo)}/${encabezado.id}`);
    return { ok: true, message: "Soporte eliminado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarSoporteMarca", e) };
  }
}

// ============================================================
// ELIMINAR datos CARGADOS del módulo (no borradores: eso es `descartarBorradorModulo`).
//
// Alcance explícito —una versión, todo el período o todo el historial del cliente
// junto con sus perfiles de formato—, resuelto en `alcance-eliminacion.ts` (puro).
// El permiso `modulos_datos:eliminar` es independiente de cargar/editar y se
// vuelve a comprobar con alcance sobre el cliente del cargue.
//
// NO se tocan: el cliente, sus borradores, sus preferencias de carga, sus
// correcciones por fila ni la consolidación clasificador→cuenta (configuración,
// no archivo). Sí caen con el período/cliente las marcas de auditoría del cruce
// —quedarían apuntando a una cédula sin datos— y sus soportes.
// ============================================================
export type EliminarDatosModuloState = ActionState & {
  cargasEliminadas?: number;
  marcasEliminadas?: number;
  perfilesEliminados?: number;
};

export async function eliminarDatosModulo(input: {
  encabezadoId: number;
  alcance: AlcanceEliminacionModulo;
}): Promise<EliminarDatosModuloState> {
  // Primer gate antes de validar o consultar nada enviado por el cliente.
  const authz = await authorizePermiso("modulos_datos:eliminar");
  if (!authz.ok) return { ok: false, message: authz.message };

  const encabezadoId = Number(input?.encabezadoId);
  const alcance = parseAlcanceEliminacionModulo(input?.alcance);
  if (!Number.isInteger(encabezadoId) || encabezadoId <= 0 || !alcance) {
    return { ok: false, message: "Selecciona de nuevo qué información deseas eliminar." };
  }

  try {
    const referencia = await prisma.moduloDatoEncabezado.findUnique({
      where: { id: encabezadoId },
      select: {
        id: true,
        clienteId: true,
        moduloCodigo: true,
        nombreCliente: true,
        periodo: true,
        version: true,
        archivoNombre: true,
      },
    });
    if (!referencia) return { ok: false, message: "Ese cargue ya no existe." };

    const scope = await authorizePermiso("modulos_datos:eliminar", { clientId: referencia.clienteId });
    if (!scope.ok) return { ok: false, message: scope.message };

    const plan = resolverAlcanceEliminacionModulo(alcance, referencia);

    const resultado = await transaccionSerializable(async (tx) => {
      await tomarCandadoTransaccion(tx, `modulo-eliminar:${referencia.moduloCodigo}:${referencia.clienteId}`);

      // Se revalida dentro de la transacción: otra sesión pudo eliminarlo
      // mientras el modal estaba abierto.
      const vigente = await tx.moduloDatoEncabezado.findUnique({
        where: { id: encabezadoId },
        select: { id: true, clienteId: true, moduloCodigo: true, periodo: true },
      });
      if (!vigente || vigente.clienteId !== referencia.clienteId || vigente.moduloCodigo !== referencia.moduloCodigo) {
        return { ok: false as const, message: "Ese cargue ya no existe." };
      }

      const objetivos = await tx.moduloDatoEncabezado.findMany({
        where: plan.filtroEncabezado,
        select: { id: true },
      });
      const ids = objetivos.map((e) => e.id);
      if (ids.length === 0) return { ok: false as const, message: "No se encontraron cargues para eliminar." };

      // Marcas del cruce que quedan sin cédula, con sus soportes (los binarios se
      // borran DESPUÉS del commit: la BD manda).
      const marcas = plan.filtroMarcas
        ? await tx.marcaCruceModulo.findMany({
            where: plan.filtroMarcas,
            select: { id: true, adjuntos: { select: { claveObjeto: true } } },
          })
        : [];

      // El hilo de conversación del cargue es una referencia polimórfica suave:
      // se limpia explícitamente. El detalle sí cae por ON DELETE CASCADE.
      await tx.comment.deleteMany({ where: { entityType: "modulos_datos", entityId: { in: ids } } });
      if (marcas.length) {
        await tx.marcaCruceModulo.deleteMany({ where: { id: { in: marcas.map((m) => m.id) } } });
      }
      const cargas = await tx.moduloDatoEncabezado.deleteMany({ where: { id: { in: ids } } });
      const perfiles = plan.eliminaPerfiles
        ? await tx.perfilCargaModulo.deleteMany({
            where: { clienteId: referencia.clienteId, moduloCodigo: referencia.moduloCodigo },
          })
        : { count: 0 };

      // Al borrar la versión vigente de un período que conserva otras, el período
      // se quedaría sin ninguna marcada como oficial (y el cruce contable no
      // tendría de dónde leer): asciende la versión más alta que sobrevive.
      let ascendida: number | null = null;
      if (alcance === "version") {
        const restantes = await tx.moduloDatoEncabezado.findMany({
          where: {
            clienteId: referencia.clienteId,
            moduloCodigo: referencia.moduloCodigo,
            periodo: referencia.periodo,
          },
          select: { id: true, version: true, esOficial: true },
          orderBy: { version: "desc" },
        });
        if (restantes.length > 0 && !restantes.some((r) => r.esOficial)) {
          await tx.moduloDatoEncabezado.update({ where: { id: restantes[0].id }, data: { esOficial: true } });
          ascendida = restantes[0].version;
        }
      }

      return {
        ok: true as const,
        cargasEliminadas: cargas.count,
        perfilesEliminados: perfiles.count,
        marcasEliminadas: marcas.length,
        claves: marcas.flatMap((m) => m.adjuntos.map((a) => a.claveObjeto)),
        ascendida,
      };
    }, { timeoutMs: TIMEOUT_TRANSACCION_MODULO_MS });

    if (!resultado.ok) return resultado;

    // Soportes de las marcas retiradas: best-effort, ya no hay fila que los use.
    if (resultado.claves.length) {
      await Promise.allSettled(resultado.claves.map((clave) => eliminarObjeto(clave)));
    }

    const user = await getCurrentUser();
    const descripcionAlcance =
      alcance === "version"
        ? `versión ${referencia.version} de ${referencia.periodo}`
        : alcance === "periodo"
          ? `todas las versiones de ${referencia.periodo}`
          : "todo el historial del módulo y sus perfiles de carga";
    await logAudit({
      user: user?.name ?? "Sistema",
      action:
        alcance === "cliente_perfiles"
          ? "ELIMINÓ DATOS Y PERFILES DE CARGA DE MÓDULO"
          : "ELIMINÓ DATOS DE MÓDULO",
      entity: referencia.nombreCliente,
      detail: `${referencia.moduloCodigo} · ${descripcionAlcance} · ${resultado.cargasEliminadas} cargue(s) · ${resultado.marcasEliminadas} marca(s) · ${resultado.perfilesEliminados} perfil(es)`,
      clientId: referencia.clienteId,
    });

    revalidatePath(rutaModulo(referencia.moduloCodigo));
    revalidatePath("/dashboard");
    if (plan.eliminaPerfiles) revalidatePath(`/config/perfiles-carga/${referencia.moduloCodigo.toLowerCase()}`);

    const extras = [
      resultado.marcasEliminadas > 0 ? `${resultado.marcasEliminadas} marca(s) del cruce` : null,
      resultado.perfilesEliminados > 0 ? `${resultado.perfilesEliminados} perfil(es)` : null,
      resultado.ascendida != null ? `v${resultado.ascendida} quedó como vigente` : null,
    ].filter(Boolean);
    return {
      ok: true,
      message: `${resultado.cargasEliminadas} cargue(s) eliminado(s)${extras.length ? ` · ${extras.join(" · ")}` : ""}.`,
      cargasEliminadas: resultado.cargasEliminadas,
      marcasEliminadas: resultado.marcasEliminadas,
      perfilesEliminados: resultado.perfilesEliminados,
    };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarDatosModulo", e) };
  }
}
