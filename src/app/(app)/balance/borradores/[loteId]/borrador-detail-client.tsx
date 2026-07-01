"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Chip } from "@/components/ui";
import { fmt } from "@/lib/format";
import { cargarBorrador, descartarBorrador } from "@/app/actions/balance";
import type { ImportBalanceState } from "@/lib/import/balance";
import type { NodoBorrador } from "@/lib/balance/borrador";
import type { ValidacionContable } from "@/lib/balance/calcular";
import { notifyActionState, notifySuccess, notifyError } from "@/lib/client-notifications";

type Cliente = { id: number; name: string; nit: string };
type PartidaDoble = { debitos: number; creditos: number; diff: number; cuadra: boolean };

export default function BorradorDetailClient({
  loteId, nitDetectado, periodoInicial, periodoFinal, arbol, validacion, partidaDoble, clientes, clienteSugeridoId,
}: {
  loteId: string;
  archivoNombre: string;
  nitDetectado: string | null;
  periodoInicial: string | null;
  periodoFinal: string | null;
  arbol: NodoBorrador[];
  validacion: ValidacionContable;
  partidaDoble: PartidaDoble;
  clientes: Cliente[];
  clienteSugeridoId: number | null;
}) {
  const router = useRouter();
  const [cargarState, cargarAction, cargando] = useActionState<ImportBalanceState, FormData>(cargarBorrador, {});
  const [descartando, startDescartar] = useTransition();
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);

  useEffect(() => {
    notifyActionState(cargarState, { success: "Balance cargado.", error: "No se pudo cargar el balance." });
    if (cargarState?.ok && cargarState.resumen) router.push(`/balance/${cargarState.resumen.id}`);
  }, [cargarState, router]);

  const onDescartar = () =>
    startDescartar(async () => {
      const r = await descartarBorrador(loteId);
      if (r.ok) { notifySuccess(r.message ?? "Borrador descartado."); router.push("/balance/borradores"); }
      else notifyError(r.message ?? "No se pudo descartar.");
    });

  return (
    <div className="flex flex-col gap-4">
      <ValidacionHeader v={validacion} pd={partidaDoble} />

      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 bg-ink-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Movimiento en borrador (crudo del Excel · sin homologación)</div>
          <div className="mt-1 text-[11px] leading-relaxed text-ink-500">
            <span className="font-semibold text-err-700">Δ subrayado</span> en una agrupadora = su total del archivo − la suma de las filas que cuelgan de ella (por prefijo de código). Si ≠ 0, su subtotal no cuadra con su desglose: puede ser una <span className="font-semibold">cuenta faltante</span>, o que el ERP numere el detalle sin anidar por código (el subtotal y su detalle no comparten prefijo — la plata está, pero en otra rama).
          </div>
        </div>
        <div className="max-h-[560px] overflow-auto">
          <ArbolTabla arbol={arbol} />
        </div>
      </Card>

      {/* Cargar / Descartar */}
      <Card className="p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Cargar como balance oficial</div>
        <form action={cargarAction} className="flex flex-col gap-3">
          <input type="hidden" name="loteId" value={loteId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5 sm:col-span-1">
              <span className="text-[11.5px] font-medium text-ink-600">Cliente</span>
              <select name="clientId" required defaultValue={clienteSugeridoId ? String(clienteSugeridoId) : ""} className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400">
                <option value="" disabled>Selecciona el cliente…</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.nit}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-ink-600">Período desde</span>
              <input type="date" name="periodoInicio" required defaultValue={periodoInicial ?? ""} className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-ink-600">Período hasta</span>
              <input type="date" name="periodoFin" required defaultValue={periodoFinal ?? ""} className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400" />
            </label>
          </div>
          {clienteSugeridoId == null && nitDetectado && (
            <span className="text-[11px] text-warn-700">NIT detectado <span className="font-mono">{nitDetectado}</span> sin cliente coincidente — selecciónalo.</span>
          )}
          {cargarState?.message && !cargarState.ok && <p className="text-[12px] font-medium text-err-700">{cargarState.message}</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={cargando} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
              {cargando ? "Cargando…" : "Cargar balance"}
            </button>
            {confirmarDescarte ? (
              <span className="inline-flex items-center gap-2">
                <button type="button" onClick={onDescartar} disabled={descartando} className="rounded-md bg-err-100 px-3 py-1.5 text-[12.5px] font-semibold text-err-700 hover:bg-err-200 disabled:opacity-60">
                  {descartando ? "Descartando…" : "Confirmar descarte"}
                </button>
                <button type="button" onClick={() => setConfirmarDescarte(false)} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 hover:bg-ink-50">Cancelar</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmarDescarte(true)} className="rounded-md border border-err-200 px-3 py-1.5 text-[12.5px] font-semibold text-err-700 hover:bg-err-50">
                Descartar borrador
              </button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

// ---- Encabezado de validación (mismas tarjetas del borrador del modal) ----
function ValidacionHeader({ v, pd }: { v: ValidacionContable; pd: { debitos: number; creditos: number; diff: number; cuadra: boolean } }) {
  const ecOk = v.ecuacionCuadra;
  return (
    <div className="flex flex-col gap-2.5">
      <div className={`rounded-md border px-3 py-2 text-[12px] ${pd.cuadra ? "border-ok-100 bg-ok-100/40 text-ok-700" : "border-warn-200 bg-warn-50 text-warn-700"}`}>
        <span className="font-semibold">{pd.cuadra ? "Cuadra:" : "No coinciden:"}</span> partida doble · débitos <span className="font-semibold">{fmt(pd.debitos)}</span> vs créditos <span className="font-semibold">{fmt(pd.creditos)}</span> · diferencia <span className="font-semibold">{fmt(pd.diff)}</span>
      </div>
      <div className={`rounded-md border px-3 py-2 text-[12px] ${ecOk ? "border-ok-100 bg-ok-100/40 text-ok-700" : "border-warn-200 bg-warn-50 text-warn-700"}`}>
        <span className="font-semibold">{ecOk ? "Cuadra:" : "No cuadra:"}</span> Activo = Pasivo + Patrimonio + Resultado · diferencia <span className="font-semibold">{fmt(v.ecuacionDiff)}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <ClaseCard label="Activo" calc={v.activo} archivo={v.activoArchivo} cuadra={v.activoCuadra} diff={v.activoDiff} />
        <ClaseCard label="Pasivo" calc={v.pasivo} archivo={v.pasivoArchivo} cuadra={v.pasivoCuadra} diff={v.pasivoDiff} />
        <ClaseCard label="Patrimonio" calc={v.patrimonio} archivo={v.patrimonioArchivo} cuadra={v.patrimonioCuadra} diff={v.patrimonioDiff} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniDato k="Ingresos" v={v.ingresos} archivo={v.ingresosArchivo} cuadra={v.ingresosCuadra} diff={v.ingresosDiff} />
        <MiniDato k="Gastos" v={v.gastos} archivo={v.gastosArchivo} cuadra={v.gastosCuadra} diff={v.gastosDiff} />
        <MiniDato k="Costos" v={v.costos} archivo={v.costosArchivo} cuadra={v.costosCuadra} diff={v.costosDiff} />
        <MiniDato k="Resultado" v={v.resultado} archivo={v.resultadoArchivo} cuadra={v.resultadoCuadra} diff={v.resultadoDiff} />
      </div>
    </div>
  );
}

function ClaseCard({ label, calc, archivo, cuadra, diff }: { label: string; calc: number; archivo: number | null; cuadra: boolean | null; diff: number | null }) {
  const tono = cuadra == null ? "border-ink-150 bg-ink-50" : cuadra ? "border-ok-100 bg-ok-100/40" : "border-err-200 bg-err-50";
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

function MiniDato({ k, v, archivo, cuadra, diff }: { k: string; v: number; archivo: number | null; cuadra: boolean | null; diff: number | null }) {
  const tono = cuadra == null ? "border-ink-150 bg-ink-50" : cuadra ? "border-ok-100 bg-ok-100/40" : "border-err-200 bg-err-50";
  return (
    <div className={`rounded-md border px-2.5 py-1.5 ${tono}`}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">{k}</div>
      <div className="mt-0.5 text-[12px] font-semibold text-ink-700">{fmt(v)}</div>
      {archivo == null ? (
        <div className="mt-0.5 text-[10px] text-ink-400">solo calculado</div>
      ) : cuadra ? (
        <div className="mt-0.5 text-[10px] text-ok-700">✓ archivo {fmt(archivo)}</div>
      ) : (
        <div className="mt-0.5 text-[10px] text-err-700">archivo {fmt(archivo)} · Δ {fmt(diff ?? 0)}</div>
      )}
    </div>
  );
}

// ---- Árbol crudo (agrupadora / movimiento, descuadre subrayado) ----
const tieneDescuadre = (n: NodoBorrador): boolean => (n.descuadre != null && n.descuadre !== 0) || n.hijos.some(tieneDescuadre);
const nivelLabel = (codigo: string) => (codigo.length <= 2 ? "Clase" : codigo.length <= 4 ? "Grupo" : codigo.length <= 6 ? "Cuenta" : "Subcuenta");

function ArbolTabla({ arbol }: { arbol: NodoBorrador[] }) {
  // Expande por defecto los niveles altos y TODA rama con descuadre (para verlo).
  const expandidosInicial = useMemo(() => {
    const s = new Set<number>();
    const rec = (n: NodoBorrador) => {
      if ((n.codigo.length > 0 && n.codigo.length <= 2) || tieneDescuadre(n)) s.add(n.filaNum);
      n.hijos.forEach(rec);
    };
    arbol.forEach(rec);
    return s;
  }, [arbol]);
  const [abiertos, setAbiertos] = useState<Set<number>>(expandidosInicial);
  const toggle = (k: number) => setAbiertos((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const filas: React.ReactNode[] = [];
  const render = (n: NodoBorrador, depth: number) => {
    const hasHijos = n.hijos.length > 0;
    const open = abiertos.has(n.filaNum);
    const esMov = n.tipoFila === "movimiento";
    const descuadrado = n.descuadre != null && n.descuadre !== 0;
    filas.push(
      <tr key={n.filaNum} className={`border-t border-ink-100 ${esMov ? "hover:bg-ink-50/60" : "bg-ink-50/40"}`}>
        <td className="px-2 py-1 align-top">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: 4 + depth * 16 }}>
            {hasHijos ? (
              <button onClick={() => toggle(n.filaNum)} className="text-ink-400 hover:text-ink-700"><Icon name={open ? "chev-d" : "chev-r"} size={13} /></button>
            ) : (
              <span className="inline-block w-[13px]" />
            )}
            <span className="font-mono text-[11px] text-ink-500">{n.codigoCrudo || "—"}</span>
          </div>
        </td>
        <td className="px-2 py-1 align-top">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[12px] ${descuadrado ? "font-semibold text-err-700 underline decoration-err-500 decoration-2 underline-offset-2" : "text-ink-800"}`} title={n.nombre}>
              {n.nombre}
            </span>
            {n.subtotalDuplicado ? (
              <span title="Subtotal de 6 díg cuyo detalle de 8 díg (mismas 4 columnas) está mal-numerado. No se carga: su detalle ya lleva el valor.">
                <Chip label="Subtotal duplicado · no se carga" tone="warn" />
              </span>
            ) : n.tipoFila === "total" ? (
              <Chip label="Total" tone="ink" />
            ) : esMov ? (
              <Chip label="Movimiento" tone="blue" />
            ) : (
              <Chip label={`Agrupadora · ${nivelLabel(n.codigo)}`} tone="ink" />
            )}
            {descuadrado && (
              <span className="text-[10.5px] font-semibold text-err-700" title={`Total del archivo ${fmt(n.saldoFinal)} − suma de sus ${n.hijos.length} sub-filas = ${fmt(n.descuadre!)}. Su subtotal no cuadra con su desglose por código.`}>
                Δ {fmt(n.descuadre!)}
              </span>
            )}
          </div>
        </td>
        <td className="whitespace-nowrap px-2 py-1 text-right align-top tabular-nums text-ink-600">{fmt(n.saldoInicial)}</td>
        <td className="whitespace-nowrap px-2 py-1 text-right align-top tabular-nums text-ink-600">{fmt(n.debitos)}</td>
        <td className="whitespace-nowrap px-2 py-1 text-right align-top tabular-nums text-ink-600">{fmt(n.creditos)}</td>
        <td className="whitespace-nowrap px-2 py-1 text-right align-top font-medium tabular-nums text-ink-800">{fmt(n.saldoFinal)}</td>
      </tr>,
    );
    if (hasHijos && open) n.hijos.forEach((h) => render(h, depth + 1));
  };
  arbol.forEach((r) => render(r, 0));

  return (
    <table className="w-full text-[11px]">
      <thead className="sticky top-0 z-10 bg-ink-50 text-ink-500">
        <tr className="text-left">
          <th className="px-2 py-1.5 font-semibold">Código</th>
          <th className="px-2 py-1.5 font-semibold">Cuenta</th>
          <th className="px-2 py-1.5 text-right font-semibold">Saldo ant.</th>
          <th className="px-2 py-1.5 text-right font-semibold">Débito</th>
          <th className="px-2 py-1.5 text-right font-semibold">Crédito</th>
          <th className="px-2 py-1.5 text-right font-semibold">Saldo actual</th>
        </tr>
      </thead>
      <tbody>{filas}</tbody>
    </table>
  );
}
