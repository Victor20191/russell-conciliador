"use client";

import { Fragment, useState } from "react";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { chevronDivulgacion } from "@/lib/ui/chevron-divulgacion";
import { fmt, fmtContable, fmtDateTime } from "@/lib/format";
import { CeldaMarca, MarcaModal } from "./marca-modal";
import {
  etiquetaFilaCruce,
  renglonesFilaCruce,
  type CruceRetencionPantalla,
  type FilaCruce,
  type ResultadoCrucePantalla,
  type SubtotalCruce,
} from "@/lib/impuestos/retencion/cruce";

// Cruce contable de la revisión: lo declarado en los 350 hasta el corte contra el saldo final de
// las cuentas del cliente homologadas a 2365/2367, con los terceros que lo sustentan al desplegar.

const BOTON_SECUNDARIO = "rounded-md border border-ink-200 px-2.5 py-1 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-60";
const NUM = "px-3 py-1.5 text-right tabular-nums whitespace-nowrap";
const COLUMNAS = 7;

const fecha = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

export function CruceRevision({ cruce, revisionId, puedeEditar }: { cruce: CruceRetencionPantalla; revisionId: number; puedeEditar: boolean }) {
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
  const [marcando, setMarcando] = useState<string | null>(null);

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
  const filas = resultado.grupos.flatMap((g) => g.filas);
  const filaMarcando = filas.find((f) => f.clave === marcando) ?? null;
  const conMarca = filas.filter((f) => f.marca).sort((a, b) => a.marca!.numero - b.marca!.numero);
  const alternar = (clave: string) =>
    setAbiertas((prev) => {
      const sig = new Set(prev);
      if (sig.has(clave)) sig.delete(clave);
      else sig.add(clave);
      return sig;
    });

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-1.5 p-4 text-[12.5px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-ink-700">
            Balance del corte: <span className="font-semibold text-navy-800">{balance.descripcion}</span> · del {fecha(balance.periodoInicio)} al {fecha(balance.periodoFin)}
          </span>
          {resultado.pendientesMarca > 0 ? (
            <Chip label={`${resultado.pendientesMarca} ${resultado.pendientesMarca === 1 ? "diferencia exige" : "diferencias exigen"} marca`} tone="warn" />
          ) : (
            <Chip label="Sin diferencias pendientes de marca" tone="ok" />
          )}
        </div>
        <p className="text-[11.5px] text-ink-500">
          Contabilidad = saldo final al corte de las cuentas del cliente homologadas a cada cuenta Russell, en positivo (son pasivos). En las cuentas que lo indican, el saldo de la DIAN (los pagos registrados en la misma cuenta) se muestra tachado y no suma. Diferencias desde {fmt(umbral)} exigen marca; por debajo son informativas (la DIAN redondea cada renglón a miles).
        </p>
        {!inicioEnero && (
          <p className="text-[11.5px] text-warn-700">El balance no empieza el 1 de enero: no se puede medir el saldo inicial que arrastran los terceros.</p>
        )}
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-150 bg-ink-50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              <th className="px-3 py-2">Concepto</th>
              <th className="px-3 py-2">Renglones</th>
              <th className="px-3 py-2 text-right">Declaraciones</th>
              <th className="px-3 py-2 text-right">Contabilidad</th>
              <th className="px-3 py-2 text-right">Diferencia</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-center">Marca</th>
            </tr>
          </thead>
          <tbody>
            {resultado.grupos.map((g) => (
              <Fragment key={g.grupo}>
                <tr className="bg-ink-50/60">
                  <td colSpan={COLUMNAS} className="px-3 py-1.5 text-[11.5px] font-semibold text-navy-800">{g.etiqueta}</td>
                </tr>
                {g.filas.map((f) => (
                  <Fragment key={f.clave}>
                    <FilaTabla fila={f} abierta={abiertas.has(f.clave)} onAlternar={() => alternar(f.clave)} puedeEditar={puedeEditar} onMarcar={() => setMarcando(f.clave)} />
                    {abiertas.has(f.clave) && (
                      <tr className="border-b border-ink-100 bg-ink-50/40">
                        <td colSpan={COLUMNAS} className="px-4 py-3">
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
      </Card>

      {resultado.fueraDelMapeo.length > 0 && <FueraDelMapeo filas={resultado.fueraDelMapeo} />}

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

function FilaTabla({ fila, abierta, onAlternar, puedeEditar, onMarcar }: { fila: FilaCruce; abierta: boolean; onAlternar: () => void; puedeEditar: boolean; onMarcar: () => void }) {
  return (
    <tr className="border-b border-ink-100 align-top">
      <td className="px-3 py-1.5">
        <button type="button" onClick={onAlternar} aria-expanded={abierta} className="flex items-start gap-1.5 text-left">
          <Icon name={chevronDivulgacion(abierta)} size={13} className="mt-0.5 shrink-0 text-ink-400" />
          <span className="flex flex-col">
            <span className="font-medium text-ink-800">{etiquetaFilaCruce(fila)}</span>
            <span className="text-[11px] text-ink-400">
              {fila.cuentaRussell
                ? `${fila.cuentaRussell}${fila.conceptos.length > 1 ? ` · ${fila.conceptos.length} conceptos` : fila.nombreCuenta ? ` · ${fila.nombreCuenta}` : ""}`
                : "Sin cuenta Russell · solo afecta lo declarado"}
              {fila.dianRestado !== 0 && ` · DIAN restada ${fmt(fila.dianRestado)}`}
            </span>
          </span>
        </button>
        {(fila.saldoInicial || fila.posiblesDian.length > 0) && (
          <div className="ml-5 mt-1 flex flex-wrap gap-1">
            {fila.saldoInicial && <Chip label="Saldo inicial" tone="warn" />}
            {fila.posiblesDian.length > 0 && <Chip label="¿DIAN sin NIT?" tone="warn" />}
          </div>
        )}
      </td>
      <td className="px-3 py-1.5 tabular-nums text-ink-500">{renglonesFilaCruce(fila)}</td>
      <td className={NUM}>{fmtContable(fila.declarado)}</td>
      <td className={NUM}>{fila.cuentaRussell ? fmtContable(fila.contable) : "—"}</td>
      <td className={`${NUM} font-semibold ${fila.nivel === "alerta" ? "text-err-700" : fila.nivel === "informativa" ? "text-ink-600" : "text-ok-700"}`}>{fmtContable(fila.diferencia)}</td>
      <td className="px-3 py-1.5"><EstadoFila fila={fila} /></td>
      <td className="px-3 py-1.5 text-center">
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
    <tr className={`border-b border-ink-150 font-semibold ${total ? "bg-navy-50 text-navy-800" : "text-ink-800"}`}>
      <td colSpan={2} className="px-3 py-1.5">{etiqueta}</td>
      <td className={NUM}>{fmtContable(subtotal.declarado)}</td>
      <td className={NUM}>{fmtContable(subtotal.contable)}</td>
      <td className={NUM}>{fmtContable(subtotal.diferencia)}</td>
      <td colSpan={2} />
    </tr>
  );
}

function DetalleFila({ fila, inicioEnero, ocultos }: { fila: FilaCruce; inicioEnero: boolean; ocultos: ResultadoCrucePantalla["tercerosOcultos"] }) {
  return (
    <div className="flex flex-col gap-3 text-[12px]">
      <div>
        <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Lo declarado (350 vigentes hasta el corte)</h4>
        <table className="text-[12px]">
          <tbody>
            {fila.conceptos.map((c) => (
              <tr key={c.concepto}>
                <td className="py-0.5 pr-4 text-ink-700">{c.etiqueta}</td>
                <td className="py-0.5 pr-4 tabular-nums text-ink-400">{c.renglones.join(" · ")}</td>
                <td className="py-0.5 text-right tabular-nums">{fmtContable(c.declarado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {fila.cuentaRussell && (
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">La contabilidad (saldo final al corte)</h4>
          {fila.cuentasCliente.length === 0 ? (
            <p className="text-ink-500">Ninguna cuenta del cliente está homologada a {fila.cuentaRussell} en este balance.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {fila.cuentasCliente.map((c) => {
                const oculto = ocultos[`${fila.clave}|${c.cuenta}`];
                return (
                  <div key={c.cuenta}>
                    <div className="flex flex-wrap items-baseline gap-x-2 font-medium text-ink-800">
                      <span className="tabular-nums">{c.cuenta}</span>
                      <span>{c.nombre}</span>
                      <span className="ml-auto tabular-nums">{fmtContable(c.saldo)}</span>
                    </div>
                    <div className="max-h-72 overflow-y-auto rounded border border-ink-100 bg-white">
                      <table className="w-full text-[11.5px]">
                        <thead>
                          <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
                            <th className="px-2 py-1">NIT</th>
                            <th className="px-2 py-1">Tercero</th>
                            {inicioEnero && <th className="px-2 py-1 text-right">Saldo inicial</th>}
                            <th className="px-2 py-1 text-right">Saldo final</th>
                            <th className="px-2 py-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {c.terceros.map((t, i) => (
                            <tr key={`${t.nit ?? "sin-nit"}-${i}`} className="border-t border-ink-100">
                              <td className={`px-2 py-0.5 tabular-nums ${t.restado ? "text-ink-400 line-through" : ""}`}>{t.nit ?? "—"}</td>
                              <td className={`px-2 py-0.5 ${t.restado ? "text-ink-400 line-through" : ""}`}>{t.nombre ?? "—"}</td>
                              {inicioEnero && <td className="px-2 py-0.5 text-right tabular-nums">{t.saldoInicial !== 0 ? fmtContable(t.saldoInicial) : ""}</td>}
                              <td className={`px-2 py-0.5 text-right tabular-nums ${t.restado ? "text-ink-400 line-through" : ""}`}>{fmtContable(t.saldo)}</td>
                              <td className="px-2 py-0.5">
                                {t.restado && <span className="text-[10.5px] font-semibold text-ink-500">DIAN · se resta</span>}
                                {t.esDian && !t.restado && <span className="text-[10.5px] font-semibold text-ink-500">DIAN · esta cuenta no la resta</span>}
                                {t.posibleDian && <span className="text-[10.5px] font-semibold text-warn-700">¿Es la DIAN? Sin NIT: no se resta sola</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {oculto && <p className="mt-0.5 text-[11px] text-ink-400">Y {oculto.cantidad} terceros más por {fmtContable(oculto.saldo)}. En el Excel van todos.</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {fila.saldoInicial && (
        <p className="text-warn-700">
          {fila.saldoInicial.terceros} {fila.saldoInicial.terceros === 1 ? "tercero trae" : "terceros traen"} saldo inicial por {fmtContable(fila.saldoInicial.monto)}: el saldo final puede arrastrar retenciones de períodos anteriores. No cambia la cifra del cruce.
        </p>
      )}
      {fila.posiblesDian.length > 0 && (
        <p className="text-warn-700">Sin NIT pero con nombre de la DIAN: {fila.posiblesDian.join(", ")}. No se resta sola; si es un pago, revisa el tercero en el balance.</p>
      )}
      {fila.marca && !fila.marca.vigente && (
        <p className="text-warn-700">La marca {fila.marca.numero} se escribió con una diferencia de {fmtContable(fila.marca.diferencia)} y hoy es {fmtContable(fila.diferencia)}: revísala.</p>
      )}
    </div>
  );
}

function FueraDelMapeo({ filas }: { filas: ResultadoCrucePantalla["fueraDelMapeo"] }) {
  return (
    <Card className="p-4 text-[12.5px]">
      <h3 className="text-[12.5px] font-semibold text-navy-800">Cuentas de retención fuera del cruce</h3>
      <p className="mt-0.5 text-[11.5px] text-ink-500">
        Cuentas del cliente en 2365 o 2367 homologadas a una cuenta Russell que no está en el mapeo del 350 (por ejemplo 236599 «Pago de retención en la fuente»). Se informan y no suman al cruce.
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
