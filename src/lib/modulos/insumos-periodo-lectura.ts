// Insumos del cruce de Nómina que son memoria del CLIENTE (no del período), leídos con el cliente de BD
// que se le pase y sin `server-only`: los usan el cruce, la página del cargue y el script que respalda
// la copia congelada de los cierres anteriores, así la copia es exactamente lo que el cruce leería.
import type { PrismaClient } from "@/generated/prisma/client";
import { construirConfigMapeoCliente } from "@/lib/balance/mapeo-cliente-config";
import { esClaseNomina, type ClaseNomina } from "./nomina/homologacion";

type DbLectura = Pick<PrismaClient, "claseAgrupadorModulo" | "clientAccount">;

/** Clases por centro de costo (GYA → 51, MOD → 72) y homologación de las cuentas del cliente (cuenta → Russell 6). */
export async function leerHomologacionNomina(
  db: DbLectura,
  clienteId: number,
  moduloCodigo: string,
): Promise<{ reglasClase: Map<string, ClaseNomina>; mapeoCliente: Map<string, string> }> {
  const [reglas, cuentas] = await Promise.all([
    db.claseAgrupadorModulo.findMany({ where: { clienteId, moduloCodigo }, select: { agrupador: true, clase: true } }),
    db.clientAccount.findMany({
      where: { clienteId, cuenta6Russell: { not: null } },
      select: { code: true, cuenta6Russell: true, coincidencia: true, origenMapeo: true, actualizadoEn: true },
    }),
  ]);
  return {
    reglasClase: new Map(reglas.filter((r) => esClaseNomina(r.clase)).map((r) => [r.agrupador, r.clase as ClaseNomina])),
    mapeoCliente: new Map([...construirConfigMapeoCliente(cuentas).entries()].map(([k, v]) => [k, v.std])),
  };
}
