import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { tomarCandadoTransaccion, type TransactionClient } from "@/lib/concurrency";
import { descriptorModulo } from "../descriptores";
import { SpecModuloSchema, type SpecModulo } from "../extraccion/esquema";
import { normalizarSpecModulo, validarSpecModulo } from "../perfil-modulo";
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

/**
 * Solo se invoca DENTRO de la promoción, después de marcar el original como cargado.
 * No hace llamadas IA ni almacenamiento: aprender y confirmar se confirman o revierten juntos.
 */
export async function aprenderPatronInventarioConfirmado(tx: TransactionClient, entrada: {
  originalId: number;
  clienteId: number;
  erpId: number;
  spec: SpecModulo;
  encabezado: readonly unknown[];
  versionBaseId?: number | null;
  usuario: { id: number | null; nombre: string | null };
}): Promise<{ id: number; version: number; reutilizada: boolean }> {
  const descriptor = descriptorModulo("INV")!;
  const parsed = SpecModuloSchema.safeParse(entrada.spec);
  if (!parsed.success) throw new Error("La estructura confirmada de inventarios no es válida.");
  const spec = normalizarSpecModulo(descriptor, parsed.data);
  const error = validarSpecModulo(descriptor, spec);
  if (error) throw new Error(error);
  const encabezado = encabezadoParaGuardar(entrada.encabezado);
  // Un reporte estructurado puede contener varios campos dentro de UNA celda.
  // La gramática ya validada forma parte de la firma y de su futura compatibilidad.
  const minimoRotulos = spec.lecturaEstructurada ? 1 : 2;
  if (encabezado.filter(Boolean).length < minimoRotulos) throw new Error("El formato confirmado no tiene encabezados suficientes para aprenderlo.");
  const original = await tx.archivoOriginalModulo.findUnique({ where: { id: entrada.originalId } });
  if (!original || original.clienteId !== entrada.clienteId || original.moduloCodigo !== "INV" || original.estado !== "cargado" || original.encabezadoId == null) {
    throw new Error("El patrón solo se aprende al confirmar la carga de su cliente.");
  }
  const aplicativo = await tx.clientErpProcess.findFirst({
    where: { clientId: entrada.clienteId, erpId: entrada.erpId, process: { code: "INV" } },
    select: { erp: { select: { code: true } } },
  });
  if (!aplicativo || aplicativo.erp.code === "MANUAL") throw new Error("El aplicativo no corresponde al inventario de este cliente.");

  await tomarCandadoTransaccion(tx, `patron-archivo:${entrada.erpId}:INV`);
  const versiones = await tx.versionPatronArchivoModulo.findMany({ where: { erpId: entrada.erpId, moduloCodigo: "INV" } });
  const base = entrada.versionBaseId == null ? null : versiones.find((v) => v.id === entrada.versionBaseId);
  if (entrada.versionBaseId != null && (!base || (base.estado !== "aprobada" && base.clienteOrigenId !== entrada.clienteId))) {
    throw new Error("La versión de partida no pertenece al aplicativo o al cliente.");
  }
  const firma = huella(spec, encabezado);
  const igual = versiones.find((v) => {
    if (v.clienteOrigenId !== entrada.clienteId || v.estado !== "validada_cliente") return false;
    const guardado = SpecModuloSchema.safeParse(v.specJson);
    return guardado.success && Array.isArray(v.encabezadoJson)
      && huella(normalizarSpecModulo(descriptor, guardado.data), v.encabezadoJson) === firma;
  });
  if (igual) return { id: igual.id, version: igual.version, reutilizada: true };
  const creada = await tx.versionPatronArchivoModulo.create({
    data: {
      erpId: entrada.erpId, moduloCodigo: "INV", version: siguienteVersionPatron(versiones.map((v) => v.version)),
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
