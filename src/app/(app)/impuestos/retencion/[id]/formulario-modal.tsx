"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Chip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { confirmarFormularioDian, descartarFormularioDian } from "@/app/actions/impuestos-retencion";
import type { ActionState } from "@/lib/definitions";
import { NOMBRES_MES } from "@/lib/impuestos/calendario";
import { esImporte } from "@/lib/impuestos/formularios/definicion";
import { F350 } from "@/lib/impuestos/formularios/f350";
import { F490 } from "@/lib/impuestos/formularios/f490";
import { controlesLectura, type LecturaFormulario } from "@/lib/impuestos/retencion/lectura";
import type { FormularioVista } from "@/lib/impuestos/retencion/revision-servidor";

const BOTON_PRIMARIO = "rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60";
const BOTON_SECUNDARIO = "rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-60";
const ETIQUETA_PERSONA = { juridica: "P. jurídica", natural: "P. natural", unica: "" } as const;
const conMiles = (s: string) => (s === "" ? "" : Number(s).toLocaleString("es-CO"));

export type ContextoRevision = { revisionId: number; nitCliente: string; anio: number; mesCorte: number };

export function FormularioModal({
  formulario: f,
  contexto,
  puedeCargar,
  puedeEditar,
  puedeEliminar,
  onClose,
}: {
  formulario: FormularioVista;
  contexto: ContextoRevision;
  puedeCargar: boolean;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  onClose: () => void;
}) {
  const def = f.formulario === "490" ? F490 : F350;
  const editable = f.estado === "por_confirmar" && puedeCargar;
  const [confirmarState, confirmarAction, confirmando] = useActionState<ActionState, FormData>(confirmarFormularioDian, {});
  const [descartarState, descartarAction, descartando] = useActionState<ActionState, FormData>(descartarFormularioDian, {});
  const [valores, setValores] = useState<Record<number, string>>(() => Object.fromEntries(Object.entries(f.valores).map(([r, v]) => [Number(r), String(v)])));
  const [fechaSello, setFechaSello] = useState(f.fechaSello ?? "");
  const [esCorreccion, setEsCorreccion] = useState(f.codigoCorreccion === 1);
  const [numeroAnterior, setNumeroAnterior] = useState(f.numeroAnterior ?? "");
  const [concepto, setConcepto] = useState(f.concepto ?? "");
  const [numeroPagado, setNumeroPagado] = useState(f.numeroPagado ?? "");
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);

  // Una respuesta correcta del servidor cierra el panel. Va en un efecto: cerrar cambia el estado
  // de la pantalla que lo abrió, y eso no puede pasar mientras este componente se dibuja.
  useEffect(() => {
    if (confirmarState.ok || descartarState.ok) onClose();
  }, [confirmarState, descartarState, onClose]);
  useEffect(() => {
    notifyActionState(confirmarState, { success: "Formulario confirmado.", error: "No se pudo confirmar el formulario." });
  }, [confirmarState]);
  useEffect(() => {
    notifyActionState(descartarState, { success: "Formulario descartado.", error: "No se pudo descartar el formulario." });
  }, [descartarState]);

  const numericos = useMemo(
    () => Object.fromEntries(Object.entries(valores).filter(([, v]) => v !== "").map(([r, v]) => [Number(r), Number(v)])) as Record<number, number>,
    [valores],
  );
  const final: LecturaFormulario = {
    ...f.leido,
    formulario: f.formulario,
    anio: contexto.anio,
    periodo: f.periodo,
    numero: f.numero,
    fechaSello: fechaSello || null,
    codigoCorreccion: f.formulario === "350" && esCorreccion ? 1 : null,
    numeroAnterior: f.formulario === "350" && esCorreccion ? numeroAnterior.replace(/\D/g, "") || null : null,
    concepto: f.formulario === "490" ? concepto || null : null,
    numeroPagado: f.formulario === "490" ? numeroPagado.replace(/\D/g, "") || null : null,
    valores: numericos,
  };
  const controles = editable ? controlesLectura(final, contexto) : f.controles;
  const bloquean = controles.filter((c) => c.bloquea && !c.ok);
  const avisos = controles.filter((c) => !c.bloquea && !c.ok);
  const correctos = controles.filter((c) => c.ok).length;

  const renglones = def.renglones.filter((r) => r.guardar && esImporte(r));
  const visibles = renglones.filter((r) => mostrarTodos || r.tipo === "total" || (valores[r.renglon] ?? "") !== "" || f.leido.valores[r.renglon] != null);
  // Secciones en el orden del formulario (tramos seguidos): el total de renta va después de lo que suma.
  const secciones = visibles.reduce<{ seccion: string; renglones: typeof visibles }[]>((grupos, r) => {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.seccion === r.seccion) ultimo.renglones.push(r);
    else grupos.push({ seccion: r.seccion, renglones: [r] });
    return grupos;
  }, []);
  const puedeDescartar = (f.estado === "por_confirmar" && puedeCargar) || (f.estado === "confirmado" && puedeEliminar);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Formulario ${f.formulario} · ${NOMBRES_MES[f.periodo - 1] ?? `Período ${f.periodo}`} ${contexto.anio}`}
      size="4xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div>
            {puedeDescartar && (confirmarDescarte ? (
              <form action={descartarAction} className="flex items-center gap-1.5">
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="revisionId" value={contexto.revisionId} />
                <span className="text-[11.5px] text-ink-500">¿Descartar el formulario {f.numero}?</span>
                <button type="submit" disabled={descartando} className="rounded-md border border-err-100 px-2.5 py-1.5 text-[12px] font-semibold text-err-700 hover:bg-err-100 disabled:opacity-60">
                  {descartando ? <EstadoProcesando>Descartando</EstadoProcesando> : "Sí, descartar"}
                </button>
                <button type="button" onClick={() => setConfirmarDescarte(false)} className={BOTON_SECUNDARIO}>Cancelar</button>
              </form>
            ) : (
              <button type="button" onClick={() => setConfirmarDescarte(true)} className={BOTON_SECUNDARIO}>Descartar</button>
            ))}
          </div>
          {editable && (
            <form action={confirmarAction}>
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="revisionId" value={contexto.revisionId} />
              <input type="hidden" name="fechaSello" value={fechaSello} />
              <input type="hidden" name="codigoCorreccion" value={f.formulario === "350" && esCorreccion ? "1" : ""} />
              <input type="hidden" name="numeroAnterior" value={f.formulario === "350" && esCorreccion ? numeroAnterior : ""} />
              <input type="hidden" name="concepto" value={f.formulario === "490" ? concepto : ""} />
              <input type="hidden" name="numeroPagado" value={f.formulario === "490" ? numeroPagado : ""} />
              <input type="hidden" name="valores" value={JSON.stringify(numericos)} />
              <button type="submit" disabled={confirmando || bloquean.length > 0} title={bloquean.length ? "Corrige lo que está en rojo para confirmar." : undefined} className={BOTON_PRIMARIO}>
                {confirmando ? <EstadoProcesando>Confirmando</EstadoProcesando> : "Confirmar formulario"}
              </button>
            </form>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-[12.5px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tabular-nums font-semibold text-navy-800">N.º {f.numero}</span>
          <Chip label={f.estado === "confirmado" ? "Confirmado" : "Por confirmar"} tone={f.estado === "confirmado" ? "ok" : "warn"} />
          {f.tieneArchivo ? (
            <a href={`/api/impuestos/formularios/${f.id}`} target="_blank" rel="noopener" className="text-[12px] font-semibold text-blue-700 hover:underline">Ver PDF</a>
          ) : (
            <span className="text-[11.5px] text-ink-400">El original no se guardó</span>
          )}
          <span className="text-[11.5px] text-ink-400">
            {f.nombreArchivo} · leído con IA{f.cargadoPor ? ` · cargó ${f.cargadoPor}` : ""} {fmtDateTime(f.creadoEn)}
            {f.confirmadoEn ? ` · confirmó ${f.confirmadoPor ?? ""} ${fmtDateTime(f.confirmadoEn)}` : ""}
          </span>
        </div>

        {(bloquean.length > 0 || avisos.length > 0) && (
          <div className="flex flex-col gap-2">
            {bloquean.length > 0 && (
              <div className="rounded-md border border-err-100 bg-err-100 px-3 py-2 text-err-700">
                <div className="font-semibold">Para confirmar falta corregir:</div>
                <ul className="mt-1 list-disc pl-4">{bloquean.map((c) => <li key={c.clave}>{c.mensaje}</li>)}</ul>
              </div>
            )}
            {avisos.length > 0 && (
              <div className="rounded-md border border-warn-100 bg-warn-100 px-3 py-2 text-warn-700">
                <ul className="list-disc pl-4">{avisos.map((c) => <li key={c.clave}>{c.mensaje}</li>)}</ul>
              </div>
            )}
          </div>
        )}
        <p className="text-[11.5px] text-ink-500">{correctos} control(es) correctos: NIT, año, período, número y totales del formulario.</p>
        {f.corregidoAMano.length > 0 && <p className="text-[11.5px] text-ink-500">Corregidos a mano al confirmar: renglones {f.corregidoAMano.join(", ")}.</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-ink-700">{f.formulario === "490" ? "Fecha de pago" : "Fecha de presentación"} (renglón 997)</span>
            <input type="date" value={fechaSello} disabled={!editable} onChange={(e) => setFechaSello(e.target.value)} className="h-9 w-44 rounded-md border border-ink-200 bg-white px-2 disabled:bg-ink-50" />
          </label>
          {f.formulario === "350" ? (
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 font-semibold text-ink-700">
                <input type="checkbox" checked={esCorreccion} disabled={!editable} onChange={(e) => setEsCorreccion(e.target.checked)} />
                Es una corrección (renglón 25 = 1)
              </label>
              {esCorreccion && (
                <input value={numeroAnterior} disabled={!editable} onChange={(e) => setNumeroAnterior(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="Formulario que corrige (renglón 26)" aria-label="Número del formulario anterior" className="h-9 w-56 rounded-md border border-ink-200 bg-white px-2 tabular-nums disabled:bg-ink-50" />
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-ink-700">Concepto (renglón 2)</span>
                <select value={concepto} disabled={!editable} onChange={(e) => setConcepto(e.target.value)} className="h-9 rounded-md border border-ink-200 bg-white px-2 disabled:bg-ink-50">
                  <option value="">—</option>
                  <option value="61">61 · Retención renta y autorretenciones</option>
                  <option value="62">62 · ReteIVA</option>
                  <option value="63">63 · Timbre</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-ink-700">350 que paga (renglón 29)</span>
                <input value={numeroPagado} disabled={!editable} onChange={(e) => setNumeroPagado(e.target.value.replace(/\D/g, "").slice(0, 13))} aria-label="Número del formulario que se paga" className="h-9 w-44 rounded-md border border-ink-200 bg-white px-2 tabular-nums disabled:bg-ink-50" />
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="font-semibold text-ink-700">Valores {editable && !puedeEditar ? "(solo lectura: corregir importes no está a tu alcance)" : ""}</span>
          <label className="flex items-center gap-1.5 text-[11.5px] text-ink-500">
            <input type="checkbox" checked={mostrarTodos} onChange={(e) => setMostrarTodos(e.target.checked)} />
            Mostrar todos los renglones
          </label>
        </div>
        <div className="overflow-hidden rounded-md border border-ink-150">
          <table className="w-full text-[12.5px]">
            <tbody>
              {secciones.map((g) => (
                <SeccionValores
                  key={`${g.seccion}-${g.renglones[0]?.renglon}`}
                  seccion={g.seccion}
                  renglones={g.renglones}
                  valores={valores}
                  leidos={f.leido.valores}
                  editable={editable && puedeEditar}
                  onCambio={(r, v) => setValores((prev) => ({ ...prev, [r]: v }))}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function SeccionValores({
  seccion,
  renglones,
  valores,
  leidos,
  editable,
  onCambio,
}: {
  seccion: string;
  renglones: { renglon: number; etiqueta: string; persona: "juridica" | "natural" | "unica"; tipo: string }[];
  valores: Record<number, string>;
  leidos: Record<number, number>;
  editable: boolean;
  onCambio: (renglon: number, valor: string) => void;
}) {
  return (
    <>
      <tr className="bg-ink-50">
        <td colSpan={3} className="px-3 py-1.5 text-[11.5px] font-semibold text-navy-800">{seccion}</td>
      </tr>
      {renglones.map((r) => {
        const valor = valores[r.renglon] ?? "";
        const cambiado = (leidos[r.renglon] ?? null) !== (valor === "" ? null : Number(valor));
        return (
          <tr key={r.renglon} className={`border-t border-ink-100 ${r.tipo === "total" ? "bg-ink-50/60 font-semibold" : ""}`}>
            <td className="w-14 px-3 py-1 text-right tabular-nums text-ink-500">{r.renglon}</td>
            <td className="px-2 py-1 text-ink-800">
              {r.etiqueta}
              {ETIQUETA_PERSONA[r.persona] && <span className="ml-1.5 text-[11px] text-ink-400">{ETIQUETA_PERSONA[r.persona]}</span>}
            </td>
            <td className={`w-48 px-3 py-1 text-right ${cambiado ? "bg-ai-100" : ""}`}>
              {editable ? (
                <input
                  inputMode="numeric"
                  value={conMiles(valor)}
                  onChange={(e) => onCambio(r.renglon, e.target.value.replace(/\D/g, ""))}
                  aria-label={`Renglón ${r.renglon}`}
                  className="w-40 rounded border border-ink-200 bg-white px-2 py-0.5 text-right tabular-nums"
                />
              ) : (
                <span className="tabular-nums">{valor === "" ? "—" : `$${conMiles(valor)}`}</span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

