"use client";

// Nómina · CONTROL DE DEDUCCIONES (17/Oct/2026): libranzas, retenciones, embargos… por cuenta del
// cliente contra su saldo final en el balance. Toda diferencia de más de un centavo —también la de
// una cuenta que no está en el balance— exige marca de auditoría para cerrar. La marca es la misma
// del cruce (numeración compartida del período); su detalle se lee en «Observaciones».
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import ComentarioAncla from "@/components/comentario-ancla";
import { fmtContable } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { guardarMarcaCruce, quitarMarcaCruce } from "@/app/actions/modulos-datos";
import {
  anclaControl,
  anclaObservacionMarca,
  etiquetaMarca,
  MAX_NOTA_MARCA,
  MAX_REFERENCIA_ANEXO,
  type FilaControlMarcada,
  type ResumenMarcas,
} from "@/lib/modulos/marcas-cruce";
import { EditorSoportesMarca, InsigniaMarca } from "./soportes-marca";

/** Ancla de la tarjeta, para que las observaciones lleven a ella. */
export const ANCLA_CONTROL_DEDUCCIONES = "control-deducciones";

const etiquetaControl = (f: Pick<FilaControlMarcada, "cuentaCliente" | "nombre">) => `${f.cuentaCliente}${f.nombre ? ` · ${f.nombre}` : ""}`;

export function ControlDeduccionesCard({
  filas,
  totales,
  resumen,
  moduloLabel,
  ladoModulo,
  encabezadoId,
  comentarios,
  puedeEditar,
}: {
  filas: FilaControlMarcada[];
  totales: { contable: number; modulo: number; diferencia: number };
  resumen: ResumenMarcas | null;
  moduloLabel: string;
  /** Rótulo de la columna del módulo («Nómina»). */
  ladoModulo: string;
  encabezadoId: number;
  comentarios: Record<string, number>;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<FilaControlMarcada | null>(null);
  const [quitando, startQuitar] = useTransition();
  const quitar = (fila: FilaControlMarcada) => {
    startQuitar(async () => {
      const r = await quitarMarcaCruce({ encabezadoId, clave: fila.cuentaCliente, dimension: "control" });
      if (r.ok) notifySuccess(r.message ?? "Marca retirada.");
      else notifyError(r.message ?? "No se pudo retirar la marca.");
      router.refresh();
    });
  };

  return (
    <Card className="scroll-mt-24 p-0">
      <div id={ANCLA_CONTROL_DEDUCCIONES} className="border-b border-ink-100 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[12.5px] font-semibold text-ink-800">Control de deducciones</div>
          {resumen && resumen.conDiferencia > 0 && (
            <Chip
              label={`${resumen.marcadas} de ${resumen.conDiferencia} con marca`}
              tone={resumen.pendientes === 0 && resumen.desactualizadas === 0 ? "ok" : "warn"}
            />
          )}
        </div>
        <p className="text-[11px] text-ink-500">
          Conceptos cuya cuenta del cliente es de pasivo, activo o ingreso (libranzas, retención, embargos, préstamos, intereses): la Σ de {moduloLabel.toLocaleLowerCase("es")} contra el saldo final de esa cuenta en el balance. No suma al gasto, pero <b>toda diferencia exige marca para cerrar</b>; una cuenta que no está en el balance se compara contra cero.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-ink-50 text-left text-ink-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Cuenta del cliente</th>
              <th className="px-3 py-2 font-semibold">Conceptos</th>
              <th className="px-3 py-2 text-right font-semibold">Contabilidad</th>
              <th className="px-3 py-2 text-right font-semibold">{ladoModulo}</th>
              <th className="px-3 py-2 text-right font-semibold">Diferencia</th>
              <th className="px-3 py-2 text-center font-semibold">Marca</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.cuentaCliente} className="border-t border-ink-100">
                <td className="px-3 py-2 text-ink-800">
                  <span className="font-mono">{f.cuentaCliente}</span> {f.nombre ?? <span className="text-warn-700">sin cuenta en el balance</span>}
                  {f.cuentasBalance.length > 1 && <div className="text-[10.5px] text-ink-400">{f.cuentasBalance.join(", ")}</div>}
                </td>
                <td className="px-3 py-2 text-[11.5px] text-ink-600">{f.conceptos.map((c) => `${c.codigo}${c.descripcion ? ` ${c.descripcion}` : ""}`).join(" · ")}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-700">{f.contable == null ? <span className="text-ink-300" title="La cuenta no está en el balance: se compara contra cero.">0,00</span> : fmtContable(f.contable)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-700">{fmtContable(f.modulo)}</td>
                <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums font-semibold ${f.admiteMarca ? "text-err-700" : "text-ok-700"}`}>{fmtContable(f.diferenciaEfectiva)}</td>
                <td className="px-3 py-2">
                  <CeldaMarcaControl
                    fila={f}
                    encabezadoId={encabezadoId}
                    comentarios={comentarios[anclaControl(f.cuentaCliente)] ?? 0}
                    puedeEditar={puedeEditar}
                    ocupado={quitando}
                    onMarcar={() => setEditando(f)}
                    onQuitar={() => quitar(f)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink-200 bg-ink-50 font-semibold text-ink-800">
              <td className="px-3 py-2" colSpan={2}>Totales</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtContable(totales.contable)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtContable(totales.modulo)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtContable(totales.diferencia)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {editando && (
        <ModalMarcaControl
          key={editando.cuentaCliente}
          fila={editando}
          encabezadoId={encabezadoId}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}

function CeldaMarcaControl({
  fila,
  encabezadoId,
  comentarios,
  puedeEditar,
  ocupado,
  onMarcar,
  onQuitar,
}: {
  fila: FilaControlMarcada;
  encabezadoId: number;
  comentarios: number;
  puedeEditar: boolean;
  ocupado: boolean;
  onMarcar: () => void;
  onQuitar: () => void;
}) {
  const hilo = (
    <ComentarioAncla tipo="modulos_datos" entityId={encabezadoId} anchor={anclaControl(fila.cuentaCliente)} titulo={`Control · ${etiquetaControl(fila)}`} count={comentarios} />
  );
  if (!fila.admiteMarca && !fila.marca) return <div className="flex items-center justify-center gap-1">{hilo}</div>;
  if (!fila.marca) {
    return (
      <div className="flex items-center justify-center gap-1">
        {puedeEditar ? (
          <button
            type="button"
            onClick={onMarcar}
            title="Poner una marca a esta diferencia"
            className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-dashed border-warn-500 px-1 text-warn-700 transition hover:border-navy-700 hover:text-navy-700"
          >
            <Icon name="plus" size={12} />
          </button>
        ) : (
          <span title="Diferencia sin marca" className="text-[11.5px] font-semibold text-warn-700">—</span>
        )}
        {hilo}
      </div>
    );
  }
  const { marca } = fila;
  const titulo = fila.desactualizada
    ? `Marca ${marca.numero} · la diferencia era ${fmtContable(marca.diferencia)} cuando se escribió y hoy es ${fmtContable(fila.diferenciaEfectiva)}.`
    : `Marca ${marca.numero} · ver la observación al pie`;
  return (
    <div className="flex items-center justify-center gap-1">
      <a href={`#${anclaObservacionMarca(marca.numero)}`} className="inline-flex">
        <InsigniaMarca numero={marca.numero} tono={fila.desactualizada ? "warn" : "ok"} titulo={titulo} />
      </a>
      {puedeEditar && (
        <>
          <button type="button" onClick={onMarcar} disabled={ocupado} title="Editar la marca" aria-label="Editar la marca" className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 disabled:opacity-50">
            <Icon name="edit" size={13} />
          </button>
          <button type="button" onClick={onQuitar} disabled={ocupado} title="Retirar la marca" aria-label="Retirar la marca" className="rounded p-1 text-ink-400 transition hover:bg-err-100 hover:text-err-700 disabled:opacity-50">
            <Icon name="trash" size={13} />
          </button>
        </>
      )}
      {hilo}
    </div>
  );
}

function ModalMarcaControl({
  fila,
  encabezadoId,
  onClose,
  onGuardado,
}: {
  fila: FilaControlMarcada;
  encabezadoId: number;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [nota, setNota] = useState(fila.marca?.nota ?? "");
  const [anexo, setAnexo] = useState(fila.marca?.referenciaAnexo ?? "");
  const [nuevos, setNuevos] = useState<File[]>([]);
  const [guardando, startGuardar] = useTransition();

  const guardar = () => {
    const texto = nota.trim();
    if (!texto || guardando) return;
    startGuardar(async () => {
      const datos = new FormData();
      datos.set("encabezadoId", String(encabezadoId));
      datos.set("dimension", "control");
      datos.set("clave", fila.cuentaCliente);
      datos.set("nota", texto);
      datos.set("referenciaAnexo", anexo.trim());
      // La diferencia la recalcula el servidor sobre el cruce vigente.
      for (const archivo of nuevos) datos.append("soportes", archivo);
      const r = await guardarMarcaCruce(datos);
      if (r.ok) {
        notifySuccess(r.message ?? "Marca guardada.");
        onGuardado();
      } else {
        notifyError(r.message ?? "No se pudo guardar la marca.");
      }
    });
  };

  const titulo = fila.marca ? `${etiquetaMarca(fila.marca.numero)} · control ${etiquetaControl(fila)}` : `Nueva marca · control ${etiquetaControl(fila)}`;

  return (
    <Modal
      open
      onClose={onClose}
      title={titulo}
      size="lg"
      footer={
        <button
          type="button"
          onClick={guardar}
          disabled={!nota.trim() || guardando}
          className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {guardando ? "Guardando…" : fila.marca ? "Guardar cambios" : "Poner marca"}
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-2 rounded-md border border-ink-150 bg-ink-50 px-3 py-2 text-[12px] sm:grid-cols-3">
          <div>
            <div className="text-ink-500">Contabilidad</div>
            <div className="font-semibold tabular-nums text-ink-800">{fmtContable(fila.contable ?? 0)}</div>
          </div>
          <div>
            <div className="text-ink-500">Módulo</div>
            <div className="font-semibold tabular-nums text-ink-800">{fmtContable(fila.modulo)}</div>
          </div>
          <div>
            <div className="text-ink-500">Diferencia</div>
            <div className="font-semibold tabular-nums text-err-700">{fmtContable(fila.diferenciaEfectiva)}</div>
          </div>
        </div>
        {fila.contable == null && (
          <p className="text-[11.5px] text-warn-700">La cuenta del cliente no está en el balance del período: se compara contra cero.</p>
        )}
        {fila.desactualizada && fila.marca && (
          <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] text-warn-700">
            La diferencia era <b>{fmtContable(fila.marca.diferencia)}</b> cuando se escribió esta marca. Actualízala para dejar constancia del monto de hoy.
          </div>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-ink-700">Detalle de la marca</span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, MAX_NOTA_MARCA))}
            rows={5}
            autoFocus
            placeholder="Explica a qué corresponde la diferencia de esta deducción y cómo se soporta al corte."
            className="resize-y rounded-md border border-ink-200 px-3 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-navy-600"
          />
          <span className="self-end text-[10.5px] text-ink-400">{nota.length}/{MAX_NOTA_MARCA}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-ink-700">
            Referencia al anexo <span className="font-normal text-ink-400">(opcional)</span>
          </span>
          <input
            type="text"
            value={anexo}
            onChange={(e) => setAnexo(e.target.value.slice(0, MAX_REFERENCIA_ANEXO))}
            placeholder="P. ej. Anexo N-4 · conciliación de libranzas"
            className="rounded-md border border-ink-200 px-3 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-navy-600"
          />
        </label>
        <EditorSoportesMarca encabezadoId={encabezadoId} yaGuardados={fila.marca?.adjuntos ?? []} nuevos={nuevos} onCambiarNuevos={setNuevos} />
        <p className="text-[11.5px] text-ink-500">
          La marca queda numerada en el control de deducciones y su detalle en Observaciones. La numeración es la misma del cruce contable.
        </p>
      </div>
    </Modal>
  );
}
