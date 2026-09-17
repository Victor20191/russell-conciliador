// CONTROLES DEL FORMATO (Cartera y CxP): una barra por control que pide el tipo del archivo —
// documentos contra el total del cliente, edades contra el total— con su veredicto, o «sin
// validar» y el porqué cuando el archivo no trae con qué comparar. Lo usan el borrador (resumen,
// dentro de «Validación del archivo») y las Novedades del dato cargado (con las tablas).
import { fmtContable, fmtNum } from "@/lib/format";
import type { ControlesFormatoCartera, EstadoControlFormato } from "@/lib/modulos/cartera/controles-formato";
import { INFO_TIPO_FORMATO } from "@/lib/modulos/cartera/tipo-formato";

const TONO: Record<EstadoControlFormato, string> = {
  cuadra: "border-ok-100 bg-ok-100/40 text-ok-700",
  descuadre: "border-err-200 bg-err-50 text-err-700",
  no_validado: "border-ink-150 bg-ink-50 text-ink-600",
};
const VEREDICTO: Record<EstadoControlFormato, string> = {
  cuadra: "cuadra",
  descuadre: "no coincide",
  no_validado: "sin validar",
};
const encabezadoTabla = "bg-ink-50 text-left text-ink-500";
const celda = "px-2.5 py-1.5";
/** Diferencias que se nombran en el resumen del borrador (el detalle completo va en Novedades). */
const EN_RESUMEN = 4;

function Mas({ cantidad, mostradas }: { cantidad: number; mostradas: number }) {
  if (cantidad <= mostradas) return null;
  return <div className="mt-1 text-[11.5px] text-ink-500">y {fmtNum(cantidad - mostradas)} más.</div>;
}

const plural = (n: number, uno: string, varios: string) => `${fmtNum(n)} ${n === 1 ? uno : varios}`;

export function ControlesFormato({
  controles,
  detalle = false,
}: {
  controles: ControlesFormatoCartera;
  /** Con tablas de diferencias (Novedades); sin él, un resumen de una línea (borrador). */
  detalle?: boolean;
}) {
  const { documentosVsCliente: docs, edadesVsTotal: edades } = controles;
  const formato = controles.tipos.map((t) => INFO_TIPO_FORMATO[t].etiqueta).join(" + ");
  return (
    <div className="flex flex-col gap-1.5" aria-label="Controles del formato">
      <div className="text-[11.5px] text-ink-600">
        <span className="font-semibold text-ink-700">Formato: {formato}</span>
        {controles.deducido ? " · deducido del mapeo, el patrón no lo declara" : ""}
      </div>

      {docs && (
        <div className={`rounded-md border px-3 py-2 text-[12px] ${TONO[docs.estado]}`}>
          <span className="font-semibold">Documentos vs total del cliente — {VEREDICTO[docs.estado]}:</span>{" "}
          {docs.estado === "no_validado" ? (
            docs.motivo
          ) : docs.estado === "cuadra" ? (
            <>
              {docs.comparados === 1 ? "el cliente con total coincide" : `los ${fmtNum(docs.comparados)} clientes con total coinciden`} con la
              suma de sus documentos (<span className="font-semibold">{fmtContable(docs.totales.declarado)}</span>).
            </>
          ) : (
            <>
              {plural(docs.diferencias.cantidad, "cliente difiere", "clientes difieren")} de la suma de sus documentos
              {" "}(Δ total <span className="font-semibold">{fmtContable(docs.totales.diferencia)}</span>).
              {!detalle && (
                <>
                  {" "}
                  {docs.diferencias.filas.slice(0, EN_RESUMEN).map((f) => `${f.nombre ?? f.claveTercero}: total ${fmtContable(f.declarado)} vs Σ ${fmtContable(f.calculado)}`).join("; ")}
                  {docs.diferencias.cantidad > EN_RESUMEN ? "…" : "."}
                </>
              )}
            </>
          )}
          {docs.sinTotal > 0 && (
            <span className="ml-1 opacity-80">{plural(docs.sinTotal, "cliente no trae", "clientes no traen")} total en el archivo.</span>
          )}
        </div>
      )}
      {detalle && docs && docs.diferencias.cantidad > 0 && (
        <div>
          <div className="overflow-x-auto rounded-md border border-ink-150">
            <table className="w-full text-[12px]">
              <thead className={encabezadoTabla}>
                <tr>
                  <th className={`${celda} font-semibold`}>Cliente</th>
                  <th className={`${celda} font-semibold`}>Identificación</th>
                  <th className={`${celda} text-right font-semibold`}>Total del archivo</th>
                  <th className={`${celda} text-right font-semibold`}>Σ documentos</th>
                  <th className={`${celda} text-right font-semibold`}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {docs.diferencias.filas.map((f) => (
                  <tr key={f.claveTercero} className="border-t border-ink-100">
                    <td className={`${celda} text-ink-700`}>{f.nombre ?? "—"}</td>
                    <td className={`${celda} tabular-nums text-ink-500`}>{f.claveTercero.startsWith("~") ? "—" : f.claveTercero}</td>
                    <td className={`${celda} text-right tabular-nums text-ink-700`}>{fmtContable(f.declarado)}</td>
                    <td className={`${celda} text-right tabular-nums text-ink-700`}>{f.estado === "solo_declarado" ? "sin documentos" : fmtContable(f.calculado)}</td>
                    <td className={`${celda} text-right font-semibold tabular-nums text-err-700`}>{fmtContable(f.diferencia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Mas cantidad={docs.diferencias.cantidad} mostradas={docs.diferencias.filas.length} />
        </div>
      )}

      {edades && (
        <div className={`rounded-md border px-3 py-2 text-[12px] ${TONO[edades.estado]}`}>
          <span className="font-semibold">Edades vs total — {VEREDICTO[edades.estado]}:</span>{" "}
          {edades.estado === "no_validado" ? (
            edades.motivo
          ) : edades.estado === "cuadra" ? (
            <>en {edades.comparadas === 1 ? "la fila" : `las ${fmtNum(edades.comparadas)} filas`} con edades y total, las edades suman el total.</>
          ) : (
            <>
              en {plural(edades.diferencias.cantidad, "fila", "filas")} de {fmtNum(edades.comparadas)} la suma de las edades no es el total.
              {!detalle && (
                <>
                  {" "}
                  {edades.diferencias.filas.slice(0, EN_RESUMEN).map((f) => `fila ${f.filaNum} (${f.tercero}): total ${fmtContable(f.total)} vs Σ ${fmtContable(f.sumaEdades)}`).join("; ")}
                  {edades.diferencias.cantidad > EN_RESUMEN ? "…" : "."}
                </>
              )}
            </>
          )}
        </div>
      )}
      {detalle && edades && edades.diferencias.cantidad > 0 && (
        <div>
          <div className="overflow-x-auto rounded-md border border-ink-150">
            <table className="w-full text-[12px]">
              <thead className={encabezadoTabla}>
                <tr>
                  <th className={`${celda} font-semibold`}>Fila</th>
                  <th className={`${celda} font-semibold`}>Tercero</th>
                  <th className={`${celda} font-semibold`}>Documento</th>
                  <th className={`${celda} text-right font-semibold`}>Total</th>
                  <th className={`${celda} text-right font-semibold`}>Σ edades</th>
                  <th className={`${celda} text-right font-semibold`}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {edades.diferencias.filas.map((f) => (
                  <tr key={f.filaNum} className="border-t border-ink-100">
                    <td className={`${celda} tabular-nums text-ink-500`}>{f.filaNum}</td>
                    <td className={`${celda} text-ink-700`}>{f.tercero}</td>
                    <td className={`${celda} text-ink-700`}>{f.documento ?? "—"}</td>
                    <td className={`${celda} text-right tabular-nums text-ink-700`}>{fmtContable(f.total)}</td>
                    <td className={`${celda} text-right tabular-nums text-ink-700`}>{fmtContable(f.sumaEdades)}</td>
                    <td className={`${celda} text-right font-semibold tabular-nums text-err-700`}>{fmtContable(f.diferencia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Mas cantidad={edades.diferencias.cantidad} mostradas={edades.diferencias.filas.length} />
        </div>
      )}
    </div>
  );
}
