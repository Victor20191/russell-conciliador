"use client";

import { Fragment, useState } from "react";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { BotonPantallaCompleta, CLASE_TARJETA, claseScrollTabla, propsRegionPantallaCompleta, usePantallaCompletaTabla } from "@/components/tabla-pantalla-completa";
import { chevronDivulgacion } from "@/lib/ui/chevron-divulgacion";
import { fmt, fmtContable, fmtDateTime } from "@/lib/format";
import { CeldaMarca, MarcaModal } from "./marca-modal";
import { ConmutadorCeros } from "./vistas-revision";
import {
  alcanceSaldoInicial,
  aporteTercero,
  etiquetaFilaCruce,
  gruposCruceConValores,
  renglonesFilaCruce,
  resumenCuentaCruce,
  terceroTachado,
  type CruceRetencionPantalla,
  type CuentaFueraDeRetencion,
  type FilaCruce,
  type ResultadoCrucePantalla,
  type SubtotalCruce,
} from "@/lib/impuestos/retencion/cruce";

// Cruce contable de la revisión: lo declarado en los 350 hasta el corte contra el saldo final de
// las cuentas del cliente homologadas a 2365/2367, con los terceros que lo sustentan al desplegar.

const BOTON_SECUNDARIO = "rounded-md border border-ink-200 px-2.5 py-1 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-60";
const NUM = "px-3 py-1.5 text-right tabular-nums whitespace-nowrap";
const COLUMNAS = 8;
// La tabla del cruce va por bloques, con el aspecto de las tablas de los módulos: lo declarado (renglones y
// cifra), el balance del corte (cuenta Russell y cifra) y el resultado, cada uno con su título de grupo y una
// línea fina entre ellos; los bloques tienen ancho fijo y el concepto toma el resto.
const INICIO_SECCION = "border-l border-ink-200";
const BORDE_RESULTADO = "border-l border-ink-200";
const FONDO_RESULTADO = "";
const ENCABEZADO_GRUPO = "bg-ink-50 px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-600";
const NOTA_CIFRA = "mt-0.5 whitespace-normal text-[11px] font-normal text-ink-400";
// Títulos fijos en pantalla completa: la primera fila (bandas) tiene alto fijo y la segunda se pega debajo.
// Los fondos van en cada celda porque una celda sticky no arrastra el fondo del thead.
const TITULO_FIJO = "sticky top-0 z-20";
const SUBTITULO_FIJO = "sticky top-8 z-20 bg-ink-50 shadow-[inset_0_-1px_0_var(--color-ink-150)]";
const COLUMNAS_CRUCE = (
  <colgroup>
    <col />
    <col className="w-44" />
    <col className="w-44" />
    <col className="w-64" />
    <col className="w-56" />
    <col className="w-40" />
    <col className="w-40" />
    <col className="w-16" />
  </colgroup>
);
// Los renglones de una fila agrupada son muchos («47 · 100 · 50 · 103…»): se parten en líneas en vez de montarse sobre la cifra.
const RENGLONES = "px-3 py-1.5 text-right text-[11.5px] leading-4 tabular-nums text-ink-500 whitespace-normal break-words";

const alternarEnConjunto = (conjunto: ReadonlySet<string>, clave: string) => {
  const sig = new Set(conjunto);
  if (sig.has(clave)) sig.delete(clave);
  else sig.add(clave);
  return sig;
};

const fecha = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

export function CruceRevision({ cruce, revisionId, puedeEditar }: { cruce: CruceRetencionPantalla; revisionId: number; puedeEditar: boolean }) {
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
  const [marcando, setMarcando] = useState<string | null>(null);
  const [ocultarCeros, setOcultarCeros] = useState(false);
  const { pantallaCompleta, alternar: alternarPantalla } = usePantallaCompletaTabla();

  if (cruce.estado !== "listo") {
    return (
      <Card className="flex items-start gap-3 p-4 text-[12.5px]">
        <Icon name="warn" size={16} className="mt-0.5 shrink-0 text-warn-700" />
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-navy-800">{cruce.estado === "sin_balance" ? "Aún no hay balance para el cruce" : "El cruce está bloqueado"}</span>
          <span className="text-ink-600">{cruce.mensaje}</span>
          {cruce.balance && <span className="text-ink-500">Balance del corte: {cruce.balance.descripcion} (del {fecha(cruce.balance.periodoInicio)} al {fecha(cruce.balance.periodoFin)}).</span>}
          <span className="text-[11.5px] text-ink-400">El cruce usa el balance cerrado y vigente que termina en el mes de corte, cargado con detalle por tercero y con el prevalidador aprobado.</span>
        </div>
      </Card>
    );
  }

  const { resultado, balance, umbral, inicioEnero } = cruce;
  const saldoInicial = resultado.saldoInicial ?? null;
  const filas = resultado.grupos.flatMap((g) => g.filas);
  const grupos = ocultarCeros ? gruposCruceConValores(resultado.grupos) : resultado.grupos;
  const filaMarcando = filas.find((f) => f.clave === marcando) ?? null;
  const conMarca = filas.filter((f) => f.marca).sort((a, b) => a.marca!.numero - b.marca!.numero);
  const alternar = (clave: string) => setAbiertas((prev) => alternarEnConjunto(prev, clave));

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-1.5 p-4 text-[12.5px]">
        <span className="text-ink-700">
          Balance del corte: <span className="font-semibold text-navy-800">{balance.descripcion}</span> · del {fecha(balance.periodoInicio)} al {fecha(balance.periodoFin)}
        </span>
        <p className="text-[11.5px] text-ink-500">
          Contabilidad = saldo final al corte de las cuentas del cliente homologadas a cada cuenta Russell, en positivo (son pasivos). En las cuentas que lo indican, el saldo de la DIAN (los pagos registrados en la misma cuenta) se muestra tachado y no suma.{saldoInicial?.restado && " Como el balance empieza el 1 de enero, además se resta siempre el saldo inicial de los terceros distintos de la DIAN: cada uno suma solo lo del año."} Diferencias desde {fmt(umbral)} exigen marca; por debajo son informativas (la DIAN redondea cada renglón a miles).
        </p>
        {!inicioEnero && (
          <p className="text-[11.5px] text-warn-700">El balance no empieza el 1 de enero: no se puede medir el saldo inicial que arrastran los terceros.</p>
        )}
        <ResumenSaldoInicial saldoInicial={saldoInicial} />
      </Card>

      {/* Región propia (no `<Card>`): en pantalla completa ocupa el viewport y solo la tabla scrollea. */}
      <div role="region" aria-label="Cruce contable de retención en la fuente" {...propsRegionPantallaCompleta(pantallaCompleta, CLASE_TARJETA)}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-white px-4 py-2.5">
          <ConmutadorCeros ocultar={ocultarCeros} onCambio={setOcultarCeros} />
          <div className="flex flex-wrap items-center gap-2">
            {resultado.pendientesMarca > 0 ? (
              <Chip label={`${resultado.pendientesMarca} ${resultado.pendientesMarca === 1 ? "diferencia exige" : "diferencias exigen"} marca`} tone="warn" />
            ) : (
              <Chip label="Sin diferencias pendientes de marca" tone="ok" />
            )}
            <BotonPantallaCompleta activa={pantallaCompleta} onToggle={alternarPantalla} />
          </div>
        </div>
        <div className={claseScrollTabla(pantallaCompleta, null)}>
        <table className="w-full min-w-[1100px] table-fixed text-[12.5px]">
          {COLUMNAS_CRUCE}
          <thead className="border-b border-ink-150 bg-ink-50 text-left font-semibold text-ink-500">
            <tr>
              <th rowSpan={2} className={`${TITULO_FIJO} bg-ink-50 px-3 py-2 align-bottom shadow-[inset_0_-1px_0_var(--color-ink-150)]`}>Concepto</th>
              <th colSpan={2} className={`${TITULO_FIJO} ${INICIO_SECCION} h-8 whitespace-nowrap ${ENCABEZADO_GRUPO}`}>Declarado · Formulario 350</th>
              <th colSpan={2} className={`${TITULO_FIJO} ${INICIO_SECCION} h-8 whitespace-nowrap ${ENCABEZADO_GRUPO}`}>Balance del corte</th>
              <th colSpan={2} className={`${TITULO_FIJO} ${BORDE_RESULTADO} h-8 whitespace-nowrap ${ENCABEZADO_GRUPO}`}>Resultado</th>
              <th rowSpan={2} className={`${TITULO_FIJO} ${BORDE_RESULTADO} bg-ink-50 px-3 py-2 text-center align-bottom shadow-[inset_0_-1px_0_var(--color-ink-150)]`}>Marca</th>
            </tr>
            <tr>
              <th className={`${SUBTITULO_FIJO} ${INICIO_SECCION} px-3 py-2 text-right`}>Renglones</th>
              <th className={`${SUBTITULO_FIJO} px-3 py-2 text-right`}>Declaraciones</th>
              <th className={`${SUBTITULO_FIJO} ${INICIO_SECCION} px-3 py-2`}>Cuenta Russell</th>
              <th className={`${SUBTITULO_FIJO} px-3 py-2 text-right`}>Contabilidad</th>
              <th className={`${SUBTITULO_FIJO} ${BORDE_RESULTADO} px-3 py-2 text-right`}>Diferencia</th>
              <th className={`${SUBTITULO_FIJO} px-3 py-2`}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <Fragment key={g.grupo}>
                <tr className="bg-ink-50">
                  <td colSpan={COLUMNAS} className="px-3 py-1.5 text-[11.5px] font-semibold text-navy-800">{g.etiqueta}</td>
                </tr>
                {g.filas.map((f) => (
                  <Fragment key={f.clave}>
                    <FilaTabla fila={f} abierta={abiertas.has(f.clave)} onAlternar={() => alternar(f.clave)} puedeEditar={puedeEditar} onMarcar={() => setMarcando(f.clave)} />
                    {abiertas.has(f.clave) && (
                      <tr className="border-b border-ink-100 bg-ink-50/40">
                        <td colSpan={COLUMNAS} className="border-l-2 border-ink-300 px-4 py-3">
                          <DetalleFila fila={f} inicioEnero={inicioEnero} ocultos={resultado.tercerosOcultos} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                <FilaSubtotal etiqueta={`Subtotal · ${g.etiqueta}`} subtotal={g.subtotal} />
              </Fragment>
            ))}
            <FilaSubtotal etiqueta="Total retenciones (136)" subtotal={resultado.total} total />
          </tbody>
        </table>
        </div>
      </div>

      {resultado.fueraDelMapeo.length > 0 && <FueraDelMapeo filas={resultado.fueraDelMapeo} />}

      {(resultado.fueraDeRetencion?.length ?? 0) > 0 && <FueraDeRetencion filas={resultado.fueraDeRetencion ?? []} />}

      <Observaciones filas={conMarca} puedeEditar={puedeEditar} onEditar={setMarcando} />

      {filaMarcando && (
        <MarcaModal
          key={filaMarcando.clave}
          revisionId={revisionId}
          clave={filaMarcando.clave}
          titulo={etiquetaFilaCruce(filaMarcando)}
          marca={filaMarcando.marca}
          diferencia={filaMarcando.diferencia}
          placeholder="Ej.: redondeo de la DIAN a miles en cada renglón de los meses del corte."
          resumen={
            <>
              Diferencia de hoy: <span className="font-semibold tabular-nums text-ink-800">{fmtContable(filaMarcando.diferencia)}</span> (declaraciones {fmtContable(filaMarcando.declarado)} − contabilidad {fmtContable(filaMarcando.contable)}).
            </>
          }
          onClose={() => setMarcando(null)}
        />
      )}
    </div>
  );
}

/**
 * El saldo inicial de todo el cruce. Con un balance desde el 1 de enero se resta siempre; una copia
 * congelada antigua puede traerlo sin restar. El detalle y su marca están en Novedades.
 */
function ResumenSaldoInicial({ saldoInicial }: { saldoInicial: NonNullable<ResultadoCrucePantalla["saldoInicial"]> | null }) {
  if (!saldoInicial) return null;
  const { restado } = saldoInicial;
  return (
    <div className={`mt-1.5 flex items-start gap-2 rounded-md border border-l-4 px-3 py-2.5 text-[12.5px] ${restado ? "border-navy-300 border-l-navy-600 bg-navy-50 text-ink-800" : "border-warn-300 border-l-warn-500 bg-warn-50 text-warn-700"}`}>
      <Icon name="info" size={15} className={`mt-px shrink-0 ${restado ? "text-navy-600" : "text-warn-600"}`} />
      {restado ? (
        <span>
          Se restó el saldo inicial de <span className="font-semibold text-navy-800">{alcanceSaldoInicial(saldoInicial)}</span>, por{" "}
          <span className="font-semibold tabular-nums text-navy-800">{fmtContable(saldoInicial.monto)}</span>: el balance empieza el 1 de enero, así que se resta siempre. El detalle y su marca están en Novedades.
        </span>
      ) : (
        <span>
          <span className="font-semibold">{alcanceSaldoInicial(saldoInicial)}</span>: {saldoInicial.terceros === 1 ? "trae" : "traen"} saldo inicial por{" "}
          <span className="font-semibold tabular-nums">{fmtContable(saldoInicial.monto)}</span>, que la contabilidad incluye.
        </span>
      )}
    </div>
  );
}

function FilaTabla({ fila, abierta, onAlternar, puedeEditar, onMarcar }: { fila: FilaCruce; abierta: boolean; onAlternar: () => void; puedeEditar: boolean; onMarcar: () => void }) {
  return (
    <tr className={`border-b border-ink-100 align-top ${abierta ? "bg-ink-50/60" : ""}`}>
      <td className="px-3 py-1.5">
        <button type="button" onClick={onAlternar} aria-expanded={abierta} className="flex items-start gap-1.5 text-left">
          <Icon name={chevronDivulgacion(abierta)} size={13} className="mt-0.5 shrink-0 text-ink-400" />
          <span className="flex flex-col">
            <span className="font-medium text-ink-800">{etiquetaFilaCruce(fila)}</span>
            {fila.conceptos.length > 1 && <span className="text-[11px] text-ink-400">{fila.conceptos.length} conceptos</span>}
          </span>
        </button>
      </td>
      <td className={`${RENGLONES} ${INICIO_SECCION}`}>{renglonesFilaCruce(fila)}</td>
      <td className={NUM}>{fmtContable(fila.declarado)}</td>
      <td className={`${INICIO_SECCION} px-3 py-1.5`}>
        {fila.cuentaRussell ? (
          <div className="flex flex-col">
            <span className="tabular-nums text-ink-800">{fila.cuentaRussell}</span>
            {fila.nombreCuenta && <span className="truncate text-[11px] text-ink-400" title={fila.nombreCuenta}>{fila.nombreCuenta}</span>}
          </div>
        ) : (
          <span className="text-[11px] text-ink-400">Sin cuenta · solo afecta lo declarado</span>
        )}
      </td>
      <td className={NUM}>
        {fila.cuentaRussell ? fmtContable(fila.contable) : "—"}
        {fila.dianRestado !== 0 && <div className={NOTA_CIFRA}>DIAN restada {fmt(fila.dianRestado)}</div>}
        {fila.saldoInicial?.restado && <div className={NOTA_CIFRA}>Saldo inicial restado {fmt(fila.saldoInicial.monto)}</div>}
        {((fila.saldoInicial && !fila.saldoInicial.restado) || fila.posiblesDian.length > 0) && (
          <div className="mt-1 flex flex-wrap justify-end gap-1">
            {fila.saldoInicial && !fila.saldoInicial.restado && <Chip label="Saldo inicial" tone="warn" />}
            {fila.posiblesDian.length > 0 && <Chip label="¿DIAN sin NIT?" tone="warn" />}
          </div>
        )}
      </td>
      <td className={`${NUM} ${BORDE_RESULTADO} ${FONDO_RESULTADO} font-semibold ${fila.nivel === "alerta" ? "text-err-700" : fila.nivel === "informativa" ? "text-ink-600" : "text-ok-700"}`}>{fmtContable(fila.diferencia)}</td>
      <td className={`${FONDO_RESULTADO} px-3 py-1.5`}><EstadoFila fila={fila} /></td>
      <td className={`${BORDE_RESULTADO} px-3 py-1.5 text-center`}>
        <CeldaMarca
          marca={fila.marca}
          requiereMarca={fila.requiereMarca}
          admiteMarca={fila.diferencia !== 0}
          puedeEditar={puedeEditar}
          ancla={`marca-retencion-${fila.marca?.numero ?? ""}`}
          tituloDesactualizada={fila.marca ? `Marca ${fila.marca.numero} · la diferencia era ${fmtContable(fila.marca.diferencia)} cuando se escribió y hoy es ${fmtContable(fila.diferencia)}` : undefined}
          onMarcar={onMarcar}
        />
      </td>
    </tr>
  );
}

function EstadoFila({ fila }: { fila: FilaCruce }) {
  if (fila.nivel === "cero") return <Chip label="Cuadra" tone="ok" />;
  if (fila.nivel === "informativa") return <Chip label="Informativa" tone="ink" />;
  if (fila.marca?.vigente) return <Chip label="Marcada" tone="blue" />;
  return <Chip label={fila.marca ? "Marca desactualizada" : "Exige marca"} tone="warn" />;
}

function FilaSubtotal({ etiqueta, subtotal, total = false }: { etiqueta: string; subtotal: SubtotalCruce; total?: boolean }) {
  return (
    <tr className={`border-t-2 border-ink-200 font-semibold text-ink-800 ${total ? "bg-ink-100" : "bg-ink-50"}`}>
      <td className="px-3 py-2">{etiqueta}</td>
      <td className={INICIO_SECCION} />
      <td className={NUM}>{fmtContable(subtotal.declarado)}</td>
      <td className={INICIO_SECCION} />
      <td className={NUM}>{fmtContable(subtotal.contable)}</td>
      <td className={`${NUM} ${BORDE_RESULTADO}`}>{fmtContable(subtotal.diferencia)}</td>
      <td />
      <td className={BORDE_RESULTADO} />
    </tr>
  );
}

// Las dos tablas del detalle comparten columnas: lo declarado y los saldos de todas las cuentas quedan alineados.
const COLUMNAS_DETALLE = (
  <colgroup>
    <col className="w-28" />
    <col />
    <col className="w-40" />
    <col className="w-40" />
    <col className="w-52" />
  </colgroup>
);
const ENCABEZADO_DETALLE = "sticky top-0 z-20 bg-ink-50 px-2 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-ink-500 shadow-[inset_0_-1px_0_var(--color-ink-150)]";
const VALOR_DETALLE = "px-2 py-1 text-right tabular-nums whitespace-nowrap";
const BANDA_CUENTA = "sticky top-[27px] z-10 bg-ink-100 font-semibold text-navy-800";
const FILA_TOTAL_DETALLE = "border-t-2 border-ink-200 bg-ink-50 font-semibold text-ink-800";
const RESALTE_SALDO_INICIAL = "rounded bg-warn-100 px-1 text-warn-700";
const SALDO_INICIAL_RESTADO = "text-ink-400 line-through";

function TituloDetalle({ titulo, detalle, cuentaRussell }: { titulo: string; detalle: string; cuentaRussell?: string }) {
  return (
    <h4 className="mb-1.5 border-b border-ink-200 pb-1 text-[12px] font-bold text-navy-800">
      {titulo} <span className="font-normal text-ink-500">· {detalle}</span>
      {cuentaRussell && <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 tabular-nums">Cuenta Russell {cuentaRussell}</span>}
    </h4>
  );
}

function DetalleFila({ fila, inicioEnero, ocultos }: { fila: FilaCruce; inicioEnero: boolean; ocultos: ResultadoCrucePantalla["tercerosOcultos"] }) {
  const [cuentasAbiertas, setCuentasAbiertas] = useState<ReadonlySet<string>>(new Set());
  const hayAvisos = fila.saldoInicial || fila.posiblesDian.length > 0 || (fila.marca && !fila.marca.vigente);
  return (
    <div className="flex flex-col gap-4 text-[12px]">
      <section>
        <TituloDetalle titulo="Lo declarado" detalle="350 vigentes hasta el corte" />
        <div className="rounded border border-ink-150 bg-white">
          <table className="w-full table-fixed">
            {COLUMNAS_DETALLE}
            <thead>
              <tr>
                <th colSpan={2} className={ENCABEZADO_DETALLE}>Concepto</th>
                <th className={`${ENCABEZADO_DETALLE} text-right`}>Renglones</th>
                <th className={`${ENCABEZADO_DETALLE} text-right`}>Declarado</th>
                <th className={ENCABEZADO_DETALLE} />
              </tr>
            </thead>
            <tbody>
              {fila.conceptos.map((c) => (
                <tr key={c.concepto} className="border-t border-ink-100">
                  <td colSpan={2} className="px-2 py-1 text-ink-800">{c.etiqueta}</td>
                  <td className={`${VALOR_DETALLE} text-ink-400`}>{c.renglones.join(" · ")}</td>
                  <td className={VALOR_DETALLE}>{fmtContable(c.declarado)}</td>
                  <td />
                </tr>
              ))}
              {fila.conceptos.length > 1 && (
                <tr className={FILA_TOTAL_DETALLE}>
                  <td colSpan={3} className="px-2 py-1">Total declarado</td>
                  <td className={VALOR_DETALLE}>{fmtContable(fila.declarado)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {fila.cuentaRussell && (
        <section>
          <TituloDetalle titulo="La contabilidad" detalle={fila.saldoInicial?.restado ? "saldo final al corte, sin el saldo inicial" : "saldo final al corte"} cuentaRussell={fila.cuentaRussell} />
          {fila.cuentasCliente.length === 0 ? (
            <p className="text-ink-500">Ninguna cuenta del cliente está homologada a {fila.cuentaRussell} en este balance.</p>
          ) : (
            <div className="max-h-[30rem] overflow-y-auto rounded border border-ink-150 bg-white">
              <table className="w-full table-fixed">
                {COLUMNAS_DETALLE}
                <thead>
                  <tr>
                    <th colSpan={2} className={ENCABEZADO_DETALLE}>Cuenta del cliente</th>
                    <th className={`${ENCABEZADO_DETALLE} text-right`}>{inicioEnero ? "Saldo inicial" : ""}</th>
                    <th className={`${ENCABEZADO_DETALLE} text-right`}>Saldo final</th>
                    <th className={ENCABEZADO_DETALLE} />
                  </tr>
                </thead>
                {fila.cuentasCliente.map((c) => {
                  const oculto = ocultos[`${fila.clave}|${c.cuenta}`];
                  const abierta = cuentasAbiertas.has(c.cuenta);
                  const resumen = resumenCuentaCruce(c, oculto);
                  return (
                    <tbody key={c.cuenta}>
                      <tr>
                        <td colSpan={2} className={`${BANDA_CUENTA} px-2 py-1.5`}>
                          <button type="button" onClick={() => setCuentasAbiertas((prev) => alternarEnConjunto(prev, c.cuenta))} aria-expanded={abierta} className="flex w-full items-center gap-1.5 text-left">
                            <Icon name={chevronDivulgacion(abierta)} size={13} className="shrink-0" />
                            <span className="tabular-nums">{c.cuenta}</span>
                            <span className="ml-1">{c.nombre}</span>
                            <span className="ml-1 font-normal text-ink-600">· {resumen.terceros} {resumen.terceros === 1 ? "tercero" : "terceros"}</span>
                          </button>
                        </td>
                        <td className={`${BANDA_CUENTA} ${VALOR_DETALLE}`}>
                          {inicioEnero && resumen.saldoInicial !== 0 && <span className={resumen.saldoInicialRestado !== 0 ? SALDO_INICIAL_RESTADO : RESALTE_SALDO_INICIAL}>{fmtContable(resumen.saldoInicial)}</span>}
                        </td>
                        <td className={`${BANDA_CUENTA} ${VALOR_DETALLE}`}>{fmtContable(c.saldo)}</td>
                        <td className={`${BANDA_CUENTA} px-2 text-[10.5px]`}>
                          {resumen.dianRestado !== 0 && <span className="block">DIAN restada {fmtContable(resumen.dianRestado)}</span>}
                          {resumen.saldoInicialRestado !== 0 && <span className="block">Saldo inicial restado {fmtContable(resumen.saldoInicialRestado)}</span>}
                          {resumen.posibleDian && <span className="block">¿DIAN sin NIT?</span>}
                        </td>
                      </tr>
                      {abierta && (
                        <tr className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
                          <td className="pb-0.5 pl-5 pr-2 pt-1.5">NIT</td>
                          <td className="px-2 pb-0.5 pt-1.5">Tercero</td>
                          <td colSpan={3} />
                        </tr>
                      )}
                      {abierta && c.terceros.map((t, i) => {
                        const tachado = terceroTachado(t) ? "text-ink-400 line-through" : "";
                        const aporte = aporteTercero(t);
                        return (
                          <tr key={`${t.nit ?? "sin-nit"}-${i}`} className="border-t border-ink-100 hover:bg-ink-50">
                            <td className={`py-1 pl-5 pr-2 tabular-nums ${tachado}`}>{t.nit ?? "—"}</td>
                            <td className={`px-2 py-1 ${tachado}`}>{t.nombre ?? "—"}</td>
                            <td className={`${VALOR_DETALLE} ${tachado}`}>
                              {inicioEnero && t.saldoInicial !== 0 && (
                                t.esDian ? fmtContable(t.saldoInicial) : <span className={t.saldoInicialRestado ? SALDO_INICIAL_RESTADO : RESALTE_SALDO_INICIAL}>{fmtContable(t.saldoInicial)}</span>
                              )}
                            </td>
                            <td className={`${VALOR_DETALLE} ${tachado}`}>{fmtContable(t.saldo)}</td>
                            <td className="px-2 py-1 text-[10.5px] font-semibold">
                              {t.restado && <span className="text-ink-500">DIAN · se resta</span>}
                              {t.esDian && !t.restado && <span className="text-ink-500">DIAN · esta cuenta no la resta</span>}
                              {Boolean(t.saldoInicialRestado) && <span className="block text-ink-500">Saldo inicial · se resta{aporte !== 0 && `; suma ${fmtContable(aporte)}`}</span>}
                              {t.posibleDian && <span className="text-warn-700">¿Es la DIAN? Sin NIT: no se resta sola</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {abierta && oculto && (
                        <tr className="border-t border-ink-100 text-[11px] text-ink-500">
                          <td colSpan={3} className="py-1 pl-5 pr-2">Y {oculto.cantidad} terceros más</td>
                          <td className={VALOR_DETALLE}>{fmtContable(oculto.saldo)}</td>
                          <td className="px-2 py-1">En el Excel van todos.</td>
                        </tr>
                      )}
                    </tbody>
                  );
                })}
                {fila.cuentasCliente.length > 1 && (
                  <tfoot>
                    <tr className={FILA_TOTAL_DETALLE}>
                      <td colSpan={2} className="px-2 py-1.5">Total contabilidad</td>
                      <td className={VALOR_DETALLE}>{fila.saldoInicial && fmtContable(fila.saldoInicial.monto)}</td>
                      <td className={VALOR_DETALLE}>{fmtContable(fila.contable)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </section>
      )}

      {hayAvisos && (
        <div className="flex flex-col gap-1 rounded-md border border-warn-300 bg-warn-50 px-3 py-2 text-warn-700">
          {fila.saldoInicial && (
            <p>
              {fila.saldoInicial.restado
                ? `${fila.saldoInicial.terceros} ${fila.saldoInicial.terceros === 1 ? "tercero traía" : "terceros traían"} saldo inicial por ${fmtContable(fila.saldoInicial.monto)}: se restó de la contabilidad.`
                : `${fila.saldoInicial.terceros} ${fila.saldoInicial.terceros === 1 ? "tercero trae" : "terceros traen"} saldo inicial por ${fmtContable(fila.saldoInicial.monto)}: el saldo final puede arrastrar retenciones de períodos anteriores. No cambia la cifra del cruce.`}
            </p>
          )}
          {fila.posiblesDian.length > 0 && (
            <p>Sin NIT pero con nombre de la DIAN: {fila.posiblesDian.join(", ")}. No se resta sola; si es un pago, revisa el tercero en el balance.</p>
          )}
          {fila.marca && !fila.marca.vigente && (
            <p>La marca {fila.marca.numero} se escribió con una diferencia de {fmtContable(fila.marca.diferencia)} y hoy es {fmtContable(fila.diferencia)}: revísala.</p>
          )}
        </div>
      )}
    </div>
  );
}

function FueraDelMapeo({ filas }: { filas: ResultadoCrucePantalla["fueraDelMapeo"] }) {
  return (
    <Card className="p-4 text-[12.5px]">
      <h3 className="text-[12.5px] font-semibold text-navy-800">Cuentas de retención fuera del cruce</h3>
      <p className="mt-0.5 text-[11.5px] text-ink-500">
        Cuentas del cliente homologadas a una cuenta Russell de 2365 o 2367 que no está en el mapeo del 350 (por ejemplo 236599 «Pago de retención en la fuente»). Se informan y no suman al cruce.
      </p>
      <table className="mt-2 text-[12px]">
        <tbody>
          {filas.map((f) => (
            <tr key={f.cuentaRussell} className="border-t border-ink-100">
              <td className="py-1 pr-4 font-semibold tabular-nums text-ink-700">{f.cuentaRussell}</td>
              <td className="py-1 pr-4 tabular-nums text-ink-500">{f.cuentas.join(", ")}</td>
              <td className="py-1 text-right tabular-nums">{fmtContable(f.saldo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function FueraDeRetencion({ filas }: { filas: CuentaFueraDeRetencion[] }) {
  return (
    <Card className="p-4 text-[12.5px]">
      <h3 className="text-[12.5px] font-semibold text-navy-800">Cuentas del cliente en 2365 o 2367 homologadas fuera de retención</h3>
      <p className="mt-0.5 text-[11.5px] text-ink-500">
        Están en 2365 o 2367 del cliente, pero homologadas a una cuenta Russell de otro grupo o sin homologar, así que su saldo no llega al cruce. Revisa si la homologación es correcta. Es informativo: no impide cerrar.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[480px] text-[12px]">
          <thead className="text-left font-semibold text-ink-500">
            <tr>
              <th className="py-1 pr-4">Cuenta del cliente</th>
              <th className="py-1 pr-4">Homologada a</th>
              <th className="py-1 text-right">Saldo final</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.cuenta} className="border-t border-ink-100 align-top">
                <td className="py-1 pr-4">
                  <span className="font-semibold tabular-nums text-ink-700">{f.cuenta}</span>
                  {f.nombre && <span className="ml-2 text-ink-500">{f.nombre}</span>}
                </td>
                <td className="py-1 pr-4">
                  {f.cuentaRussell ? (
                    <>
                      <span className="font-semibold tabular-nums text-ink-700">{f.cuentaRussell}</span>
                      {f.nombreRussell && <span className="ml-2 text-ink-500">{f.nombreRussell}</span>}
                    </>
                  ) : (
                    <span className="text-ink-500">Sin homologar</span>
                  )}
                </td>
                <td className="whitespace-nowrap py-1 text-right tabular-nums">{fmtContable(f.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Observaciones({ filas, puedeEditar, onEditar }: { filas: FilaCruce[]; puedeEditar: boolean; onEditar: (clave: string) => void }) {
  return (
    <Card className="p-0">
      <div className="border-b border-ink-100 px-3 py-2">
        <h3 className="text-[12.5px] font-semibold text-navy-800">Observaciones · marcas del cruce</h3>
      </div>
      {filas.length === 0 ? (
        <p className="px-3 py-5 text-center text-[12px] text-ink-400">Sin marcas todavía. Pon una marca a una diferencia de la tabla y su detalle aparecerá aquí.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {filas.map((f) => {
            const m = f.marca!;
            return (
              <li key={f.clave} id={`marca-retencion-${m.numero}`} className="flex flex-col gap-0.5 px-3 py-2 text-[12px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border px-1 text-[11.5px] font-bold tabular-nums ${m.vigente ? "border-navy-700 text-navy-700" : "border-warn-500 bg-warn-100 text-warn-700"}`}>{m.numero}</span>
                  <span className="font-semibold text-ink-800">{etiquetaFilaCruce(f)}</span>
                  <span className="tabular-nums text-ink-500">diferencia {fmtContable(m.diferencia)}</span>
                  {!m.vigente && <Chip label={`Desactualizada · hoy ${fmtContable(f.diferencia)}`} tone="warn" />}
                  {puedeEditar && <button type="button" onClick={() => onEditar(f.clave)} className={`ml-auto ${BOTON_SECUNDARIO}`}>Editar</button>}
                </div>
                <p className="whitespace-pre-line text-ink-700">{m.nota}</p>
                <p className="text-[11px] text-ink-400">
                  {m.referenciaAnexo ? `Ref. ${m.referenciaAnexo} · ` : ""}
                  {m.marcadoPor ?? "—"} · {fmtDateTime(m.marcadoEn)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
