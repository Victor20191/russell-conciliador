"use client";

// Panel VALIDACIÓN DEL ARCHIVO. Lo comparten el BORRADOR (`borradores/[loteId]`, donde el
// control se recalcula en vivo al omitir o rescatar filas) y el CARGUE YA PROMOVIDO
// (`[id]`, donde sale de lo que el encabezado congeló: ver `validacion-cargue.ts`). Un solo
// componente para que el veredicto que se ve antes de confirmar sea, palabra por palabra, el
// que queda registrado después.
//
// Misma gramática visual que la barra de cuadre del panel «Validación del balance»: UNA sola
// línea con el veredicto y sus tres cifras. Nada de tarjetas ni contadores duplicando lo que
// ya dice la línea.
//
// Qué decide el cuadre: el TOTAL que el propio archivo declara para su detalle (la fila
// que el motor marcó `gran_total`) contra la Σ de los movimientos. De los subtotales por
// grupo solo se listan los que NO cuadran — no compiten con el total del archivo.
//
// NO bloquea la carga: es un control de auditoría. El consolidado sale SIEMPRE de los
// movimientos, nunca de las filas de total.
import { useState } from "react";
import { Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { fmtContable, fmtNum } from "@/lib/format";
import { TOLERANCIA_CONTROL, type ControlSubtotales } from "@/lib/modulos/subtotales";
import type { OrigenTotalDeclarado } from "@/lib/modulos/validacion-cargue";

/** Lo que el borrador va a cargar, para contrastarlo con lo que declara el archivo. */
export type ResumenValidacionArchivo = {
  /** Movimientos que sí consolidan. */
  items: number;
  /** Σ de los movimientos imputables (respaldo cuando el archivo no declara total). */
  sumaMovimientos: number;
};

const TONO = {
  cuadra: "border-ok-100 bg-ok-100/40 text-ok-700",
  descuadre: "border-err-200 bg-err-50 text-err-700",
  no_validado: "border-ink-150 bg-ink-50 text-ink-600",
} as const;

type Estado = keyof typeof TONO;

function ModalAyuda({ onClose }: { onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Cómo leer la validación del archivo" size="lg">
      <div className="flex flex-col gap-3 text-[12.5px] leading-relaxed text-ink-700">
        <p>
          <span className="font-semibold text-ink-800">«Total declarado por el archivo»</span> — la fila de cierre que el
          propio archivo trae con el total de su detalle. Se reconoce por rótulo («Total», «Subtotal») o, cuando el
          archivo cierra con un cuadro sin rótulos, porque su cifra equivale exactamente a la suma del detalle que tiene
          encima. Esa fila y el resto del cuadro de cierre quedan <span className="font-semibold">fuera del consolidado</span>:
          si entraran como ítems, el módulo quedaría al doble.
        </p>
        <p>
          <span className="font-semibold text-ink-800">«Σ movimientos»</span> — lo que realmente se carga: los
          movimientos no omitidos y con valor. En el borrador se recalcula al instante al omitir o rescatar una fila; en
          un cargue ya confirmado es la cifra que quedó registrada.
        </p>
        <p>
          <span className="font-semibold text-ink-800">«Diferencia»</span> — total declarado menos Σ movimientos. Se
          considera cuadrado hasta {fmtContable(TOLERANCIA_CONTROL)} (absorbe el redondeo a dos decimales). Una
          diferencia mayor casi siempre significa que quedaron filas de cierre contadas como ítems, o ítems omitidos de
          más.
        </p>
        <p>
          <span className="font-semibold text-ink-800">«Subtotales por grupo»</span> — cuando el archivo trae un renglón
          de subtotal por cada agrupador, cada uno se compara contra la suma de su propio bloque. Solo se listan los que
          no cuadran.
        </p>
        <p className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2">
          Ninguno de estos controles <span className="font-semibold">bloquea la carga</span>: son papel de trabajo. El
          consolidado del módulo se calcula siempre desde los movimientos, nunca desde las filas de total.
        </p>
      </div>
    </Modal>
  );
}

export function ValidacionArchivo({
  control,
  resumen,
  modo = "borrador",
  origen,
}: {
  control: ControlSubtotales;
  resumen: ResumenValidacionArchivo;
  /** Cambia solo los tiempos verbales: en el borrador aún no se ha cargado nada. */
  modo?: "borrador" | "cargado";
  /** Solo en un cargue: de cuántos archivos salió el total (los anexos pueden no traerlo). */
  origen?: OrigenTotalDeclarado;
}) {
  const [ayuda, setAyuda] = useState(false);
  const gran = control.granTotal;
  const itemsTxt = `${fmtNum(resumen.items)} ítem${resumen.items === 1 ? "" : "s"} ${modo === "cargado" ? "cargados" : "se cargarán"}`;
  // Un anexo puede no traer total al pie: entonces la Σ de los declarados cubre solo parte
  // de lo cargado y no se puede convertir en veredicto.
  const coberturaParcial = origen != null && origen.archivosConTotal > 0 && origen.archivosConTotal < origen.archivos;
  const estado: Estado = gran == null ? "no_validado" : gran.estado === "cuadra" ? "cuadra" : gran.estado === "descuadre" ? "descuadre" : "no_validado";

  const gruposDescuadrados = control.grupos.filter((g) => g.estado === "descuadre");

  const chip = estado === "cuadra"
    ? { label: "Cuadra", tone: "ok" as const }
    : estado === "descuadre"
      ? { label: "No cuadra", tone: "err" as const }
      : { label: "Sin total en el archivo", tone: "ink" as const };

  return (
    <section className="flex flex-col gap-2.5" aria-label="Validación del archivo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Validación del archivo</span>
          <button
            type="button"
            onClick={() => setAyuda(true)}
            aria-label="Qué verifica esta validación"
            title="Qué verifica esta validación"
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-ink-400 transition hover:text-ink-700"
          >
            <Icon name="info" size={13} />
          </button>
        </div>
        <Chip label={chip.label} tone={chip.tone} />
      </div>

      <div className={`rounded-md border px-3 py-2 text-[12px] ${TONO[estado]}`}>
        {gran == null && coberturaParcial ? (
          <>
            <span className="font-semibold">No validado:</span> solo {fmtNum(origen!.archivosConTotal)} de{" "}
            {fmtNum(origen!.archivos)} archivos de esta versión declaran un total, así que no es comparable con lo
            cargado (<span className="font-semibold">{fmtContable(resumen.sumaMovimientos)}</span>, {itemsTxt}).
          </>
        ) : gran == null ? (
          <>
            <span className="font-semibold">No validado:</span> el archivo no declara un total comparable para su
            detalle. Σ movimientos <span className="font-semibold">{fmtContable(resumen.sumaMovimientos)}</span> —{" "}
            {modo === "cargado" ? "es lo que quedó cargado" : "es lo que se cargará"}, sin contraste contra el archivo.
          </>
        ) : gran.estado === "no_validado" ? (
          <>
            <span className="font-semibold">No validado:</span> total declarado{" "}
            <span className="font-semibold">{fmtContable(gran.subtotalArchivo)}</span> · no hay al menos dos movimientos
            comparables.
          </>
        ) : (
          <>
            <span className="font-semibold">{gran.estado === "cuadra" ? "Cuadra:" : "No coincide:"}</span> total declarado{" "}
            <span className="font-semibold">{fmtContable(gran.subtotalArchivo)}</span> vs Σ movimientos{" "}
            <span className="font-semibold">{fmtContable(gran.sumaMovimientos)}</span> · diferencia{" "}
            <span className="font-semibold">{fmtContable(gran.diferencia ?? 0)}</span>
            <span className="ml-1 opacity-80">
              ({origen != null && origen.archivos > 1
                ? `declarado por los ${origen.archivos} archivos de la versión`
                : gran.filaNum > 0
                  ? `fila ${gran.filaNum} del archivo, fuera del consolidado`
                  : "declarado por el archivo, fuera del consolidado"}{" · "}{itemsTxt})
            </span>
          </>
        )}
      </div>

      {gruposDescuadrados.length > 0 && (
        <div className="rounded-md border border-err-200 bg-err-50 px-3 py-2 text-[11.5px] text-err-700">
          <span className="font-semibold">
            {gruposDescuadrados.length} subtotal{gruposDescuadrados.length === 1 ? "" : "es"} de grupo no cuadra
            {gruposDescuadrados.length === 1 ? "" : "n"} con la suma de su bloque:
          </span>{" "}
          {gruposDescuadrados.slice(0, 6).map((g) => `${g.clasificador} — fila ${g.filaSubtotal}, archivo ${fmtContable(g.subtotalArchivo)} vs Σ ${fmtContable(g.sumaMovimientos)} (Δ ${fmtContable(g.diferencia ?? 0)})`).join("; ")}
          {gruposDescuadrados.length > 6 ? "…" : "."}
        </div>
      )}

      {ayuda && <ModalAyuda onClose={() => setAyuda(false)} />}
    </section>
  );
}
