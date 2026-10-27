"use client";

// Lista de patrones manuales de un módulo, agrupada por cliente (21/Oct/2026).
import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, Chip, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { fmtDate } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { eliminarPerfilCargaModulo } from "@/app/actions/perfiles-carga-modulos";
import type { ClienteFormatosManualesVm, FormatoManualVm } from "@/lib/modulos/formatos-manuales-servidor";

export default function PatronesManualesClient({ clientes, puedeBorrar }: { clientes: ClienteFormatosManualesVm[]; puedeBorrar: boolean }) {
  if (clientes.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="doc"
          title="Todavía no hay patrones manuales"
          description="Se guardan al confirmar un cargue con «Archivo manual»: la casilla «Guardar este patrón manual para el cliente» del borrador."
        />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {clientes.map((grupo) => (
        <Card key={grupo.clienteId} className="overflow-hidden">
          <CardHeader
            title={grupo.cliente}
            right={
              <span className="text-[11.5px] text-ink-500">
                {grupo.nit ? `NIT ${grupo.nit} · ` : ""}{grupo.formatos.length} {grupo.formatos.length === 1 ? "patrón" : "patrones"}
              </span>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12px]">
              <thead className="bg-ink-50 text-left text-[10.5px] uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Formato</th>
                  <th className="px-3 py-2 font-semibold">Archivo de ejemplo</th>
                  <th className="px-3 py-2 text-right font-semibold">Usos</th>
                  <th className="px-3 py-2 font-semibold">Guardado</th>
                  <th className="px-3 py-2 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {grupo.formatos.map((formato) => (
                  <FilaFormato key={formato.id} formato={formato} cliente={grupo.cliente} puedeBorrar={puedeBorrar} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}

function FilaFormato({ formato, cliente, puedeBorrar }: { formato: FormatoManualVm; cliente: string; puedeBorrar: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [borrando, setBorrando] = useState(false);
  return (
    <Fragment>
      <tr className="border-t border-ink-100 align-top">
        <td className="px-3 py-2.5 text-ink-600">
          {formato.anterior ? (
            <Chip label="Patrón anterior · solo coincidencia exacta" tone="warn" />
          ) : (
            <button type="button" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="inline-flex items-center gap-1 font-semibold text-ink-800">
              <Icon name={abierta ? "chev-d" : "chev-r"} size={12} />{formato.titulos.length} títulos
            </button>
          )}
          <div className="mt-1 text-[11px] text-ink-500">
            {formato.hojaEjemplo ? <>Hoja del ejemplo «{formato.hojaEjemplo}» · </> : null}{formato.resumenColumnas || "—"}
          </div>
        </td>
        <td className="px-3 py-2.5 text-ink-600">{formato.archivoEjemplo ?? "—"}</td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-600">
          {formato.vecesUsado}
          {formato.ultimoUsoEn && <div className="text-[10.5px] text-ink-400">último {fmtDate(formato.ultimoUsoEn)}</div>}
        </td>
        <td className="px-3 py-2.5 text-ink-500">
          <div>{fmtDate(formato.guardadoEn)}</div>
          <div className="text-[10.5px]">{formato.guardadoPor ?? "—"}</div>
        </td>
        <td className="px-3 py-2.5 text-right">
          {puedeBorrar ? (
            <button type="button" onClick={() => setBorrando(true)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-err-100 px-2 py-1 text-[11px] font-semibold text-err-700 hover:bg-err-50">
              <Icon name="trash" size={11} />Borrar
            </button>
          ) : (
            <span className="text-[11px] text-ink-400">—</span>
          )}
          {borrando && <BorrarFormatoModal formato={formato} cliente={cliente} onClose={() => setBorrando(false)} />}
        </td>
      </tr>
      {abierta && (
        <tr className="border-t border-ink-100 bg-ink-50/60">
          <td colSpan={5} className="px-4 py-3 text-[11.5px] text-ink-600">
            <div className="mb-1 font-semibold text-ink-700">Títulos con que se reconoce el archivo</div>
            <div className="flex flex-wrap gap-1">
              {formato.titulos.map((titulo, i) => (
                <span key={`${titulo}-${i}`} className="rounded border border-ink-200 bg-white px-1.5 py-0.5 text-[11px] text-ink-700">{titulo}</span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/** Confirma el borrado de un patrón manual. Se cierra solo con la X. */
function BorrarFormatoModal({ formato, cliente, onClose }: { formato: FormatoManualVm; cliente: string; onClose: () => void }) {
  const router = useRouter();
  const [borrando, startBorrar] = useTransition();
  const borrar = () => {
    startBorrar(async () => {
      const r = await eliminarPerfilCargaModulo(formato.id);
      if (!r.ok) { notifyError(r.message ?? "No se pudo borrar el patrón manual."); return; }
      notifySuccess(r.message ?? "Patrón manual eliminado.");
      onClose();
      router.refresh();
    });
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Borrar patrón manual · ${cliente}`}
      size="md"
      footer={
        <button type="button" disabled={borrando} onClick={borrar} className="inline-flex items-center gap-1.5 rounded-md bg-err-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-err-400 disabled:opacity-60">
          <Icon name="trash" size={12} />{borrando ? "Borrando…" : "Borrar patrón"}
        </button>
      }
    >
      <div className="flex flex-col gap-2 text-left text-[12.5px] leading-relaxed text-ink-700">
        <p>
          Se borra el patrón manual de <b>{cliente}</b>{formato.archivoEjemplo ? <> guardado con «{formato.archivoEjemplo}»</> : null}. No se puede deshacer.
        </p>
        <p className="text-[12px] text-ink-600">
          Los cargues hechos con él no cambian. El próximo archivo manual de {cliente} con estos títulos volverá a la sugerencia automática, y al confirmarlo se podrá guardar de nuevo.
        </p>
      </div>
    </Modal>
  );
}
