import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import { MODULO_CONCEPTOS_NOMINA } from "@/lib/import/conceptos-nomina";
import ConceptosNominaClient, { type ConceptoRow } from "./conceptos-nomina-client";

/**
 * Configuración › **Conceptos de nómina** — carga MASIVA y administración del
 * catálogo de conceptos por cliente (cliente / código / concepto / cuenta).
 *
 * Es la misma memoria que edita a mano la pestaña «Consolidado» de un cargue de
 * nómina (`consolidacion_modulo_cliente`), pero vista al derecho: por cliente y
 * concepto, y cargable de una sola vez desde Excel para toda la cartera. El código
 * del concepto es la LLAVE: es lo que la plataforma busca en el archivo de nómina
 * para saber contra qué cuenta cruza cada fila.
 *
 * Alcance: se listan SOLO los clientes de la cartera del usuario (los
 * administradores tienen alcance global); la escritura revalida el alcance cliente
 * por cliente en la Server Action.
 */
export default async function ConceptosNominaPage() {
  await requirePermiso("modulos_datos:editar");
  const alc = await alcanceLecturaUsuario();

  const [clientes, filas, subgrupos] = await Promise.all([
    prisma.client.findMany({
      where: alc.todos ? {} : { id: { in: alc.clientIds } },
      select: { id: true, code: true, name: true, nit: true },
      orderBy: { name: "asc" },
    }),
    prisma.consolidacionModuloCliente.findMany({
      where: {
        moduloCodigo: MODULO_CONCEPTOS_NOMINA,
        ...(alc.todos ? {} : { clienteId: { in: alc.clientIds } }),
      },
      select: { clienteId: true, clasificador: true, descripcion: true, cuenta4: true, actualizadoEn: true },
      orderBy: [{ clasificador: "asc" }, { cuenta4: "asc" }],
    }),
    prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true } }),
  ]);

  const porCliente = new Map(clientes.map((c) => [c.id, c]));
  const nombreCuenta = new Map(subgrupos.map((s) => [s.codigo, s.nombre]));

  // Una fila por (cliente, código): sus cuentas se agrupan, porque en BD cada par
  // concepto↔cuenta es una fila propia.
  const agrupadas = new Map<string, ConceptoRow>();
  for (const f of filas) {
    const cliente = porCliente.get(f.clienteId);
    if (!cliente) continue; // FK suave: el cliente pudo borrarse
    const clave = `${f.clienteId}|${f.clasificador}`;
    const previa = agrupadas.get(clave);
    if (previa) {
      previa.cuentas.push({ codigo: f.cuenta4, nombre: nombreCuenta.get(f.cuenta4) ?? null });
      if (!previa.concepto && f.descripcion) previa.concepto = f.descripcion;
      if (f.actualizadoEn.getTime() > previa.actualizadoEn) previa.actualizadoEn = f.actualizadoEn.getTime();
      continue;
    }
    agrupadas.set(clave, {
      clienteId: f.clienteId,
      clienteCodigo: cliente.code,
      clienteNombre: cliente.name,
      clienteNit: cliente.nit,
      codigo: f.clasificador,
      concepto: f.descripcion,
      cuentas: [{ codigo: f.cuenta4, nombre: nombreCuenta.get(f.cuenta4) ?? null }],
      actualizadoEn: f.actualizadoEn.getTime(),
    });
  }

  const rows = [...agrupadas.values()].sort(
    (a, b) =>
      a.clienteNombre.localeCompare(b.clienteNombre, "es") ||
      a.codigo.localeCompare(b.codigo, "es", { numeric: true }),
  );

  return (
    <div>
      <PageHeader
        title="Conceptos de nómina"
        subtitle="Qué cuenta Russell corresponde a cada concepto de la nómina de cada cliente. Cárgalos en bloque desde Excel: el código del concepto es la llave con la que se homologa el archivo de nómina."
      />
      <ConceptosNominaClient rows={rows} totalClientes={clientes.length} />
    </div>
  );
}
