import "server-only";

import { randomUUID } from "node:crypto";
import { ingerir } from "@/lib/balance/extraccion/ingesta";
import { registrarError } from "@/lib/errores";
import prisma from "@/lib/prisma";
import { almacenamientoDisponible, eliminarObjeto, obtenerObjeto, subirObjeto } from "@/lib/storage/objetos";
import { claveMuestraPatronModulo, huellaSha256Archivo } from "../archivo-original";
import { descriptorModulo } from "../descriptores";
import { SpecModuloSchema } from "../extraccion/esquema";
import { normalizarSpecModulo } from "../perfil-modulo";
import { FILAS_DATOS_MUESTRA, generarMuestraRecortada } from "./muestra-recortada";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ResultadoGuardarMuestra =
  | { ok: true; nombre: string; filasDatos: number; yaTenia: boolean }
  | { ok: false; motivo: string };

/**
 * Genera, verifica y guarda la muestra de una versión aprendida de un cargue: el original con su
 * formato y su nombre, cortado y con las personas ficticias (ver `muestra-recortada.ts`). Nunca
 * lanza: si algo falla, la versión queda como estaba y el administrador sube una muestra. No
 * verifica permisos: lo llama la confirmación del cargue (quien confirmó ya tiene alcance sobre el
 * cliente) o la acción del administrador. Con `reemplazar`, rehace una muestra que ya era copia
 * del original (nunca una que subió alguien).
 */
export async function guardarMuestraRecortada(versionId: number, opciones: { reemplazar?: boolean } = {}): Promise<ResultadoGuardarMuestra> {
  let claveSubida: string | null = null;
  try {
    if (!almacenamientoDisponible()) return { ok: false, motivo: "El almacenamiento de objetos no está configurado." };
    const version = await prisma.versionPatronArchivoModulo.findUnique({
      where: { id: versionId },
      include: { erp: { select: { code: true } } },
    });
    if (!version) return { ok: false, motivo: "La versión ya no existe." };
    const claveAnterior = version.muestraClaveObjeto;
    if (claveAnterior && !(opciones.reemplazar && version.muestraOrigen === "recorte_original")) {
      return { ok: true, nombre: version.muestraNombre ?? "", filasDatos: 0, yaTenia: true };
    }
    if (version.archivoOrigenId == null || version.clienteOrigenId == null) return { ok: false, motivo: "La versión no salió de un cargue." };
    const descriptor = descriptorModulo(version.moduloCodigo);
    const parsed = SpecModuloSchema.safeParse(version.specJson);
    if (!descriptor || !parsed.success || !Array.isArray(version.encabezadoJson)) return { ok: false, motivo: "El mapeo guardado de la versión es ilegible." };

    const original = await prisma.archivoOriginalModulo.findUnique({
      where: { id: version.archivoOrigenId },
      select: { clienteId: true, moduloCodigo: true, nombreArchivo: true, tamanoBytes: true, huellaSha256: true, claveObjeto: true, disponible: true },
    });
    if (!original || original.clienteId !== version.clienteOrigenId || original.moduloCodigo !== version.moduloCodigo
      || !original.disponible || !original.claveObjeto) {
      return { ok: false, motivo: "El archivo original del cargue ya no está disponible." };
    }
    const objeto = await obtenerObjeto(original.claveObjeto);
    if (!objeto || objeto.cuerpo.byteLength !== original.tamanoBytes || huellaSha256Archivo(objeto.cuerpo) !== original.huellaSha256) {
      return { ok: false, motivo: "El archivo original no supera la verificación de integridad." };
    }
    const ingesta = await ingerir(objeto.cuerpo.slice().buffer as ArrayBuffer, original.nombreArchivo);
    const spec = normalizarSpecModulo(descriptor, parsed.data);
    const hoja = ingesta.modo === "tabular" ? ingesta.hojas.find((h) => h.nombre === spec.hoja) : undefined;
    if (!hoja) return { ok: false, motivo: `El original no tiene la hoja «${spec.hoja}».` };

    const muestra = await generarMuestraRecortada(descriptor, { bytes: objeto.cuerpo, nombre: original.nombreArchivo }, hoja, {
      id: version.id, version: version.version, estado: "validada_cliente", clienteOrigenId: version.clienteOrigenId,
      hoja: version.hoja, filaEncabezado: version.filaEncabezado, primeraFilaDatos: version.primeraFilaDatos,
      encabezado: version.encabezadoJson as unknown[], spec,
    });
    if (!muestra.ok) return muestra;

    // El nombre del original (5/Oct/2026, decisión del usuario); un .xls se guarda como .xlsx.
    const nombre = muestra.nombre;
    const clave = claveMuestraPatronModulo({
      moduloCodigo: version.moduloCodigo, erpCode: version.erp.code, version: version.version,
      nombreArchivo: `${randomUUID()}-${nombre}`,
    });
    await subirObjeto({ key: clave, cuerpo: muestra.bytes, contentType: TIPO_XLSX });
    claveSubida = clave;
    // Solo si la muestra sigue siendo la que se vio: una subida del administrador en el mismo instante manda.
    const actualizada = await prisma.versionPatronArchivoModulo.updateMany({
      where: { id: version.id, muestraClaveObjeto: claveAnterior },
      data: {
        muestraClaveObjeto: clave,
        muestraNombre: nombre,
        muestraTamanoBytes: muestra.bytes.byteLength,
        muestraSha256: huellaSha256Archivo(muestra.bytes),
        muestraOrigen: "recorte_original",
      },
    });
    if (actualizada.count !== 1) {
      await eliminarObjeto(clave).catch((error) => registrarError("guardarMuestraRecortada.limpiar", error));
      claveSubida = null;
      return { ok: true, nombre, filasDatos: 0, yaTenia: true };
    }
    claveSubida = null;
    if (claveAnterior) await eliminarObjeto(claveAnterior).catch((error) => registrarError("guardarMuestraRecortada.limpiarAnterior", error));
    return { ok: true, nombre, filasDatos: Math.min(muestra.filasDatos, FILAS_DATOS_MUESTRA), yaTenia: false };
  } catch (e) {
    registrarError("guardarMuestraRecortada", e);
    if (claveSubida) await eliminarObjeto(claveSubida).catch((error) => registrarError("guardarMuestraRecortada.limpiarError", error));
    return { ok: false, motivo: "No se pudo generar la muestra." };
  }
}
