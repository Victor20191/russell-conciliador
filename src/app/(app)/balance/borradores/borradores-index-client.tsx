"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Chip, EmptyState } from "@/components/ui";
import { fmt } from "@/lib/format";
import { descartarBorrador } from "@/app/actions/balance";
import { notifySuccess, notifyError } from "@/lib/client-notifications";

export type BorradorRow = {
  loteId: string;
  archivoNombre: string;
  conEncabezado: boolean;
  nitDetectado: string | null;
  clienteSugerido: string | null;
  periodo: string;
  cuentasMovimiento: number;
  cuadrado: boolean;
  partidaDobleDiff: number;
  cargadoPor: string | null;
  fecha: string;
};

export default function BorradoresIndexClient({ rows }: { rows: BorradorRow[] }) {
  const router = useRouter();
  const [descartando, startDescartar] = useTransition();
  const [confirmar, setConfirmar] = useState<string | null>(null);

  const onDescartar = (loteId: string) => {
    startDescartar(async () => {
      const r = await descartarBorrador(loteId);
      if (r.ok) notifySuccess(r.message ?? "Borrador descartado.");
      else notifyError(r.message ?? "No se pudo descartar.");
      setConfirmar(null);
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="doc"
          title="No tienes borradores"
          description="Sube un balance desde «Balance» → «Cargar balance». Tras leerlo, quedará aquí como borrador para revisar antes de cargarlo."
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-[12.5px]">
        <thead className="bg-ink-50 text-ink-500">
          <tr className="text-left">
            <th className="px-3 py-2 font-semibold">Archivo</th>
            <th className="px-3 py-2 font-semibold">Cliente / NIT</th>
            <th className="px-3 py-2 font-semibold">Período</th>
            <th className="px-3 py-2 text-right font-semibold">Cuentas</th>
            <th className="px-3 py-2 font-semibold">Estado</th>
            <th className="px-3 py-2 font-semibold">Fecha</th>
            <th className="px-3 py-2 text-right font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.loteId} className="border-t border-ink-100 align-middle hover:bg-ink-50/50">
              <td className="px-3 py-2">
                <Link href={`/balance/borradores/${r.loteId}`} className="font-medium text-blue-500 hover:underline">
                  {r.archivoNombre}
                </Link>
                {!r.conEncabezado && <span className="block text-[10.5px] text-ink-400">recuperado del staging (relee para el nombre)</span>}
                {r.cargadoPor && <span className="block text-[10.5px] text-ink-400">por {r.cargadoPor}</span>}
              </td>
              <td className="px-3 py-2 text-ink-700">
                {r.clienteSugerido ?? <span className="text-ink-400">sin cliente</span>}
                {r.nitDetectado && <span className="block font-mono text-[10.5px] text-ink-400">{r.nitDetectado}</span>}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-ink-600">{r.periodo}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-700">{r.cuentasMovimiento}</td>
              <td className="px-3 py-2">
                {r.cuadrado ? (
                  <Chip label="Cuadrado" tone="ok" />
                ) : (
                  <span className="inline-flex flex-col gap-0.5">
                    <Chip label="Descuadrado" tone="warn" />
                    <span className="text-[10px] text-warn-700">DB−CR {fmt(r.partidaDobleDiff)}</span>
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-[11px] text-ink-500">{r.fecha}</td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-2">
                  <Link
                    href={`/balance/borradores/${r.loteId}`}
                    className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11.5px] font-semibold text-ink-700 hover:bg-ink-50"
                  >
                    <Icon name="chev-r" size={12} /> Revisar
                  </Link>
                  {confirmar === r.loteId ? (
                    <span className="inline-flex items-center gap-1">
                      <button
                        onClick={() => onDescartar(r.loteId)}
                        disabled={descartando}
                        className="rounded-md bg-err-100 px-2 py-1 text-[11.5px] font-semibold text-err-700 hover:bg-err-200 disabled:opacity-60"
                      >
                        {descartando ? "Descartando…" : "Confirmar"}
                      </button>
                      <button onClick={() => setConfirmar(null)} className="rounded-md border border-ink-200 px-2 py-1 text-[11.5px] text-ink-600 hover:bg-ink-50">
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmar(r.loteId)}
                      className="inline-flex items-center gap-1 rounded-md border border-err-200 px-2 py-1 text-[11.5px] font-semibold text-err-700 hover:bg-err-50"
                    >
                      <Icon name="x" size={12} /> Descartar
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
