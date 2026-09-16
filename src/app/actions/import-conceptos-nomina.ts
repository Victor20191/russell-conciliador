"use server";

// Carga MASIVA de los conceptos de nómina (RF-NOM-07/08/09/10), por dos vías:
//  - `importarConceptosNomina`: la plantilla Russell (cliente / grupo / código / nombre /
//    cuenta contable del cliente + centro opcional), varios clientes en un archivo.
//  - `importarCatalogoConceptosErp`: el catálogo tal como lo imprime el ERP del cliente (SIIGO
//    «INFORME CONCEPTOS DE NOMINA», INCODOL «EQUIVALENCIAS», NOMINAI «MAESTRO DE CONCEPTOS»…),
//    un cliente elegido en el modal.
//
// Ambas escriben en `consolidacion_modulo_cliente` del módulo NOM, la misma tabla que alimenta
// la pestaña «Consolidado» y el cruce contable: el CÓDIGO canónico del concepto queda como
// `clasificador`, el nombre como `descripcion`, el centro/clase como `agrupador` ('' = a todos)
// y, por cada cuenta del archivo, una fila con la cuenta del cliente (`cuenta_cliente`), su
// subcuenta PUC, el grupo RF-NOM-02 y la cuenta Russell de 6 (`cuenta_6`) cuando se pudo
// resolver: por la homologación del balance (`cuentas_cliente`, RF-NOM-10), por la estructura
// PUC de la cuenta (52050601 → 520506) o porque ya venía en Russell. Las cuentas de clase «00»
// (SIIGO: la clase la pone el centro de costo) y las de control (pasivo/activo/ingreso) quedan
// sin `cuenta_6`: la subcuenta sí se guarda y el cruce las usa (vista por subcuenta / control de
// deducciones).
//
// Reglas del cargue:
//  - Todo o nada: si una sola fila falla (cliente inexistente, cuenta ilegible, grupo
//    desconocido), no se escribe nada. Lo que no impide la carga se devuelve como AVISO.
//  - Cada (concepto, agrupador) REEMPLAZA sus cuentas anteriores; lo que el archivo no
//    menciona queda intacto (RF-NOM-09: la memoria persiste).
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
import { ingerir } from "@/lib/balance/extraccion/ingesta";
import {
  parseConceptosNominaWorkbook,
  HOJA_CONCEPTOS,
  MODULO_CONCEPTOS_NOMINA,
  type ConceptoCatalogoEntrada,
  type ImportConceptosNominaState,
} from "@/lib/import/conceptos-nomina";
import { leerCatalogoConceptosErp } from "@/lib/import/conceptos-nomina-erp";
import { construirConfigMapeoCliente } from "@/lib/balance/mapeo-cliente-config";
import { cedulaModulo, cuentaAsignableCedula, cuentasCedula6, prefijosCuentaModulo } from "@/lib/modulos/cuentas-modulo";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { grupoPorSubcuentaPuc, sugerirGrupoConcepto } from "@/lib/modulos/nomina/grupos-concepto";
import {
  claseDeCuentaCliente,
  destinoDeCuentaCliente,
  esCuentaComodin,
  resolverCuentaClienteARussell,
  subcuentaPucDe,
} from "@/lib/modulos/nomina/homologacion";
import { getCatalogoPrevalidador } from "@/lib/parametros/prevalidador";

const PATH = "/config/conceptos-nomina";
const RUTA_MODULO = `/modulos/${MODULO_CONCEPTOS_NOMINA.toLowerCase()}`;
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB (los libros de conciliación traen más hojas que el catálogo)

// Sin `export`: un archivo "use server" solo puede exportar funciones async.
const ORIGEN_CARGA_MASIVA = "carga_masiva";

type EntradaResuelta = ConceptoCatalogoEntrada & { clienteId: number; nombreCliente: string; hoja: string };

/** Una fila lista para `consolidacion_modulo_cliente`. */
type FilaAEscribir = {
  clienteId: number;
  clasificador: string;
  descripcion: string;
  agrupador: string;
  grupo: string | null;
  subcuentaPuc: string | null;
  cuentaCliente: string;
  cuenta4: string;
  cuenta6: string;
};

/**
 * Resuelve cada cuenta de cada entrada a su fila de BD y valida lo que impide la carga. La
 * memoria del balance del cliente (`cuentas_cliente`) se carga UNA vez por cliente.
 */
async function resolverEntradas(entradas: EntradaResuelta[]): Promise<{ filas: FilaAEscribir[]; problemas: ErrorImport[]; avisos: string[]; sinRussell: number }> {
  const descriptor = descriptorModulo(MODULO_CONCEPTOS_NOMINA);
  const prefijos = prefijosCuentaModulo(MODULO_CONCEPTOS_NOMINA, await getCatalogoPrevalidador());
  // Cuentas de la cédula de Nómina: las de gasto y los pasivos laborales que también concilia.
  const cedula = cedulaModulo(descriptor, prefijos);
  const cuentasRussell6 = cuentasCedula6(descriptor);
  const delModulo = (cuenta: string) => cuentaAsignableCedula(cedula, cuenta);
  const listado = cuentasRussell6.length ? cuentasRussell6.join(", ") : prefijos.length ? prefijos.join(", ") : "—";

  const clienteIds = [...new Set(entradas.map((e) => e.clienteId))];
  const mapeoPorCliente = new Map<number, Map<string, string>>();
  for (const clienteId of clienteIds) {
    const filas = await prisma.clientAccount.findMany({
      where: { clienteId, cuenta6Russell: { not: null } },
      select: { code: true, cuenta6Russell: true, coincidencia: true, origenMapeo: true, actualizadoEn: true },
    });
    const config = construirConfigMapeoCliente(filas);
    mapeoPorCliente.set(clienteId, new Map([...config.entries()].map(([k, v]) => [k, v.std])));
  }
  const codigosPlan = new Set(
    (await prisma.standardAccount.findMany({ where: { code: { in: cuentasRussell6 } }, select: { code: true } })).map((c) => c.code),
  );

  const filas: FilaAEscribir[] = [];
  const problemas: ErrorImport[] = [];
  let porEstructura = 0;
  let sinRussell = 0;
  let gruposSugeridos = 0;
  const fueraDelModulo: string[] = [];
  const claseFuera: string[] = [];
  for (const e of entradas) {
    const mapeo = mapeoPorCliente.get(e.clienteId);
    for (const cuenta of e.cuentas) {
      if (esCuentaComodin(cuenta)) {
        problemas.push({ hoja: e.hoja, fila: e.fila, mensaje: `La cuenta «${cuenta}» es un comodín del ERP, no una cuenta contable.` });
        continue;
      }
      const destino = destinoDeCuentaCliente(cuenta);
      const sub = subcuentaPucDe(cuenta);
      const grupo = e.grupo ?? grupoPorSubcuentaPuc(destino === "gasto" ? sub : null) ?? sugerirGrupoConcepto(e.concepto);
      if (!e.grupo && grupo) gruposSugeridos++;
      const base = {
        clienteId: e.clienteId,
        clasificador: e.codigo,
        descripcion: e.concepto,
        agrupador: e.agrupador,
        grupo,
        subcuentaPuc: sub,
      };
      // Russell de 6 escrita directamente (plantilla anterior / auditor).
      if (cuenta.length === 6 && delModulo(cuenta)) {
        if (!codigosPlan.has(cuenta)) {
          problemas.push({ hoja: e.hoja, fila: e.fila, mensaje: `La cuenta ${cuenta} no existe en el plan estándar Russell.` });
          continue;
        }
        filas.push({ ...base, cuentaCliente: "", cuenta4: cuenta.slice(0, 4), cuenta6: cuenta });
        continue;
      }
      const r = resolverCuentaClienteARussell(cuenta, mapeo);
      if (destino === "control" && !(r && delModulo(r.cuenta6))) {
        // Libranzas, retención, préstamos, intereses: no cruzan contra el gasto; se conservan
        // con su cuenta del cliente para el control de deducciones (D1). Los pasivos que la
        // cédula sí concilia (cesantías 251010, homologada en el balance) siguen abajo.
        filas.push({ ...base, cuentaCliente: cuenta, cuenta4: "", cuenta6: "" });
        sinRussell++;
        continue;
      }
      if (r && delModulo(r.cuenta6)) {
        if (r.origen === "estructura") porEstructura++;
        filas.push({ ...base, cuentaCliente: cuenta, cuenta4: r.cuenta6.slice(0, 4), cuenta6: r.cuenta6 });
        continue;
      }
      if (r && !delModulo(r.cuenta6)) {
        // Homologada en el balance a una Russell fuera del módulo (510548, 519995…): se guarda
        // sin cuenta Russell —cruza por su subcuenta— y se avisa, sin bloquear la carga.
        fueraDelModulo.push(`${cuenta} → ${r.cuenta6}`);
        filas.push({ ...base, cuentaCliente: cuenta, cuenta4: "", cuenta6: "" });
        sinRussell++;
        continue;
      }
      const clase = claseDeCuentaCliente(cuenta);
      if (clase === null && sub) {
        // SIIGO «0005060000»: clase a cargo del centro de costo. Se guarda con subcuenta; la
        // cuenta Russell la decide una regla de clase o el reparto en el cruce.
        filas.push({ ...base, cuentaCliente: cuenta, cuenta4: "", cuenta6: "" });
        sinRussell++;
        continue;
      }
      // Gasto/costo de una clase que el módulo no concilia (61 asistencial, 53…): se guarda sin
      // cuenta Russell —queda visible como «sin Russell» y cruza por su subcuenta— y se avisa.
      // La carga no se bloquea por eso: la cuenta ES del cliente, solo que Nómina no la cruza.
      claseFuera.push(`${cuenta} (clase ${clase ?? "?"})`);
      filas.push({ ...base, cuentaCliente: cuenta, cuenta4: "", cuenta6: "" });
      sinRussell++;
    }
  }
  const avisos: string[] = [];
  if (porEstructura > 0) avisos.push(`${porEstructura} cuenta(s) del cliente no estaban homologadas en el balance: la cuenta Russell se derivó por su estructura PUC (clase + subcuenta). Revísalas al cargar el balance.`);
  if (fueraDelModulo.length > 0) avisos.push(`${fueraDelModulo.length} cuenta(s) del cliente están homologadas en el balance fuera del módulo de Nómina (${listado}) y quedan sin cuenta Russell: ${fueraDelModulo.slice(0, 5).join(", ")}${fueraDelModulo.length > 5 ? "…" : ""}.`);
  if (claseFuera.length > 0) avisos.push(`${claseFuera.length} cuenta(s) del cliente son de una clase que Nómina no concilia (solo 51/52/72/73) y quedan sin cuenta Russell: ${claseFuera.slice(0, 5).join(", ")}${claseFuera.length > 5 ? "…" : ""}.`);
  if (sinRussell > 0) avisos.push(`${sinRussell} cuenta(s) quedan sin cuenta Russell (clase «00» del ERP o cuentas de control): cruzan por su subcuenta PUC y por el control de deducciones.`);
  if (gruposSugeridos > 0) avisos.push(`${gruposSugeridos} concepto(s) sin grupo de cuenta contable: se sugirió por la subcuenta o por el nombre.`);
  return { filas, problemas, avisos, sinRussell };
}

/** Verifica alcance de escritura sobre cada cliente (fail-closed). */
async function clientesSinAlcance(clienteIds: number[]): Promise<Set<number>> {
  const alcance = await Promise.all(
    clienteIds.map(async (clienteId) => ({ clienteId, ok: (await authorizePermiso("modulos_datos:editar", { clientId: clienteId })).ok })),
  );
  return new Set(alcance.filter((a) => !a.ok).map((a) => a.clienteId));
}

/** Escribe las filas: cada (cliente, concepto, agrupador) reemplaza su conjunto anterior. */
async function escribirFilas(filas: FilaAEscribir[], actor: string | null): Promise<{ actualizados: number }> {
  const grupos = new Map<string, FilaAEscribir[]>();
  for (const f of filas) {
    const k = `${f.clienteId}|${f.clasificador}|${f.agrupador}`;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const clienteIds = [...new Set(filas.map((f) => f.clienteId))];
  const previas = await prisma.consolidacionModuloCliente.findMany({
    where: { moduloCodigo: MODULO_CONCEPTOS_NOMINA, clienteId: { in: clienteIds }, clasificador: { in: [...new Set(filas.map((f) => f.clasificador))] } },
    select: { clienteId: true, clasificador: true, agrupador: true },
  });
  const yaExistian = new Set(previas.map((p) => `${p.clienteId}|${p.clasificador}|${p.agrupador}`));
  const actualizados = [...grupos.keys()].filter((k) => yaExistian.has(k)).length;

  await prisma.$transaction(
    [...grupos.values()].flatMap((lista) => {
      const [{ clienteId, clasificador, agrupador }] = lista;
      // Dos filas iguales (misma cuenta del cliente) no se escriben dos veces.
      const vistas = new Set<string>();
      const data = lista
        .filter((f) => {
          const k = `${f.cuenta6}|${f.cuentaCliente}`;
          if (vistas.has(k)) return false;
          vistas.add(k);
          return true;
        })
        .map((f) => ({
          clienteId,
          moduloCodigo: MODULO_CONCEPTOS_NOMINA,
          clasificador,
          agrupador,
          descripcion: f.descripcion,
          grupo: f.grupo,
          subcuentaPuc: f.subcuentaPuc,
          cuentaCliente: f.cuentaCliente,
          cuenta4: f.cuenta4,
          cuenta6: f.cuenta6,
          origen: ORIGEN_CARGA_MASIVA,
          actualizadoPor: actor,
        }));
      return [
        prisma.consolidacionModuloCliente.deleteMany({ where: { clienteId, moduloCodigo: MODULO_CONCEPTOS_NOMINA, clasificador, agrupador } }),
        prisma.consolidacionModuloCliente.createMany({ data }),
      ];
    }),
  );
  return { actualizados };
}

async function cargarEntradas(entradas: EntradaResuelta[], accion: string): Promise<ImportConceptosNominaState> {
  const clienteIds = [...new Set(entradas.map((e) => e.clienteId))];
  const sinAlcance = await clientesSinAlcance(clienteIds);
  const problemas: ErrorImport[] = [];
  for (const e of entradas) {
    if (sinAlcance.has(e.clienteId)) problemas.push({ hoja: e.hoja, fila: e.fila, mensaje: `No tienes permiso para configurar «${e.nombreCliente}».` });
  }
  const resuelto = await resolverEntradas(entradas);
  problemas.push(...resuelto.problemas);
  if (problemas.length > 0) {
    return { ok: false, message: `${problemas.length} problema(s) encontrados. No se importó nada.`, errores: problemas };
  }

  const user = await getCurrentUser();
  const actor = user?.name ?? null;
  const { actualizados } = await escribirFilas(resuelto.filas, actor);
  const conceptos = new Set(entradas.map((e) => `${e.clienteId}|${e.codigo}|${e.agrupador}`)).size;
  const cuentas = resuelto.filas.length;
  await logAudit({
    user: actor ?? "Sistema",
    action: accion,
    entity: clienteIds.length === 1 ? entradas[0].nombreCliente : `${clienteIds.length} clientes`,
    detail: `${conceptos} concepto(s) · ${cuentas} cuenta(s) · ${actualizados} actualizado(s) · ${resuelto.sinRussell} sin Russell`,
    clientId: clienteIds.length === 1 ? clienteIds[0] : undefined,
  });
  revalidatePath(PATH);
  revalidatePath(RUTA_MODULO);
  return {
    ok: true,
    message: `${conceptos} concepto(s) importados.`,
    avisos: resuelto.avisos,
    resumen: { clientes: clienteIds.length, conceptos, cuentas, actualizados, sinRussell: resuelto.sinRussell },
  };
}

/** Plantilla Russell (RF-NOM-08): varios clientes en un archivo. */
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
  if (archivo.size > MAX_BYTES) return { ok: false, message: "El archivo supera 12 MB." };

  try {
    const { filas, errores } = await parseConceptosNominaWorkbook(await archivo.arrayBuffer());
    if (errores.length > 0) {
      return { ok: false, message: `${errores.length} error(es) de formato. Corrige el archivo y reinténtalo.`, errores };
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
    const entradas: EntradaResuelta[] = [];
    for (const f of filas) {
      const digitos = claveNit(f.cliente);
      const cliente = (digitos ? porNit.get(digitos) : undefined) ?? porCodigo.get(normalizar(f.cliente));
      if (!cliente) {
        problemas.push({ hoja: HOJA_CONCEPTOS, fila: f.fila, mensaje: `No existe un cliente con NIT o código «${f.cliente}».` });
        continue;
      }
      entradas.push({ ...f, clienteId: cliente.id, nombreCliente: cliente.name, hoja: HOJA_CONCEPTOS });
    }
    if (problemas.length > 0) {
      return { ok: false, message: `${problemas.length} problema(s) encontrados. No se importó nada.`, errores: problemas };
    }
    return await cargarEntradas(entradas, "IMPORTÓ conceptos de nómina");
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("importarConceptosNomina", e) };
  }
}

/** Catálogo nativo del ERP (RF-NOM-07): un cliente elegido en el modal; la hoja se detecta o se elige. */
export async function importarCatalogoConceptosErp(
  _prev: ImportConceptosNominaState,
  formData: FormData,
): Promise<ImportConceptosNominaState> {
  const clienteId = Number(formData.get("clienteId"));
  if (!Number.isInteger(clienteId) || clienteId <= 0) return { ok: false, message: "Elige el cliente al que pertenece el catálogo." };
  const authz = await authorizePermiso("modulos_datos:editar", { clientId: clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, message: "Adjunta el catálogo de conceptos del ERP (.xlsx, .xls o .csv)." };
  if (archivo.size > MAX_BYTES) return { ok: false, message: "El archivo supera 12 MB." };
  const hojaPedida = String(formData.get("hoja") ?? "").trim() || null;

  try {
    const cliente = await prisma.client.findUnique({ where: { id: clienteId }, select: { id: true, name: true } });
    if (!cliente) return { ok: false, message: "El cliente no existe." };
    const ingesta = await ingerir(await archivo.arrayBuffer(), archivo.name);
    if (ingesta.modo !== "tabular") return { ok: false, message: "El catálogo debe ser una hoja de cálculo (.xlsx, .xls o .csv), no un PDF." };
    const lectura = leerCatalogoConceptosErp(ingesta.hojas, hojaPedida);
    if (!lectura) {
      return {
        ok: false,
        message: hojaPedida
          ? `En la hoja «${hojaPedida}» no se reconoce un catálogo de conceptos (código + cuenta contable).`
          : "No se reconoce un catálogo de conceptos en el archivo: hace falta una hoja con el código del concepto y su cuenta contable (p. ej. «INFORME CONCEPTOS DE NOMINA» de SIIGO o «EQUIVALENCIAS»).",
      };
    }
    if (lectura.filas.length === 0) return { ok: false, message: `La hoja «${lectura.deteccion.hoja}» no trae conceptos con cuenta contable.` };
    const entradas: EntradaResuelta[] = lectura.filas.map((f) => ({ ...f, clienteId: cliente.id, nombreCliente: cliente.name, hoja: lectura.deteccion.hoja }));
    const resultado = await cargarEntradas(entradas, "IMPORTÓ catálogo de conceptos del ERP");
    const otras = lectura.candidatas.filter((c) => c.hoja !== lectura.deteccion.hoja).map((c) => `«${c.hoja}» (${c.entradas})`);
    const avisos = [
      `Se leyó la hoja «${lectura.deteccion.hoja}» (encabezado en la fila ${lectura.deteccion.filaEncabezado}).${otras.length ? ` Otras hojas con conceptos: ${otras.join(", ")}.` : ""}`,
      ...lectura.avisos,
      ...(resultado.avisos ?? []),
    ];
    return { ...resultado, avisos };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("importarCatalogoConceptosErp", e) };
  }
}

/** Borra un concepto (todas sus cuentas, en todos sus centros) de un cliente. */
export async function eliminarConceptoNomina(input: {
  clienteId: number;
  codigo: string;
  /** Si viene, borra solo ese centro/clase; si no, todos. */
  agrupador?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const authz = await authorizePermiso("modulos_datos:editar", { clientId: input.clienteId });
  if (!authz.ok) return { ok: false, message: authz.message };
  const codigo = String(input.codigo ?? "").trim();
  if (!codigo) return { ok: false, message: "Indica el código del concepto." };
  const agrupador = input.agrupador == null ? null : String(input.agrupador).trim();

  try {
    const { count } = await prisma.consolidacionModuloCliente.deleteMany({
      where: { clienteId: input.clienteId, moduloCodigo: MODULO_CONCEPTOS_NOMINA, clasificador: codigo, ...(agrupador == null ? {} : { agrupador }) },
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
      detail: `${codigo}${agrupador ? ` · ${agrupador}` : ""} · ${count} cuenta(s)`,
      clientId: input.clienteId,
    });

    revalidatePath(PATH);
    revalidatePath(RUTA_MODULO);
    return { ok: true, message: "Concepto eliminado." };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("eliminarConceptoNomina", e) };
  }
}
