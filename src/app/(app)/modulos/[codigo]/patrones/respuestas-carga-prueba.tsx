"use client";

// Las respuestas de la carga que supone la prueba del mapeo en el editor de patrones. El borrador
// sale del mapeo MÁS estas respuestas, así que la prueba las pide igual que el modal de carga,
// ya respondidas con lo más habitual. Cambiarlas solo cambia la prueba: el patrón no las guarda.
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";
import type { PreguntasCarga } from "@/lib/modulos/mapeo-de-carga";
import { preguntasVisibles, type RespuestasPrueba } from "@/lib/modulos/respuestas-carga-prueba";
import {
  CONTENIDOS_ARCHIVO,
  INFO_CONTENIDO_ARCHIVO,
  INFO_SIGNO_NOTAS_CREDITO,
  INFO_SIGNO_VENTAS,
  SIGNOS_NOTAS_CREDITO,
  SIGNOS_VENTAS,
} from "@/lib/modulos/ingresos/contenido-archivo";
import { CONTENIDOS_ACTIVOS, INFO_CONTENIDO_ACTIVOS } from "@/lib/modulos/activos/contenido-archivo";

const claseCampo = "rounded-md border border-ink-200 bg-white px-2 py-1 text-[12px] text-ink-800";
const claseEtiqueta = "flex min-w-0 flex-col gap-1 text-[11px] font-medium text-ink-600";

export function RespuestasCargaPrueba({
  preguntas,
  spec,
  valor,
  onCambio,
}: {
  preguntas: PreguntasCarga;
  spec: Pick<SpecModulo, "columnas" | "monedaArchivo">;
  valor: RespuestasPrueba;
  onCambio: (siguiente: RespuestasPrueba) => void;
}) {
  const visibles = preguntasVisibles(preguntas, spec);
  const cambiar = <K extends keyof RespuestasPrueba>(clave: K, v: RespuestasPrueba[K]) => onCambio({ ...valor, [clave]: v });
  const hayPreguntas = visibles.total || visibles.trm || visibles.centro || visibles.agruparPor.length > 0
    || visibles.contenido || visibles.contenidoActivos || visibles.mes;
  if (!hayPreguntas) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-ink-150 bg-ink-50 px-3 py-2.5">
      <p className="text-[11.5px] leading-snug text-ink-600">
        <span className="font-semibold">Respuestas de la carga para esta prueba.</span>{" "}
        El borrador se lee con el patrón y con lo que se responda al cargar; aquí se supone lo más habitual. Cámbialas para
        ver cómo quedaría con otra respuesta. No se guardan en el patrón.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {visibles.total && (
          <div className={claseEtiqueta}>
            <span>¿El archivo trae el valor total?</span>
            <div className="flex flex-wrap items-center gap-3 text-[12px] font-normal text-ink-800">
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" name="prueba-total" checked={valor.total === "no"} onChange={() => cambiar("total", "no")} />
                No
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" name="prueba-total" checked={valor.total === "si"} onChange={() => cambiar("total", "si")} />
                Sí, en la celda
              </label>
              <input
                type="text"
                value={valor.celdaTotal}
                disabled={valor.total !== "si"}
                onChange={(e) => cambiar("celdaTotal", e.target.value)}
                placeholder="p. ej. M160"
                aria-label="Celda del valor total"
                className={`${claseCampo} w-24 uppercase disabled:opacity-50`}
              />
            </div>
          </div>
        )}
        {visibles.trm && (
          <label className={claseEtiqueta}>
            <span>TRM de cierre ({spec.monedaArchivo})</span>
            <input type="text" inputMode="decimal" value={valor.trm} onChange={(e) => cambiar("trm", e.target.value)} placeholder="p. ej. 4.150,25" className={claseCampo} />
          </label>
        )}
        {visibles.centro && (
          <label className={claseEtiqueta}>
            <span>¿Separar por centro de costo?</span>
            <select value={valor.separarCentro} onChange={(e) => cambiar("separarCentro", e.target.value as "si" | "no")} className={claseCampo}>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </label>
        )}
        {visibles.agruparPor.length > 0 && (
          <label className={claseEtiqueta}>
            <span>Agrupar los conceptos por</span>
            <select
              value={visibles.agruparPor.some((o) => o.id === valor.agruparPor) ? valor.agruparPor : visibles.agruparPor[0].id}
              onChange={(e) => cambiar("agruparPor", e.target.value)}
              className={claseCampo}
            >
              {visibles.agruparPor.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
            </select>
          </label>
        )}
        {visibles.contenido && (
          <>
            <label className={claseEtiqueta}>
              <span>¿Qué trae este archivo?</span>
              <select value={valor.contenido} onChange={(e) => cambiar("contenido", e.target.value)} className={claseCampo}>
                {CONTENIDOS_ARCHIVO.map((c) => <option key={c} value={c}>{INFO_CONTENIDO_ARCHIVO[c].opcion}</option>)}
              </select>
            </label>
            {valor.contenido !== "notas_credito" && (
              <label className={claseEtiqueta}>
                <span>¿Con qué signo vienen las ventas?</span>
                <select value={valor.signoVentas} onChange={(e) => cambiar("signoVentas", e.target.value)} className={claseCampo}>
                  {SIGNOS_VENTAS.map((s) => <option key={s} value={s}>{INFO_SIGNO_VENTAS[s].opcion}</option>)}
                </select>
              </label>
            )}
            {valor.contenido !== "facturas" && (
              <label className={claseEtiqueta}>
                <span>¿Con qué signo vienen las notas crédito?</span>
                <select value={valor.signoNotasCredito} onChange={(e) => cambiar("signoNotasCredito", e.target.value)} className={claseCampo}>
                  {SIGNOS_NOTAS_CREDITO.map((s) => <option key={s} value={s}>{INFO_SIGNO_NOTAS_CREDITO[s].opcion}</option>)}
                </select>
              </label>
            )}
          </>
        )}
        {visibles.contenidoActivos && (
          <label className={claseEtiqueta}>
            <span>¿Qué trae este archivo?</span>
            <select value={valor.contenidoActivos} onChange={(e) => cambiar("contenidoActivos", e.target.value)} className={claseCampo}>
              {CONTENIDOS_ACTIVOS.map((c) => <option key={c} value={c}>{INFO_CONTENIDO_ACTIVOS[c].opcion}</option>)}
            </select>
          </label>
        )}
        {visibles.mes && (
          <label className={claseEtiqueta}>
            <span>Mes de corte (opcional)</span>
            <input type="month" value={valor.mes} onChange={(e) => cambiar("mes", e.target.value)} className={claseCampo} />
          </label>
        )}
      </div>
    </div>
  );
}
