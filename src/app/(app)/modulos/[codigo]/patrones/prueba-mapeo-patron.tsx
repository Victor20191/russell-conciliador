"use client";

// «Probar el mapeo»: el editor de patrones mapea columnas a ciegas —solo se ven dos celdas al
// lado de cada selector— y hasta ahora no había forma de saber si el patrón leería bien el
// archivo antes de guardarlo y aprobarlo. Este panel pide al servidor la MISMA lectura que hace
// el guardado (`revisarMapeoMuestra`) y muestra las primeras filas tal como quedan: qué fila del
// archivo es, si suma o no y por qué, y qué sacó el motor en cada columna.
//
// Es de SOLO LECTURA: no toca el mapeo del editor, así que probar nunca hace perder trabajo.
// Bajo demanda a propósito: en una versión nueva cada prueba vuelve a subir la muestra.
import { useState, useTransition } from "react";
import { Card, Chip } from "@/components/ui";
import { notifyError } from "@/lib/client-notifications";
import { probarMapeoPatron } from "@/app/actions/patrones-modulo";
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";
import type { OrigenPruebaMapeo, ResultadoPruebaMapeo } from "@/lib/modulos/extraccion/vista-prueba-mapeo";
import { LIMITE_FILAS_PRUEBA } from "@/lib/modulos/extraccion/vista-prueba-mapeo";
import { textoCeldaDetalle } from "@/lib/modulos/celda-detalle-modulo";

/** De dónde sale el archivo que se prueba: lo que el editor tenga a mano en ese momento. */
export type FuentePrueba =
  | { tipo: "muestra"; archivo: File }
  | { tipo: "version"; id: number }
  | { tipo: "original"; recepcionLoteId: string };

type Resultado = Extract<ResultadoPruebaMapeo, { ok: true }>;

const esNumerica = (tipo: string) => tipo === "numero" || tipo === "moneda";

function OrigenProbado({ origen }: { origen: OrigenPruebaMapeo }) {
  if (origen.tipo === "original") {
    return (
      <>
        Probado sobre «{origen.nombre}» de {origen.cliente} — archivo de referencia, no es la muestra del patrón.
      </>
    );
  }
  return <>Probado sobre «{origen.nombre}».</>;
}

export function PruebaMapeoPatron({
  moduloCodigo,
  clasificadorEtiqueta,
  spec,
  fuente,
  puedeProbar,
}: {
  moduloCodigo: string;
  /** Cómo llama el módulo a lo que agrupa el archivo («Tipo de inventario», «Concepto»). */
  clasificadorEtiqueta: string;
  spec: SpecModulo;
  /**
   * Se resuelve al pulsar, no al pintar: en una versión nueva el archivo vive en un `ref` del
   * editor y leerlo durante el render no está permitido.
   */
  fuente: () => FuentePrueba | null;
  /** ¿Ya hay algún archivo con el que probar? */
  puedeProbar: boolean;
}) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [specProbado, setSpecProbado] = useState<string | null>(null);
  const [probando, startProbar] = useTransition();

  const actual = JSON.stringify(spec);
  const obsoleto = resultado != null && specProbado !== actual;

  const probar = () => {
    const origen = fuente();
    if (!origen) {
      notifyError("Sube la muestra del aplicativo para probar el mapeo.");
      return;
    }
    startProbar(async () => {
      const fd = new FormData();
      fd.set("moduloCodigo", moduloCodigo);
      fd.set("specJson", actual);
      fd.set("fuente", origen.tipo);
      if (origen.tipo === "muestra") fd.set("archivo", origen.archivo);
      if (origen.tipo === "version") fd.set("versionId", String(origen.id));
      if (origen.tipo === "original") fd.set("recepcionLoteId", origen.recepcionLoteId);
      const r = await probarMapeoPatron(fd);
      if (!r.ok) {
        notifyError(r.message ?? "No se pudo probar el mapeo.");
        return;
      }
      setResultado(r);
      setSpecProbado(actual);
    });
  };

  const sinMovimientos = resultado != null && resultado.filasProducidas > 0 && resultado.movimientos === 0;

  return (
    <Card className="flex flex-col gap-3 p-4 text-[12.5px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Prueba del mapeo</span>
          {obsoleto
            ? <Chip label="el mapeo cambió desde esta prueba" tone="warn" />
            : resultado?.impedimentos.length === 0 && (
              <Chip
                label={resultado.recorte ? `sin problemas en las primeras ${resultado.recorte.filasLeidas.toLocaleString("es-CO")} filas` : "el mapeo se puede guardar"}
                tone="ok"
              />
            )}
        </div>
        <button
          type="button"
          onClick={probar}
          disabled={probando || !puedeProbar}
          className="whitespace-nowrap rounded-md border border-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-navy-700 hover:bg-blue-50 disabled:opacity-50"
        >
          {probando ? "Probando…" : resultado ? "Volver a probar" : "Probar el mapeo"}
        </button>
      </div>

      {!resultado && (
        <p className="text-[11.5px] leading-snug text-ink-500">
          Muestra las primeras filas como las va a leer el sistema: el número de fila del archivo, si la fila suma o no,
          el valor y el {clasificadorEtiqueta.toLowerCase()} que saca el motor, y lo que queda en cada columna mapeada.
          Con archivos grandes puede tardar unos segundos.
        </p>
      )}

      {resultado && (
        <div className={`flex flex-col gap-3 ${probando ? "opacity-60" : ""}`}>
          {resultado.impedimentos.length > 0 && (
            <div className="rounded-md border border-err-200 bg-err-50 px-3 py-2 text-[11.5px] leading-relaxed text-err-700">
              <p className="font-semibold">Con este mapeo no se puede guardar:</p>
              <ul className="mt-1 list-disc pl-4">
                {resultado.impedimentos.map((m) => <li key={m}>{m}</li>)}
              </ul>
              {sinMovimientos && (
                <p className="mt-1">
                  El archivo produce {resultado.filasProducidas.toLocaleString("es-CO")} filas, pero ninguna suma: todas
                  quedaron como total o agrupadora. Revisa la primera fila de datos y la columna del valor.
                </p>
              )}
            </div>
          )}

          {resultado.avisos.map((a) => (
            <p key={a} className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2 text-[11.5px] leading-relaxed text-ink-600">{a}</p>
          ))}

          {resultado.filas.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-ink-150">
              <table className="w-full text-[12px]">
                <thead className="bg-ink-50 text-left text-ink-500">
                  <tr>
                    <th className="px-2.5 py-2 font-semibold">Fila</th>
                    <th className="px-2.5 py-2 font-semibold">Qué hace</th>
                    {resultado.columnas.map((c) => (
                      <th key={c.nombre} className={`px-2.5 py-2 font-semibold ${esNumerica(c.tipo) ? "text-right" : ""}`}>
                        {c.etiqueta}
                        <span className="ml-1 font-normal text-ink-400">{c.nota ? `· ${c.nota}` : c.letra}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultado.filas.map((f) => (
                    <tr
                      key={f.filaNum}
                      className={`border-t border-ink-100 ${f.tipoFila === "total" ? "bg-ink-50" : ""} ${f.imputa ? "" : "text-ink-400"} ${f.salto ? "border-t-2 border-dashed border-ink-300" : ""}`}
                    >
                      <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{f.filaNum}</td>
                      <td className="px-2.5 py-1.5">
                        <Chip label={f.motivoTexto} tone={f.imputa ? "ok" : "ink"} />
                      </td>
                      {resultado.columnas.map((c, i) => (
                        <td key={c.nombre} className={`px-2.5 py-1.5 ${esNumerica(c.tipo) ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                          {textoCeldaDetalle(f.celdas[i], c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11.5px] leading-snug text-ink-500">
            {resultado.filas.length > 0 && (
              <>
                {resultado.filasProducidas > LIMITE_FILAS_PRUEBA
                  ? `Primeras ${LIMITE_FILAS_PRUEBA} de ${resultado.filasProducidas.toLocaleString("es-CO")} filas leídas`
                  : `${resultado.filasProducidas.toLocaleString("es-CO")} filas leídas`}
                {" · "}
                {resultado.movimientos.toLocaleString("es-CO")} suman
                {" · "}
              </>
            )}
            hoja «{resultado.hoja}» ({resultado.totalFilasHoja.toLocaleString("es-CO")} filas del archivo).{" "}
            <OrigenProbado origen={resultado.origen} />
            {resultado.recorte && (
              <>
                {" "}La prueba lee solo las primeras {resultado.recorte.filasLeidas.toLocaleString("es-CO")} filas para
                no hacer esperar; al guardar se lee el archivo completo.
              </>
            )}
          </p>
        </div>
      )}
    </Card>
  );
}
