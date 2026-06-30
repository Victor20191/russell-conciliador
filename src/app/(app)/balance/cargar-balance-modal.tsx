"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { Chip } from "@/components/ui";
import { fmt } from "@/lib/format";
import { leerBalance, confirmarCargaBalance, auditarCargaBalance, type LeerBalanceState, type SugerenciaBalance, type AuditoriaCarga } from "@/app/actions/balance";
import { notifyActionState } from "@/lib/client-notifications";
import { leerHojasParaPreview, columnaLetra, type CeldaCruda, type HojaPreview } from "@/lib/balance/extraccion/hojas-cliente";
import type { ImportBalanceState } from "@/lib/import/balance";

/** Extensiones de Excel que pueden traer varias hojas (inspeccionables en cliente). */
const esExcel = (name: string) => /\.(xlsx|xlsm)$/i.test(name);

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
  // Hojas detectadas en el cliente (solo Excel con 2+ hojas) y la elegida por el
  // usuario. Mientras `hojas` esté presente, la elección es obligatoria.
  const [hojas, setHojas] = useState<HojaPreview[] | null>(null);
  const [hojaElegida, setHojaElegida] = useState<string | null>(null);
  const [inspeccionando, setInspeccionando] = useState(false);
  // Identifica el análisis en curso: si el usuario cambia de archivo mientras se
  // lee el anterior, descartamos el resultado tardío (no pisa el estado nuevo).
  const seqRef = useRef(0);

  useEffect(() => {
    notifyActionState(confirmState, { success: "Balance cargado.", error: "No se pudo cargar el balance." });
    if (confirmState?.ok) router.refresh();
  }, [confirmState, router]);

  // Al elegir archivo: si es Excel moderno, leemos sus hojas en el navegador
  // para que el usuario elija cuál cargar cuando haya 2+. Cualquier
  // fallo degrada al flujo normal (la IA elige) sin bloquear.
  async function onArchivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    const seq = ++seqRef.current;
    setFileName(file?.name ?? "");
    setHojas(null);
    setHojaElegida(null);
    if (!file || !esExcel(file.name)) {
      setInspeccionando(false);
      return;
    }
    setInspeccionando(true);
    try {
      const detectadas = await leerHojasParaPreview(file);
      if (seqRef.current !== seq) return; // otro archivo se eligió mientras tanto
      // Con 2+ hojas el usuario elige; con una sola la fijamos directamente. En
      // ambos casos la IA recibe SIEMPRE una hoja ya validada aquí, nunca asume.
      if (detectadas.length >= 2) setHojas(detectadas);
      else if (detectadas.length === 1) setHojaElegida(detectadas[0].nombre);
    } catch {
      /* archivo ilegible en el cliente: seguimos el flujo normal (la IA lee el archivo) */
    } finally {
      if (seqRef.current === seq) setInspeccionando(false);
    }
  }

  const sug = leerState?.sugerencia;
  const fase: "ok" | "revisar" | "archivo" = confirmState?.ok ? "ok" : sug ? "revisar" : "archivo";

  // Con Excel multi-hoja, no se puede leer hasta elegir una hoja.
  const requiereHoja = !!hojas && hojas.length >= 2;
  const leerDeshabilitado = leyendo || inspeccionando || !fileName || clients.length === 0 || (requiereHoja && !hojaElegida);

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
        disabled={leerDeshabilitado}
        className="ml-auto rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
      >
        {leyendo
          ? "Leyendo con IA…"
          : inspeccionando
            ? "Analizando hojas…"
            : requiereHoja && hojaElegida
              ? `Leer hoja «${recortar(hojaElegida, 22)}»`
              : "Leer archivo"}
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
            Sube el balance en <span className="font-semibold">Excel (.xlsx/.xlsm), CSV, JSON o PDF</span>. La IA lo
            lee, identifica la estructura y te <span className="font-semibold">sugiere</span> los datos (cliente, período,
            saldos). Tú revisas y completas lo que falte antes de cargar; nada se guarda hasta confirmar.
          </p>

          {clients.length === 0 ? (
            <div className="rounded-md border border-warn-100 bg-warn-100/40 px-3 py-2.5 text-[12.5px] text-warn-700">
              No tienes clientes asignados con alcance para cargar balances.
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-ink-600">Archivo (Excel, CSV, JSON o PDF)</span>
                <input
                  type="file"
                  name="archivo"
                  accept=".xlsx,.xlsm,.csv,.json,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  required
                  onChange={onArchivoChange}
                  className="rounded-md border border-ink-200 bg-white text-[12.5px] text-ink-700 file:mr-3 file:cursor-pointer file:border-0 file:bg-navy-700 file:px-3 file:py-2 file:text-[12.5px] file:font-semibold file:text-white"
                />
              </label>

              {/* Hoja elegida en Excel multi-hoja; vacío en archivos de una sola hoja, CSV o PDF. */}
              <input type="hidden" name="hoja" value={hojaElegida ?? ""} />

              {inspeccionando && <p className="text-[12px] text-ink-500">Analizando las hojas del archivo…</p>}
              {requiereHoja && hojas && <SelectorHojas hojas={hojas} elegida={hojaElegida} onElegir={setHojaElegida} />}
            </>
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

  // Auditoría rápida (determinista, no bloqueante): se corre al elegir cliente.
  const [audit, setAudit] = useState<AuditoriaCarga | null>(null);
  const [auditando, startAudit] = useTransition();
  const correrAudit = (cid: number) => {
    if (!cid) { setAudit(null); return; }
    startAudit(async () => { setAudit(await auditarCargaBalance(cid, sug.importReady)); });
  };
  // Fetch-on-mount intencional para el cliente sugerido (la auditoría es una
  // lectura asíncrona, no un prefill de estado derivado).
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (clienteSug) correrAudit(Number(clienteSug)); }, []);

  return (
    <form id="confirmar-form" action={confirmAction} className="flex flex-col gap-3.5">
      <input type="hidden" name="payload" value={JSON.stringify(sug)} />

      <div className="rounded-md border border-ok-100 bg-ok-100/40 px-3 py-2.5 text-[12.5px] text-ok-700">
        Leí <span className="font-semibold">{sug.cuentas} cuenta(s)</span> de{" "}
        <span className="font-mono">{sug.archivoNombre}</span>. Revisa y completa los campos antes de cargar; no se ha guardado nada todavía.
      </div>

      <CuadreBanner c={sug.cuadre} />
      <BorradorBalance sug={sug} />

      <label className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-medium text-ink-600">Cliente</span>
        <select
          name="clientId"
          required
          defaultValue={clienteSug}
          onChange={(e) => correrAudit(Number(e.target.value))}
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

      <AuditPanel audit={audit} auditando={auditando} />

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

      <SugerenciaResumen sug={sug} />

      {confirmMessage && <p className="text-[12px] font-medium text-err-700">{confirmMessage}</p>}
      {excepciones.length > 0 && <ExcepcionesTabla excepciones={excepciones} />}
    </form>
  );
}

/**
 * Resultado del cuadre de las cuentas de movimiento (hojas) contra la fila
 * TOTALES del archivo. Si no se detectó fila de totales, queda informativo; si no
 * cuadra, es bloqueante (rojo) y el botón de carga se desactiva.
 */
function CuadreBanner({ c }: { c: SugerenciaBalance["cuadre"] }) {
  if (!c) return null;
  // 1) Partida doble (lo más importante): Σ débitos debe ser EXACTAMENTE igual a Σ
  // créditos, sin tolerancia de %. Si no, se alerta aunque coincida con TOTALES.
  if (!c.partidaDobleCuadra) {
    return (
      <div className="rounded-md border border-warn-200 bg-warn-50 px-3 py-2.5 text-[12px] text-warn-700">
        <div className="font-semibold">Débitos y créditos no coinciden (partida doble).</div>
        <div className="mt-1">Débitos {fmt(c.sumaDebitos)} vs créditos {fmt(c.sumaCreditos)} · diferencia <span className="font-semibold">{fmt(c.diferenciaPartidaDoble)}</span>. Deben ser exactamente iguales.</div>
        {c.detectado && c.cuadra && <div className="mt-1 text-warn-600">Cada columna sí coincide con la fila TOTALES del archivo, pero entre sí no cuadran: revisa el archivo origen.</div>}
        <div className="mt-1">Puedes cargarlo igual: quedará <span className="font-semibold">marcado como descuadrado</span> (novedad) para revisión.</div>
      </div>
    );
  }
  // 2) Partida doble OK pero sin fila TOTALES en el archivo.
  if (!c.detectado) {
    return (
      <div className="rounded-md border border-ok-100 bg-ok-100/40 px-3 py-2 text-[12px] text-ok-700">
        <span className="font-semibold">Cuadre por partida doble: OK.</span> Débitos {fmt(c.sumaDebitos)} y créditos {fmt(c.sumaCreditos)} son iguales. (El archivo no trae fila TOTALES.)
      </div>
    );
  }
  // 3) Partida doble OK y coincide con la fila TOTALES.
  if (c.cuadra) {
    return (
      <div className="rounded-md border border-ok-100 bg-ok-100/40 px-3 py-2 text-[12px] text-ok-700">
        <span className="font-semibold">Cuadre: OK.</span> Débitos {fmt(c.sumaDebitos)} y créditos {fmt(c.sumaCreditos)} coinciden entre sí y con la fila TOTALES del archivo.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-err-200 bg-err-50 px-3 py-2.5 text-[12px] text-err-700">
      <div className="font-semibold">No cuadra contra la fila TOTALES del archivo.</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        <li>Débitos: hojas {fmt(c.sumaDebitos)} vs TOTALES {fmt(c.totalDebitos)} (Δ {fmt(c.diferenciaDebitos)})</li>
        <li>Créditos: hojas {fmt(c.sumaCreditos)} vs TOTALES {fmt(c.totalCreditos)} (Δ {fmt(c.diferenciaCreditos)})</li>
      </ul>
      <div className="mt-1">Puedes cargarlo igual: quedará <span className="font-semibold">marcado como descuadrado</span> (novedad) para revisión, o revisa la jerarquía de cuentas (padres/auxiliares) y vuelve a leer el archivo.</div>
    </div>
  );
}

/**
 * Borrador del paso 1: valida en el encabezado si CRUZAN las cuentas de Activo,
 * Pasivo y Patrimonio —tanto la ecuación contable (A = P + Patrimonio + Resultado)
 * como la consistencia archivo vs detalle (delata cuentas omitidas)— y muestra
 * TODO el movimiento en una tabla scrollable. Nada se ha cargado todavía.
 */
function BorradorBalance({ sug }: { sug: SugerenciaBalance }) {
  const v = sug.validacion;
  if (!v) return null;
  const ecOk = v.ecuacionCuadra;
  return (
    <div className="flex flex-col gap-2.5">
      {/* Validación 1 — ecuación contable */}
      <div className={`rounded-md border px-3 py-2 text-[12px] ${ecOk ? "border-ok-100 bg-ok-100/40 text-ok-700" : "border-warn-200 bg-warn-50 text-warn-700"}`}>
        <span className="font-semibold">{ecOk ? "Cuadra:" : "No cuadra:"}</span> Activo = Pasivo + Patrimonio + Resultado · diferencia <span className="font-semibold">{fmt(v.ecuacionDiff)}</span>
        {!ecOk && <span> (fuera del margen ±{fmt(1000)}; se puede cargar igual, quedará marcado descuadrado)</span>}
      </div>

      {/* Validación 2 — A/P/Patrimonio: calculado vs archivo */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <ClaseCard label="Activo" calc={v.activo} archivo={v.activoArchivo} cuadra={v.activoCuadra} diff={v.activoDiff} />
        <ClaseCard label="Pasivo" calc={v.pasivo} archivo={v.pasivoArchivo} cuadra={v.pasivoCuadra} diff={v.pasivoDiff} />
        <ClaseCard label="Patrimonio" calc={v.patrimonio} archivo={v.patrimonioArchivo} cuadra={v.patrimonioCuadra} diff={v.patrimonioDiff} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniDato k="Ingresos" v={v.ingresos} />
        <MiniDato k="Gastos" v={v.gastos} />
        <MiniDato k="Costos" v={v.costos} />
        <MiniDato k="Resultado" v={v.resultado} />
      </div>

      {/* Movimiento completo en borrador */}
      <DetalleMovimiento cuentas={sug.importReady} />
    </div>
  );
}

function ClaseCard({ label, calc, archivo, cuadra, diff }: { label: string; calc: number; archivo: number | null; cuadra: boolean | null; diff: number | null }) {
  const tono =
    cuadra == null ? "border-ink-150 bg-ink-50" : cuadra ? "border-ok-100 bg-ok-100/40" : "border-err-200 bg-err-50";
  return (
    <div className={`rounded-md border px-3 py-2 ${tono}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold text-ink-800">{fmt(calc)}</div>
      {archivo == null ? (
        <div className="mt-0.5 text-[10.5px] text-ink-400">solo calculado (sin total en archivo)</div>
      ) : cuadra ? (
        <div className="mt-0.5 text-[10.5px] text-ok-700">✓ archivo {fmt(archivo)} — cruza</div>
      ) : (
        <div className="mt-0.5 text-[10.5px] text-err-700">archivo {fmt(archivo)} · Δ {fmt(diff ?? 0)}</div>
      )}
    </div>
  );
}

function MiniDato({ k, v }: { k: string; v: number }) {
  return (
    <div className="rounded-md border border-ink-150 bg-ink-50 px-2.5 py-1.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">{k}</div>
      <div className="mt-0.5 text-[12px] font-semibold text-ink-700">{fmt(v)}</div>
    </div>
  );
}

/** Tabla scrollable con TODAS las cuentas de movimiento del borrador. */
function DetalleMovimiento({ cuentas }: { cuentas: SugerenciaBalance["importReady"] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Movimiento en borrador · {cuentas.length} cuenta(s)</div>
      <div className="max-h-72 overflow-auto rounded-md border border-ink-150">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-ink-50 text-ink-500">
            <tr className="text-left">
              <th className="px-2 py-1.5 font-semibold">Código</th>
              <th className="px-2 py-1.5 font-semibold">Cuenta</th>
              <th className="px-2 py-1.5 text-right font-semibold">Saldo ant.</th>
              <th className="px-2 py-1.5 text-right font-semibold">Débito</th>
              <th className="px-2 py-1.5 text-right font-semibold">Crédito</th>
              <th className="px-2 py-1.5 text-right font-semibold">Saldo act.</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((c, i) => (
              <tr key={`${c.code}-${i}`} className="border-t border-ink-100">
                <td className="whitespace-nowrap px-2 py-1 font-mono text-ink-500">{c.code}</td>
                <td className="max-w-[220px] truncate px-2 py-1 text-ink-700" title={c.name}>{c.name}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-ink-600">{fmt(c.prevBalance)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-ink-600">{fmt(c.debitos ?? 0)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-ink-600">{fmt(c.creditos ?? 0)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right font-medium tabular-nums text-ink-800">{fmt(c.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Auditoría rápida pre-carga (no bloqueante): posibles omisiones (cuentas del
 * último balance del cliente que no vienen) + cuentas que se cargarán sin mapeo.
 */
function AuditPanel({ audit, auditando }: { audit: AuditoriaCarga | null; auditando: boolean }) {
  if (auditando) return <p className="text-[11.5px] text-ink-500">Auditando contra el último balance del cliente…</p>;
  if (!audit?.ok) return null;
  return (
    <div className="flex flex-col gap-2">
      {audit.omisiones.length > 0 ? (
        <div className="rounded-md border border-warn-200 bg-warn-50 px-3 py-2 text-[12px] text-warn-700">
          <div className="font-semibold">⚠ {audit.omisiones.length} posible(s) omisión(es): cuentas del último balance del cliente que NO vienen en este archivo.</div>
          <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4 font-mono text-[11px]">
            {audit.omisiones.slice(0, 60).map((o) => <li key={o.code}><span className="font-semibold">{o.code}</span> {o.name}</li>)}
            {audit.omisiones.length > 60 && <li className="list-none text-warn-600">… y {audit.omisiones.length - 60} más</li>}
          </ul>
        </div>
      ) : audit.hayPrevio ? (
        <div className="rounded-md border border-ok-100 bg-ok-100/40 px-3 py-1.5 text-[12px] text-ok-700">✓ No faltan cuentas respecto al último balance del cliente.</div>
      ) : (
        <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-1.5 text-[11.5px] text-ink-500">Primer balance de este cliente: no hay con qué comparar omisiones.</div>
      )}
      {audit.sinMapeo.length > 0 && (
        <div className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[12px] text-ink-600">
          <div className="font-semibold">{audit.sinMapeo.length} cuenta(s) se cargarán SIN mapeo al estándar (revisa códigos de 4 díg o con sufijos).</div>
          <ul className="mt-1 max-h-24 list-disc space-y-0.5 overflow-y-auto pl-4 font-mono text-[11px]">
            {audit.sinMapeo.slice(0, 40).map((o) => <li key={o.code}><span className="font-semibold">{o.code}</span> {o.name}</li>)}
            {audit.sinMapeo.length > 40 && <li className="list-none text-ink-500">… y {audit.sinMapeo.length - 40} más</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function SugerenciaResumen({ sug }: { sug: SugerenciaBalance }) {
  return (
    <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2.5">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Lo que detecté en el archivo</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-ink-600 sm:grid-cols-3">
        <Linea k="NIT" v={`${sug.nitDetectado ?? "—"} (${sug.nitFuente.toLowerCase()})`} />
        <Linea k="Período" v={`${sug.periodoInicial ?? "?"} → ${sug.periodoFinal ?? "?"}`} />
        <Linea k="Movimiento (hojas)" v={String(sug.cuentasMovimiento)} />
        <Linea k="Agrupadoras" v={String(sug.cuentasAgrupadoras)} />
        <Linea k="Importables" v={String(sug.cuentas)} />
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
            <Linea k="Movimiento (hojas)" v={String(aud.cuentasMovimiento)} />
            <Linea k="Agrupadoras" v={String(aud.cuentasAgrupadoras)} />
            <Linea k="Importables" v={String(aud.filasImportables)} />
            <Linea k="Excluidas" v={String(aud.filasExcluidas)} />
            <Linea k="Descuadres" v={String(aud.filasDescuadre)} />
            <Linea k="NIT" v={`${aud.nit.valor ?? "—"} (${aud.nit.fuente.toLowerCase()})`} />
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

/** Selector de hoja (Excel multi-hoja): pestañas + vista previa de la elegida. */
function SelectorHojas({
  hojas,
  elegida,
  onElegir,
}: {
  hojas: HojaPreview[];
  elegida: string | null;
  onElegir: (nombre: string) => void;
}) {
  const activa = hojas.find((h) => h.nombre === elegida) ?? null;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-warn-100 bg-warn-100/30 px-3 py-2.5">
      <p className="text-[12px] leading-relaxed text-warn-700">
        Este archivo tiene <span className="font-semibold">{hojas.length} hojas</span>. Selecciona cuál es el balance
        que quieres cargar — <span className="font-semibold">la IA no elegirá por ti</span>.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {hojas.map((h) => {
          const on = h.nombre === elegida;
          return (
            <button
              key={h.nombre}
              type="button"
              onClick={() => onElegir(h.nombre)}
              className={`rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition ${
                on ? "border-navy-700 bg-navy-700 text-white" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
              }`}
            >
              {h.nombre} <span className={on ? "text-white/70" : "text-ink-400"}>· {h.totalFilas} fila(s)</span>
            </button>
          );
        })}
      </div>
      {activa ? (
        <PreviewHoja hoja={activa} />
      ) : (
        <p className="rounded-md border border-dashed border-ink-200 bg-white px-3 py-4 text-center text-[11.5px] text-ink-400">
          Elige una hoja para ver su contenido y poder cargarla.
        </p>
      )}
    </div>
  );
}

/** Mini-tabla tipo Excel: primeras filas × columnas (A, B, C…) de la hoja. */
function PreviewHoja({ hoja }: { hoja: HojaPreview }) {
  const numCols = Math.min(8, Math.max(1, hoja.totalColumnas));
  const cols = Array.from({ length: numCols }, (_, j) => j);
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">Vista previa de «{hoja.nombre}»</div>
      <div className="max-h-56 overflow-auto rounded-md border border-ink-150 bg-white">
        <table className="border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-ink-50 text-ink-400">
            <tr>
              <th className="border-b border-r border-ink-100 px-2 py-1 text-right font-semibold">#</th>
              {cols.map((j) => (
                <th key={j} className="border-b border-ink-100 px-2 py-1 text-left font-semibold">{columnaLetra(j)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hoja.muestra.map((fila, i) => (
              <tr key={i} className="even:bg-ink-50/40">
                <td className="border-r border-ink-100 px-2 py-1 text-right font-mono text-ink-400">{i + 1}</td>
                {cols.map((j) => (
                  <td key={j} className="whitespace-nowrap px-2 py-1 text-ink-700">{celdaTexto(fila[j] ?? null)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[10.5px] text-ink-400">
        Mostrando {hoja.muestra.length} de {hoja.totalFilas} fila(s)
        {hoja.totalColumnas > numCols && ` · ${hoja.totalColumnas} columnas en total`}
      </div>
    </div>
  );
}

function celdaTexto(c: CeldaCruda): string {
  if (c == null || c === "") return "";
  const s = String(c).replace(/\s+/g, " ").trim();
  return s.length > 28 ? `${s.slice(0, 28)}…` : s;
}

function recortar(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
