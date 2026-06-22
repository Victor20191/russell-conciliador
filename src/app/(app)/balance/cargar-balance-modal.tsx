"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { Chip } from "@/components/ui";
import { MESES_LARGOS } from "@/lib/format";
import { cargarBalance } from "@/app/actions/balance";
import { notifyActionState } from "@/lib/client-notifications";
import type { ImportBalanceState } from "@/lib/import/balance";

export type ClienteOpcion = { id: number; name: string; nit: string };

type Resumen = NonNullable<ImportBalanceState["resumen"]>;
type Excepcion = NonNullable<ImportBalanceState["excepciones"]>[number];

export function CargarBalanceButton({ clients }: { clients: ClienteOpcion[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-navy-600"
      >
        <Icon name="upload" size={14} /> Cargar balance
      </button>
      {open && <CargarBalanceModal clients={clients} onClose={() => setOpen(false)} />}
    </>
  );
}

function CargarBalanceModal({ clients, onClose }: { clients: ClienteOpcion[]; onClose: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ImportBalanceState, FormData>(cargarBalance, {});
  const [clientId, setClientId] = useState("");
  const [fileName, setFileName] = useState("");
  const anioActual = new Date().getFullYear();
  const mesActual = new Date().getMonth();
  const anios = [anioActual + 1, anioActual, anioActual - 1, anioActual - 2, anioActual - 3];

  useEffect(() => {
    notifyActionState(state, {
      success: "Balance cargado.",
      error: "No se pudo cargar el balance.",
    });
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Cargar balance de comprobación"
      size="2xl"
      footer={
        state?.ok ? (
          <button onClick={onClose} className="ml-auto rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600">
            Cerrar
          </button>
        ) : (
          <button
            type="submit"
            form="cargar-balance-form"
            disabled={pending || !clientId || !fileName}
            className="ml-auto rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
          >
            {pending ? "Extrayendo con IA…" : "Cargar balance"}
          </button>
        )
      }
    >
      {state?.ok && state.resumen ? (
        <ResultadoOk resumen={state.resumen} excepciones={state.excepciones ?? []} onClose={onClose} />
      ) : (
        <form id="cargar-balance-form" action={formAction} className="flex flex-col gap-3.5">
          <p className="text-[12.5px] leading-relaxed text-ink-600">
            Sube el balance en <span className="font-semibold">Excel (.xlsx/.xls/.xlsb), CSV, JSON o PDF</span>. La IA
            identifica la estructura, extrae las cuentas (NIT, período, saldos, débitos y créditos), valida el cuadre y
            reporta las excepciones sin inventar datos. Cada cargue crea una nueva versión del período.
          </p>

          {clients.length === 0 ? (
            <div className="rounded-md border border-warn-100 bg-warn-100/40 px-3 py-2.5 text-[12.5px] text-warn-700">
              No tienes clientes asignados con alcance para cargar balances.
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-ink-600">Cliente</span>
                <select
                  name="clientId"
                  required
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
                >
                  <option value="" disabled>
                    Selecciona el cliente…
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.nit}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-3 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11.5px] font-medium text-ink-600">Mes del período</span>
                  <select name="mes" required defaultValue={MESES_LARGOS[mesActual]} className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400">
                    {MESES_LARGOS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11.5px] font-medium text-ink-600">Año</span>
                  <select name="anio" required defaultValue={anioActual} className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400">
                    {anios.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11.5px] font-medium text-ink-600">Estándar</span>
                  <select name="estandar" defaultValue="AUTO" className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400">
                    <option value="AUTO">Auto</option>
                    <option value="NIIF">NIIF</option>
                    <option value="PCGA">PCGA</option>
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-ink-600">Archivo (Excel, CSV, JSON o PDF)</span>
                <input
                  type="file"
                  name="archivo"
                  accept=".xlsx,.xls,.xlsb,.csv,.json,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  required
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
                  className="rounded-md border border-ink-200 bg-white text-[12.5px] text-ink-700 file:mr-3 file:cursor-pointer file:border-0 file:bg-navy-700 file:px-3 file:py-2 file:text-[12.5px] file:font-semibold file:text-white"
                />
              </label>

              {state?.message && <p className="text-[12px] font-medium text-err-700">{state.message}</p>}
              {state?.errores && state.errores.length > 0 && <ErroresTabla errores={state.errores} />}
              {state?.excepciones && state.excepciones.length > 0 && <ExcepcionesTabla excepciones={state.excepciones} />}
            </>
          )}
        </form>
      )}
    </Modal>
  );
}

function ResultadoOk({ resumen, excepciones, onClose }: { resumen: Resumen; excepciones: Excepcion[]; onClose: () => void }) {
  const aud = resumen.auditoria;
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-ok-100 bg-ok-100/40 px-3 py-2.5 text-[12.5px] text-ok-700">
        Balance cargado como <span className="font-semibold">{resumen.version}</span> para{" "}
        <span className="font-semibold">{resumen.cliente}</span> · {resumen.period}.
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Dato label="Cuentas" value={String(resumen.cuentas)} />
        <Dato label="Mapeadas" value={`${resumen.mapped}/${resumen.cuentas}`} />
        <Dato label="Sin mapeo" value={String(resumen.unmapped)} />
        <Dato label="Cuadre">
          <Chip label={resumen.balanced ? "Cuadrado" : "Descuadra"} tone={resumen.balanced ? "ok" : "err"} />
        </Dato>
      </div>

      {aud && (
        <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2.5">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Resumen de auditoría</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-ink-600 sm:grid-cols-3">
            <Linea k="Filas leídas" v={String(aud.filasLeidas)} />
            <Linea k="Importables" v={String(aud.filasImportables)} />
            <Linea k="Excluidas" v={String(aud.filasExcluidas)} />
            <Linea k="Descuadres" v={String(aud.filasDescuadre)} />
            <Linea k="NIT" v={`${aud.nit.valor ?? "—"} (${aud.nit.fuente.toLowerCase()})`} />
            <Linea k="Centro" v={`${aud.centro.valor ?? "—"} (${aud.centro.fuente.toLowerCase()})`} />
            <Linea k="Período" v={`${aud.periodoInicial.valor ?? "?"} → ${aud.periodoFinal.valor ?? "?"}`} />
            <Linea k="Estándar" v={aud.estandar} />
            <Linea k="Signo crédito" v={aud.convencionCredito} />
          </div>
        </div>
      )}

      {excepciones.length > 0 && <ExcepcionesTabla excepciones={excepciones} />}

      <Link href={`/balance/${resumen.id}`} onClick={onClose} className="inline-flex w-fit items-center gap-1.5 rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50">
        <Icon name="chev-r" size={13} /> Ver balance cargado
      </Link>
    </div>
  );
}

function ExcepcionesTabla({ excepciones }: { excepciones: Excepcion[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-warn-700">{excepciones.length} excepción(es) — no se importaron estas filas:</span>
      <div className="max-h-60 overflow-y-auto rounded-md border border-ink-150">
        <table className="w-full text-[11.5px]">
          <thead className="sticky top-0 bg-ink-50 text-ink-500">
            <tr className="text-left">
              <th className="px-2.5 py-1.5 font-semibold">Fila</th>
              <th className="px-2.5 py-1.5 font-semibold">Regla / conflicto</th>
              <th className="px-2.5 py-1.5 font-semibold">Acción</th>
            </tr>
          </thead>
          <tbody>
            {excepciones.map((e, i) => (
              <tr key={i} className="border-t border-ink-100 align-top">
                <td className="px-2.5 py-1.5 font-mono text-ink-500">{e.fila ?? "—"}</td>
                <td className="px-2.5 py-1.5 text-ink-700">
                  {e.regla}
                  {e.valor && <span className="block font-mono text-[10.5px] text-ink-400">{e.valor}</span>}
                </td>
                <td className="px-2.5 py-1.5 text-ink-500">{e.accion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ErroresTabla({ errores }: { errores: NonNullable<ImportBalanceState["errores"]> }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-err-700">{errores.length} problema(s) encontrados — nada se cargó:</span>
      <div className="max-h-60 overflow-y-auto rounded-md border border-ink-150">
        <table className="w-full text-[11.5px]">
          <thead className="sticky top-0 bg-ink-50 text-ink-500">
            <tr className="text-left">
              <th className="px-2.5 py-1.5 font-semibold">Fila</th>
              <th className="px-2.5 py-1.5 font-semibold">Problema</th>
            </tr>
          </thead>
          <tbody>
            {errores.map((e, i) => (
              <tr key={i} className="border-t border-ink-100">
                <td className="px-2.5 py-1.5 font-mono text-ink-500">{e.fila || "—"}</td>
                <td className="px-2.5 py-1.5 text-ink-700">{e.mensaje}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Dato({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2">
      <div className="text-[11px] font-semibold text-ink-500">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold text-ink-800">{children ?? value}</div>
    </div>
  );
}

function Linea({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-ink-400">{k}</span>
      <span className="text-right font-medium text-ink-700">{v}</span>
    </div>
  );
}
