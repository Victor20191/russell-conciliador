"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "@/components/modal";
import { Card } from "@/components/ui";
import { SelectorClienteBuscable } from "@/components/selector-cliente-buscable";
import { fmtContable, fmtDate, fmtDateTime } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { columnaLetra } from "@/lib/balance/extraccion/hojas-cliente";
import ConversacionesEntidad from "@/components/conversaciones-entidad";
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";
import { leerDatosModulo, analizarArchivoModulo, type AnalisisModulo, type CeldaMuestra } from "@/app/actions/modulos-datos";

type Cliente = { id: number; name: string; nit: string };
type Rol = { nombre: string; etiqueta: string; tipo: string; requerido: boolean };
type Borrador = { loteId: string; cliente: string; archivoNombre: string; filas: number; creadoEn: string; comentarios: number };
type Cargado = { id: number; cliente: string; periodo: string; version: number; filas: number; total: number; creadoEn: string; cargadoPor: string | null; comentarios: number };

function BadgeComentarios({ n }: { n: number }) {
  if (!n) return null;
  return <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-blue-600" title={`${n} comentario(s)`}>💬 {n}</span>;
}

export default function ModulosDatosClient({
  moduloCodigo,
  moduloLabel,
  roles,
  clasificadorRol,
  clientes,
  borradores,
  cargados,
}: {
  moduloCodigo: string;
  moduloLabel: string;
  roles: Rol[];
  clasificadorRol: string;
  clientes: Cliente[];
  borradores: Borrador[];
  cargados: Cargado[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [conversando, setConversando] = useState<{ tipo: string; entityId: number; titulo: string } | null>(null);
  const ruta = `/modulos/${moduloCodigo.toLowerCase()}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="rounded-md bg-navy-700 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600"
        >
          Cargar {moduloLabel.toLowerCase()}
        </button>
      </div>

      {abierto && (
        <CargarModal
          moduloCodigo={moduloCodigo}
          moduloLabel={moduloLabel}
          roles={roles}
          clasificadorRol={clasificadorRol}
          clientes={clientes}
          onClose={() => setAbierto(false)}
        />
      )}

      {conversando && (
        <ConversacionesEntidad tipo={conversando.tipo} entityId={conversando.entityId} titulo={conversando.titulo} onClose={() => setConversando(null)} />
      )}

      {borradores.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-warn-700">Borradores por confirmar</div>
          <div className="flex flex-col divide-y divide-ink-100">
            {borradores.map((b) => (
              <Link
                key={b.loteId}
                href={`${ruta}/borradores/${b.loteId}`}
                className="flex items-center justify-between gap-3 py-2 text-[12.5px] hover:bg-ink-50"
              >
                <span className="font-medium text-ink-800">{b.cliente}</span>
                <span className="truncate font-mono text-[11px] text-ink-500" title={b.archivoNombre}>{b.archivoNombre}</span>
                <span className="flex items-center gap-2 whitespace-nowrap text-ink-500"><BadgeComentarios n={b.comentarios} />{b.filas} filas · {fmtDate(b.creadoEn)}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">{moduloLabel} cargados</div>
        {cargados.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-200 bg-ink-50 px-3 py-4 text-center text-[12px] text-ink-400">
            Aún no hay {moduloLabel.toLowerCase()} cargados. Usa «Cargar {moduloLabel.toLowerCase()}» para empezar.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-ink-150">
            <table className="w-full text-[12px]">
              <thead className="bg-ink-50 text-left text-ink-500">
                <tr>
                  <th className="px-2.5 py-1.5 font-semibold">Cliente</th>
                  <th className="px-2.5 py-1.5 font-semibold">Período</th>
                  <th className="px-2.5 py-1.5 font-semibold">Ver.</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Filas</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Total</th>
                  <th className="px-2.5 py-1.5 text-center font-semibold">💬</th>
                  <th className="px-2.5 py-1.5 font-semibold">Cargado</th>
                </tr>
              </thead>
              <tbody>
                {cargados.map((c) => (
                  <tr key={c.id} className="cursor-pointer border-t border-ink-100 hover:bg-ink-50" onClick={() => router.push(`${ruta}/${c.id}`)}>
                    <td className="px-2.5 py-1.5 font-medium text-navy-700 underline decoration-ink-200 underline-offset-2">{c.cliente}</td>
                    <td className="px-2.5 py-1.5 text-ink-600">{c.periodo}</td>
                    <td className="px-2.5 py-1.5 text-ink-500">v{c.version}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-ink-600">{c.filas}</td>
                    <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums text-ink-800">{fmtContable(c.total)}</td>
                    <td className="px-2.5 py-1.5 text-center">
                      {c.comentarios ? (
                        <button type="button" title="Ver conversaciones" onClick={(e) => { e.stopPropagation(); setConversando({ tipo: "modulos_datos", entityId: c.id, titulo: `${c.cliente} · ${c.periodo} v${c.version}` }); }}>
                          <BadgeComentarios n={c.comentarios} />
                        </button>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-ink-500">
                      <div className="whitespace-nowrap tabular-nums">{fmtDateTime(c.creadoEn)}</div>
                      <div className="text-[11px] text-ink-400">{c.cargadoPor ?? "—"}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

const celdaTxt = (v: CeldaMuestra): string => (v == null ? "" : typeof v === "number" ? String(v) : v);

function CargarModal({
  moduloCodigo,
  moduloLabel,
  roles,
  clasificadorRol,
  clientes,
  onClose,
}: {
  moduloCodigo: string;
  moduloLabel: string;
  roles: Rol[];
  clasificadorRol: string;
  clientes: Cliente[];
  onClose: () => void;
}) {
  const router = useRouter();
  const bufferRef = useRef<ArrayBuffer | null>(null);
  const nombreRef = useRef<string>("");
  const [tieneArchivo, setTieneArchivo] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [fase, setFase] = useState<"archivo" | "mapeo">("archivo");
  const [analisis, setAnalisis] = useState<AnalisisModulo | null>(null);
  const [spec, setSpec] = useState<SpecModulo | null>(null);
  const [mes, setMes] = useState("");
  const [leyendoArchivo, setLeyendoArchivo] = useState(false);
  const [analizando, startAnalizar] = useTransition();
  const [leyendo, startLeer] = useTransition();

  const onArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLeyendoArchivo(true);
    setTieneArchivo(false);
    setAnalisis(null);
    setSpec(null);
    setFase("archivo");
    try {
      bufferRef.current = await f.arrayBuffer();
      nombreRef.current = f.name;
      setNombreArchivo(f.name);
      setTieneArchivo(true);
    } catch {
      notifyError("No pudimos leer el archivo. Suele pasar si está ABIERTO en Excel o sincronizándose en OneDrive: ciérralo e intenta de nuevo.");
    } finally {
      setLeyendoArchivo(false);
    }
  };

  const analizar = (hoja?: string) => {
    if (!bufferRef.current) { notifyError("Adjunta el archivo."); return; }
    if (clienteId == null) { notifyError("Selecciona el cliente."); return; }
    startAnalizar(async () => {
      const fd = new FormData();
      fd.set("moduloCodigo", moduloCodigo);
      fd.set("clienteId", String(clienteId));
      if (hoja) fd.set("hoja", hoja);
      fd.set("archivo", new File([bufferRef.current!], nombreRef.current));
      try {
        const r = await analizarArchivoModulo(fd);
        if (r.ok && r.spec) {
          setAnalisis(r);
          setSpec(r.spec);
          setFase("mapeo");
          if (r.origen === "perfil") notifySuccess("Se aplicó el perfil guardado de este cliente. Revisa y confirma.");
        } else {
          notifyError(r.message ?? "No se pudo analizar el archivo.");
        }
      } catch {
        notifyError("No se pudo enviar el archivo al servidor. Verifica la conexión e intenta nuevamente.");
      }
    });
  };

  const leer = () => {
    if (!bufferRef.current || !spec) { notifyError("Falta analizar el archivo."); return; }
    if (clienteId == null) { notifyError("Selecciona el cliente."); return; }
    const faltantes = roles.filter((rc) => rc.requerido && (spec.columnas[rc.nombre] ?? 0) < 1);
    if (faltantes.length) { notifyError("Faltan columnas obligatorias: " + faltantes.map((f) => f.etiqueta).join(", ") + "."); return; }
    startLeer(async () => {
      const fd = new FormData();
      fd.set("moduloCodigo", moduloCodigo);
      fd.set("clienteId", String(clienteId));
      fd.set("hoja", spec.hoja);
      fd.set("specJson", JSON.stringify(spec));
      fd.set("periodoInicio", mes ? `${mes}-01` : "");
      fd.set("periodoFin", mes ? `${mes}-01` : "");
      fd.set("archivo", new File([bufferRef.current!], nombreRef.current));
      try {
        const r = await leerDatosModulo(undefined, fd);
        if (r.ok && r.loteId) {
          notifySuccess(r.message ?? "Archivo leído.");
          router.push(`/modulos/${moduloCodigo.toLowerCase()}/borradores/${r.loteId}`);
        } else {
          notifyError(r.message ?? "No se pudo leer el archivo.");
        }
      } catch {
        notifyError("No se pudo completar la carga. Verifica la conexión e intenta nuevamente.");
      }
    });
  };

  const setCol = (rol: string, col: number) => setSpec((s) => (s ? { ...s, columnas: { ...s.columnas, [rol]: col } } : s));
  const setEnc = (v: number) => setSpec((s) => (s ? { ...s, filaEncabezado: v } : s));
  const setDat = (v: number) => setSpec((s) => (s ? { ...s, primeraFilaDatos: v } : s));
  const modo: "columna" | "arrastrar" | "seccion" = spec?.clasificadorModo ?? (spec?.arrastrarClasificador ? "arrastrar" : "columna");
  const setModo = (m: "columna" | "arrastrar" | "seccion") =>
    setSpec((s) => (s ? { ...s, clasificadorModo: m, arrastrarClasificador: m === "arrastrar" ? true : undefined, seccionColumnaVaciaRol: m === "seccion" ? s.seccionColumnaVaciaRol ?? "descripcion" : undefined } : s));
  const setSeccionRol = (rol: string) => setSpec((s) => (s ? { ...s, seccionColumnaVaciaRol: rol } : s));

  // Etiqueta de cada columna para los selectores: «C · "Encabezado" (muestra, muestra)».
  const opcionesColumna = (): { index1: number; label: string }[] => {
    if (!analisis) return [];
    const ancho = analisis.ancho ?? analisis.encabezado?.length ?? 0;
    return Array.from({ length: ancho }, (_, c) => {
      const enc = celdaTxt(analisis.encabezado?.[c] ?? null);
      const muestras = (analisis.muestraFilas ?? []).map((f) => celdaTxt(f[c] ?? null)).filter(Boolean).slice(0, 2);
      const tail = muestras.length ? ` (${muestras.join(", ").slice(0, 30)})` : "";
      return { index1: c + 1, label: `${columnaLetra(c)}${enc ? ` · ${enc.slice(0, 28)}` : ""}${tail}` };
    });
  };

  const preview = (rol: string): string[] => {
    if (!analisis || !spec) return [];
    const col = spec.columnas[rol] ?? 0;
    if (col < 1) return [];
    return (analisis.muestraFilas ?? []).slice(0, 6).map((f) => celdaTxt(f[col - 1] ?? null));
  };
  // ¿La columna del clasificador viene mayormente vacía? (señal de agrupación → arrastrar).
  const clasifEsparso = (() => {
    if (!analisis || !spec) return false;
    const col = spec.columnas[clasificadorRol] ?? 0;
    if (col < 1) return false;
    const vals = (analisis.muestraFilas ?? []).map((f) => celdaTxt(f[col - 1] ?? null));
    if (vals.length < 3) return false;
    const vacias = vals.filter((v) => !v).length;
    return vacias / vals.length >= 0.3;
  })();

  return (
    <Modal
      open
      onClose={onClose}
      title={`Cargar ${moduloLabel.toLowerCase()}`}
      size={fase === "mapeo" ? "2xl" : "lg"}
      footer={
        fase === "archivo" ? (
          <>
            <button type="button" onClick={onClose} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50">Cancelar</button>
            <button type="button" disabled={!tieneArchivo || clienteId == null || analizando} onClick={() => analizar()} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
              {analizando ? "Analizando…" : "Analizar columnas"}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setFase("archivo")} className="rounded-md border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-50">Atrás</button>
            <button type="button" disabled={leyendo || analizando} onClick={leer} className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60">
              {leyendo ? "Leyendo…" : "Leer y crear borrador"}
            </button>
          </>
        )
      }
    >
      {fase === "archivo" ? (
        <div className="flex flex-col gap-3.5 text-[12.5px]">
          <SelectorClienteBuscable
            clients={clientes}
            value={clienteId}
            onChange={setClienteId}
          />

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Archivo (Excel/CSV)</span>
            <input type="file" accept=".xlsx,.xlsm,.xls,.csv,.txt" onChange={onArchivo} className="text-[12px] text-ink-600 file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-ink-700 hover:file:bg-ink-200" />
            {leyendoArchivo && <span className="text-[11px] text-ink-400">Leyendo archivo…</span>}
            {tieneArchivo && !leyendoArchivo && <span className="text-[11px] text-ok-700">Listo: {nombreArchivo}</span>}
          </label>

          <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[11.5px] leading-relaxed text-blue-800">
            Al analizar, el sistema sugiere qué columna es cada campo. En el siguiente paso podrás corregir el mapeo, marcar si el tipo viene agrupado, y se guardará el perfil para las próximas cargas de este cliente.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 text-[12.5px]">
          {analisis?.origen === "perfil" && (
            <p className="rounded-md border border-ok-500 bg-ok-100/40 px-3 py-1.5 text-[11.5px] text-ok-700">Perfil guardado aplicado. Ajusta si hace falta.</p>
          )}

          {(analisis?.hojas?.length ?? 0) > 1 && (
            <label className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="shrink-0 text-[11px] font-medium text-ink-600">Hoja</span>
              <select value={spec?.hoja ?? ""} onChange={(e) => analizar(e.target.value)} className="min-w-0 max-w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-ink-700 outline-none focus:border-blue-400">
                {analisis?.hojas?.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className="shrink-0 text-[11px] text-ink-400">{analisis?.totalFilas} filas</span>
            </label>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Fila de encabezado</span>
              <input type="number" min={1} value={spec?.filaEncabezado ?? 1} onChange={(e) => setEnc(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 tabular-nums text-ink-700 outline-none focus:border-blue-400" />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">Primera fila de datos</span>
              <input type="number" min={1} value={spec?.primeraFilaDatos ?? 2} onChange={(e) => setDat(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 tabular-nums text-ink-700 outline-none focus:border-blue-400" />
            </label>
          </div>

          <div className="overflow-hidden rounded-md border border-ink-150">
            <div className="border-b border-ink-100 bg-ink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Mapeo de columnas</div>
            <div className="flex flex-col divide-y divide-ink-100">
              {roles.map((rc) => {
                const muestras = preview(rc.nombre);
                const muestraTxt = muestras.filter(Boolean).slice(0, 2).join(" · ") || "—";
                return (
                  <div key={rc.nombre} className="flex flex-col gap-1.5 px-3 py-2.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="text-[12px] font-medium leading-snug text-ink-700">
                        {rc.etiqueta}
                        {rc.requerido && <span className="text-err-700"> *</span>}
                      </span>
                      {rc.nombre === clasificadorRol && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-blue-700">
                          clasifica
                        </span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                      <select
                        value={spec?.columnas[rc.nombre] ?? 0}
                        onChange={(e) => setCol(rc.nombre, Number(e.target.value))}
                        className="w-full min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400"
                      >
                        <option value={0}>— sin mapear —</option>
                        {opcionesColumna().map((o) => (
                          <option key={o.index1} value={o.index1}>{o.label}</option>
                        ))}
                      </select>
                      <span
                        className="min-w-0 truncate text-[11px] leading-snug text-ink-400 sm:w-36 sm:shrink-0"
                        title={muestras.join(" · ")}
                      >
                        {muestraTxt}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-md border border-ink-150 bg-ink-50 px-3 py-2.5">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-medium text-ink-600">¿Cómo viene el {roles.find((r) => r.nombre === clasificadorRol)?.etiqueta.toLowerCase() ?? "tipo"}?</span>
              <select value={modo} onChange={(e) => setModo(e.target.value as typeof modo)} className="w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400">
                <option value="columna">En su propia columna, en cada fila</option>
                <option value="arrastrar">Agrupado en su columna (una vez por bloque; se arrastra){clasifEsparso ? " · recomendado" : ""}</option>
                <option value="seccion">En renglones de sección (encabezados de grupo) intercalados con los ítems</option>
              </select>
            </label>
            {modo === "seccion" && (
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-medium text-ink-600">El renglón de sección se reconoce porque está vacía la columna:</span>
                <select value={spec?.seccionColumnaVaciaRol ?? "descripcion"} onChange={(e) => setSeccionRol(e.target.value)} className="w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400">
                  {roles.filter((r) => r.nombre !== clasificadorRol).map((r) => <option key={r.nombre} value={r.nombre}>{r.etiqueta}</option>)}
                </select>
                <span className="text-[11px] leading-snug text-ink-500">El tipo va en la misma columna que otro campo (p. ej. el código): mapea ese campo a la misma columna del tipo. Si el archivo trae negrita, también se detecta por negrita.</span>
                {(() => {
                  const rolSenal = spec?.seccionColumnaVaciaRol ?? "descripcion";
                  const colSenal = spec?.columnas[rolSenal] ?? 0;
                  const colTipo = spec?.columnas[clasificadorRol] ?? 0;
                  if (colSenal < 1)
                    return <span className="text-[11px] font-semibold leading-snug text-err-700">⚠ Esa columna está «sin mapear»: mapéala arriba, o elige otra que esté vacía en los renglones de sección. Si no, no se detectaría ninguna sección.</span>;
                  if (colSenal === colTipo)
                    return <span className="text-[11px] font-semibold leading-snug text-err-700">⚠ Esa es la MISMA columna del tipo (nunca está vacía): elige otra —normalmente la Descripción— que sí venga vacía en los renglones de sección.</span>;
                  return null;
                })()}
              </label>
            )}
          </div>

          <label className="flex w-full max-w-xs flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-600">Mes del inventario</span>
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-ink-700 outline-none focus:border-blue-400" />
          </label>
        </div>
      )}
    </Modal>
  );
}
