import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceEscrituraUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import { MODULO_CONCEPTOS_NOMINA } from "@/lib/import/conceptos-nomina";
import { descriptorVigente } from "@/lib/parametros/cuentas-conciliacion";
import { cargarCuentasEstandarDeCedula } from "@/lib/modulos/cruce-contable-servidor";
import { grupoConcepto } from "@/lib/modulos/nomina/grupos-concepto";
import { esAgruparPor } from "@/lib/modulos/nomina/agrupar-por";
import ConceptosNominaClient, { type ConceptoRow } from "./conceptos-nomina-client";

/**
 * Configuración › **Conceptos de nómina** — carga MASIVA y administración del catálogo de
 * conceptos por cliente (RF-NOM-07/08/09): cliente / grupo de cuenta contable / código /
 * nombre / cuenta contable del cliente (+ centro de costo), desde la plantilla Russell o desde
 * el catálogo nativo del ERP (SIIGO, INCODOL, NOMINAI…).
 *
 * Es la misma memoria que edita a mano la pestaña «Consolidado» de un cargue de nómina
 * (`consolidacion_modulo_cliente`), pero vista al derecho: por cliente y concepto. El código
 * del concepto es la LLAVE: es lo que la plataforma busca en el archivo de nómina para saber
 * contra qué cuenta cruza cada fila; el centro de costo permite que un mismo concepto vaya a
 * 510506 en administración y a 720506 en producción.
 *
 * Alcance (19/Oct/2026): todos los roles CONSULTAN el catálogo de todos los clientes; cargar y
 * eliminar es de quien tiene `modulos_datos:editar` y alcance de escritura sobre el cliente
 * (staff y senior asignados, administradores). La pantalla solo ofrece esos controles en esos
 * clientes, y la Server Action vuelve a revisar el alcance cliente por cliente.
 */
export default async function ConceptosNominaPage() {
  await requirePermiso("modulos_datos:ver");
  const [puedeEditar, escritura] = await Promise.all([
    authorizePermiso("modulos_datos:editar").then((r) => r.ok),
    alcanceEscrituraUsuario(),
  ]);

  const [clientes, filas, subgrupos, cuentasEstandar] = await Promise.all([
    prisma.client.findMany({
      select: { id: true, code: true, name: true, nit: true },
      orderBy: { name: "asc" },
    }),
    prisma.consolidacionModuloCliente.findMany({
      where: { moduloCodigo: MODULO_CONCEPTOS_NOMINA },
      select: {
        clienteId: true, agruparPor: true, clasificador: true, agrupador: true, descripcion: true, cuenta4: true, cuenta6: true,
        grupo: true, subcuentaPuc: true, cuentaCliente: true, origen: true, actualizadoEn: true,
      },
      orderBy: [{ agruparPor: "asc" }, { clasificador: "asc" }, { agrupador: "asc" }, { cuenta6: "asc" }, { cuentaCliente: "asc" }],
    }),
    prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true } }),
    descriptorVigente(MODULO_CONCEPTOS_NOMINA).then((d) => cargarCuentasEstandarDeCedula(d)),
  ]);

  const porCliente = new Map(clientes.map((c) => [c.id, c]));
  // Nómina cruza a 6 dígitos: se muestra la cuenta completa; las filas guardadas antes de ese
  // cambio (solo cuenta_4) se ven por su subgrupo, para que se note que falta completarlas.
  const nombreCuenta = new Map([...subgrupos, ...cuentasEstandar].map((s) => [s.codigo, s.nombre]));
  const cuentaDe = (f: { cuenta4: string; cuenta6: string }) => f.cuenta6 || f.cuenta4;

  // Una fila por (cliente, código, centro): sus cuentas se agrupan, porque en BD cada par
  // concepto↔cuenta es una fila propia. Lo guardado agrupando por nombre o por cuenta del cliente
  // («Agrupar por» del Consolidado) es otra llave: no se mezcla con el código.
  const agrupadas = new Map<string, ConceptoRow>();
  for (const f of filas) {
    const cliente = porCliente.get(f.clienteId);
    if (!cliente) continue; // FK suave: el cliente pudo borrarse
    const clave = `${f.clienteId}|${f.agruparPor}|${f.clasificador}|${f.agrupador}`;
    const russell = cuentaDe(f);
    const cuenta = { codigo: russell, nombre: russell ? nombreCuenta.get(russell) ?? null : null, cuentaCliente: f.cuentaCliente, subcuentaPuc: f.subcuentaPuc };
    const previa = agrupadas.get(clave);
    if (previa) {
      previa.cuentas.push(cuenta);
      if (!previa.concepto && f.descripcion) previa.concepto = f.descripcion;
      if (!previa.grupo && f.grupo) previa.grupo = grupoConcepto(f.grupo)?.etiqueta ?? f.grupo;
      if (f.actualizadoEn.getTime() > previa.actualizadoEn) previa.actualizadoEn = f.actualizadoEn.getTime();
      continue;
    }
    agrupadas.set(clave, {
      clienteId: f.clienteId,
      clienteCodigo: cliente.code,
      clienteNombre: cliente.name,
      clienteNit: cliente.nit,
      codigo: f.clasificador,
      agruparPor: esAgruparPor(f.agruparPor) ? f.agruparPor : "codigo",
      agrupador: f.agrupador,
      concepto: f.descripcion,
      grupo: f.grupo ? grupoConcepto(f.grupo)?.etiqueta ?? f.grupo : null,
      origen: f.origen,
      cuentas: [cuenta],
      actualizadoEn: f.actualizadoEn.getTime(),
    });
  }

  const rows = [...agrupadas.values()].sort(
    (a, b) =>
      a.clienteNombre.localeCompare(b.clienteNombre, "es") ||
      a.codigo.localeCompare(b.codigo, "es", { numeric: true }) ||
      a.agrupador.localeCompare(b.agrupador, "es"),
  );

  return (
    <div>
      <PageHeader
        title="Conceptos de nómina"
        subtitle="Qué cuenta contable —del cliente y Russell— corresponde a cada concepto de la nómina de cada cliente. Cárgalos en bloque desde la plantilla o desde el catálogo del ERP: el código del concepto es la llave con la que se homologa el archivo de nómina."
      />
      <ConceptosNominaClient
        rows={rows}
        totalClientes={clientes.length}
        clientes={clientes.map((c) => ({ id: c.id, name: c.name, nit: c.nit }))}
        puedeEditar={puedeEditar}
        editables={escritura.todos ? "todos" : escritura.clientIds}
      />
    </div>
  );
}
