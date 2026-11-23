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
  previsualizarMovimientosTercero,
  quitarMovimientosTercero,
  type AdjuntarMovimientosState,
} from "@/app/actions/balance-movimientos-tercero";
import type { MapeoMovimientos } from "@/lib/balance/movimientos-tercero";
import type { VistaPreviaMovimientos } from "@/lib/balance/movimientos-tercero-servidor";

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
  captura,
  puedeEditar,
  motivoNoAdmite,
  bloqueoCierre,
}: {
  balanceId: number;
  captura: CapturaMovimientosVm | null;
  puedeEditar: boolean;
  /** Por qué este balance no admite el archivo (no empieza en enero, cargue antiguo…); null = lo admite. */
  motivoNoAdmite: string | null;
  /** Conciliación en firme contra este balance: no se reemplaza ni se quita. */
  bloqueoCierre: string | null;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [paso, setPaso] = useState<Paso>({ tipo: "inicio" });
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
    const r = await adjuntarMovimientosTercero({ balanceId, archivoLoteId: loteId, mapeo });
    if (r.ok) {
      notifySuccess("Terceros agregados", r.message);
      setPaso({ tipo: "inicio" });
      router.refresh();
      return;
    }
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
          onCambiar={(mapeo) => setPaso({ ...paso, tipo: paso.tipo === "leyendo" ? "leyendo" : "mapeo", mapeo } as Paso)}
          onLeer={() => void leer()}
          onCancelar={() => cancelar(paso.loteId)}
        />
      )}
      {paso.tipo === "rechazo" && <RechazoAmarre resultado={paso.resultado} />}

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

function MapeoMovimientosForm({ vista, mapeo, leyendo, onCambiar, onLeer, onCancelar }: {
  vista: VistaPreviaMovimientos;
  mapeo: MapeoMovimientos;
  leyendo: boolean;
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={BOTON_PRIMARIO} disabled={!completo || leyendo} onClick={onLeer}>
          {leyendo ? <EstadoProcesando>Leyendo y amarrando con el balance</EstadoProcesando> : <><Icon name="check" size={14} /> Leer y amarrar con el balance</>}
        </button>
        {!leyendo && <button type="button" className={BOTON} onClick={onCancelar}>Cancelar</button>}
        {leyendo && <span className="text-[11.5px] text-ink-500">Un archivo de 400 mil filas tarda cerca de un minuto.</span>}
      </div>
    </div>
  );
}

function RechazoAmarre({ resultado }: { resultado: AdjuntarMovimientosState }) {
  return (
    <div role="alert" className="mt-3 rounded-md border border-err-200 bg-err-50 px-4 py-3">
      <p className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-err-700"><Icon name="warn" size={14} /> {resultado.message}</p>
      {resultado.montosIlegibles?.length ? (
        <p className="mt-1 text-[12px] text-ink-700">Filas del archivo con importes ilegibles: {resultado.montosIlegibles.join(", ")}.</p>
      ) : null}
      {resultado.descuadres?.length ? (
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-[11.5px]">
            <thead>
              <tr className="border-b border-err-200 text-left text-ink-600">
                <th className="px-2 py-1">Cuenta</th>
                <th className="px-2 py-1 text-right">Movimiento del balance</th>
                <th className="px-2 py-1 text-right">Movimiento del archivo</th>
                <th className="px-2 py-1 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {resultado.descuadres.map((d) => (
                <tr key={d.cuenta8} className="border-b border-err-100 text-ink-800">
                  <td className="px-2 py-1">{d.cuenta8} · {d.nombreCuenta}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(d.movimientoBalance)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(d.movimientoArchivo)}</td>
                  <td className="px-2 py-1 text-right font-semibold tabular-nums">{fmt(d.diferencia)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11.5px] text-ink-500">Movimiento = débitos − créditos de enero al corte (en el balance, saldo final − saldo inicial).</p>
        </div>
      ) : null}
      {resultado.sinCuentaEnBalance?.length ? (
        <p className="mt-2 text-[12px] text-ink-700">
          Cuentas del archivo que no están en el balance: {resultado.sinCuentaEnBalance.map((s) => `${s.cuenta} (${fmt(s.movimiento)})`).join(", ")}.
        </p>
      ) : null}
      <p className="mt-2 text-[12px] text-ink-700">No se guardó nada. Corrige el mapeo y vuelve a leer, o pide al cliente el reporte completo del período.</p>
    </div>
  );
}
