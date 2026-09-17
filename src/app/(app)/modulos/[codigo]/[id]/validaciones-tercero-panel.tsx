import { Card } from "@/components/ui";
import { fmtContable } from "@/lib/format";
import type { ValidacionesTercero } from "@/lib/modulos/cartera/validaciones-tercero";
import { ControlesFormato } from "../controles-formato";

const encabezadoTabla = "bg-ink-50 text-left text-ink-500";
const celda = "px-2.5 py-1.5";
const fechaLegible = (iso: string) => iso.split("-").reverse().join("/");

function Mas({ cantidad, mostradas }: { cantidad: number; mostradas: number }) {
  if (cantidad <= mostradas) return null;
  return <div className="mt-1 text-[11.5px] text-ink-500">y {(cantidad - mostradas).toLocaleString("es-CO")} más.</div>;
}

/** Novedades de Cartera y CxP: lo que el auxiliar por tercero muestra que hay que revisar. */
export function ValidacionesTerceroPanel({ validaciones }: { validaciones: ValidacionesTercero }) {
  const { formato, documentosRepetidos, posiblesColisiones, saldosContrarios, corte, diasVsCorte, edadVsCorte, vencimientosAtipicos } = validaciones;
  // Las diferencias del formato (edades y documentos contra el total) se ven en su bloque.
  const otras = validaciones.total - validaciones.edadesVsTotal.cantidad - (formato.documentosVsCliente?.diferencias.cantidad ?? 0);
  return (
    <Card className="p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Validaciones del auxiliar por tercero</div>
      <div className="mb-4">
        <ControlesFormato controles={formato} detalle />
      </div>
      {otras === 0 ? (
        <div className="rounded-md border border-ok-500 bg-ok-100/30 px-3 py-1.5 text-[12px] text-ok-700">
          ✓ Las edades cuadran con la fecha de corte, no hay documentos repetidos entre terceros ni claves que colisionen, y la contabilidad de los terceros no tiene saldos contrarios a su naturaleza por encima del umbral.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {corte.fecha && corte.deducido && (
            <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] text-warn-700">
              Los días vencidos del archivo están calculados al <b>{fechaLegible(corte.deducido.fecha)}</b> ({corte.deducido.coincidencias} de {corte.deducido.filasConDias} documentos con días), no al corte del cargue ({fechaLegible(corte.fecha)}): sus edades están corridas. Pide el reporte al corte o ajusta la fecha de corte del cargue.
            </div>
          )}

          {diasVsCorte.cantidad > 0 && (
            <section>
              <div className="mb-1 text-[12.5px] font-semibold text-warn-700">
                {diasVsCorte.cantidad.toLocaleString("es-CO")} {diasVsCorte.cantidad === 1 ? "documento tiene" : "documentos tienen"} días vencidos que no corresponden a la fecha de corte
              </div>
              <div className="overflow-x-auto rounded-md border border-ink-150">
                <table className="w-full text-[12px]">
                  <thead className={encabezadoTabla}>
                    <tr><th className={`${celda} font-semibold`}>Fila</th><th className={`${celda} font-semibold`}>Tercero</th><th className={`${celda} font-semibold`}>Documento</th><th className={`${celda} font-semibold`}>Vencimiento</th><th className={`${celda} text-right font-semibold`}>Días en el archivo</th><th className={`${celda} text-right font-semibold`}>Días al corte</th></tr>
                  </thead>
                  <tbody>
                    {diasVsCorte.filas.map((f) => (
                      <tr key={f.filaNum} className="border-t border-ink-100">
                        <td className={`${celda} tabular-nums text-ink-500`}>{f.filaNum}</td>
                        <td className={`${celda} text-ink-700`}>{f.tercero}</td>
                        <td className={`${celda} text-ink-700`}>{f.documento ?? "—"}</td>
                        <td className={`${celda} tabular-nums text-ink-700`}>{fechaLegible(f.vencimiento)}</td>
                        <td className={`${celda} text-right tabular-nums text-ink-700`}>{f.diasArchivo}</td>
                        <td className={`${celda} text-right font-semibold tabular-nums text-warn-700`}>{f.diasAlCorte}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Mas cantidad={diasVsCorte.cantidad} mostradas={diasVsCorte.filas.length} />
            </section>
          )}

          {edadVsCorte.cantidad > 0 && (
            <section>
              <div className="mb-1 text-[12.5px] font-semibold text-warn-700">
                {edadVsCorte.cantidad.toLocaleString("es-CO")} {edadVsCorte.cantidad === 1 ? "documento está" : "documentos están"} en un rango de edad que no corresponde a sus días al corte
              </div>
              <div className="overflow-x-auto rounded-md border border-ink-150">
                <table className="w-full text-[12px]">
                  <thead className={encabezadoTabla}>
                    <tr><th className={`${celda} font-semibold`}>Fila</th><th className={`${celda} font-semibold`}>Tercero</th><th className={`${celda} font-semibold`}>Documento</th><th className={`${celda} font-semibold`}>Rango del archivo</th><th className={`${celda} text-right font-semibold`}>Días al corte</th></tr>
                  </thead>
                  <tbody>
                    {edadVsCorte.filas.map((f) => (
                      <tr key={f.filaNum} className="border-t border-ink-100">
                        <td className={`${celda} tabular-nums text-ink-500`}>{f.filaNum}</td>
                        <td className={`${celda} text-ink-700`}>{f.tercero}</td>
                        <td className={`${celda} text-ink-700`}>{f.documento ?? "—"}</td>
                        <td className={`${celda} text-ink-700`}>{f.rango}</td>
                        <td className={`${celda} text-right font-semibold tabular-nums text-warn-700`}>{f.diasAlCorte}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Mas cantidad={edadVsCorte.cantidad} mostradas={edadVsCorte.filas.length} />
            </section>
          )}

          {vencimientosAtipicos.cantidad > 0 && (
            <section>
              <div className="mb-1 text-[12.5px] font-semibold text-warn-700">
                {vencimientosAtipicos.cantidad.toLocaleString("es-CO")} {vencimientosAtipicos.cantidad === 1 ? "documento tiene" : "documentos tienen"} una fecha de vencimiento imposible
              </div>
              <ul className="flex flex-col gap-0.5 text-[12px] text-ink-700">
                {vencimientosAtipicos.filas.map((f) => (
                  <li key={f.filaNum}>Fila {f.filaNum} · {f.tercero}{f.documento ? ` · ${f.documento}` : ""}: vence el {fechaLegible(f.vencimiento)}.</li>
                ))}
              </ul>
              <Mas cantidad={vencimientosAtipicos.cantidad} mostradas={vencimientosAtipicos.filas.length} />
            </section>
          )}

          {documentosRepetidos.cantidad > 0 && (
            <section>
              <div className="mb-1 text-[12.5px] font-semibold text-err-700">
                ⚠ {documentosRepetidos.cantidad.toLocaleString("es-CO")} {documentosRepetidos.cantidad === 1 ? "documento aparece" : "documentos aparecen"} por el mismo valor bajo terceros distintos
              </div>
              <div className="overflow-x-auto rounded-md border border-ink-150">
                <table className="w-full text-[12px]">
                  <thead className={encabezadoTabla}>
                    <tr><th className={`${celda} font-semibold`}>Documento</th><th className={`${celda} text-right font-semibold`}>Valor</th><th className={`${celda} font-semibold`}>Terceros (filas)</th></tr>
                  </thead>
                  <tbody>
                    {documentosRepetidos.grupos.map((g) => (
                      <tr key={`${g.documento}|${g.valor}`} className="border-t border-ink-100 align-top">
                        <td className={`${celda} font-medium text-ink-800`}>{g.documento}</td>
                        <td className={`${celda} text-right tabular-nums text-ink-700`}>{fmtContable(g.valor)}</td>
                        <td className={`${celda} text-ink-700`}>
                          {g.terceros.map((t) => `${t.nombre ?? (t.clave.startsWith("~") ? t.clave.slice(1) : t.clave)} (${t.filas.join(", ")})`).join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Mas cantidad={documentosRepetidos.cantidad} mostradas={documentosRepetidos.grupos.length} />
            </section>
          )}

          {posiblesColisiones.length > 0 && (
            <section>
              <div className="mb-1 text-[12.5px] font-semibold text-warn-700">
                {posiblesColisiones.length} {posiblesColisiones.length === 1 ? "clave junta" : "claves juntan"} identificaciones de terceros con nombres distintos
              </div>
              <ul className="flex flex-col gap-0.5 text-[12px] text-ink-700">
                {posiblesColisiones.map((c) => (
                  <li key={c.clave}>
                    <b>{c.clave}</b>: {c.identificaciones.map((i) => `${i.documento} ${i.nombre ?? ""}`.trim()).join(" · ")}. Confirma si es un dígito de verificación o son terceros distintos.
                  </li>
                ))}
              </ul>
            </section>
          )}

          {saldosContrarios.cantidad > 0 && (
            <section>
              <div className="mb-1 text-[12.5px] font-semibold text-warn-700">
                {saldosContrarios.cantidad.toLocaleString("es-CO")} {saldosContrarios.cantidad === 1 ? "saldo contable" : "saldos contables"} de terceros contrarios a la naturaleza de su cuenta
              </div>
              <div className="overflow-x-auto rounded-md border border-ink-150">
                <table className="w-full text-[12px]">
                  <thead className={encabezadoTabla}>
                    <tr><th className={`${celda} font-semibold`}>NIT</th><th className={`${celda} font-semibold`}>Nombre</th><th className={`${celda} font-semibold`}>Cuenta</th><th className={`${celda} text-right font-semibold`}>Saldo</th></tr>
                  </thead>
                  <tbody>
                    {saldosContrarios.filas.map((s) => (
                      <tr key={`${s.clave}|${s.cuenta}`} className="border-t border-ink-100">
                        <td className={`${celda} font-medium text-ink-800`}>{s.clave.startsWith("~") ? "—" : s.clave}</td>
                        <td className={`${celda} text-ink-700`}>{s.nombre ?? "—"}</td>
                        <td className={`${celda} tabular-nums text-ink-700`}>{s.cuenta}</td>
                        <td className={`${celda} text-right font-semibold tabular-nums text-warn-700`}>{fmtContable(s.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Mas cantidad={saldosContrarios.cantidad} mostradas={saldosContrarios.filas.length} />
            </section>
          )}
        </div>
      )}
    </Card>
  );
}
