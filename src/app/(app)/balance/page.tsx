import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { PageHeader } from "@/components/ui";
import BalanceIndexClient, {
  type ClientGroup,
  type CorteGroup,
  type CorteRow,
  type AuditRow,
} from "./balance-index-client";
import { fmtDateTime } from "@/lib/format";
import { estadoBalance } from "@/lib/balance/estado-balance";
import { agruparPorCorte, estadoDelCorte, fechaCorteISO, lineasDelCorte } from "@/lib/balance/corte";
import { cargarComparacionesDeClientes } from "@/lib/balance/comparacion-corte-servidor";
import { leerPartesArchivo } from "@/lib/balance/partes-archivo";
import { porcentajeCompletitud } from "@/lib/balance/completitud";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { configuracionIABalanceUISesion } from "@/lib/ia/proveedor-balance-sesion";

// La extracción asistida puede tardar hasta 10 minutos. Vercel usa este valor
// para que la Server Action no sea terminada antes que su proveedor de IA.
export const maxDuration = 1800;

export default async function BalancePage() {
  await requirePermiso("balance:ver");
  // Cartera de lectura: cada usuario ve solo los balances de SUS clientes
  // (Admin/Superadmin ven todos). El encabezado referencia al cliente por id.
  const [alc, crearBalanceAuth] = await Promise.all([
    alcanceLecturaUsuario(),
    authorizePermiso("balance:crear"),
  ]);
  const canUpload = crearBalanceAuth.ok;
  const whereCliente = alc.todos ? {} : { clienteId: { in: alc.clientIds } };
  const [encabezados, carteraClientes, configuracionIA, auditoria, usuariosAuditoria, comparaciones, cierresEnFirme] = await Promise.all([
    prisma.balancePruebaEncabezado.findMany({
      where: whereCliente,
      orderBy: { creadoEn: "desc" },
      select: {
        id: true, clienteId: true, nombreCliente: true, nit: true, periodo: true, periodoFin: true, version: true,
        estaCongelado: true, estado: true, completitud: true, ultimaCarga: true,
        mapeadas: true, sinMapear: true, filasTotales: true, aperturaBalance: true, creadoEn: true,
        archivosCargue: true,
      },
    }),
    // Clientes de la cartera para el selector del modal de carga.
    prisma.client.findMany({
      where: alc.todos ? {} : { id: { in: alc.clientIds } },
      select: { id: true, name: true, nit: true },
      orderBy: { name: "asc" },
    }),
    canUpload ? configuracionIABalanceUISesion() : Promise.resolve(null),
    prisma.auditEntry.findMany({
      where: alc.todos
        ? { clientId: { not: null } }
        : { clientId: { in: alc.clientIds } },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: {
        createdAt: true,
        user: true,
        action: true,
        entity: true,
        detail: true,
        clientId: true,
        ip: true,
      },
    }),
    prisma.user.findMany({
      select: { name: true, role: true },
    }),
    // Pares de saldos finales guardados (null si la consulta falló: el corte se ve «sin comparar»).
    cargarComparacionesDeClientes(whereCliente),
    // Conciliaciones en firme: el balance contra el que se cerró lleva el distintivo.
    prisma.conciliacionModuloCierre.findMany({
      where: { estado: "firme", ...whereCliente },
      select: { balanceEncabezadoId: true, moduloCodigo: true },
    }),
  ]);
  // Cargar balance = permiso de rol (Staff es el único operativo). El alcance
  // por cliente se verifica de nuevo en la Server Action al enviar.
  const uploadClients = canUpload ? carteraClientes : [];

  // Agrupar por cliente → corte → balances vigentes (18/Oct/2026). La clave de cliente es el
  // clienteId (NO el nombre, que es denormalizado). Un corte reúne los balances que terminan en
  // la misma fecha —mensual, anual, por cuenta, por terceros—; cada renglón es la versión
  // VIGENTE de una línea (texto del período + apertura) y muestra su período completo. Las
  // reglas de líneas y vigentes viven en `corte.ts`. Solo objetos planos cruzan al cliente.
  const pares = comparaciones ?? [];
  const firmesPorBalance = new Map<number, string[]>();
  for (const c of cierresEnFirme) firmesPorBalance.set(c.balanceEncabezadoId, [...(firmesPorBalance.get(c.balanceEncabezadoId) ?? []), c.moduloCodigo]);
  const porCliente = new Map<number, typeof encabezados>();
  for (const b of encabezados) porCliente.set(b.clienteId, [...(porCliente.get(b.clienteId) ?? []), b]);

  const clients: ClientGroup[] = [...porCliente.values()]
    // Clientes por su última carga (el listado viene por `creadoEn desc`).
    .sort((a, b) => b[0].creadoEn.getTime() - a[0].creadoEn.getTime())
    .map((delCliente) => {
      const primero = delCliente[0];
      const cortes: CorteGroup[] = [...agruparPorCorte(delCliente).entries()]
        // Corte más reciente primero.
        .sort(([, a], [, b]) => b[0].periodoFin.getTime() - a[0].periodoFin.getTime())
        .map(([clave, delCorte]) => {
          const lineas = lineasDelCorte(delCorte);
          const vigentes = lineas.map((l) => l.vigente);
          const idsVigentes = new Set(vigentes.map((v) => v.id));
          const paresDelCorte = pares.filter((p) => idsVigentes.has(p.balanceAId) && idsVigentes.has(p.balanceBId));
          const rows: CorteRow[] = lineas.map((l) => {
            const b = l.vigente;
            return {
              key: l.clave, id: b.id, period: b.periodo, apertura: l.apertura, versions: l.versiones.length,
              // De los conteos, no de la columna guardada: las versiones anteriores la
              // redondeaban y 341 de 342 cuentas se veían «100 %».
              status: estadoBalance(b), complete: porcentajeCompletitud(b.mapeadas, b.sinMapear), lastUpload: b.ultimaCarga ? fmtDateTime(b.ultimaCarga) : "",
              mapped: b.mapeadas, unmapped: b.sinMapear, total: b.filasTotales,
              inconsistente: paresDelCorte.some((p) => p.inconsistente && (p.balanceAId === b.id || p.balanceBId === b.id)),
              // Por el nombre del módulo («Inventarios»), no por su código.
              enFirme: [...new Set(firmesPorBalance.get(b.id) ?? [])].map((codigo) => descriptorModulo(codigo)?.label ?? codigo),
              // Balance partido en varios archivos: nombres de las partes de ESTA versión.
              archivos: leerPartesArchivo(b.archivosCargue).map((parte) => parte.archivoNombre),
            };
          });
          const [anio, mes, dia] = fechaCorteISO(delCorte[0].periodoFin).split("-");
          const estado = comparaciones ? estadoDelCorte(vigentes, paresDelCorte) : vigentes.length > 1 ? "sin_comparar" : "unico";
          return {
            key: clave,
            fechaCorte: `${dia}/${mes}/${anio}`,
            estado,
            // Con dos vigentes el corte tiene un solo par: cuántas cuentas difieren desde el umbral.
            cuentasDiferentes: estado === "inconsistente" && vigentes.length === 2 ? paresDelCorte[0]?.materiales ?? null : null,
            rows,
          };
        });
      return { clientId: primero.clienteId, clientName: primero.nombreCliente, clientNit: primero.nit ?? "", cortes };
    });

  const clientePorId = new Map(carteraClientes.map((cliente) => [cliente.id, cliente.name]));
  const rolPorUsuario = new Map(usuariosAuditoria.map((usuario) => [usuario.name, usuario.role]));
  const auditRows: AuditRow[] = auditoria.flatMap((entrada) => {
    if (entrada.clientId == null) return [];
    const clientName = clientePorId.get(entrada.clientId);
    if (!clientName) return [];
    return [{
      date: fmtDateTime(entrada.createdAt),
      actor: entrada.user,
      role: rolPorUsuario.get(entrada.user) ?? "Sistema",
      action: entrada.action,
      ip: entrada.ip ?? "—",
      details: [entrada.entity, entrada.detail].filter(Boolean).join(" · "),
      clientId: entrada.clientId,
      clientName,
    }];
  });
  const auditClients = carteraClientes.map((cliente) => ({ id: cliente.id, name: cliente.name }));

  return (
    <div>
      <PageHeader
        title="Balance de comprobación"
        subtitle="Fuente única de los balances cargados por cliente. Carga, versionamiento, validaciones y trazabilidad. Lo consumen DIAN y Conciliaciones."
      />
      <BalanceIndexClient
        clients={clients}
        auditRows={auditRows}
        auditClients={auditClients}
        uploadClients={uploadClients}
        canUpload={canUpload}
        configuracionIA={configuracionIA}
      />
    </div>
  );
}
