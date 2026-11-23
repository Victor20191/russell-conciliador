"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { EstadoProcesando } from "@/components/estado-procesando";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { fmt, fmtNum } from "@/lib/format";
import { cargarArchivoBalanceTemporal, cancelarArchivoBalanceTemporal } from "@/lib/balance/carga-archivo-cliente";
import {
  adjuntarMovimientosTercero,
  exportarDescuadreMovimientos,
  previsualizarMovimientosTercero,
  quitarMovimientosTercero,
  type AdjuntarMovimientosState,
} from "@/app/actions/balance-movimientos-tercero";
import type { MapeoMovimientos } from "@/lib/balance/movimientos-tercero";
import type { VistaPreviaMovimientos } from "@/lib/balance/movimientos-tercero-servidor";

/** Fechas del balance ya legibles («01/01/2026»). */
export type PeriodoBalanceVm = { desde: string; hasta: string };

export type CapturaMovimientosVm = {
  archivo: string;
  cargadoPor: string;
  cargadoEn: string;
  renglones: number;
};

type Paso =
  | { tipo: "inicio" }
  | { tipo: "subiendo"; porcentaje: number }
  | { tipo: "mapeo"; loteId: string; vista: VistaPreviaMovimientos; mapeo: MapeoMovimientos }
  | { tipo: "leyendo"; loteId: string; vista: VistaPreviaMovimientos; mapeo: MapeoMovimientos }
  | { tipo: "rechazo"; loteId: string; vista: VistaPreviaMovimientos; mapeo: MapeoMovimientos; resultado: AdjuntarMovimientosState };

const BOTON = "inline-flex items-center gap-1.5 rounded-md border border-navy-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-navy-800 transition hover:border-navy-600 disabled:opacity-60";
const BOTON_PRIMARIO = "inline-flex items-center gap-1.5 rounded-md bg-navy-800 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60";

/**
 * Archivo de movimientos por tercero del ERP para un cliente SIN balance por terceros: se adjunta al
 * balance y los impuestos cruzan con él (Retención, IVA y RST).
 */
export function MovimientosTerceroPanel({
  balanceId,
  periodo,
  baseAmarre,
  captura,
  puedeEditar,
  motivoNoAdmite,
  bloqueoCierre,
  diferencias,
}: {
  balanceId: number;
  /** Período del archivo: del 1 de enero a la fecha de corte del balance; se confirma antes de leerlo. */
  periodo: PeriodoBalanceVm;
  /** Regla 2: «el balance de cierre de diciembre …» cuando el balance no empieza en enero; null = su saldo inicial. */
  baseAmarre: string | null;
  captura: CapturaMovimientosVm | null;
  puedeEditar: boolean;
  /** Por qué este balance no admite el archivo (no empieza en enero, cargue antiguo…); null = lo admite. */
  motivoNoAdmite: string | null;
  /** Conciliación en firme contra este balance: no se reemplaza ni se quita. */
  bloqueoCierre: string | null;
  /** Diferencias del amarre de los terceros ya guardados (recalculadas al abrir la página); null = ninguna. */
  diferencias: AdjuntarMovimientosState | null;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [paso, setPaso] = useState<Paso>({ tipo: "inicio" });
  const [confirmaPeriodo, setConfirmaPeriodo] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [guardadoConDiferencias, setGuardadoConDiferencias] = useState<AdjuntarMovimientosState | null>(null);
  const [quitarAbierto, setQuitarAbierto] = useState(false);
  const [quitando, startQuitar] = useTransition();

  const cancelar = (loteId?: string) => {
    if (loteId) void cancelarArchivoBalanceTemporal(loteId);
    setPaso({ tipo: "inicio" });
  };

  const alElegir = async (archivo: File | undefined) => {
    if (entrada.current) entrada.current.value = "";
    if (!archivo) return;
    if (!/\.xlsx$/i.test(archivo.name)) {
      notifyError("Formato no admitido", "El archivo de movimientos debe ser un Excel .xlsx.");
      return;
    }
    const loteId = crypto.randomUUID();
    // Cada archivo nuevo se vuelve a confirmar.
    setConfirmaPeriodo(false);
    setNombreArchivo(archivo.name);
    setPaso({ tipo: "subiendo", porcentaje: 0 });
    try {
      await cargarArchivoBalanceTemporal(archivo, loteId, (porcentaje) => setPaso({ tipo: "subiendo", porcentaje }));
      const r = await previsualizarMovimientosTercero({ balanceId, archivoLoteId: loteId });
      if (!r.ok || !r.vista) {
        notifyError("No se pudo leer el archivo", r.message);
        cancelar(loteId);
        return;
      }
      setPaso({ tipo: "mapeo", loteId, vista: r.vista, mapeo: r.vista.sugerencia });
    } catch (e) {
      notifyError("No se pudo subir el archivo", e instanceof Error ? e.message : undefined);
      cancelar(loteId);
    }
  };

  const leer = async () => {
    if (paso.tipo !== "mapeo" && paso.tipo !== "rechazo") return;
    const { loteId, vista, mapeo } = paso;
    setPaso({ tipo: "leyendo", loteId, vista, mapeo });
    const r = await adjuntarMovimientosTercero({ balanceId, archivoLoteId: loteId, mapeo, confirmaPeriodo });
    if (r.ok) {
      notifySuccess("Terceros agregados", r.message);
      // Con diferencias informativas (fuera de impuestos) la tabla se queda a la vista para exportarla.
      setGuardadoConDiferencias(r.descuadres?.length || r.sinCuentaEnBalance?.length ? r : null);
      setPaso({ tipo: "inicio" });
      router.refresh();
      return;
    }
    setGuardadoConDiferencias(null);
    if (r.descuadres?.length || r.sinCuentaEnBalance?.length || r.montosIlegibles?.length) {
      setPaso({ tipo: "rechazo", loteId, vista, mapeo, resultado: r });
    } else {
      notifyError("No se agregaron los terceros", r.message);
      setPaso({ tipo: "mapeo", loteId, vista, mapeo });
    }
  };

  const quitar = () => startQuitar(async () => {
    const r = await quitarMovimientosTercero({ balanceId });
    if (r.ok) {
      notifySuccess("Terceros agregados quitados", r.message);
      setQuitarAbierto(false);
      router.refresh();
    } else {
      notifyError("No se quitaron los terceros agregados", r.message);
    }
  });

  const enFlujo = paso.tipo === "mapeo" || paso.tipo === "leyendo" || paso.tipo === "rechazo";

  return (
    <section className="mb-4 rounded-lg border border-warn-200 bg-warn-50 px-4 py-3" aria-label="Terceros agregados para impuestos">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-warn-700">Cliente con excepción de balance por terceros</p>
          <p className="mt-0.5 text-[13.5px] font-semibold text-ink-800">
            {captura ? "Balance por cuenta con terceros agregados · para impuestos" : "Terceros agregados para impuestos"}
          </p>
          <p className="mt-0.5 max-w-3xl text-[12.5px] text-ink-700">
            Este cliente no entrega balance por terceros. Para cruzar los <b>impuestos</b> (Retención en la fuente, IVA y RST) se agregan los terceros desde el reporte del ERP con los movimientos de enero a la fecha de corte por cuenta y tercero.
            Se guardan los grupos 13, 21, 22, 23, 24 y 28, y el movimiento de cada cuenta debe amarrar con el balance. Cartera y Cuentas por pagar no los usan: se concilian por cuenta.
          </p>
          <p className="mt-1 text-[12.5px] text-ink-800">
            El archivo debe traer los movimientos del <b>{periodo.desde}</b> al <b>{periodo.hasta}</b> (de enero a la fecha de corte de este balance).
            {" "}Se amarra contra {baseAmarre ? <>la diferencia entre el saldo final de este balance y <b>{baseAmarre}</b>, porque este balance no empieza el 1 de enero</> : "el saldo inicial de este balance, que empieza el 1 de enero"}.
          </p>
          {/* Lo que debe traer el archivo, a la vista antes de adjuntarlo. */}
          <div className="mt-1.5 text-[12.5px] text-ink-800">
            <p className="font-semibold">El archivo (Excel .xlsx) debe traer estas columnas:</p>
            <ul className="mt-0.5 list-disc pl-5">
              <li><b>Cuenta</b> contable</li>
              <li><b>Débito</b> y <b>Crédito</b> en columnas aparte, o un solo <b>importe o movimiento</b> con signo (positivo = débito)</li>
              <li><b>NIT</b> del tercero</li>
              <li><b>Nombre</b> del tercero (cliente o proveedor)</li>
            </ul>
            <p className="mt-0.5 text-[11.5px] text-ink-600">Una fila por documento o movimiento; los títulos de las columnas van en una sola fila. Al adjuntarlo se escoge cuál columna es cada una.</p>
          </div>
          {captura ? (
            <p className="mt-1.5 inline-flex flex-wrap items-center gap-x-2 text-[12px] text-ink-700">
              <Icon name="file-check" size={14} />
              <span className="font-semibold">{captura.archivo}</span>
              <span>· {fmtNum(captura.renglones)} renglones cuenta–tercero · {captura.cargadoPor} · {captura.cargadoEn}</span>
            </p>
          ) : (
            <p className="mt-1.5 text-[12px] font-medium text-warn-700">Sin terceros agregados: los impuestos de este corte no pueden cruzar.</p>
          )}
          {motivoNoAdmite && <p className="mt-1 text-[12px] text-err-700">{motivoNoAdmite}</p>}
          {bloqueoCierre && captura && <p className="mt-1 text-[12px] text-ink-500">{bloqueoCierre}</p>}
        </div>
        {puedeEditar && !motivoNoAdmite && !enFlujo && (
          <div className="flex shrink-0 gap-2">
            <input ref={entrada} type="file" accept=".xlsx" className="hidden" onChange={(e) => void alElegir(e.target.files?.[0])} />
            {paso.tipo === "subiendo" ? (
              <span className="text-[12.5px] text-ink-600"><EstadoProcesando>{`Subiendo ${paso.porcentaje} %`}</EstadoProcesando></span>
            ) : (!captura || !bloqueoCierre) && (
              <>
                <button type="button" className={BOTON_PRIMARIO} onClick={() => entrada.current?.click()}>
                  <Icon name="upload" size={14} /> {captura ? "Reemplazar terceros" : "Adjuntar terceros"}
                </button>
                {captura && (
                  <button type="button" className={BOTON} onClick={() => setQuitarAbierto(true)}>
                    <Icon name="trash" size={14} /> Quitar
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {enFlujo && (
        <MapeoMovimientosForm
          vista={paso.vista}
          mapeo={paso.mapeo}
          leyendo={paso.tipo === "leyendo"}
          periodo={periodo}
          confirmaPeriodo={confirmaPeriodo}
          onConfirmarPeriodo={setConfirmaPeriodo}
          onCambiar={(mapeo) => setPaso({ ...paso, tipo: paso.tipo === "leyendo" ? "leyendo" : "mapeo", mapeo } as Paso)}
          onLeer={() => void leer()}
          onCancelar={() => cancelar(paso.loteId)}
        />
      )}
      {paso.tipo === "rechazo" && <RechazoAmarre resultado={paso.resultado} balanceId={balanceId} archivo={nombreArchivo} baseAmarre={baseAmarre} />}
      {paso.tipo === "inicio" && (guardadoConDiferencias ?? diferencias) && (
        <RechazoAmarre resultado={(guardadoConDiferencias ?? diferencias)!} balanceId={balanceId} archivo={nombreArchivo || captura?.archivo || ""} baseAmarre={baseAmarre} />
      )}

      <Modal
        open={quitarAbierto}
        onClose={() => setQuitarAbierto(false)}
        title="Quitar los terceros agregados"
        footer={
          <button type="button" onClick={quitar} disabled={quitando} className="inline-flex items-center gap-1.5 rounded-md bg-err-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-err-400 disabled:opacity-60">
            {quitando ? <EstadoProcesando>Quitando</EstadoProcesando> : <><Icon name="trash" size={14} /> Quitar</>}
          </button>
        }
      >
        <p className="text-[13px] text-ink-700">
          Los impuestos de este corte quedarán sin terceros para el cruce hasta que adjuntes otro archivo; el balance por cuenta no cambia.
        </p>
      </Modal>
    </section>
  );
}

const ROLES: { clave: "cuenta" | "nit" | "nombre"; etiqueta: string; opcional?: boolean }[] = [
  { clave: "cuenta", etiqueta: "Cuenta" },
  { clave: "nit", etiqueta: "NIT del tercero" },
  { clave: "nombre", etiqueta: "Nombre del tercero", opcional: true },
];

function SelectorColumna({ etiqueta, valor, encabezados, opcional, onChange }: {
  etiqueta: string; valor: number; encabezados: string[]; opcional?: boolean; onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-700">
      {etiqueta}{opcional ? " (opcional)" : ""}
      <select
        aria-label={etiqueta}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12.5px] text-ink-800"
      >
        <option value={0}>{opcional ? "— Sin columna —" : "— Escoge la columna —"}</option>
        {encabezados.map((e, i) => (
          <option key={i} value={i + 1}>{e || `Columna ${i + 1}`}</option>
        ))}
      </select>
    </label>
  );
}

function MapeoMovimientosForm({ vista, mapeo, leyendo, periodo, confirmaPeriodo, onConfirmarPeriodo, onCambiar, onLeer, onCancelar }: {
  vista: VistaPreviaMovimientos;
  mapeo: MapeoMovimientos;
  leyendo: boolean;
  periodo: PeriodoBalanceVm;
  confirmaPeriodo: boolean;
  onConfirmarPeriodo: (v: boolean) => void;
  onCambiar: (m: MapeoMovimientos) => void;
  onLeer: () => void;
  onCancelar: () => void;
}) {
  const completo = mapeo.cuenta > 0 && mapeo.nit > 0 && (mapeo.modo === "importe" ? mapeo.importe > 0 : mapeo.debito > 0 && mapeo.credito > 0);
  const columnasMuestra = [mapeo.cuenta, mapeo.nit, mapeo.nombre, ...(mapeo.modo === "importe" ? [mapeo.importe] : [mapeo.debito, mapeo.credito])].filter((c) => c > 0);
  return (
    <div className="mt-3 rounded-md border border-ink-150 bg-white px-4 py-3">
      <p className="text-[12.5px] font-semibold text-ink-800">Columnas del archivo · hoja «{vista.hoja}», encabezados en la fila {vista.filaEncabezado}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {ROLES.map((r) => (
          <SelectorColumna key={r.clave} etiqueta={r.etiqueta} opcional={r.opcional} valor={mapeo[r.clave]} encabezados={vista.encabezados} onChange={(v) => onCambiar({ ...mapeo, [r.clave]: v })} />
        ))}
      </div>
      <fieldset className="mt-3">
        <legend className="text-[12px] font-medium text-ink-700">Valores</legend>
        <div className="mt-1 flex flex-wrap gap-4 text-[12.5px] text-ink-800">
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" checked={mapeo.modo === "debito_credito"} onChange={() => onCambiar({ ...mapeo, modo: "debito_credito" })} /> Débito y crédito en columnas aparte
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" checked={mapeo.modo === "importe"} onChange={() => onCambiar({ ...mapeo, modo: "importe" })} /> Un importe con signo (positivo = débito)
          </label>
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {mapeo.modo === "importe" ? (
            <SelectorColumna etiqueta="Importe" valor={mapeo.importe} encabezados={vista.encabezados} onChange={(v) => onCambiar({ ...mapeo, importe: v })} />
          ) : (
            <>
              <SelectorColumna etiqueta="Débito" valor={mapeo.debito} encabezados={vista.encabezados} onChange={(v) => onCambiar({ ...mapeo, debito: v })} />
              <SelectorColumna etiqueta="Crédito" valor={mapeo.credito} encabezados={vista.encabezados} onChange={(v) => onCambiar({ ...mapeo, credito: v })} />
            </>
          )}
        </div>
      </fieldset>

      {columnasMuestra.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-[11.5px]">
            <thead>
              <tr className="border-b border-ink-150 text-left text-ink-500">
                {columnasMuestra.map((c) => <th key={c} className="px-2 py-1 font-semibold">{vista.encabezados[c - 1] || `Columna ${c}`}</th>)}
              </tr>
            </thead>
            <tbody>
              {vista.muestra.map((fila, i) => (
                <tr key={i} className="border-b border-ink-100 text-ink-700">
                  {columnasMuestra.map((c) => <td key={c} className="px-2 py-1 tabular-nums">{fila[c - 1] ?? ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* El archivo tiene que ser del mismo período del balance: se confirma antes de leerlo. */}
      <label className="mt-3 flex items-start gap-2 rounded-md border border-warn-200 bg-warn-50 px-3 py-2 text-[12.5px] text-ink-800">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0"
          checked={confirmaPeriodo}
          disabled={leyendo}
          onChange={(e) => onConfirmarPeriodo(e.target.checked)}
        />
        <span>
          Confirmo que el archivo trae los movimientos del <b>{periodo.desde}</b> al <b>{periodo.hasta}</b>, de enero a la fecha de corte de este balance.
        </span>
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={BOTON_PRIMARIO} disabled={!completo || !confirmaPeriodo || leyendo} onClick={onLeer}>
          {leyendo ? <EstadoProcesando>Leyendo y amarrando con el balance</EstadoProcesando> : <><Icon name="check" size={14} /> Leer y amarrar con el balance</>}
        </button>
        {!leyendo && <button type="button" className={BOTON} onClick={onCancelar}>Cancelar</button>}
        {leyendo && <span className="text-[11.5px] text-ink-500">Un archivo de 400 mil filas tarda cerca de un minuto.</span>}
      </div>
    </div>
  );
}

function RechazoAmarre({ resultado, balanceId, archivo, baseAmarre }: { resultado: AdjuntarMovimientosState; balanceId: number; archivo: string; baseAmarre: string | null }) {
  const [exportando, startExportar] = useTransition();
  const hayTabla = Boolean(resultado.descuadres?.length || resultado.sinCuentaEnBalance?.length);
  const exportar = () => startExportar(async () => {
    const r = await exportarDescuadreMovimientos({
      balanceId, archivo, descuadres: resultado.descuadres ?? [], sinCuentaEnBalance: resultado.sinCuentaEnBalance ?? [], base: resultado.base,
    });
    if (!r.ok || !r.base64 || !r.nombre) {
      notifyError("No se pudo exportar", r.message);
      return;
    }
    const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = r.nombre;
    enlace.click();
    URL.revokeObjectURL(url);
  });
  return (
    <div role={resultado.ok ? "status" : "alert"} className={`mt-3 rounded-md border px-4 py-3 ${resultado.ok ? "border-warn-200 bg-white" : "border-err-200 bg-err-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${resultado.ok ? "text-warn-700" : "text-err-700"}`}><Icon name={resultado.ok ? "info" : "warn"} size={14} /> {resultado.message}</p>
        {hayTabla && (
          <button type="button" className={BOTON} disabled={exportando} onClick={exportar}>
            {exportando ? <EstadoProcesando>Exportando</EstadoProcesando> : <><Icon name="download" size={14} /> Exportar a Excel</>}
          </button>
        )}
      </div>
      {resultado.montosIlegibles?.length ? (
        <p className="mt-1 text-[12px] text-ink-700">Filas del archivo con importes ilegibles: {resultado.montosIlegibles.join(", ")}.</p>
      ) : null}
      {resultado.descuadres?.length ? (
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-[11.5px]">
            <thead>
              <tr className="border-b border-err-200 text-left text-ink-600">
                <th className="px-2 py-1">Cuenta</th>
                <th className="px-2 py-1">¿Impide guardar?</th>
                <th className="px-2 py-1 text-right">Movimiento del balance</th>
                <th className="px-2 py-1 text-right">Movimiento del archivo</th>
                <th className="px-2 py-1 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {resultado.descuadres.map((d) => (
                <tr key={d.cuenta8} className="border-b border-err-100 text-ink-800">
                  <td className="px-2 py-1">{d.cuenta8} · {d.nombreCuenta}</td>
                  <td className={`px-2 py-1 ${d.bloquea ? "font-semibold text-err-700" : "text-ink-500"}`}>{d.bloquea ? "Sí, cuenta de impuestos" : "No, informativa"}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(d.movimientoBalance)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(d.movimientoArchivo)}</td>
                  <td className="px-2 py-1 text-right font-semibold tabular-nums">{fmt(d.diferencia)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11.5px] text-ink-500">Movimiento = débitos − créditos de enero al corte. En el balance: saldo final − {baseAmarre ? <>saldo final de {baseAmarre}</> : "saldo inicial"}.</p>
        </div>
      ) : null}
      {resultado.sinCuentaEnBalance?.length ? (
        <p className="mt-2 text-[12px] text-ink-700">
          Cuentas del archivo que no están en el balance: {resultado.sinCuentaEnBalance.map((s) => `${s.cuenta} (${fmt(s.movimiento)}${s.bloquea ? ", de impuestos" : ""})`).join(", ")}.
        </p>
      ) : null}
      <p className="mt-2 text-[12px] text-ink-700">
        {resultado.ok
          ? "Solo impiden guardar las cuentas que usa el cruce de impuestos (2365, 2367, 2408, 135517, 135595 y 249505); estas diferencias son de otras cuentas y quedan como información."
          : "No se guardó nada: no amarra al menos una cuenta que usa el cruce de impuestos. Corrige el mapeo y vuelve a leer, o pide al cliente el reporte completo del período. Las diferencias marcadas «No, informativa» no impiden guardar."}
      </p>
    </div>
  );
}
