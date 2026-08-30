"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Modal } from "@/components/modal";
import { Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { notifyActionState, notifyError, notifySuccess } from "@/lib/client-notifications";
import {
  listarPerfilesCargaModulo,
  actualizarPerfilCargaModulo,
  eliminarPerfilCargaModulo,
  guardarAjustesCargaModulo,
  type PerfilCargaModuloResumen,
  type PerfilesCargaModuloState,
  type RolPerfilModulo,
} from "@/app/actions/perfiles-carga-modulos";
import type { ActionState } from "@/lib/definitions";
import { fmtDate } from "@/lib/format";
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";
import {
  MODOS_CLASIFICADOR,
  MODOS_SUBTOTALES,
  descripcionModoClasificador,
  descripcionModoSubtotales,
  letraColumnaModulo,
  modoClasificadorDe,
  type ModoClasificador,
  type ModoSubtotales,
} from "@/lib/modulos/perfil-modulo";

const TIPO_LEGIBLE: Record<string, string> = {
  texto: "Texto",
  numero: "Cantidad",
  moneda: "Monto en pesos",
  fecha: "Fecha",
};

/**
 * Personalización de la CARGA de UN MÓDULO (Inventarios, Cartera, CxP, Ingresos,
 * Activos Fijos, Nómina) para UN cliente, dentro de Configuración › Perfiles de carga
 * (ruta admin-only, permiso `perfiles_carga:administrar`): perfiles de formato (mapeo
 * de columnas) guardados automáticamente al leer el archivo, y preferencias por defecto
 * (hoja, notas) que el asistente aplica cuando se elige el cliente.
 *
 * Es el gemelo de `AjustesCargaModal` (balance): mismos modos y misma disposición.
 * Todos los módulos se administran exactamente igual; solo cambia el descriptor
 * (los roles de columna que trae `data.roles`).
 *
 * `modo="ver"`: solo lectura (ojo en el listado). `modo="editar"`: permite cambiar y
 * borrar. Desde «ver» se puede pasar a editar con el botón del pie.
 */
export function AjustesCargaModuloModal({
  cliente,
  moduloCodigo,
  moduloLabel,
  modo = "editar",
  onPasarAEditar,
  onClose,
}: {
  cliente: { id: number; name: string; nit: string };
  moduloCodigo: string;
  moduloLabel: string;
  modo?: "ver" | "editar";
  onPasarAEditar?: () => void;
  onClose: () => void;
}) {
  const soloLectura = modo === "ver";
  const [data, setData] = useState<PerfilesCargaModuloState | null>(null);
  const [cargando, setCargando] = useState(true);
  const [perfilAbierto, setPerfilAbierto] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      try {
        const res = await listarPerfilesCargaModulo(cliente.id, moduloCodigo);
        if (vivo) setData(res);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [cliente.id, moduloCodigo]);

  const recargar = async () => {
    setData(await listarPerfilesCargaModulo(cliente.id, moduloCodigo));
  };

  const [saveState, saveAction, guardando] = useActionState<ActionState, FormData>(guardarAjustesCargaModulo, {});
  useEffect(() => {
    notifyActionState(saveState, { success: "Preferencias de carga guardadas.", error: "No se pudieron guardar las preferencias." });
    // React 19 reinicia el <form action> al terminar la acción: sin recargar, los
    // campos volverían a los valores VIEJOS aunque el guardado haya sido exitoso.
    if (saveState?.ok) void listarPerfilesCargaModulo(cliente.id, moduloCodigo).then(setData);
  }, [saveState, cliente.id, moduloCodigo]);

  const [eliminando, startEliminar] = useTransition();
  const [eliminandoObjetivo, setEliminandoObjetivo] = useState<number | null>(null);
  const eliminar = (id: number) => {
    if (!confirm(`¿Eliminar este perfil? La próxima carga de ${moduloLabel.toLowerCase()} con ese formato volverá a sugerir el mapeo de columnas desde cero.`)) return;
    setEliminandoObjetivo(id);
    startEliminar(async () => {
      try {
        const res = await eliminarPerfilCargaModulo(id);
        if (res.ok) {
          notifySuccess("Perfil eliminado.");
          await recargar();
        } else {
          notifyError(res.message ?? "No se pudo eliminar el perfil.");
        }
      } finally {
        setEliminandoObjetivo(null);
      }
    });
  };

  const etiquetaModulo = data?.moduloLabel ?? moduloLabel;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${soloLectura ? "Ver" : "Editar"} perfiles en memoria · ${cliente.name} · ${etiquetaModulo}`}
      size="4xl"
      footer={
        // No hay botón «Cerrar»: el modal ya se cierra con la X del header
        // (convención del proyecto en `src/components/modal.tsx` / CLAUDE.md).
        soloLectura ? (
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-[11.5px] text-ink-400">Solo lectura · no se guarda ningún cambio</span>
            {onPasarAEditar && (
              <button
                type="button"
                onClick={onPasarAEditar}
                className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-navy-600"
              >
                <Icon name="edit" size={13} />
                Editar
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      {cargando ? (
        <p className="px-1 py-6 text-center text-[12.5px] text-ink-400"><EstadoProcesando>Cargando perfiles y preferencias</EstadoProcesando></p>
      ) : !data?.ok ? (
        <p className="rounded-md border border-err-200 bg-err-50 px-3 py-2.5 text-[12.5px] text-err-700">
          {data?.message ?? "No se pudo consultar la información."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {soloLectura && (
            <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
              Estás viendo la memoria de carga de <strong>{etiquetaModulo}</strong> en solo lectura. Usa{" "}
              <strong>Editar</strong> si necesitas cambiar formatos o preferencias.
            </p>
          )}

          {/* ---- Perfiles de formato guardados ---- */}
          <section className="flex flex-col gap-2">
            <div>
              <h3 className="text-[12.5px] font-semibold text-ink-800">Perfiles de formato guardados</h3>
              <p className="text-[11.5px] leading-relaxed text-ink-500">
                El mapeo de columnas del archivo memorizado por formato: con perfil, la próxima carga de{" "}
                {etiquetaModulo.toLowerCase()} de este cliente aplica el mismo mapeo al instante y{" "}
                <span className="font-semibold">sin volver a sugerirlo</span>. Se crean automáticamente al leer el archivo en{" "}
                <span className="font-semibold">Módulos › {etiquetaModulo}</span>.
              </p>
            </div>
            {data.perfiles.length === 0 ? (
              <p className="rounded-md border border-dashed border-ink-200 bg-ink-50 px-3 py-3 text-center text-[11.5px] text-ink-400">
                Este cliente aún no tiene un formato de {etiquetaModulo.toLowerCase()} memorizado. El próximo se creará automáticamente al leer un archivo.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.perfiles.map((p, indice) => {
                  const abierto = perfilAbierto === p.id;
                  return (
                    <article
                      key={p.id}
                      className={`overflow-hidden rounded-lg border transition ${
                        abierto
                          ? "border-blue-300 bg-white shadow-sm"
                          : "border-ink-150 bg-white hover:border-ink-200"
                      }`}
                    >
                      <div className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={() => setPerfilAbierto((actual) => actual === p.id ? null : p.id)}
                          aria-expanded={abierto}
                          aria-controls={`perfil-carga-modulo-${p.id}`}
                          className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        >
                          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                            abierto ? "bg-blue-100 text-blue-600" : "bg-ink-50 text-ink-500"
                          }`}>
                            <Icon name={abierto ? "eye" : "doc"} size={15} />
                          </span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-[12.5px] font-semibold text-ink-800">
                                Formato {indice + 1} · hoja «{p.hoja || "sin nombre"}»
                              </span>
                              <Chip
                                label={p.origen === "manual" ? "Revisado manualmente" : "Detectado automáticamente"}
                                tone={p.origen === "manual" ? "blue" : "ai"}
                              />
                            </span>
                            <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-500">
                              {p.resumenColumnas || "Sin columnas mapeadas: revisa la estructura."}
                            </span>
                            <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-ink-400">
                              <span>{p.vecesUsado} {p.vecesUsado === 1 ? "uso" : "usos"}</span>
                              <span>Último uso: {fmtDate(p.ultimoUsoEn)}</span>
                              <span className="max-w-[280px] truncate font-mono" title={p.archivoEjemplo ?? undefined}>
                                Archivo: {p.archivoEjemplo ?? "sin ejemplo"}
                              </span>
                            </span>
                          </span>
                        </button>

                        <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => setPerfilAbierto((actual) => actual === p.id ? null : p.id)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            <Icon name={abierto ? "eye-off" : "eye"} size={13} />
                            {abierto
                              ? "Ocultar estructura"
                              : soloLectura
                                ? "Ver estructura"
                                : "Ver y editar"}
                          </button>
                          {!soloLectura && (
                            <button
                              type="button"
                              disabled={eliminando}
                              onClick={() => eliminar(p.id)}
                              title="Eliminar perfil (la próxima carga volverá a sugerir el mapeo)"
                              aria-label={`Eliminar formato ${indice + 1}`}
                              className="rounded-md border border-transparent p-1.5 text-ink-400 hover:border-err-200 hover:bg-err-50 hover:text-err-700 disabled:opacity-50"
                            >
                              {eliminandoObjetivo === p.id ? (
                                <EstadoProcesando etiqueta="Eliminando perfil" />
                              ) : (
                                <Icon name="trash" size={14} />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {abierto && (
                        <div id={`perfil-carga-modulo-${p.id}`} className="border-t border-blue-100 bg-blue-50/20 px-3.5 py-3.5">
                          <PerfilCargaModuloDetalle
                            key={`${p.id}:${p.actualizadoEn}:${modo}`}
                            perfil={p}
                            roles={data.roles}
                            clasificadorRol={data.clasificadorRol}
                            moduloLabel={etiquetaModulo}
                            soloLectura={soloLectura}
                            onActualizado={recargar}
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* ---- Preferencias por defecto ---- */}
          <section className="flex flex-col gap-2 border-t border-ink-100 pt-3">
            <div>
              <h3 className="text-[12.5px] font-semibold text-ink-800">Preferencias de carga</h3>
              <p className="text-[11.5px] leading-relaxed text-ink-500">
                Se aplican automáticamente al elegir este cliente en <span className="font-semibold">Módulos › {etiquetaModulo}</span>:
                la hoja preferida queda preseleccionada y las notas aparecen como aviso al cargar y al revisar el borrador. «Auto» deja que la lectura decida.
              </p>
            </div>
            <form
              // Remonta el formulario cuando cambian las preferencias cargadas para
              // que los `defaultValue` reflejen lo último guardado.
              key={`${data.ajustes?.hojaPreferida ?? ""}|${data.ajustes?.observaciones ?? ""}`}
              action={soloLectura ? undefined : saveAction}
              onSubmit={soloLectura ? (e) => e.preventDefault() : undefined}
              className="flex flex-col gap-3"
            >
              <input type="hidden" name="clienteId" value={cliente.id} />
              <input type="hidden" name="moduloCodigo" value={data.moduloCodigo} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-600">Hoja preferida (nombre exacto en el Excel)</span>
                  <input
                    type="text"
                    name="hojaPreferida"
                    defaultValue={data.ajustes?.hojaPreferida ?? ""}
                    placeholder="Auto (el usuario elige / se detecta)"
                    readOnly={soloLectura}
                    disabled={soloLectura}
                    className="rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] text-ink-700 outline-none focus:border-blue-400 disabled:cursor-default disabled:bg-ink-50 disabled:text-ink-600"
                  />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-[11px] font-medium text-ink-600">Notas / observaciones de carga</span>
                  <textarea
                    name="observaciones"
                    defaultValue={data.ajustes?.observaciones ?? ""}
                    rows={3}
                    maxLength={2000}
                    readOnly={soloLectura}
                    disabled={soloLectura}
                    placeholder={`Particularidades del archivo de ${etiquetaModulo.toLowerCase()} de este cliente para recordar en cada carga (p. ej. «el tipo viene en renglones de sección; la última hoja es un resumen»).`}
                    className="resize-y rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12.5px] leading-relaxed text-ink-700 outline-none focus:border-blue-400 disabled:cursor-default disabled:bg-ink-50 disabled:text-ink-600"
                  />
                  <span className="text-[10.5px] leading-relaxed text-ink-400">
                    Texto libre. Aparecen como aviso al cargar y revisar el borrador de {etiquetaModulo.toLowerCase()} de este cliente. No cambian el cálculo; sirven de memoria para el equipo.
                  </span>
                </label>
              </div>
              {!soloLectura && saveState?.message && !saveState.ok && (
                <p className="text-[12px] font-medium text-err-700">{saveState.message}</p>
              )}
              {!soloLectura && (
                <button
                  type="submit"
                  disabled={guardando}
                  className="w-fit rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
                >
                  {guardando ? <EstadoProcesando>Guardando</EstadoProcesando> : "Guardar preferencias"}
                </button>
              )}
            </form>
          </section>
        </div>
      )}
    </Modal>
  );
}

function ubicacionColumna(numero: number): string {
  return numero > 0 ? `Columna ${letraColumnaModulo(numero)} · posición ${numero}` : "No se lee en este formato";
}

const CLASE_INPUT =
  "rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[12px] text-ink-700 outline-none focus:border-blue-400 disabled:cursor-default disabled:bg-ink-50 disabled:text-ink-500";

function PerfilCargaModuloDetalle({
  perfil,
  roles,
  clasificadorRol,
  moduloLabel,
  soloLectura = false,
  onActualizado,
}: {
  perfil: PerfilCargaModuloResumen;
  roles: RolPerfilModulo[];
  clasificadorRol: string;
  moduloLabel: string;
  soloLectura?: boolean;
  onActualizado: () => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [estructura, setEstructura] = useState<SpecModulo>(perfil.estructura);
  const [error, setError] = useState<string | null>(null);
  const [guardando, startGuardar] = useTransition();

  const rolClasificador = roles.find((r) => r.nombre === clasificadorRol);
  const etiquetaClasificador = rolClasificador?.etiqueta ?? "clasificador";
  const modo = modoClasificadorDe(estructura);
  const modoGuardado = modoClasificadorDe(perfil.estructura);
  const rolSenal = estructura.seccionColumnaVaciaRol ?? "descripcion";
  const modoSubtotales: ModoSubtotales = estructura.subtotales ?? "auto";
  const cambiarModoSubtotales = (siguiente: ModoSubtotales) =>
    setEstructura((actual) => ({ ...actual, subtotales: siguiente === "auto" ? undefined : siguiente }));

  const cambiarColumna = (rol: string, valor: number) => {
    const normalizado = Number.isInteger(valor) && valor >= 0 ? valor : 0;
    setEstructura((actual) => ({ ...actual, columnas: { ...actual.columnas, [rol]: normalizado } }));
  };
  const cambiarModo = (siguiente: ModoClasificador) => {
    setEstructura((actual) => ({
      ...actual,
      clasificadorModo: siguiente,
      arrastrarClasificador: undefined,
      seccionColumnaVaciaRol: siguiente === "seccion"
        ? actual.seccionColumnaVaciaRol ?? roles.find((r) => r.nombre !== clasificadorRol)?.nombre
        : undefined,
    }));
  };

  const cancelar = () => {
    setEstructura(perfil.estructura);
    setError(null);
    setEditando(false);
  };

  const guardar = () => {
    setError(null);
    startGuardar(async () => {
      const respuesta = await actualizarPerfilCargaModulo({
        id: perfil.id,
        actualizadoEn: perfil.actualizadoEn,
        estructura,
      });
      if (!respuesta.ok) {
        setError(respuesta.message ?? "No se pudo actualizar el perfil.");
        notifyError(respuesta.message ?? "No se pudo actualizar el perfil.");
        return;
      }
      notifySuccess(respuesta.message ?? "Perfil actualizado.");
      setEditando(false);
      await onActualizado();
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-blue-700">
            Estructura completa del formato
          </div>
          <h4 className="mt-0.5 font-serif text-lg text-ink-900">Así leerá la plataforma este archivo de {moduloLabel.toLowerCase()}</h4>
          <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-ink-500">
            Cada fila muestra el dato del módulo y la columna exacta que se tomará. “No se lee” significa que
            este formato no trae ese dato; si el módulo sabe derivarlo (p. ej. valor total = cantidad × unitario), lo calcula.
          </p>
        </div>
        {!soloLectura && !editando && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md bg-navy-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600"
          >
            <Icon name="settings" size={13} />
            Editar estructura
          </button>
        )}
      </div>

      {!editando ? (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-ink-150 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Hoja del archivo</div>
              <div className="mt-1 break-words text-[12.5px] font-semibold text-ink-800">{perfil.estructura.hoja || "—"}</div>
            </div>
            <div className="rounded-md border border-ink-150 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Fila del encabezado</div>
              <div className="mt-1 text-[12.5px] font-semibold tabular-nums text-ink-800">
                Fila {perfil.estructura.filaEncabezado}
              </div>
              <div className="mt-0.5 text-[10.5px] text-ink-400">Donde están los títulos de columna</div>
            </div>
            <div className="rounded-md border border-ink-150 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Inicio de los datos</div>
              <div className="mt-1 text-[12.5px] font-semibold tabular-nums text-ink-800">
                Fila {perfil.estructura.primeraFilaDatos}
              </div>
              <div className="mt-0.5 text-[10.5px] text-ink-400">Primera fila con ítems del módulo</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-ink-150 bg-white">
            <table className="w-full min-w-[650px] text-[11.5px]">
              <thead className="bg-ink-50 text-left text-ink-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Dato que se busca</th>
                  <th className="px-3 py-2 font-semibold">Ubicación guardada</th>
                  <th className="px-3 py-2 font-semibold">Tipo de dato</th>
                  <th className="px-3 py-2 text-center font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((rol) => {
                  const numero = perfil.estructura.columnas[rol.nombre] ?? 0;
                  const esClasificador = rol.nombre === clasificadorRol;
                  const global = esClasificador && modoGuardado === "global";
                  const usada = numero > 0;
                  return (
                    <tr key={rol.nombre} className="border-t border-ink-100">
                      <td className="px-3 py-2 font-medium text-ink-700">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {rol.etiqueta}
                          {esClasificador && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-blue-700">clasifica</span>
                          )}
                        </span>
                      </td>
                      <td className={`px-3 py-2 font-mono text-[10.5px] ${usada || global ? "text-ink-700" : "text-ink-400"}`}>
                        {global ? "Sin columna · un solo grupo global" : ubicacionColumna(numero)}
                      </td>
                      <td className="px-3 py-2 text-ink-500">{TIPO_LEGIBLE[rol.tipo] ?? rol.tipo}</td>
                      <td className="px-3 py-2 text-center">
                        {rol.requerido && !global
                          ? <Chip label={usada ? "Obligatoria" : "Obligatoria · falta"} tone={usada ? "blue" : "err"} />
                          : <Chip label={usada || global ? "Se lee" : "No se lee"} tone={usada || global ? "ok" : "ink"} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-ink-150 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Cómo viene el {etiquetaClasificador.toLowerCase()}</div>
              <div className="mt-1 text-[11.5px] font-semibold leading-relaxed text-ink-700">
                {descripcionModoClasificador(modoGuardado, etiquetaClasificador)}
              </div>
            </div>
            <div className="rounded-md border border-ink-150 bg-white px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Subtotales del archivo</div>
              <div className="mt-1 text-[11.5px] font-semibold leading-relaxed text-ink-700">
                {descripcionModoSubtotales(perfil.estructura.subtotales ?? "auto")}
              </div>
            </div>
            {modoGuardado === "seccion" && (
              <div className="rounded-md border border-ink-150 bg-white px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Señal del renglón de sección</div>
                <div className="mt-1 text-[11.5px] font-semibold leading-relaxed text-ink-700">
                  Columna «{roles.find((r) => r.nombre === perfil.estructura.seccionColumnaVaciaRol)?.etiqueta ?? perfil.estructura.seccionColumnaVaciaRol ?? "sin definir"}» vacía
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 pt-2 text-[10.5px] text-ink-400">
            <span>Identificador del formato: <span className="font-mono">{perfil.huella}</span></span>
            <span>Actualizado: {fmtDate(perfil.actualizadoEn)}</span>
            <span>Los cambios aplican a cargas futuras; no modifican datos ya cargados.</span>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border border-blue-200 bg-white p-3.5">
          <div className="flex items-start gap-2 rounded-md border border-warn-200 bg-warn-100/60 px-3 py-2.5 text-[11.5px] leading-relaxed text-warn-700">
            <Icon name="info" size={14} className="mt-0.5 shrink-0" />
            <p>
              Estás cambiando cómo se interpretarán las <span className="font-semibold">próximas cargas</span> de
              este mismo formato de {moduloLabel.toLowerCase()}. Los datos ya cargados no se alteran. Usa 0 únicamente
              cuando el archivo no trae una columna.
            </p>
          </div>

          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <legend className="mb-2 text-[12px] font-semibold text-ink-800">1. Ubicación de la tabla</legend>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Nombre exacto de la hoja</span>
              <input
                type="text"
                value={estructura.hoja}
                maxLength={120}
                onChange={(evento) => setEstructura((actual) => ({ ...actual, hoja: evento.target.value }))}
                className={CLASE_INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Fila del encabezado</span>
              <input
                type="number"
                min={1}
                value={estructura.filaEncabezado}
                onChange={(evento) => setEstructura((actual) => ({ ...actual, filaEncabezado: Number(evento.target.value) || 0 }))}
                className={`${CLASE_INPUT} tabular-nums`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Primera fila con datos</span>
              <input
                type="number"
                min={2}
                value={estructura.primeraFilaDatos}
                onChange={(evento) => setEstructura((actual) => ({ ...actual, primeraFilaDatos: Number(evento.target.value) || 0 }))}
                className={`${CLASE_INPUT} tabular-nums`}
              />
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-3 border-t border-ink-100 pt-3">
            <legend className="pr-2 text-[12px] font-semibold text-ink-800">2. Mapa completo de columnas</legend>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((rol) => {
                const numero = estructura.columnas[rol.nombre] ?? 0;
                const esClasificador = rol.nombre === clasificadorRol;
                const deshabilitado = esClasificador && modo === "global";
                return (
                  <label key={rol.nombre} className="flex flex-col gap-1 rounded-md border border-ink-150 p-2.5">
                    <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-ink-700">
                      {rol.etiqueta}
                      {rol.requerido && <span className="text-err-700">*</span>}
                      {esClasificador && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-blue-700">clasifica</span>
                      )}
                    </span>
                    <span className="min-h-4 text-[10.5px] leading-relaxed text-ink-400">{TIPO_LEGIBLE[rol.tipo] ?? rol.tipo}</span>
                    <input
                      type="number"
                      min={0}
                      value={deshabilitado ? 0 : numero}
                      disabled={deshabilitado}
                      onChange={(evento) => cambiarColumna(rol.nombre, Number(evento.target.value))}
                      aria-label={`Número de columna para ${rol.etiqueta}`}
                      className={`${CLASE_INPUT} px-2 py-1.5 tabular-nums`}
                    />
                    <span className={`text-[10px] ${!deshabilitado && numero > 0 ? "font-medium text-blue-600" : "text-ink-400"}`}>
                      {deshabilitado ? "No se lee: modo global" : ubicacionColumna(numero)}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="grid grid-cols-1 gap-3 border-t border-ink-100 pt-3 sm:grid-cols-2">
            <legend className="mb-2 pr-2 text-[12px] font-semibold text-ink-800">3. Cómo viene el {etiquetaClasificador.toLowerCase()}</legend>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Modo del {etiquetaClasificador.toLowerCase()}</span>
              <select
                value={modo}
                onChange={(evento) => cambiarModo(evento.target.value as ModoClasificador)}
                className={CLASE_INPUT}
              >
                {MODOS_CLASIFICADOR.map((m) => (
                  <option key={m} value={m}>
                    {m === "columna" && "En su propia columna, en cada fila"}
                    {m === "arrastrar" && "Agrupado en su columna (una vez por bloque; se arrastra)"}
                    {m === "seccion" && "En renglones de sección (encabezados de grupo) intercalados con los ítems"}
                    {m === "global" && "Sin columna: todo el archivo es un único grupo global"}
                  </option>
                ))}
              </select>
            </label>
            {modo === "seccion" && (
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-ink-600">El renglón de sección se reconoce porque está vacía la columna:</span>
                <select
                  value={rolSenal}
                  onChange={(evento) => setEstructura((actual) => ({ ...actual, seccionColumnaVaciaRol: evento.target.value }))}
                  className={CLASE_INPUT}
                >
                  {roles.filter((r) => r.nombre !== clasificadorRol).map((r) => (
                    <option key={r.nombre} value={r.nombre}>{r.etiqueta}</option>
                  ))}
                </select>
                <span className="text-[10.5px] leading-relaxed text-ink-400">
                  El {etiquetaClasificador.toLowerCase()} va en la misma columna que otro campo (p. ej. el código): esa otra columna debe venir vacía en los renglones de sección.
                </span>
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Subtotales del archivo</span>
              <select
                value={modoSubtotales}
                onChange={(evento) => cambiarModoSubtotales(evento.target.value as ModoSubtotales)}
                className={CLASE_INPUT}
              >
                {MODOS_SUBTOTALES.map((m) => (
                  <option key={m} value={m}>{descripcionModoSubtotales(m)}</option>
                ))}
              </select>
              <span className="text-[10.5px] leading-relaxed text-ink-400">
                Las filas de subtotal no se cargan: el borrador las compara con la suma de sus movimientos y avisa si no cuadran.
              </span>
            </label>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-md border border-err-200 bg-err-50 px-3 py-2 text-[11.5px] font-medium text-err-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 pt-3">
            <button
              type="button"
              disabled={guardando}
              onClick={cancelar}
              className="rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={guardando}
              onClick={guardar}
              className="rounded-md bg-navy-700 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60"
            >
              {guardando ? <EstadoProcesando>Guardando perfil</EstadoProcesando> : "Guardar estructura del perfil"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
