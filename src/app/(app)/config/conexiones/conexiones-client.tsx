"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { Card, Chip, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { EstadoProcesando } from "@/components/estado-procesando";
import { Modal } from "@/components/modal";
import { fmtDateTime } from "@/lib/format";
import {
  CATEGORIAS,
  etiquetaCategoria,
  etiquetaEntorno,
  iconoCategoria,
  proveedorPorClave,
} from "@/lib/conexiones/tipos";
import {
  notifyActionState,
  notifyError,
  notifyInfo,
  notifySuccess,
} from "@/lib/client-notifications";
import {
  cambiarEstadoConexion,
  ejecutarConexionAction,
  eliminarConexion,
  probarConexionAction,
  enviarPruebaSmtpAction,
  type ConexionActionState,
} from "@/app/actions/conexiones";
import { ConexionModal, type ConexionVista } from "./conexion-modal";

type Ocupacion = "probar" | "ejecutar" | "estado" | "correo";

type EnvioVista = { id: number; conexion: string; fecha: Date; estado: string; mensaje: string | null };

export default function ConexionesClient({ conexiones, envios = [], puedeAdministrar = false, cifradoListo = false }: {
  conexiones: ConexionVista[];
  envios?: EnvioVista[];
  puedeAdministrar?: boolean;
  cifradoListo?: boolean;
}) {
  const [q, setQ] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("TODAS");
  const [modal, setModal] = useState<{ conexion?: ConexionVista; proveedorInicial?: string } | null>(null);
  const [porEliminar, setPorEliminar] = useState<ConexionVista | null>(null);
  const [ocupadas, setOcupadas] = useState<Record<number, Ocupacion>>({});
  const [, startTransition] = useTransition();

  const filtradas = useMemo(() => {
    const aguja = q.trim().toLowerCase();
    return conexiones.filter((c) => {
      if (categoriaFiltro === "IA" && !proveedorPorClave(c.proveedor)?.inteligenciaArtificial) return false;
      if (categoriaFiltro !== "TODAS" && categoriaFiltro !== "IA" && c.categoria !== categoriaFiltro) return false;
      if (!aguja) return true;
      const proveedor = proveedorPorClave(c.proveedor)?.label ?? c.proveedor;
      return (
        c.nombre.toLowerCase().includes(aguja) ||
        c.codigo.toLowerCase().includes(aguja) ||
        (c.descripcion ?? "").toLowerCase().includes(aguja) ||
        c.proveedor.toLowerCase().includes(aguja) ||
        proveedor.toLowerCase().includes(aguja) ||
        etiquetaCategoria(c.categoria).toLowerCase().includes(aguja) ||
        etiquetaEntorno(c.entorno).toLowerCase().includes(aguja)
      );
    });
  }, [conexiones, q, categoriaFiltro]);

  const configuradas = conexiones.length;
  const activas = conexiones.filter((c) => c.activa).length;
  const conPruebaOk = conexiones.filter((c) => c.ultimaPruebaOk === true).length;

  function ejecutarEnTarjeta(id: number, tipo: Ocupacion, accion: () => Promise<ConexionActionState>) {
    setOcupadas((previas) => ({ ...previas, [id]: tipo }));
    startTransition(async () => {
      try {
        const res = await accion();
        if (res.estado === "omitida") {
          notifyInfo("Sin ejecución automática", res.message);
        } else if (res.ok) {
          notifySuccess(tipo === "correo" ? "Correo aceptado por SMTP" : tipo === "probar" ? "Prueba correcta" : "Ejecución completada", res.message);
        } else {
          notifyError(tipo === "correo" ? "No se pudo enviar el correo" : tipo === "probar" ? "La prueba falló" : "La ejecución falló", res.message);
        }
      } catch {
        notifyError("No se pudo completar la operación");
      } finally {
        setOcupadas((previas) => {
          const siguiente = { ...previas };
          delete siguiente[id];
          return siguiente;
        });
      }
    });
  }

  function alternarEstado(conexion: ConexionVista) {
    setOcupadas((previas) => ({ ...previas, [conexion.id]: "estado" }));
    startTransition(async () => {
      try {
        const res = await cambiarEstadoConexion(conexion.id, !conexion.activa);
        if (res.ok) notifySuccess(res.message ?? "Estado actualizado.");
        else notifyError(res.message ?? "No se pudo cambiar el estado.");
      } catch {
        notifyError("No se pudo cambiar el estado.");
      } finally {
        setOcupadas((previas) => {
          const siguiente = { ...previas };
          delete siguiente[conexion.id];
          return siguiente;
        });
      }
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-ink-100 pb-4">
        <div>
          <div className="flex items-center gap-2 text-ink-500">
            <Icon name="link" size={16} />
            <span className="text-[13px] font-medium tracking-wide">CONFIGURACIÓN</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-navy-800">
            Conexiones e integraciones
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-600">
            Parametriza tus servicios de inteligencia artificial, correo y otras conexiones
            desde un solo lugar.
          </p>
        </div>
        {puedeAdministrar && <button
          type="button"
          onClick={() => setModal({})}
          className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-navy-600"
        >
          <Icon name="plus" size={14} /> Nueva conexión
        </button>}
      </header>

      {!cifradoListo && <div role="status" className="rounded-lg border border-warn-200 bg-warn-100/50 px-4 py-3 text-[13px] text-warn-700">
        El servidor necesita su clave de cifrado antes de guardar credenciales. Configura MASTER_ENCRYPTION_KEY con 32 bytes.
      </div>}

      {puedeAdministrar && <div className="grid gap-3 sm:grid-cols-3">
        {([
          { proveedor: "anthropic", icono: "ai", titulo: "Inteligencia artificial", detalle: "Claude, Gemini, OpenAI y OpenRouter" },
          { proveedor: "smtp", icono: "send", titulo: "Correo SMTP", detalle: "Servidor, usuario y conexión segura" },
          { proveedor: "api_rest", icono: "link", titulo: "Otras conexiones", detalle: "APIs, Microsoft 365, S3 y webhooks" },
        ] as const).map((opcion) => <button key={opcion.proveedor} type="button"
          onClick={() => setModal({ proveedorInicial: opcion.proveedor })}
          className="group flex items-center gap-3 rounded-lg border border-ink-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-2 focus-visible:outline-blue-500">
          <span className="rounded-lg bg-navy-700 p-2.5 text-white"><Icon name={opcion.icono} size={20} /></span>
          <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold text-navy-800">{opcion.titulo}</span>
            <span className="mt-1 block text-[12px] text-ink-500">{opcion.detalle}</span></span>
          <Icon name="plus" size={14} />
        </button>)}
      </div>}

      <Card className="border-blue-100 bg-blue-50/60 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-500">
            <Icon name="info" size={16} />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-navy-800">Elige cómo se usa cada conexión</div>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-600">
              En Claude, Gemini y OpenRouter puedes seleccionar «Usar esta clave en Russell».
              Se aplicará a los procesos que ya usan ese proveedor, con sus modelos y permisos actuales.
              Si ninguna está seleccionada, se conserva la configuración del servidor.
              Selecciona un SMTP para enviar avisos de balances, menciones y respuestas de soporte. «Probar» verifica la conexión; «Enviar prueba a mi correo» envía un mensaje real a tu usuario. Los avisos automáticos se envían desde el servidor en producción.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-100 text-blue-500">
              <Icon name="link" size={16} />
            </div>
            <div>
              <div className="font-mono text-xl font-semibold text-ink-900">{configuradas}</div>
              <div className="text-[12px] text-ink-500">Configuradas</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-ok-100 text-ok-700">
              <Icon name="check" size={16} />
            </div>
            <div>
              <div className="font-mono text-xl font-semibold text-ok-700">{activas}</div>
              <div className="text-[12px] text-ink-500">Activas</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-100 text-navy-700">
              <Icon name="check" size={16} />
            </div>
            <div>
              <div className="font-mono text-xl font-semibold text-navy-800">{conPruebaOk}</div>
              <div className="text-[12px] text-ink-500">Prueba correcta</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-64 flex-1 items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-ink-400">
          <Icon name="search" size={15} />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Buscar conexiones por nombre, identificador o tipo…"
            className="w-full bg-transparent text-[13px] text-ink-700 outline-none placeholder:text-ink-400"
          />
        </div>
        <label className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-ink-600">Filtrar por categoría</span>
          <select
            value={categoriaFiltro}
            onChange={(event) => setCategoriaFiltro(event.target.value)}
            className="rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-700"
          >
            <option value="TODAS">Todas las categorías</option>
            <option value="IA">Inteligencia artificial</option>
            {CATEGORIAS.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtradas.length === 0 ? (
        <Card>
          <EmptyState
            icon="link"
            title={conexiones.length === 0 ? "Todavía no hay conexiones" : "Sin resultados"}
            description={
              conexiones.length === 0
                ? "Crea la primera conexión para administrar sus credenciales, probarlas y ver su último uso."
                : "Ajusta la búsqueda o el filtro de categoría para encontrar la conexión."
            }
            action={
              conexiones.length === 0 && puedeAdministrar ? (
                <button
                  type="button"
                  onClick={() => setModal({})}
                  className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600"
                >
                  <Icon name="plus" size={13} /> Nueva conexión
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {filtradas.map((conexion) => (
            <TarjetaConexion
              key={conexion.id}
              conexion={conexion}
              puedeAdministrar={puedeAdministrar}
              ocupacion={ocupadas[conexion.id]}
              onEditar={() => setModal({ conexion })}
              onEliminar={() => setPorEliminar(conexion)}
              onProbarCorreo={() => ejecutarEnTarjeta(conexion.id, "correo", () => enviarPruebaSmtpAction(conexion.id))}
              onProbar={() =>
                ejecutarEnTarjeta(conexion.id, "probar", () => probarConexionAction(conexion.id))
              }
              onEjecutar={() =>
                ejecutarEnTarjeta(conexion.id, "ejecutar", () => ejecutarConexionAction(conexion.id))
              }
              onAlternarEstado={() => alternarEstado(conexion)}
            />
          ))}
        </div>
      )}

      {envios.length > 0 && <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-navy-800">Últimos envíos de correo</h2>
        <p className="mt-1 text-[12px] text-ink-500">Aceptado por SMTP indica que el servidor recibió el mensaje. Comprueba la bandeja de entrada y correo no deseado.</p>
        <ul className="mt-4 divide-y divide-ink-100">
          {envios.map((envio) => <li key={envio.id} className="flex flex-wrap items-start gap-2 py-3 text-[12px]">
            <Chip label={envio.estado === "ok" ? "Aceptado" : "Error"} tone={envio.estado === "ok" ? "ok" : "err"} />
            <div className="min-w-0 flex-1"><p className="font-semibold text-ink-700">{envio.conexion} · {fmtDateTime(envio.fecha)}</p><p className="mt-1 break-words text-ink-500">{envio.mensaje}</p></div>
          </li>)}
        </ul>
      </Card>}

      {modal && (
        <ConexionModal
          key={modal.conexion?.id ?? "nueva"}
          conexion={modal.conexion}
          proveedorInicial={modal.proveedorInicial}
          onClose={() => setModal(null)}
        />
      )}
      {porEliminar && (
        <EliminarConexionModal conexion={porEliminar} onClose={() => setPorEliminar(null)} />
      )}
    </div>
  );
}

function TarjetaConexion({
  conexion,
  puedeAdministrar,
  ocupacion,
  onEditar,
  onEliminar,
  onProbar,
  onProbarCorreo,
  onEjecutar,
  onAlternarEstado,
}: {
  conexion: ConexionVista;
  puedeAdministrar: boolean;
  ocupacion?: Ocupacion;
  onEditar: () => void;
  onEliminar: () => void;
  onProbar: () => void;
  onProbarCorreo: () => void;
  onEjecutar: () => void;
  onAlternarEstado: () => void;
}) {
  const proveedor = proveedorPorClave(conexion.proveedor);
  const probando = ocupacion === "probar";
  const ejecutando = ocupacion === "ejecutar" || ocupacion === "correo";
  const cambiandoEstado = ocupacion === "estado";
  const mensajePrueba = conexion.ultimaPruebaMensaje;
  const pruebaOk = conexion.ultimaPruebaOk === true;
  const pruebaFallo = conexion.ultimaPruebaOk === false;

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-500">
            <Icon name={iconoCategoria(conexion.categoria)} size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">
              {etiquetaCategoria(conexion.categoria)} · {etiquetaEntorno(conexion.entorno)}
            </div>
            <h2 className="truncate text-[15px] font-semibold text-ink-900" title={conexion.nombre}>
              {conexion.nombre}
            </h2>
          </div>
        </div>
        <Chip label={conexion.activa ? "Activa" : "Inactiva"} tone={conexion.activa ? "ok" : "ink"} />
      </div>

      <p className="mt-3 line-clamp-2 min-h-8 text-[12.5px] leading-relaxed text-ink-500">
        {conexion.descripcion ?? proveedor?.descripcion ?? "Sin descripción."}
      </p>
      {conexion.configuracion.usar_en_plataforma === true && conexion.activa && conexion.entorno === "PRODUCCION" &&
        <p className="mt-2 text-[11px] font-semibold text-blue-500">Clave seleccionada para Russell</p>}

      {conexion.configuracion.usar_para_notificaciones === true && conexion.activa && conexion.entorno === "PRODUCCION" &&
        <p className="mt-2 text-[11px] font-semibold text-blue-500">SMTP de notificaciones de Russell</p>}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            Identificador
          </div>
          <div className="mt-0.5 truncate font-mono text-[12px] text-ink-700" title={conexion.codigo}>
            {conexion.codigo}
          </div>
        </div>
        <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            Última prueba
          </div>
          <div className="mt-0.5 truncate text-[12px] text-ink-700">
            {conexion.ultimaPruebaEn ? fmtDateTime(conexion.ultimaPruebaEn) : "Sin probar"}
          </div>
        </div>
        <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            Último uso
          </div>
          <div className="mt-0.5 truncate text-[12px] text-ink-700">
            {conexion.ultimoUsoEn ? fmtDateTime(conexion.ultimoUsoEn) : "Sin usar"}
          </div>
        </div>
        <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            Proveedor
          </div>
          <div className="mt-0.5 truncate text-[12px] text-ink-700">
            {proveedor?.label ?? conexion.proveedor}
          </div>
        </div>
      </div>

      <div className="mt-3 min-h-9">
        {mensajePrueba ? (
          <div
            className={`flex items-start gap-1.5 rounded-md px-2.5 py-2 text-[11.5px] leading-snug ${
              pruebaOk ? "bg-ok-100/70 text-ok-700" : pruebaFallo ? "bg-err-100/70 text-err-700" : "bg-ink-50 text-ink-600"
            }`}
          >
            <span className="mt-0.5 shrink-0">
              <Icon name={pruebaOk ? "check" : "warn"} size={12} />
            </span>
            <span>{mensajePrueba}</span>
          </div>
        ) : (
          <p className="px-1 text-[11.5px] text-ink-400">
            Prueba la conexión para validar sus credenciales.
          </p>
        )}
      </div>

      {proveedor?.prueba.tipo === "smtp" && conexion.ultimaEjecucionMensaje && <p role="status" className={`mb-3 rounded-md p-2.5 text-[11.5px] ${conexion.ultimaEjecucionEstado === "error" ? "bg-err-50 text-err-700" : "bg-ink-50 text-ink-600"}`}>
        Último envío: {conexion.ultimaEjecucionMensaje}
      </p>}

      {puedeAdministrar && <><div className="mt-auto flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
        <button
          type="button"
          onClick={onEditar}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink-700 transition hover:bg-ink-50"
        >
          <Icon name="edit" size={12} /> Editar
        </button>
        <button
          type="button"
          onClick={onProbar}
          disabled={probando || ejecutando || cambiandoEstado}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-60"
        >
          <Icon name="check" size={12} />
          {probando ? <EstadoProcesando>Probando</EstadoProcesando> : "Probar"}
        </button>
        {conexion.activa && proveedor?.prueba.tipo === "smtp" && <button type="button" onClick={onProbarCorreo}
          disabled={Boolean(ocupacion)} className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[12px] font-semibold text-navy-800 disabled:opacity-60">
          <Icon name="send" size={12} />{ocupacion === "correo" ? <EstadoProcesando>Enviando</EstadoProcesando> : "Enviar prueba a mi correo"}
        </button>}
        {conexion.activa && proveedor?.ejecutable ? (
          <button
            type="button"
            onClick={onEjecutar}
            disabled={probando || ejecutando || cambiandoEstado}
            className="inline-flex items-center gap-1.5 rounded-md bg-ok-700 px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-ok-700/90 disabled:opacity-60"
          >
            <Icon name="play" size={12} />
            {ejecutando ? <EstadoProcesando>Ejecutando</EstadoProcesando> : "Ejecutar ahora"}
          </button>
        ) : !conexion.activa ? (
          <button
            type="button"
            onClick={onAlternarEstado}
            disabled={probando || ejecutando || cambiandoEstado}
            className="inline-flex items-center gap-1.5 rounded-md bg-ok-700 px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-ok-700/90 disabled:opacity-60"
          >
            <Icon name="check" size={12} />
            {cambiandoEstado ? <EstadoProcesando>Activando</EstadoProcesando> : "Activar"}
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        {conexion.activa ? (
          <button
            type="button"
            onClick={onAlternarEstado}
            disabled={probando || ejecutando || cambiandoEstado}
            className="inline-flex items-center gap-1.5 rounded-md border border-warn-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-warn-700 transition hover:bg-warn-100/60 disabled:opacity-60"
          >
            {cambiandoEstado ? <EstadoProcesando>Desactivando</EstadoProcesando> : "Desactivar"}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onEliminar}
          disabled={probando || ejecutando || cambiandoEstado}
          title="Eliminar conexión"
          className="inline-flex items-center justify-center rounded-md border border-err-200 bg-white p-1.5 text-err-700 transition hover:bg-err-50 disabled:opacity-60"
        >
          <Icon name="trash" size={13} />
        </button>
      </div></>}
    </Card>
  );
}

function EliminarConexionModal({
  conexion,
  onClose,
}: {
  conexion: ConexionVista;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(eliminarConexion, undefined);

  useEffect(() => {
    notifyActionState(state, {
      success: "Conexión eliminada.",
      error: "No se pudo eliminar la conexión.",
    });
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Eliminar conexión"
      footer={
        <button
          type="submit"
          form="eliminar-conexion"
          disabled={pending}
          className="rounded-md bg-err-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-err-700/90 disabled:opacity-60"
        >
          {pending ? <EstadoProcesando>Eliminando</EstadoProcesando> : "Eliminar definitivamente"}
        </button>
      }
    >
      <form id="eliminar-conexion" action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={conexion.id} />
        <p className="text-[13px] leading-relaxed text-ink-600">
          Vas a eliminar <strong>{conexion.nombre}</strong> ({conexion.codigo}). Con ella se borra su
          historial de pruebas y ejecuciones, y las integraciones que la referencien dejarán de
          encontrarla.
        </p>
        {state?.ok === false && state.message && (
          <p className="text-[12px] text-err-700">{state.message}</p>
        )}
      </form>
    </Modal>
  );
}
