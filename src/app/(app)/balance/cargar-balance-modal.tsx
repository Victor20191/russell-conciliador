"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { Chip } from "@/components/ui";
import { leerBalance, confirmarCargaBalance, type LeerBalanceState, type SugerenciaBalance } from "@/app/actions/balance";
import { notifyActionState } from "@/lib/client-notifications";
import { TIPO_BALANCE_CARGA } from "@/lib/balance/tipo-balance";
import type { ImportBalanceState } from "@/lib/import/balance";

export type ClienteOpcion = { id: number; name: string; nit: string };

type Resumen = NonNullable<ImportBalanceState["resumen"]>;
type Excepcion = NonNullable<ImportBalanceState["excepciones"]>[number];

const soloDigitos = (s: string) => (s ?? "").replace(/\D/g, "");

/** Cliente cuyo NIT coincide con el NIT detectado (núcleo de 9 dígitos). */
function clienteSugerido(clients: ClienteOpcion[], nit: string | null): string {
  const core = soloDigitos(nit ?? "").slice(0, 9);
  if (core.length < 5) return "";
  const m = clients.find((c) => soloDigitos(c.nit).slice(0, 9) === core);
  return m ? String(m.id) : "";
}

export function CargarBalanceButton({ clients }: { clients: ClienteOpcion[] }) {
  const [open, setOpen] = useState(false);
  // `instancia` reinicia el asistente por completo (incluye los useActionState).
  const [instancia, setInstancia] = useState(0);
  const reiniciar = () => setInstancia((n) => n + 1);
  return (
    <>
      <button
        onClick={() => { reiniciar(); setOpen(true); }}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-navy-600"
      >
        <Icon name="upload" size={14} /> Cargar balance
      </button>
      {open && <CargarBalanceModal key={instancia} clients={clients} onClose={() => setOpen(false)} onReiniciar={reiniciar} />}
    </>
  );
}

function CargarBalanceModal({ clients, onClose, onReiniciar }: { clients: ClienteOpcion[]; onClose: () => void; onReiniciar: () => void }) {
  const router = useRouter();
  const [leerState, leerAction, leyendo] = useActionState<LeerBalanceState, FormData>(leerBalance, {});
  const [confirmState, confirmAction, cargando] = useActionState<ImportBalanceState, FormData>(confirmarCargaBalance, {});
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    notifyActionState(confirmState, { success: "Balance cargado.", error: "No se pudo cargar el balance." });
    if (confirmState?.ok) router.refresh();
  }, [confirmState, router]);

  const sug = leerState?.sugerencia;
  const fase: "ok" | "revisar" | "archivo" = confirmState?.ok ? "ok" : sug ? "revisar" : "archivo";

  const footer =
    fase === "ok" ? (
      <button onClick={onClose} className="ml-auto rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600">
        Cerrar
      </button>
    ) : fase === "revisar" ? (
      <div className="flex w-full items-center">
        <button type="button" onClick={onReiniciar} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50">
          ← Otro archivo
        </button>
        <button
          type="submit"
          form="confirmar-form"
          disabled={cargando}
          className="ml-auto rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
        >
          {cargando ? "Cargando…" : "Cargar balance"}
        </button>
      </div>
    ) : (
      <button
        type="submit"
        form="leer-form"
        disabled={leyendo || !fileName || clients.length === 0}
        className="ml-auto rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
      >
        {leyendo ? "Leyendo con IA…" : "Leer archivo"}
      </button>
    );

  return (
    <Modal open onClose={onClose} title="Cargar balance de comprobación" size="2xl" footer={footer}>
      {fase === "ok" && confirmState.resumen ? (
        <ResultadoOk resumen={confirmState.resumen} excepciones={confirmState.excepciones ?? []} onClose={onClose} />
      ) : fase === "revisar" && sug ? (
        <FormRevisar sug={sug} clients={clients} confirmAction={confirmAction} confirmMessage={confirmState?.message} excepciones={leerState?.excepciones ?? []} />
      ) : (
        <form id="leer-form" action={leerAction} className="flex flex-col gap-3.5">
          <p className="text-[12.5px] leading-relaxed text-ink-600">
            Sube el balance en <span className="font-semibold">Excel (.xlsx/.xls/.xlsb), CSV, JSON o PDF</span>. La IA lo
            lee, identifica la estructura y te <span className="font-semibold">sugiere</span> los datos (cliente, período,
            saldos). Tú revisas y completas lo que falte antes de cargar; nada se guarda hasta confirmar.
          </p>

          {clients.length === 0 ? (
            <div className="rounded-md border border-warn-100 bg-warn-100/40 px-3 py-2.5 text-[12.5px] text-warn-700">
              No tienes clientes asignados con alcance para cargar balances.
            </div>
          ) : (
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
          )}

          {leerState?.message && <p className="text-[12px] font-medium text-err-700">{leerState.message}</p>}
          {leerState?.errores && leerState.errores.length > 0 && <ErroresTabla errores={leerState.errores} />}
          {leerState?.excepciones && leerState.excepciones.length > 0 && <ExcepcionesTabla excepciones={leerState.excepciones} />}
        </form>
      )}
    </Modal>
  );
}

function FormRevisar({
  sug,
  clients,
  confirmAction,
  confirmMessage,
  excepciones,
}: {
  sug: SugerenciaBalance;
  clients: ClienteOpcion[];
  confirmAction: (payload: FormData) => void;
  confirmMessage?: string;
  excepciones: Excepcion[];
}) {
  // Defaults derivados de la sugerencia (campos NO controlados con defaultValue).
  const clienteSug = clienteSugerido(clients, sug.nitDetectado);
  const desdeDef = sug.periodoInicial ?? "";
  const hastaDef = sug.periodoFinal ?? "";
  const centroDef = sug.centro ?? "";

  return (
    <form id="confirmar-form" action={confirmAction} className="flex flex-col gap-3.5">
      <input type="hidden" name="payload" value={JSON.stringify(sug)} />

      <div className="rounded-md border border-ok-100 bg-ok-100/40 px-3 py-2.5 text-[12.5px] text-ok-700">
        Leí <span className="font-semibold">{sug.cuentas} cuenta(s)</span> de{" "}
        <span className="font-mono">{sug.archivoNombre}</span>. Revisa y completa los campos antes de cargar; no se ha guardado nada todavía.
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-medium text-ink-600">Cliente</span>
        <select
          name="clientId"
          required
          defaultValue={clienteSug}
          className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400"
        >
          <option value="" disabled>Selecciona el cliente…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name} — {c.nit}</option>
          ))}
        </select>
        {clienteSug === "" && sug.nitDetectado && (
          <span className="text-[11px] text-warn-700">
            NIT detectado <span className="font-mono">{sug.nitDetectado}</span> sin cliente coincidente — selecciónalo manualmente.
          </span>
        )}
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-medium text-ink-600">Período desde</span>
          <input type="date" name="periodoInicio" required defaultValue={desdeDef} className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-medium text-ink-600">Período hasta</span>
          <input type="date" name="periodoFin" required defaultValue={hastaDef} className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400" />
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-medium text-ink-600">Tipo de balance</span>
        <div className="rounded-md border border-ink-150 bg-ink-50 px-2.5 py-2 text-[12.5px] font-semibold text-ink-700">
          {TIPO_BALANCE_CARGA}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-medium text-ink-600">
          Centro operativo <span className="font-normal text-ink-400">(opcional · solo si aplica)</span>
        </span>
        <input type="text" name="centroOperativo" defaultValue={centroDef} placeholder="Déjalo vacío si el balance no tiene centro" className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400" />
      </label>

      <SugerenciaResumen sug={sug} />

      {confirmMessage && <p className="text-[12px] font-medium text-err-700">{confirmMessage}</p>}
      {excepciones.length > 0 && <ExcepcionesTabla excepciones={excepciones} />}
    </form>
  );
}

function SugerenciaResumen({ sug }: { sug: SugerenciaBalance }) {
  return (
    <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2.5">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Lo que detecté en el archivo</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-ink-600 sm:grid-cols-3">
        <Linea k="NIT" v={`${sug.nitDetectado ?? "—"} (${sug.nitFuente.toLowerCase()})`} />
        <Linea k="Centro" v={sug.centro ?? "—"} />
        <Linea k="Período" v={`${sug.periodoInicial ?? "?"} → ${sug.periodoFinal ?? "?"}`} />
        <Linea k="Cuentas" v={String(sug.cuentas)} />
        <Linea k="Excluidas" v={String(sug.filasExcluidas)} />
        <Linea k="Descuadres" v={String(sug.filasDescuadre)} />
        <Linea k="Tipo" v={sug.estandar} />
        <Linea k="Signo crédito" v={sug.convencionCredito} />
      </div>
    </div>
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
            <Linea k="Tipo" v={aud.estandar} />
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
      <span className="text-[11.5px] font-semibold text-warn-700">{excepciones.length} excepción(es) — filas/datos que la IA marcó para revisar:</span>
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
      <span className="text-[11.5px] font-semibold text-err-700">{errores.length} problema(s) en el archivo — nada se leyó:</span>
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
