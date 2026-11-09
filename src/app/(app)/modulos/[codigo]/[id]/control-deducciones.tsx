"use client";

// Nómina · CONTROL DE DEDUCCIONES (17/Oct/2026): libranzas, retenciones, embargos… por cuenta del
// cliente contra su saldo final en el balance. Toda diferencia de más de un centavo —también la de
// una cuenta que no está en el balance— exige marca de auditoría para cerrar. La marca es la misma
// del cruce (numeración compartida del período); su detalle se lee en «Observaciones». Un renglón
// puede llevar varias marcas: cada una explica su monto y entre todas tienen que cubrir la diferencia.
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
  leerMontoMarca,
  montoDeMarca,
  textoMontoMarca,
  MAX_NOTA_MARCA,
  MAX_REFERENCIA_ANEXO,
  type FilaControlMarcada,
  type MarcaCruce,
  type ResumenMarcas,
} from "@/lib/modulos/marcas-cruce";
import { CampoMontoMarca, EditorSoportesMarca, InsigniaMarca } from "./soportes-marca";

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
  // La marca que se escribe: la que se edita, o null para agregar una nueva al renglón.
  const [editando, setEditando] = useState<{ fila: FilaControlMarcada; marca: MarcaCruce | null } | null>(null);
  const [quitando, startQuitar] = useTransition();
  const quitar = (marca: MarcaCruce) => {
    startQuitar(async () => {
      const r = await quitarMarcaCruce({ encabezadoId, numero: marca.numero });
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
              label={resumen.desactualizadas > 0
                ? `${resumen.marcadas} de ${resumen.conDiferencia} con marca · ${resumen.desactualizadas} con saldo por explicar`
                : `${resumen.marcadas} de ${resumen.conDiferencia} con marca`}
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
                  <span className="tabular-nums">{f.cuentaCliente}</span> {f.nombre ?? <span className="text-warn-700">sin cuenta en el balance</span>}
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
                    onMarcar={(marca) => setEditando({ fila: f, marca })}
                    onQuitar={quitar}
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
          key={`${editando.fila.cuentaCliente}:${editando.marca?.numero ?? "nueva"}`}
          fila={editando.fila}
          marca={editando.marca}
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
  /** Abre el modal: con la marca que se edita, o null para agregar una nueva. */
  onMarcar: (marca: MarcaCruce | null) => void;
  onQuitar: (marca: MarcaCruce) => void;
}) {
  const hilo = (
    <ComentarioAncla tipo="modulos_datos" entityId={encabezadoId} anchor={anclaControl(fila.cuentaCliente)} titulo={`Control · ${etiquetaControl(fila)}`} count={comentarios} />
  );
  const tono = fila.desactualizada ? "warn" : "ok";
  return (
    <div className="flex flex-col items-center gap-1">
      {fila.marcas.map((marca) => (
        <div key={marca.numero} className="flex items-center gap-1">
          <a href={`#${anclaObservacionMarca(marca.numero)}`} className="inline-flex">
            <InsigniaMarca numero={marca.numero} tono={tono} titulo={`Marca ${marca.numero} · explica ${fmtContable(montoDeMarca(marca))} · ver la observación al pie`} />
          </a>
          <span className="whitespace-nowrap text-[10.5px] tabular-nums text-ink-500">{fmtContable(montoDeMarca(marca))}</span>
          {puedeEditar && (
            <>
              <button type="button" onClick={() => onMarcar(marca)} disabled={ocupado} title="Editar la marca" aria-label="Editar la marca" className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 disabled:opacity-60">
                <Icon name="edit" size={13} />
              </button>
              <button type="button" onClick={() => onQuitar(marca)} disabled={ocupado} title="Retirar la marca" aria-label="Retirar la marca" className="rounded p-1 text-ink-400 transition hover:bg-err-100 hover:text-err-700 disabled:opacity-60">
                <Icon name="trash" size={13} />
              </button>
            </>
          )}
        </div>
      ))}
      {fila.desactualizada && (
        <span className="whitespace-nowrap text-[10.5px] font-semibold text-warn-700" title={`Las marcas explican ${fmtContable(fila.explicado)} de ${fmtContable(fila.diferenciaEfectiva)}.`}>
          Por explicar {fmtContable(fila.porExplicar)}
        </span>
      )}
      <div className="flex items-center justify-center gap-1">
        {fila.admiteMarca && (puedeEditar ? (
          <button
            type="button"
            onClick={() => onMarcar(null)}
            title={fila.marcas.length > 0 ? "Agregar otra marca a este renglón" : "Poner una marca a esta diferencia"}
            aria-label={fila.marcas.length > 0 ? "Agregar otra marca" : "Poner una marca"}
            className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-dashed px-1 transition hover:border-navy-700 hover:text-navy-700 ${
              fila.marcas.length === 0 || fila.desactualizada ? "border-warn-500 text-warn-700" : "border-ink-300 text-ink-400"
            }`}
          >
            <Icon name="plus" size={12} />
          </button>
        ) : fila.marcas.length === 0 ? (
          <span title="Diferencia sin marca" className="text-[11.5px] font-semibold text-warn-700">—</span>
        ) : null)}
        {hilo}
      </div>
    </div>
  );
}

function ModalMarcaControl({
  fila,
  marca,
  encabezadoId,
  onClose,
  onGuardado,
}: {
  fila: FilaControlMarcada;
  /** La marca que se edita; null para agregar una nueva al renglón. */
  marca: MarcaCruce | null;
  encabezadoId: number;
  onClose: () => void;
  onGuardado: () => void;
}) {
  // Lo que falta por explicar sin contar esta marca: la diferencia menos lo que explican las demás.
  const otras = Math.round((fila.explicado - (marca ? montoDeMarca(marca) : 0)) * 100) / 100 + 0;
  const faltante = Math.round((fila.diferenciaEfectiva - otras) * 100) / 100 + 0;
  const [nota, setNota] = useState(marca?.nota ?? "");
  const [anexo, setAnexo] = useState(marca?.referenciaAnexo ?? "");
  const [montoTexto, setMontoTexto] = useState(textoMontoMarca(marca ? montoDeMarca(marca) : faltante));
  const [nuevos, setNuevos] = useState<File[]>([]);
  const [guardando, startGuardar] = useTransition();
  const monto = leerMontoMarca(montoTexto);

  const guardar = () => {
    const texto = nota.trim();
    if (!texto || monto == null || guardando) return;
    startGuardar(async () => {
      const datos = new FormData();
      datos.set("encabezadoId", String(encabezadoId));
      datos.set("dimension", "control");
      datos.set("clave", fila.cuentaCliente);
      if (marca) datos.set("numero", String(marca.numero));
      datos.set("monto", String(monto));
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

  const titulo = marca
    ? `${etiquetaMarca(marca.numero)} · control ${etiquetaControl(fila)}`
    : `${fila.marcas.length > 0 ? "Otra marca" : "Nueva marca"} · control ${etiquetaControl(fila)}`;

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
          disabled={!nota.trim() || monto == null || guardando}
          className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {guardando ? "Guardando…" : marca ? "Guardar cambios" : "Poner marca"}
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
        <CampoMontoMarca texto={montoTexto} onCambiar={setMontoTexto} faltante={faltante} cifra={fila.diferenciaEfectiva} otras={otras} />
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-ink-700">Detalle de la marca</span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, MAX_NOTA_MARCA))}
            rows={5}
            autoFocus
            placeholder="Explica a qué corresponde este monto de la diferencia de la deducción y cómo se soporta al corte."
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
        <EditorSoportesMarca encabezadoId={encabezadoId} yaGuardados={marca?.adjuntos ?? []} nuevos={nuevos} onCambiarNuevos={setNuevos} />
        <p className="text-[11.5px] text-ink-500">
          Un renglón puede llevar varias marcas: cada una explica su monto y, para cerrar, entre todas tienen que cubrir la diferencia. Quedan numeradas en el control de deducciones con su detalle en Observaciones; la numeración es la misma del cruce contable.
        </p>
      </div>
    </Modal>
  );
}
