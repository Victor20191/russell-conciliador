"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { etiquetaApertura } from "@/lib/balance/apertura-balance";
import { fmtDateTime } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import type { ActionState } from "@/lib/definitions";
import type { EleccionBalanceVista } from "@/lib/modulos/compuerta-cruce";

// Lista de los balances que sirven para el cruce de un período (7/Nov/2026): cerrados, vigentes de
// su línea y que terminan en la fecha de corte. Coinciden en saldos finales, pero pueden traer
// homologaciones distintas, así que el usuario escoge contra cuál concilia. La comparten los seis
// módulos y Retención en la fuente; cada pantalla aporta la acción que guarda la elección.

const fecha = (iso: string) => iso.split("-").reverse().join("/");
const BOTON = "whitespace-nowrap rounded-md border border-ink-200 px-2.5 py-1 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-60";
const CELDA = "px-3 py-1.5 align-middle";

export function SelectorBalanceCruce({
  eleccion,
  balanceEnUsoId,
  puedeEscoger,
  escoger,
}: {
  eleccion: EleccionBalanceVista | null | undefined;
  balanceEnUsoId: number | null;
  /** Quien edita el cargue (o la revisión), con el período abierto. */
  puedeEscoger: boolean;
  escoger: (balanceId: number) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  if (!eleccion) return null;
  const { opciones, origen, elegidoPor, elegidoEn, aviso } = eleccion;
  const aviso_ = aviso ? (
    <div className="flex items-start gap-2 rounded-md border border-warn-500 bg-warn-100 px-3 py-2 text-[12px] leading-snug text-warn-700">
      <Icon name="warn" size={14} className="mt-0.5 shrink-0" />
      <span>{aviso}</span>
    </div>
  ) : null;
  if (opciones.length < 2) return aviso_;

  const masReciente = opciones[0]?.id;
  const usar = (balanceId: number) => {
    start(async () => {
      const r = await escoger(balanceId);
      if (r.ok) notifySuccess(r.message ?? "Balance del cruce actualizado.");
      else notifyError(r.message ?? "No se pudo cambiar el balance del cruce.");
      router.refresh();
    });
  };

  return (
    <section aria-label="Balances que sirven para el cruce" className="rounded-lg border border-ink-150 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-ink-100 px-4 py-2.5">
        <h3 className="text-[13px] font-semibold text-navy-800">
          {opciones.length} balances cerrados sirven para este corte
        </h3>
        {origen === "elegido"
          ? <Chip label={`Escogido por ${elegidoPor ?? "un usuario"}`} tone="blue" />
          : <Chip label="Preseleccionado: el de modificación más reciente" tone="warn" />}
      </div>
      <div className="flex flex-col gap-2 px-4 py-2.5">
        <p className="text-[12px] leading-snug text-ink-500">
          Todos están cerrados y terminan en la fecha de corte, así que coinciden en saldos finales, pero pueden traer
          homologaciones distintas. Escoge contra cuál se concilia este período.
          {origen === "elegido" && elegidoEn && <> Lo escogió {elegidoPor ?? "un usuario"} el {fmtDateTime(elegidoEn)}</>}
          {origen === "preseleccionado" && " Nadie lo ha escogido todavía: mientras tanto se usa el de modificación más reciente."}
        </p>
        {aviso_}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-t border-ink-100 text-[12px]">
          <thead className="bg-ink-50 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            <tr>
              <th className={CELDA}>Balance</th>
              <th className={CELDA}>Apertura</th>
              <th className={CELDA}>Período</th>
              <th className={CELDA} title="La carga, el último cambio de homologación de sus cuentas o el último ajuste de su prevalidador, lo más reciente.">Última modificación</th>
              <th className={`${CELDA} text-right`}><span className="sr-only">Acción</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {opciones.map((b) => {
              const enUso = b.id === balanceEnUsoId;
              return (
                <tr key={b.id} className={enUso ? "bg-blue-50" : undefined}>
                  <td className={CELDA}>
                    <Link href={`/balance/${b.id}`} className="font-semibold text-blue-700 hover:underline">
                      {b.periodo} · {b.version}
                    </Link>
                  </td>
                  <td className={`${CELDA} text-ink-700`}>{etiquetaApertura(b.aperturaBalance)}</td>
                  <td className={`${CELDA} tabular-nums text-ink-700`}>{fecha(b.periodoInicio)} – {fecha(b.periodoFin)}</td>
                  <td className={`${CELDA} tabular-nums text-ink-700`}>
                    {b.ultimaModificacion ? fmtDateTime(b.ultimaModificacion) : "—"}
                    {b.id === masReciente && <span className="ml-1.5 text-[11px] text-ink-400">(la más reciente)</span>}
                  </td>
                  <td className={`${CELDA} text-right`}>
                    {enUso ? (
                      <Chip label="En uso" tone="ok" />
                    ) : puedeEscoger ? (
                      <button type="button" className={BOTON} disabled={pendiente} onClick={() => usar(b.id)}>
                        Conciliar contra este
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
