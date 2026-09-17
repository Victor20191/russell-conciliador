"use client";

// Lista de patrones de archivo de un módulo, agrupada por aplicativo, con sus versiones.
import { Fragment, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, Chip, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import type { PatronAplicativoVm, VersionPatronVm } from "@/lib/modulos/patrones/servidor";
import { ETIQUETA_ESTADO_PATRON } from "@/lib/modulos/patrones/version";
import { cambiarEstadoVersionPatron, declararTipoFormatoVersion, subirMuestraVersionPatron } from "@/app/actions/patrones-modulo";
import { Modal } from "@/components/modal";
import { INFO_TIPO_FORMATO, nivelDeTipoFormato, TIPOS_FORMATO_CARTERA, type TipoFormatoCartera } from "@/lib/modulos/cartera/tipo-formato";

const TONO_ESTADO = { aprobada: "ok", pendiente: "warn", inactiva: "ink" } as const;

const botonAccion = "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-45";

function tamano(bytes: number | null): string {
  if (bytes == null) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function PatronesModuloClient({
  moduloCodigo,
  moduloLabel,
  patrones,
  puedeAdministrar,
}: {
  moduloCodigo: string;
  moduloLabel: string;
  patrones: PatronAplicativoVm[];
  puedeAdministrar: boolean;
}) {
  const ruta = `/modulos/${moduloCodigo.toLowerCase()}/patrones`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-[12px] leading-relaxed text-ink-500">
          Cada versión guarda cómo se lee el archivo de {moduloLabel.toLowerCase()} de un aplicativo: su encabezado, el mapeo de
          columnas y un archivo de muestra. Una versión <b>pendiente</b> solo sirve al cliente del que salió; al <b>aprobarla</b> la usan
          todos los clientes del aplicativo.
        </p>
        {puedeAdministrar && (
          <Link href={`${ruta}/nueva`} className="rounded-md bg-navy-700 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600">
            Nuevo patrón
          </Link>
        )}
      </div>

      {patrones.length === 0 ? (
        <Card>
          <EmptyState
            icon="doc"
            title="Todavía no hay patrones para este módulo"
            description={puedeAdministrar
              ? "Crea el primero subiendo un archivo de muestra del aplicativo."
              : "Un administrador debe crear el patrón del aplicativo antes de cargar sus archivos."}
          />
        </Card>
      ) : (
        patrones.map((patron) => (
          <GrupoAplicativo key={patron.erp.id} patron={patron} ruta={ruta} puedeAdministrar={puedeAdministrar} />
        ))
      )}
    </div>
  );
}

function GrupoAplicativo({ patron, ruta, puedeAdministrar }: { patron: PatronAplicativoVm; ruta: string; puedeAdministrar: boolean }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const aprobadas = patron.versiones.filter((v) => v.estado === "aprobada").length;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={`${patron.erp.nombre}${patron.erp.activo ? "" : " (inactivo)"}`}
        right={
          <span className="text-[11.5px] text-ink-500">
            {patron.clientes} cliente{patron.clientes === 1 ? "" : "s"} · {patron.versiones.length} versión{patron.versiones.length === 1 ? "" : "es"} · {aprobadas} aprobada{aprobadas === 1 ? "" : "s"}
            {puedeAdministrar && patron.erp.activo && (
              <Link href={`${ruta}/nueva?erp=${patron.erp.id}`} className="ml-3 font-semibold text-blue-700 hover:underline">Nueva versión</Link>
            )}
          </span>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[12px]">
          <thead className="bg-ink-50 text-left text-[10.5px] uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Versión</th>
              <th className="px-3 py-2 font-semibold">Formato</th>
              <th className="px-3 py-2 font-semibold">Muestra</th>
              <th className="px-3 py-2 text-right font-semibold">Usos</th>
              <th className="px-3 py-2 font-semibold">Creada</th>
              <th className="px-3 py-2 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {patron.versiones.map((version) => (
              <Fragment key={version.id}>
                <FilaVersion
                  version={version}
                  erpId={patron.erp.id}
                  ruta={ruta}
                  puedeAdministrar={puedeAdministrar}
                  abierta={abierta === version.id}
                  onAlternar={() => setAbierta((actual) => (actual === version.id ? null : version.id))}
                />
                {abierta === version.id && (
                  <tr className="border-t border-ink-100 bg-ink-50/60">
                    <td colSpan={6} className="px-4 py-3 text-[11.5px] text-ink-600">
                      <div className="mb-1 font-semibold text-ink-700">Rótulos con que se reconoce el archivo</div>
                      <div className="flex flex-wrap gap-1">
                        {version.rotulos.length === 0
                          ? <span className="italic text-ink-400">Sin rótulos guardados</span>
                          : version.rotulos.map((r, i) => <span key={`${r}-${i}`} className="rounded border border-ink-200 bg-white px-1.5 py-0.5">{r}</span>)}
                      </div>
                      <div className="mt-2"><b>Totales:</b> {version.totales}</div>
                      {version.nota && <div className="mt-1 whitespace-pre-line"><b>Nota:</b> {version.nota}</div>}
                      {version.aprobadoPor && <div className="mt-1">Aprobada por {version.aprobadoPor} el {fmtDateTime(version.aprobadoEn)}.</div>}
                      {version.ultimoUsoEn && <div className="mt-1">Último uso: {fmtDateTime(version.ultimoUsoEn)}.</div>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const NIVEL_FILA = { documento: "un documento", tercero: "un tercero" } as const;

/**
 * Declara el tipo de formato de una versión sin tocar sus columnas. En una aprobada solo se declara
 * una vez (la versión se creó antes de que existiera el tipo); para cambiarlo, versión nueva.
 */
function DeclararTipoModal({ version, onClose }: { version: VersionPatronVm; onClose: () => void }) {
  const router = useRouter();
  const formato = version.formato!;
  const [tipo, setTipo] = useState<TipoFormatoCartera>(formato.tipo);
  const [guardando, startGuardar] = useTransition();
  const nivelNuevo = nivelDeTipoFormato(tipo);
  const cambiaNivel = nivelNuevo !== formato.nivel;
  const guardar = () => {
    startGuardar(async () => {
      const r = await declararTipoFormatoVersion({ id: version.id, actualizadoEn: version.actualizadoEn, tipoFormato: tipo });
      if (!r.ok) { notifyError(r.message ?? "No se pudo declarar el tipo de formato."); return; }
      notifySuccess(r.message ?? "Tipo de formato declarado.");
      onClose();
      router.refresh();
    });
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Tipo de formato · v${version.version}`}
      size="md"
      footer={
        <button type="button" disabled={guardando} onClick={guardar} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
          {guardando ? "Guardando…" : formato.declarado ? "Cambiar tipo" : "Declarar tipo"}
        </button>
      }
    >
      <div className="flex flex-col gap-3 text-[12.5px] text-ink-700">
        <p className="text-[12px] leading-relaxed text-ink-600">
          {formato.declarado
            ? <>Hoy es <b>{formato.etiqueta.toLowerCase()}</b>.</>
            : <>La versión no lo declara; por su mapeo parece <b>{formato.etiqueta.toLowerCase()}</b>.</>}{" "}
          Las columnas no cambian. Lo que declares rige desde el próximo archivo: los cargues ya hechos conservan su lectura.
          {version.estado !== "pendiente" && " En una versión aprobada o inactiva el tipo se declara una sola vez."}
        </p>
        <fieldset className="flex flex-col gap-2">
          {TIPOS_FORMATO_CARTERA.map((t) => (
            <label key={t} className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${tipo === t ? "border-blue-400 bg-blue-50" : "border-ink-150"}`}>
              <input type="radio" name={`tipo-${version.id}`} checked={tipo === t} onChange={() => setTipo(t)} className="mt-0.5" />
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">
                  {INFO_TIPO_FORMATO[t].etiqueta}
                  {t === formato.tipo && !formato.declarado && <span className="ml-1 text-[11px] font-normal text-ink-400">(sugerido)</span>}
                </span>
                <span className="text-[11.5px] text-ink-500">{INFO_TIPO_FORMATO[t].fila}.</span>
                <span className="text-[11.5px] text-ink-500">Se valida: {INFO_TIPO_FORMATO[t].controles.join("; ").toLowerCase()}.</span>
              </span>
            </label>
          ))}
        </fieldset>
        {cambiaNivel && (
          <p className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[11.5px] leading-relaxed text-warn-700">
            Hoy cada fila de este formato se lee como {NIVEL_FILA[formato.nivel]}; con este tipo se leerá como {NIVEL_FILA[nivelNuevo]}.
            Cambia qué suma en el período y qué entra como control. Confírmalo con la muestra antes de guardar.
          </p>
        )}
      </div>
    </Modal>
  );
}

function FilaVersion({
  version,
  erpId,
  ruta,
  puedeAdministrar,
  abierta,
  onAlternar,
}: {
  version: VersionPatronVm;
  erpId: number;
  ruta: string;
  puedeAdministrar: boolean;
  abierta: boolean;
  onAlternar: () => void;
}) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();
  const archivoRef = useRef<HTMLInputElement>(null);
  const [declarando, setDeclarando] = useState(false);

  const cambiarEstado = (estado: "aprobada" | "inactiva") => {
    startAccion(async () => {
      const r = await cambiarEstadoVersionPatron({ id: version.id, estado });
      if (r.ok) notifySuccess(r.message ?? "Versión actualizada.");
      else notifyError(r.message ?? "No se pudo actualizar la versión.");
      router.refresh();
    });
  };
  const subirMuestra = (archivo: File) => {
    startAccion(async () => {
      const fd = new FormData();
      fd.set("versionId", String(version.id));
      fd.set("archivo", archivo);
      const r = await subirMuestraVersionPatron(fd);
      if (r.ok) notifySuccess(r.message ?? "Muestra guardada.");
      else notifyError(r.message ?? "No se pudo guardar la muestra.");
      router.refresh();
    });
  };

  const pendiente = version.estado === "pendiente";
  // Una pendiente cambia su tipo cuando quiera; las demás solo lo declaran si no lo tenían.
  const puedeDeclararTipo = version.formato != null && (pendiente || !version.formato.declarado);
  return (
    <tr className="border-t border-ink-100 align-top">
      <td className="px-3 py-2.5">
        <button type="button" onClick={onAlternar} aria-expanded={abierta} className="inline-flex items-center gap-1 font-semibold text-ink-800">
          <Icon name={abierta ? "chev-d" : "chev-r"} size={12} />v{version.version}
        </button>
        <div className="mt-1"><Chip label={ETIQUETA_ESTADO_PATRON[version.estado]} tone={TONO_ESTADO[version.estado]} /></div>
        {version.clienteOrigenNombre && pendiente && (
          <div className="mt-1 text-[10.5px] text-ink-400">Solo para {version.clienteOrigenNombre}</div>
        )}
      </td>
      <td className="px-3 py-2.5 text-ink-600">
        <div>Hoja «{version.hoja}» · encabezado fila {version.filaEncabezado} · datos desde fila {version.primeraFilaDatos}</div>
        {version.formato && (
          <div className="mt-1">
            <Chip
              label={version.formato.declarado ? version.formato.etiqueta : `Sin declarar · parece ${version.formato.etiqueta.toLowerCase()}`}
              tone={version.formato.declarado ? "blue" : "warn"}
            />
          </div>
        )}
        <div className="mt-0.5 text-[11px] text-ink-500">{version.resumenColumnas || "—"}</div>
      </td>
      <td className="px-3 py-2.5">
        {version.muestra ? (
          <span className="text-ink-600" title={version.muestra.nombre}>
            {version.muestra.nombre.length > 28 ? `${version.muestra.nombre.slice(0, 27)}…` : version.muestra.nombre}
            <span className="ml-1 text-[10.5px] text-ink-400">{tamano(version.muestra.tamanoBytes)}</span>
          </span>
        ) : (
          <Chip label="Sin muestra" tone="warn" />
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink-600">{version.vecesUsado}</td>
      <td className="px-3 py-2.5 text-ink-500">
        <div>{fmtDate(version.creadoEn)}</div>
        <div className="text-[10.5px]">{version.creadoPor ?? "—"}</div>
      </td>
      <td className="px-3 py-2.5">
        {puedeAdministrar ? (
          <div className="flex flex-wrap justify-end gap-1">
            {version.estado !== "aprobada" && (
              <button
                type="button"
                disabled={ocupado || !version.muestra}
                title={version.muestra ? undefined : "Sube la muestra antes de aprobar"}
                onClick={() => cambiarEstado("aprobada")}
                className={`${botonAccion} border-ok-500 text-ok-700 hover:bg-ok-100/40`}
              >
                <Icon name="check" size={11} />{version.estado === "inactiva" ? "Reactivar" : "Aprobar"}
              </button>
            )}
            {puedeDeclararTipo && (
              <button type="button" disabled={ocupado} onClick={() => setDeclarando(true)} className={`${botonAccion} ${version.formato?.declarado ? "border-ink-200 text-ink-700 hover:bg-ink-50" : "border-warn-500 text-warn-700 hover:bg-warn-100/40"}`}>
                <Icon name="edit" size={11} />{version.formato?.declarado ? "Cambiar tipo" : "Declarar tipo"}
              </button>
            )}
            {pendiente && version.muestra && (
              <Link href={`${ruta}/${version.id}`} className={`${botonAccion} border-ink-200 text-ink-700 hover:bg-ink-50`}>
                <Icon name="edit" size={11} />Editar
              </Link>
            )}
            {pendiente && (
              <>
                <button type="button" disabled={ocupado} onClick={() => archivoRef.current?.click()} className={`${botonAccion} border-ink-200 text-ink-700 hover:bg-ink-50`}>
                  <Icon name="upload" size={11} />{version.muestra ? "Cambiar muestra" : "Subir muestra"}
                </button>
                <input
                  ref={archivoRef}
                  type="file"
                  accept=".xlsx,.xlsm,.xls,.xlsb,.csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const archivo = e.target.files?.[0];
                    e.target.value = "";
                    if (archivo) subirMuestra(archivo);
                  }}
                />
              </>
            )}
            {version.muestra && (
              <Link href={`${ruta}/nueva?erp=${erpId}&base=${version.id}`} className={`${botonAccion} border-ink-200 text-ink-700 hover:bg-ink-50`}>
                <Icon name="plus" size={11} />Nueva a partir de esta
              </Link>
            )}
            {version.estado !== "inactiva" && (
              <button type="button" disabled={ocupado} onClick={() => cambiarEstado("inactiva")} className={`${botonAccion} border-err-100 text-err-700 hover:bg-err-50`}>
                <Icon name="x" size={11} />Desactivar
              </button>
            )}
          </div>
        ) : (
          <span className="block text-right text-[11px] text-ink-400">—</span>
        )}
        {declarando && <DeclararTipoModal version={version} onClose={() => setDeclarando(false)} />}
      </td>
    </tr>
  );
}
