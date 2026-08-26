import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { BackLink, Chip, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtCalendarDate, fmtDateTime } from "@/lib/format";
import {
  agruparPorCuentaTercero,
  agruparPorTerceroBalance,
  resumirBalanceTercero,
  type FilaBalanceTercero,
} from "@/lib/balance/tercero-vista";
import TerceroDetailClient, { type VersionTerceroRow } from "./tercero-detail-client";

/**
 * Detalle de UN cargue del balance abierto por tercero.
 *
 * Igual que en el balance normal, los agregados NO están persistidos: se
 * reconstruyen aquí desde el detalle con la lógica pura de `tercero-vista.ts`.
 */
export default async function BalanceTerceroDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermiso("balance:ver");
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const encabezado = await prisma.balanceTerceroEncabezado.findUnique({
    where: { id },
    select: {
      id: true,
      clienteId: true,
      nombreCliente: true,
      nit: true,
      periodo: true,
      periodoInicio: true,
      periodoFin: true,
      version: true,
      esOficial: true,
      archivo: true,
      tamanoArchivo: true,
      filasTotales: true,
      cargadoPor: true,
      ultimaCarga: true,
      creadoEn: true,
    },
  });
  if (!encabezado) notFound();

  // Alcance de lectura por cartera: el id de la URL no puede abrir el balance de
  // un cliente ajeno (Admin/Superadmin tienen alcance global).
  const [alc, eliminarAuth] = await Promise.all([
    alcanceLecturaUsuario(),
    authorizePermiso("balance:eliminar", { clientId: encabezado.clienteId }),
  ]);
  if (!alc.todos && !alc.clientIds.includes(encabezado.clienteId)) notFound();

  const [detalles, hermanos] = await Promise.all([
    prisma.balanceTerceroDetalle.findMany({
      where: { encabezadoId: id },
      select: {
        id: true,
        cuenta2: true,
        cuenta4: true,
        cuenta6: true,
        cuenta8: true,
        nombreCuenta: true,
        cuenta6Russell: true,
        nitTercero: true,
        nombreTercero: true,
        saldoInicial: true,
        debitos: true,
        creditos: true,
        saldoFinal: true,
      },
      orderBy: [{ cuenta8: "asc" }, { id: "asc" }],
    }),
    prisma.balanceTerceroEncabezado.findMany({
      where: { clienteId: encabezado.clienteId, periodo: encabezado.periodo },
      select: {
        id: true,
        version: true,
        esOficial: true,
        archivo: true,
        filasTotales: true,
        cargadoPor: true,
        ultimaCarga: true,
        creadoEn: true,
      },
      orderBy: [{ ultimaCarga: "desc" }, { id: "desc" }],
    }),
  ]);

  const filas: FilaBalanceTercero[] = detalles.map((d) => ({
    id: d.id,
    cuenta2: d.cuenta2,
    cuenta4: d.cuenta4,
    cuenta6: d.cuenta6,
    cuenta8: d.cuenta8,
    nombreCuenta: d.nombreCuenta,
    cuenta6Russell: d.cuenta6Russell,
    nitTercero: d.nitTercero,
    nombreTercero: d.nombreTercero,
    saldoInicial: Number(d.saldoInicial),
    debitos: Number(d.debitos),
    creditos: Number(d.creditos),
    saldoFinal: Number(d.saldoFinal),
  }));

  const resumen = resumirBalanceTercero(filas);
  const porCuenta = agruparPorCuentaTercero(filas);
  const porTercero = agruparPorTerceroBalance(filas);

  const versiones: VersionTerceroRow[] = hermanos.map((h) => ({
    id: h.id,
    version: h.version,
    esOficial: h.esOficial,
    archivo: h.archivo,
    filas: h.filasTotales,
    cargadoPor: h.cargadoPor,
    fecha: fmtDateTime(h.ultimaCarga ?? h.creadoEn),
  }));

  const rango = `${fmtCalendarDate(encabezado.periodoInicio)} → ${fmtCalendarDate(encabezado.periodoFin)}`;

  return (
    <div>
      <BackLink href="/balance/terceros" label="Balance por tercero" />
      <PageHeader
        title={encabezado.nombreCliente}
        subtitle={`${encabezado.periodo} · ${encabezado.version}`}
        actions={
          <div className="flex items-center gap-2">
            {encabezado.esOficial ? (
              <Chip label="Vigente" tone="ok" />
            ) : (
              <Chip label="Histórica" tone="ink" />
            )}
          </div>
        }
      />

      <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
        <span className="inline-flex items-center gap-1">
          <Icon name="upload" size={12} /> {encabezado.cargadoPor ?? "Sistema"} ·{" "}
          {fmtDateTime(encabezado.ultimaCarga ?? encabezado.creadoEn)}
        </span>
        <span className="font-mono">
          {[encabezado.archivo ?? "— sin archivo —", encabezado.tamanoArchivo].filter(Boolean).join(" · ")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name="log" size={12} /> {rango}
        </span>
        {encabezado.nit && <span className="font-mono">NIT {encabezado.nit}</span>}
      </p>

      <TerceroDetailClient
        encabezadoId={encabezado.id}
        resumen={resumen}
        porCuenta={porCuenta}
        porTercero={porTercero}
        filas={filas}
        versiones={versiones}
        puedeEliminar={eliminarAuth.ok}
      />
    </div>
  );
}
