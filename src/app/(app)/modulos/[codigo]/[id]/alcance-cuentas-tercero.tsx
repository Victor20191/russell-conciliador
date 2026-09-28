"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtContable } from "@/lib/format";
import { chevronDivulgacion } from "@/lib/ui/chevron-divulgacion";
import type { AlcanceCruceTercero, CuentaAlcanceTercero } from "@/lib/modulos/cartera/alcance-cruce-tercero";

// Panel «Cuentas en este cruce» de la pestaña Cruce por tercero: qué cuentas Russell se tienen en
// cuenta, por qué entran, cuánto trae cada lado y qué queda fuera. Es de consulta y va PLEGADO:
// el consultor lo abre cuando quiere revisar el alcance antes de decidir (agregar una cuenta al
// módulo, asignarla solo para el período o asignar una cuenta del archivo en el Consolidado).

const contar = (n: number) => n.toLocaleString("es-CO");
const conSaldo = (v: number) => Math.abs(v) > 0.005;
const tieneSaldo = (c: CuentaAlcanceTercero) =>
  conSaldo(c.contable.total) || conSaldo(c.contable.sinTercero) || conSaldo(c.auxiliar.total) || conSaldo(c.auxiliar.sinTercero) || c.grupo != null;

function SinTercero({ valor }: { valor: number }) {
  if (!conSaldo(valor)) return null;
  return <div className="text-[11px] text-ink-500" title="Saldo sin tercero identificado: no entra al cruce.">+ {fmtContable(valor)} sin tercero</div>;
}

export function AlcanceCuentasTercero({
  alcance,
  periodo,
  listaDelCierre,
  enlaceCuentasModulo,
  abiertoInicial = false,
  contableNoModular,
  contableExcluidoFilas,
  onIrConsolidado,
}: {
  alcance: AlcanceCruceTercero;
  periodo: string;
  /** La conciliación del período está en firme: rige la lista de cuentas guardada al cerrar. */
  listaDelCierre: boolean;
  /** Filtros de cuentas del módulo (con regreso a esta pestaña); null si el usuario no los administra. */
  enlaceCuentasModulo: { href: string; modulo: string } | null;
  /** Abre desplegado (se vuelve de Filtros de cuentas). */
  abiertoInicial?: boolean;
  contableNoModular: { total: number; filas: number; cuentas: string[] };
  contableExcluidoFilas: number;
  onIrConsolidado?: () => void;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const { cuentas, grupos, auxiliarSinDesglose, fueraDelModulo, archivoSinAsignar } = alcance;
  const delModulo = cuentas.filter((c) => c.fuente === "modulo").length;
  const delPeriodo = cuentas.filter((c) => c.fuente === "periodo").length;
  const conMovimiento = cuentas.filter(tieneSaldo).length;
  const fuera = fueraDelModulo.length + contableNoModular.cuentas.length + archivoSinAsignar.length;
  const conOrigen = cuentas.some((c) => c.origen != null);
  const totalContable = cuentas.reduce((s, c) => s + c.contable.total, 0);
  const totalAuxiliar = cuentas.reduce((s, c) => s + c.auxiliar.total, 0)
    + grupos.reduce((s, g) => s + g.compartido, 0)
    + (auxiliarSinDesglose?.total ?? 0);
  const columnas = conOrigen ? 9 : 8;

  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-[12px] hover:bg-ink-50"
      >
        <Icon name={chevronDivulgacion(abierto)} size={13} className="text-ink-500" />
        <b className="text-ink-800">Cuentas en este cruce</b>
        <span className="text-ink-500">
          {contar(delModulo)} {delModulo === 1 ? "cuenta del módulo" : "cuentas del módulo"}
          {delPeriodo > 0 && <> · {contar(delPeriodo)} solo {periodo}</>}
          {" · "}{contar(conMovimiento)} con saldo
        </span>
        {fuera > 0 && <span className="text-warn-700">{contar(fuera)} fuera del cruce</span>}
        <span className="ml-auto text-[11.5px] font-semibold text-blue-700">{abierto ? "Ocultar" : "Ver cuentas"}</span>
      </button>

      {abierto && (
        <div className="flex flex-col gap-3 border-t border-ink-100 px-3 py-3">
          <p className="text-[11.5px] leading-snug text-ink-500">
            {listaDelCierre
              ? "La conciliación del período está en firme: rige la lista de cuentas guardada al cerrarla, aunque Filtros de cuentas cambie después."
              : "Son las cuentas que el módulo concilia según Filtros de cuentas; un cambio en esa lista rige de inmediato en este cruce."}
            {delPeriodo > 0 && <> Las marcadas «Solo {periodo}» las asignó el Consolidado únicamente para este período.</>}
            {" "}El auxiliar entra por la cuenta del módulo que el Consolidado le asignó a cada cuenta del archivo.
            {enlaceCuentasModulo
              ? " La lista es la misma para todos los clientes: «Filtros de cuentas» la edita y te regresa aquí."
              : " La lista es la misma para todos los clientes y solo un administrador la cambia en Filtros de cuentas."}
          </p>

          {/* La barra queda fuera del scroll horizontal: con la tabla desplazada, el enlace sigue a la vista. */}
          <div className="overflow-hidden rounded-md border border-ink-150">
            {enlaceCuentasModulo && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-white px-3 py-1.5">
                <span className="min-w-0 text-[11.5px] text-ink-500">Cuentas que concilia {enlaceCuentasModulo.modulo} para todos los clientes</span>
                <Link
                  href={enlaceCuentasModulo.href}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-navy-700 hover:border-navy-700 hover:bg-blue-50"
                  title={`Filtros de cuentas › ${enlaceCuentasModulo.modulo}: agregar o quitar las cuentas que concilia el módulo.`}
                >
                  <Icon name="settings" size={13} />
                  Filtros de cuentas · {enlaceCuentasModulo.modulo}
                </Link>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-ink-50 text-left text-ink-500">
                  <tr>
                    <th className="px-3 py-1.5 font-semibold">Cuenta</th>
                    <th className="px-3 py-1.5 font-semibold">Nombre</th>
                    {conOrigen && <th className="px-3 py-1.5 font-semibold">Origen</th>}
                    <th className="px-3 py-1.5 text-right font-semibold">Contabilidad</th>
                    <th className="px-3 py-1.5 text-right font-semibold" title="Terceros con saldo en la cuenta">Terc.</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Auxiliar (módulo)</th>
                    <th className="px-3 py-1.5 text-right font-semibold" title="Terceros con saldo en la cuenta">Terc.</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Diferencia</th>
                    <th className="px-3 py-1.5 font-semibold">Cuentas del archivo</th>
                  </tr>
                </thead>
                <tbody>
                  {cuentas.map((c) => {
                    const diferencia = c.contable.total - c.auxiliar.total;
                    const enGrupo = c.grupo != null;
                    const soloGrupo = enGrupo && !conSaldo(c.auxiliar.total) && !conSaldo(c.auxiliar.sinTercero);
                    const sinAsignar = conSaldo(c.contable.total) && c.auxiliar.cuentasArchivo.length === 0 && !enGrupo;
                    return (
                      <tr key={c.cuenta} className={`border-t border-ink-100 align-top ${tieneSaldo(c) ? "" : "text-ink-400"}`}>
                        <td className="whitespace-nowrap px-3 py-1.5">
                          <span className={`font-semibold ${tieneSaldo(c) ? "text-ink-800" : ""}`}>{c.cuenta}</span>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {c.fuente === "periodo" && (
                              <span title={`No es de la lista del módulo: el Consolidado la asignó solo para ${periodo}.`}><Chip label={`Solo ${periodo}`} tone="warn" /></span>
                            )}
                            {c.fueraDePrefijos && (
                              <span title="Está en la lista del módulo aunque su subgrupo no esté en los prefijos del prevalidador: se concilia por saldo final."><Chip label="Fuera de los prefijos" tone="ink" /></span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-1.5">{c.nombre ?? "—"}{!tieneSaldo(c) && <span className="ml-1 text-[11px]">· sin saldo en el período</span>}</td>
                        {conOrigen && <td className="px-3 py-1.5">{c.origen === "exterior" ? "Exterior" : c.origen === "nacional" ? "Nacional" : "—"}</td>}
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{fmtContable(c.contable.total)}<SinTercero valor={c.contable.sinTercero} /></td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{contar(c.contable.terceros)}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                          {soloGrupo ? (
                            <span className="text-[11px] text-ink-500">En el grupo {c.grupo! + 1}</span>
                          ) : (
                            <>
                              {fmtContable(c.auxiliar.total)}
                              <SinTercero valor={c.auxiliar.sinTercero} />
                              {enGrupo && <div className="text-[11px] text-ink-500">+ su parte del grupo {c.grupo! + 1}</div>}
                            </>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{soloGrupo ? "—" : contar(c.auxiliar.terceros)}</td>
                        <td
                          className={`whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums ${enGrupo ? "font-normal text-ink-400" : conSaldo(diferencia) ? "text-err-700" : "text-ok-700"}`}
                          title={enGrupo ? `El auxiliar de esta cuenta está asignado junto con otras: la diferencia se lee en el grupo ${c.grupo! + 1}.` : undefined}
                        >
                          {enGrupo ? `Grupo ${c.grupo! + 1}` : fmtContable(diferencia)}
                        </td>
                        <td className="px-3 py-1.5">
                          {c.auxiliar.cuentasArchivo.length > 0 ? (
                            <span className="text-ink-600">{c.auxiliar.cuentasArchivo.join(" · ")}</span>
                          ) : enGrupo ? (
                            <span className="text-ink-500">Las del grupo {c.grupo! + 1}</span>
                          ) : sinAsignar ? (
                            <span className="text-warn-700">
                              Ninguna asignada
                              {onIrConsolidado && (
                                <button type="button" onClick={onIrConsolidado} className="ml-1.5 font-semibold text-blue-700 hover:underline">Ir al Consolidado</button>
                              )}
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {grupos.length > 0 && (
                    <tr className="border-t-2 border-ink-200 bg-ink-50/60">
                      <td colSpan={columnas} className="px-3 py-1.5 text-[11.5px] text-ink-600">
                        <b className="text-ink-700">Cuentas asignadas juntas en el Consolidado.</b>{" "}
                        Un renglón del Consolidado con varias cuentas no se reparte entre ellas: esas cuentas se comparan en conjunto.
                      </td>
                    </tr>
                  )}
                  {grupos.map((g, i) => {
                    const diferencia = g.contable.total - g.auxiliar.total;
                    return (
                      <tr key={g.cuentas.join("+")} className="border-t border-ink-100 align-top">
                        <td className="px-3 py-1.5" colSpan={conOrigen ? 3 : 2}>
                          <span className="font-semibold text-ink-800">Grupo {i + 1}</span>
                          <span className="ml-2 text-ink-600">{g.cuentas.join(" + ")}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{fmtContable(g.contable.total)}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{contar(g.contable.terceros)}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{fmtContable(g.auxiliar.total)}<SinTercero valor={g.auxiliar.sinTercero} /></td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{contar(g.auxiliar.terceros)}</td>
                        <td className={`whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums ${conSaldo(diferencia) ? "text-err-700" : "text-ok-700"}`}>{fmtContable(diferencia)}</td>
                        <td className="px-3 py-1.5 text-ink-600">{g.cuentasArchivo.join(" · ")}</td>
                      </tr>
                    );
                  })}
                  {auxiliarSinDesglose && (
                    <tr className="border-t border-ink-100 align-top">
                      <td className="px-3 py-1.5 text-ink-600" colSpan={conOrigen ? 5 : 4}>Auxiliar sin cuenta por fila (el módulo no las asigna en el Consolidado)</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{fmtContable(auxiliarSinDesglose.total)}<SinTercero valor={auxiliarSinDesglose.sinTercero} /></td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{contar(auxiliarSinDesglose.terceros)}</td>
                      <td className="px-3 py-1.5" colSpan={2} />
                    </tr>
                  )}
                  {cuentas.length === 0 && (
                    <tr><td colSpan={columnas} className="px-3 py-4 text-center text-ink-400">El módulo no tiene cuentas para conciliar.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-200 bg-ink-50 font-semibold text-ink-800">
                    <td className="px-3 py-1.5" colSpan={conOrigen ? 3 : 2}>Total en el cruce</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{fmtContable(totalContable)}</td>
                    <td />
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{fmtContable(totalAuxiliar)}</td>
                    <td />
                    <td className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${conSaldo(totalContable - totalAuxiliar) ? "text-err-700" : "text-ok-700"}`}>{fmtContable(totalContable - totalAuxiliar)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {(fuera > 0 || contableExcluidoFilas > 0) && (
            <div className="flex flex-col gap-2 rounded-md border border-warn-500 bg-warn-100/20 px-3 py-2 text-[12px] text-ink-700">
              <b className="text-warn-700">No entran al cruce</b>
              {fueraDelModulo.length > 0 && (
                <div>
                  <div className="font-semibold">Cuentas del grupo con saldo que no son del módulo</div>
                  <ul className="mt-0.5 flex flex-col gap-0.5">
                    {fueraDelModulo.map((f) => (
                      <li key={f.cuenta} className="tabular-nums">
                        <b>{f.cuenta}</b> {f.nombre ?? ""} · {fmtContable(f.total)} · {contar(f.terceros)} {f.terceros === 1 ? "tercero" : "terceros"}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-0.5 text-[11.5px] text-ink-500">
                    Si alguna debe conciliarse,{" "}
                    {enlaceCuentasModulo ? (
                      <Link href={enlaceCuentasModulo.href} className="font-semibold text-blue-700 hover:underline">agrégala a las cuentas de {enlaceCuentasModulo.modulo}</Link>
                    ) : (
                      "un administrador puede agregarla en Filtros de cuentas"
                    )}
                    {" "}(todos los clientes) o asígnala solo para {periodo} desde el Consolidado con «Buscar…».
                  </div>
                </div>
              )}
              {contableNoModular.cuentas.length > 0 && (
                <div>
                  <div className="font-semibold">Cuentas del cliente marcadas no modulares en el cruce contable</div>
                  <div className="tabular-nums">{contableNoModular.cuentas.join(" · ")} · {fmtContable(contableNoModular.total)}</div>
                </div>
              )}
              {archivoSinAsignar.length > 0 && (
                <div>
                  <div className="font-semibold">
                    Cuentas del archivo sin una cuenta del módulo asignada en el Consolidado
                    {onIrConsolidado && (
                      <button type="button" onClick={onIrConsolidado} className="ml-2 font-semibold text-blue-700 hover:underline">Asignar en el Consolidado</button>
                    )}
                  </div>
                  <ul className="mt-0.5 flex flex-col gap-0.5">
                    {archivoSinAsignar.map((f) => (
                      <li key={f.cuentaArchivo} className="tabular-nums">
                        <b>{f.cuentaArchivo}</b> · {fmtContable(f.total)} · {contar(f.terceros)} {f.terceros === 1 ? "tercero" : "terceros"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {contableExcluidoFilas > 0 && (
                <div className="text-ink-600">
                  {contar(contableExcluidoFilas)} {contableExcluidoFilas === 1 ? "fila contable" : "filas contables"} sin homologación Russell o sin regla activa del prevalidador para el módulo.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
