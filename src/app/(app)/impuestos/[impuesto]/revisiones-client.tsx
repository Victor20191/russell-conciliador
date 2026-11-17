"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Card, Chip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { SelectBuscable } from "@/components/select-buscable";
import { fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { crearRevisionImpuesto } from "@/app/actions/impuestos-revisiones";
import { BuscadorListado, FiltroEstadoListado } from "@/app/(app)/modulos/[codigo]/listado-compartido";
import { NOMBRES_MES } from "@/lib/impuestos/calendario";
import { impuestoPorClave, nombreCorte, RETENCION, type ClaveImpuesto, type ImpuestoDian } from "@/lib/impuestos/impuestos-dian";
import { mesesCorteValidos } from "@/lib/impuestos/periodicidad";
import {
  contarRevisionesPorEstado,
  ESTADOS_REVISION,
  estadoRevision,
  etiquetaEstadoRevision,
  filtrarRevisiones,
  type EstadoRevision,
} from "@/lib/impuestos/retencion/listado";
import type { ClienteRevision, RevisionResumen } from "@/lib/impuestos/retencion/revision-servidor";
import type { ResultadoRevision } from "@/lib/impuestos/retencion/tipos";

const BOTON_PRIMARIO = "rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60";

/** «Precierre · septiembre», «Precierre · agosto», «Cierre · diciembre» o «Corte · marzo». */
const etiquetaCorte = (imp: ImpuestoDian, mes: number) => nombreCorte(imp, mes) ?? `Corte · ${NOMBRES_MES[mes - 1]?.toLowerCase()}`;

export default function RevisionesClient({
  impuestoClave,
  revisiones,
  clientes,
  puedeCrear,
  anioActual,
}: {
  impuestoClave: ClaveImpuesto;
  revisiones: RevisionResumen[];
  clientes: ClienteRevision[];
  puedeCrear: boolean;
  anioActual: number;
}) {
  const impuesto = impuestoPorClave(impuestoClave) ?? RETENCION;
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<EstadoRevision | null>(null);
  const conteo = useMemo(() => contarRevisionesPorEstado(revisiones), [revisiones]);
  const visibles = useMemo(() => filtrarRevisiones(revisiones, busqueda, estado), [revisiones, busqueda, estado]);
  const clientesVisibles = new Set(visibles.map((r) => r.clienteId)).size;
  const hayRevisiones = revisiones.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {(hayRevisiones || puedeCrear) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {hayRevisiones && <BuscadorListado busqueda={busqueda} setBusqueda={setBusqueda} etiqueta="Buscar por cliente, NIT o año" />}
          {puedeCrear && <button type="button" onClick={() => setAbierto(true)} className={`ml-auto ${BOTON_PRIMARIO}`}>Nueva revisión</button>}
        </div>
      )}
      {hayRevisiones && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Revisiones</span>
          <span className="rounded-full bg-ink-100 px-1.5 text-[10px] font-semibold text-ink-500">{visibles.length}</span>
          <span className="text-[11px] text-ink-400">{clientesVisibles === 1 ? "1 cliente" : `${clientesVisibles} clientes`}</span>
          <div className="ml-auto">
            <FiltroEstadoListado estado={estado} setEstado={setEstado} conteo={conteo} opciones={ESTADOS_REVISION} />
          </div>
        </div>
      )}
      <Card className="overflow-x-auto p-0">
        {!hayRevisiones ? (
          <p className="px-4 py-6 text-[12.5px] text-ink-500">Todavía no hay revisiones de {impuesto.nombre}{puedeCrear ? ". Crea la primera con «Nueva revisión»." : "."}</p>
        ) : visibles.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-ink-400">
            {estado
              ? `No se encontraron revisiones en estado «${etiquetaEstadoRevision(estado)}»${busqueda.trim() ? " con esa búsqueda" : ""}.`
              : "No se encontraron revisiones con ese cliente, NIT o año."}
          </p>
        ) : (
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-150 bg-ink-50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Año</th>
                <th className="px-3 py-2">Corte</th>
                <th className="px-3 py-2 text-right">Formularios del año</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Creada</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => (
                <tr key={r.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/60">
                  <td className="px-3 py-2">
                    <Link href={`/impuestos/${impuesto.slug}/${r.id}`} className="font-semibold text-navy-800 hover:underline">{r.nombreCliente}</Link>
                    <div className="tabular-nums text-[11px] text-ink-400">NIT {r.nitCliente}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.anio}</td>
                  <td className="px-3 py-2">{etiquetaCorte(impuesto, r.mesCorte)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.confirmados} confirmados{r.porConfirmar > 0 && <span className="ml-1 text-warn-700">· {r.porConfirmar} por confirmar</span>}
                  </td>
                  <td className="px-3 py-2"><Chip label={etiquetaEstadoRevision(estadoRevision(r))} tone={estadoRevision(r) === "en_firme" ? "ok" : "blue"} /></td>
                  <td className="px-3 py-2 text-[11.5px] text-ink-500">{fmtDateTime(r.creadoEn)}{r.creadoPor ? ` · ${r.creadoPor}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {abierto && <NuevaRevisionModal impuesto={impuesto} clientes={clientes} anioActual={anioActual} onClose={() => setAbierto(false)} />}
    </div>
  );
}

function NuevaRevisionModal({ impuesto, clientes, anioActual, onClose }: { impuesto: ImpuestoDian; clientes: ClienteRevision[]; anioActual: number; onClose: () => void }) {
  const router = useRouter();
  const [state, action, creando] = useActionState<ResultadoRevision, FormData>(crearRevisionImpuesto, {});
  const [clienteId, setClienteId] = useState("");
  const [anio, setAnio] = useState(String(anioActual));
  const [mesCorte, setMesCorte] = useState(String(impuesto.cortesAtajo[0]?.mes ?? 12));
  // IVA: «Precierre» (con su mes) o «Cierre · diciembre»; sin elegir, no se crea.
  const [tipoCorte, setTipoCorte] = useState<"" | "precierre" | "cierre">("");
  const [mesPrecierre, setMesPrecierre] = useState("");
  const [periodicidadElegida, setPeriodicidadElegida] = useState("");
  // RST: un cliente sin la marca del Régimen Simple se confirma aquí (y su ficha queda en Sí).
  const [confirmaRegimen, setConfirmaRegimen] = useState(false);
  useEffect(() => {
    notifyActionState(state, { success: state.message ?? "Revisión creada.", error: "No se pudo crear la revisión." });
    if (state.ok && state.id) router.push(`/impuestos/${impuesto.slug}/${state.id}`);
  }, [state, router, impuesto.slug]);

  const cliente = clientes.find((c) => String(c.id) === clienteId) ?? null;
  // Una sola periodicidad (Retención): no se pregunta. IVA: la de la ficha del cliente o, si no la tiene, la que se elija aquí.
  const unica = impuesto.periodicidades.length === 1 ? impuesto.periodicidades[0] : null;
  const deLaFicha = cliente?.periodicidad ?? null;
  const periodicidad = unica ?? deLaFicha ?? (periodicidadElegida || null);
  const pidePeriodicidad = !unica && cliente != null && deLaFicha == null;
  // El corte cierra un período: con una periodicidad que no admite el elegido, se toma el último que sí.
  const validos = periodicidad ? mesesCorteValidos(periodicidad) : [];
  const corte = validos.length === 0 || validos.includes(Number(mesCorte)) ? mesCorte : String(validos[validos.length - 1]);
  const atajos = impuesto.cortesAtajo.filter((c) => validos.length === 0 || validos.includes(c.mes));
  // Meses de precierre: los que cierran un período antes de diciembre (con periodicidad anual, ninguno).
  const mesesPrecierre = validos.filter((m) => m < 12);
  const tipo = tipoCorte === "precierre" && periodicidad && mesesPrecierre.length === 0 ? "" : tipoCorte;
  const corteIva = tipo === "cierre" ? "12" : tipo === "precierre" && mesesPrecierre.includes(Number(mesPrecierre)) ? mesPrecierre : "";
  const corteFinal = impuesto.precierreConMes ? corteIva : corte;
  const pideConfirmarRegimen = impuesto.requiereRegimenSimple && cliente != null && !cliente.regimenSimple;
  // En RST, primero los clientes con la marca del Régimen Simple (en orden alfabético, como llegan).
  const opcionesClientes = impuesto.requiereRegimenSimple ? [...clientes].sort((a, b) => Number(b.regimenSimple) - Number(a.regimenSimple)) : clientes;

  const anios = [anioActual, anioActual - 1, anioActual - 2];
  return (
    <Modal open onClose={onClose} title={`Nueva revisión de ${impuesto.nombre}`} size="xl" footer={
      <button type="submit" form="nueva-revision" disabled={creando || !clienteId || !periodicidad || !corteFinal || (pideConfirmarRegimen && !confirmaRegimen)} className={BOTON_PRIMARIO}>
        {creando ? <EstadoProcesando>Creando</EstadoProcesando> : "Crear revisión"}
      </button>
    }>
      <form id="nueva-revision" action={action} className="flex flex-col gap-4 text-[12.5px]">
        <input type="hidden" name="impuesto" value={impuesto.clave} />
        <input type="hidden" name="clienteId" value={clienteId} />
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-ink-700">Cliente</span>
          <SelectBuscable
            opciones={opcionesClientes.map((c) => ({
              value: String(c.id),
              label: c.nombre,
              sublabel: impuesto.requiereRegimenSimple ? `NIT ${c.nit} · ${c.regimenSimple ? "Régimen Simple" : "Sin la marca de Régimen Simple"}` : `NIT ${c.nit}`,
            }))}
            value={clienteId}
            onChange={(v) => {
              setClienteId(v);
              setConfirmaRegimen(false);
            }}
            placeholder="Busca el cliente"
          />
        </label>
        {impuesto.requiereRegimenSimple && cliente && (
          cliente.regimenSimple ? (
            <p className="text-ink-600">El cliente tiene la marca <span className="font-semibold text-ink-800">Régimen Simple de Tributación</span> en su ficha. Los anticipos son siempre bimestrales.</p>
          ) : (
            <div className="flex flex-col gap-2 rounded-md border border-warn-500 bg-warn-100 px-3 py-2 text-[12px] text-warn-700">
              <span>
                <span className="font-semibold">{cliente.nombre}</span> tiene «Régimen Simple de Tributación» en No en su ficha. Los anticipos bimestrales solo aplican a los clientes del Régimen Simple.
              </span>
              <label className="flex items-start gap-2 text-ink-800">
                <input type="checkbox" name="confirmaRegimenSimple" value="1" checked={confirmaRegimen} onChange={(e) => setConfirmaRegimen(e.target.checked)} className="mt-0.5" />
                <span>Confirmo que este cliente pertenece al Régimen Simple de Tributación. Su ficha quedará en Sí.</span>
              </label>
            </div>
          )
        )}
        {!unica && cliente && (
          deLaFicha ? (
            <p className="text-ink-600">Periodicidad de {impuesto.nombre} en la ficha del cliente: <span className="font-semibold text-ink-800">{deLaFicha}</span>.</p>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-ink-700">Periodicidad de {impuesto.nombre}</span>
              <span className="text-[11.5px] text-ink-500">El cliente no la tiene en su ficha: la que elijas queda guardada allí.</span>
              <select
                name="periodicidad"
                value={periodicidadElegida}
                onChange={(e) => setPeriodicidadElegida(e.target.value)}
                className="h-9 w-56 rounded-md border border-ink-200 bg-white px-2"
              >
                <option value="">Elige la periodicidad</option>
                {impuesto.periodicidades.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          )
        )}
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-ink-700">Año</span>
            <select name="anio" value={anio} onChange={(e) => setAnio(e.target.value)} className="h-9 rounded-md border border-ink-200 bg-white px-2">
              {anios.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          {impuesto.precierreConMes ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 font-semibold text-ink-700">¿A qué corte se revisa?</legend>
              <div className="flex flex-wrap items-center gap-3">
                <label className={`flex items-center gap-1.5 ${periodicidad && mesesPrecierre.length === 0 ? "text-ink-400" : ""}`}>
                  <input
                    type="radio"
                    name="tipoCorte"
                    checked={tipo === "precierre"}
                    disabled={!!periodicidad && mesesPrecierre.length === 0}
                    onChange={() => setTipoCorte("precierre")}
                  />
                  Precierre
                </label>
                {tipo === "precierre" && (
                  <select
                    value={mesPrecierre}
                    onChange={(e) => setMesPrecierre(e.target.value)}
                    aria-label="Mes del precierre"
                    autoFocus
                    className="h-8 rounded-md border border-ink-200 bg-white px-2"
                  >
                    <option value="">Elige el mes del precierre</option>
                    {(periodicidad ? mesesPrecierre : [...Array(11).keys()].map((i) => i + 1)).map((m) => (
                      <option key={m} value={m} disabled={!periodicidad}>{NOMBRES_MES[m - 1]}</option>
                    ))}
                  </select>
                )}
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="tipoCorte" checked={tipo === "cierre"} onChange={() => setTipoCorte("cierre")} />
                  Cierre · diciembre
                </label>
              </div>
              {pidePeriodicidad && !periodicidad && <span className="text-[11.5px] text-ink-500">Elige la periodicidad: el precierre tiene que cerrar uno de sus períodos.</span>}
              {periodicidad && mesesPrecierre.length === 0 && <span className="text-[11.5px] text-ink-500">Con periodicidad {periodicidad.toLowerCase()} solo hay cierre a diciembre.</span>}
              <input type="hidden" name="mesCorte" value={corteIva} />
            </fieldset>
          ) : (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 font-semibold text-ink-700">¿A qué corte se revisa?</legend>
            <div className="flex flex-wrap items-center gap-3">
              {atajos.map((o) => (
                <label key={o.mes} className="flex items-center gap-1.5">
                  <input type="radio" name="mesCorteAtajo" checked={corte === String(o.mes)} onChange={() => setMesCorte(String(o.mes))} />
                  {o.etiqueta}
                </label>
              ))}
              <label className="flex items-center gap-1.5">
                Otro mes
                <select value={corte} onChange={(e) => setMesCorte(e.target.value)} className="h-8 rounded-md border border-ink-200 bg-white px-2">
                  {NOMBRES_MES.map((m, i) => (validos.length === 0 || validos.includes(i + 1)) && <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
            </div>
            {pidePeriodicidad && !periodicidad && <span className="text-[11.5px] text-ink-500">Elige la periodicidad: el corte tiene que cerrar uno de sus períodos.</span>}
            <input type="hidden" name="mesCorte" value={corte} />
          </fieldset>
          )}
        </div>
      </form>
    </Modal>
  );
}
