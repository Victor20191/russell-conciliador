import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { tomarCandadoTransaccion, type TransactionClient } from "@/lib/concurrency";
import { procesoErpDeModulo } from "@/lib/erp-procesos";
import { descriptorModulo } from "../descriptores";
import { SpecModuloSchema, type SpecModulo } from "../extraccion/esquema";
import { normalizarSpecModulo } from "../perfil-modulo";
import { motivoNoProponible } from "./propuesta-lote";
import { encabezadoParaGuardar } from "./rotulos";
import { siguienteVersionPatron } from "./version";

function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonico(v)]));
  }
  return valor;
}

/** Incluye el encabezado: dos informes con columnas distintas no comparten aprendizaje. */
function huella(spec: SpecModulo, encabezado: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(canonico({ spec, encabezado: encabezadoParaGuardar(encabezado) }))).digest("hex");
}

export type PatronAprendido = { id: number; version: number; reutilizada: boolean };

/**
 * Guarda el formato de un cargue CONFIRMADO como versión `validada_cliente` del aplicativo: sirve
 * solo a ese cliente hasta que un administrador la apruebe para todos (los seis módulos; en
 * Inventarios lo llama la asistencia de lectura, en los demás la lectura configurada en la carga).
 *
 * Solo se invoca DENTRO de la promoción, después de marcar el original como cargado.
 * No hace llamadas IA ni almacenamiento: aprender y confirmar se confirman o revierten juntos.
 * Si ya hay una versión con el mismo mapeo y encabezado —local de ese cliente o aprobada—, la
 * enlaza en vez de crear otra.
 */
export async function aprenderPatronConfirmado(tx: TransactionClient, entrada: {
  moduloCodigo: string;
  originalId: number;
  clienteId: number;
  erpId: number;
  spec: SpecModulo;
  encabezado: readonly unknown[];
  versionBaseId?: number | null;
  usuario: { id: number | null; nombre: string | null };
}): Promise<PatronAprendido> {
  const modulo = entrada.moduloCodigo;
  const descriptor = descriptorModulo(modulo);
  const proceso = procesoErpDeModulo(modulo);
  if (!descriptor || !proceso) throw new Error("El módulo no admite patrones de archivo.");
  const parsed = SpecModuloSchema.safeParse(entrada.spec);
  if (!parsed.success) throw new Error("La estructura confirmada no es válida.");
  const spec = normalizarSpecModulo(descriptor, parsed.data);
  const encabezado = encabezadoParaGuardar(entrada.encabezado);
  const motivo = motivoNoProponible(descriptor, spec, encabezado);
  if (motivo) throw new Error(motivo);
  const original = await tx.archivoOriginalModulo.findUnique({ where: { id: entrada.originalId } });
  if (!original || original.clienteId !== entrada.clienteId || original.moduloCodigo !== modulo || original.estado !== "cargado" || original.encabezadoId == null) {
    throw new Error("El patrón solo se aprende al confirmar la carga de su cliente.");
  }
  const aplicativo = await tx.clientErpProcess.findFirst({
    where: { clientId: entrada.clienteId, erpId: entrada.erpId, process: { code: proceso } },
    select: { erp: { select: { code: true } } },
  });
  if (!aplicativo || aplicativo.erp.code === "MANUAL") throw new Error("El aplicativo no corresponde a este cliente.");

  // Mismo candado que crear una versión desde la pantalla de patrones: numeración sin choques.
  await tomarCandadoTransaccion(tx, `patron-archivo:${entrada.erpId}:${modulo}`);
  const versiones = await tx.versionPatronArchivoModulo.findMany({ where: { erpId: entrada.erpId, moduloCodigo: modulo } });
  const base = entrada.versionBaseId == null ? null : versiones.find((v) => v.id === entrada.versionBaseId);
  if (entrada.versionBaseId != null && (!base || (base.estado !== "aprobada" && base.clienteOrigenId !== entrada.clienteId))) {
    throw new Error("La versión de partida no pertenece al aplicativo o al cliente.");
  }
  const firma = huella(spec, encabezado);
  const igual = versiones.find((v) => {
    const propia = v.estado === "validada_cliente" && v.clienteOrigenId === entrada.clienteId;
    if (!propia && v.estado !== "aprobada") return false;
    const guardado = SpecModuloSchema.safeParse(v.specJson);
    return guardado.success && Array.isArray(v.encabezadoJson)
      && huella(normalizarSpecModulo(descriptor, guardado.data), v.encabezadoJson) === firma;
  });
  if (igual) return { id: igual.id, version: igual.version, reutilizada: true };
  const creada = await tx.versionPatronArchivoModulo.create({
    data: {
      erpId: entrada.erpId, moduloCodigo: modulo, version: siguienteVersionPatron(versiones.map((v) => v.version)),
      estado: "validada_cliente", clienteOrigenId: entrada.clienteId, clienteOrigenNombre: original.nombreCliente,
      archivoOrigenId: original.id, versionBaseId: base?.id ?? null,
      hoja: spec.hoja, filaEncabezado: spec.filaEncabezado, primeraFilaDatos: spec.primeraFilaDatos,
      specJson: spec as Prisma.InputJsonValue, encabezadoJson: encabezado,
      creadoPor: entrada.usuario.nombre, creadoPorId: entrada.usuario.id,
      vecesUsado: 1, ultimoUsoEn: new Date(),
    },
    select: { id: true, version: true },
  });
  return { ...creada, reutilizada: false };
}

/** Inventarios: la asistencia de lectura aprende con la misma regla. */
export function aprenderPatronInventarioConfirmado(
  tx: TransactionClient,
  entrada: Omit<Parameters<typeof aprenderPatronConfirmado>[1], "moduloCodigo">,
): Promise<PatronAprendido> {
  return aprenderPatronConfirmado(tx, { ...entrada, moduloCodigo: "INV" });
}
