"use client";

// Balance PARTIDO en varios archivos: botón «Agregar otra parte», lista de archivos
// que forman el borrador y aviso de cuentas de movimiento repetidas entre partes.
// La unión la hace `agregarParteBorrador`; la lógica pura vive en
// `lib/balance/partes-archivo.ts`.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { EstadoProcesando } from "@/components/estado-procesando";
import { agregarParteBorrador } from "@/app/actions/balance";
import { cargarArchivoBalanceTemporal } from "@/lib/balance/carga-archivo-cliente";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { fmtContable } from "@/lib/format";
import type { CuentaRepetidaEntrePartes, ParteArchivoBalance } from "@/lib/balance/partes-archivo";

const ACCEPT_TABULAR =
  ".xlsx,.xlsm,.xls,.xlsb,.csv,.txt,text/plain,application/vnd.ms-excel,application/vnd.ms-excel.sheet.binary.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type ParteVista = Pick<ParteArchivoBalance, "numero" | "archivoNombre" | "archivoTam" | "filas">;

export function AgregarParteBalance({
  loteId,
  partes,
  bloqueo,
}: {
  loteId: string;
  /** Partes actuales (al menos la primera). */
  partes: ParteVista[];
  /** Motivo por el que hoy no se puede agregar; null = habilitado. */
  bloqueo: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  // Un UUID por archivo elegido: si la respuesta se pierde, reintentar el MISMO
  // archivo reutiliza la solicitud y el servidor no lo agrega dos veces.
  const [solicitudId, setSolicitudId] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, startProcesar] = useTransition();

  const cerrar = () => {
    if (procesando) return;
    setAbierto(false);
    setArchivo(null);
    setSolicitudId(null);
    setProgreso(null);
    setError(null);
  };

  const agregar = () => {
    if (!archivo || !solicitudId) return;
    setError(null);
    startProcesar(async () => {
      try {
        setProgreso(0);
        await cargarArchivoBalanceTemporal(archivo, solicitudId, setProgreso);
        setProgreso(null);
        const datos = new FormData();
        datos.set("loteId", loteId);
        datos.set("loteIdSolicitud", solicitudId);
        const r = await agregarParteBorrador(datos);
        if (!r.ok) {
          // El archivo temporal ya se consumió: un nuevo intento vuelve a subirlo con
          // otra solicitud.
          setSolicitudId(crypto.randomUUID());
          setError(r.message ?? "No se pudo agregar la parte.");
          notifyError(r.message ?? "No se pudo agregar la parte.");
          return;
        }
        notifySuccess(r.message ?? "Parte agregada.");
        setAbierto(false);
        setArchivo(null);
        setSolicitudId(null);
        router.refresh();
      } catch (e) {
        setProgreso(null);
        const mensaje = e instanceof Error ? e.message : "No se pudo transferir el archivo.";
        setError(mensaje);
        notifyError(mensaje);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={bloqueo != null}
        title={bloqueo ?? "El ERP entregó el balance del período en varios archivos: agrega aquí las demás partes"}
        className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[12px] font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="plus" size={13} /> Agregar otra parte
      </button>
      {abierto && (
        <Modal
          open
          onClose={cerrar}
          title="Agregar otra parte del balance"
          size="lg"
          footer={
            <button
              type="button"
              onClick={agregar}
              disabled={!archivo || procesando}
              className="rounded-md bg-navy-700 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-navy-600 disabled:opacity-50"
            >
              {procesando
                ? <EstadoProcesando>{progreso != null ? `Subiendo ${progreso}%` : "Leyendo y agregando"}</EstadoProcesando>
                : "Agregar parte"}
            </button>
          }
        >
          <div className="flex flex-col gap-3 text-[12.5px] text-ink-700">
            <p className="leading-relaxed">
              Úsalo cuando el ERP no generó el balance del período en un solo archivo. La parte se lee con la
              misma estructura del borrador y sus filas se suman a continuación: el cuadre y las validaciones se
              recalculan sobre el balance completo y al cargar queda <span className="font-semibold">una sola versión</span>.
            </p>
            <div className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Archivos en este borrador</div>
              <ol className="flex flex-col gap-0.5">
                {partes.map((p) => (
                  <li key={p.numero} className="flex flex-wrap gap-x-2">
                    <span className="font-semibold">Parte {p.numero}</span>
                    <span className="break-all">{p.archivoNombre}</span>
                    {p.archivoTam && <span className="text-ink-500">· {p.archivoTam}</span>}
                  </li>
                ))}
              </ol>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-ink-600">Parte {partes.length + 1} (Excel, CSV o TXT)</span>
              <input
                type="file"
                accept={ACCEPT_TABULAR}
                disabled={procesando}
                onChange={(e) => {
                  const elegido = e.target.files?.[0] ?? null;
                  setArchivo(elegido);
                  setSolicitudId(elegido ? crypto.randomUUID() : null);
                  setError(null);
                }}
                className="rounded-md border border-ink-200 bg-white text-[12.5px] text-ink-700 file:mr-3 file:cursor-pointer file:border-0 file:bg-navy-700 file:px-3 file:py-2 file:text-[12.5px] file:font-semibold file:text-white"
              />
            </label>
            <p className="text-[11.5px] text-ink-500">
              Debe ser del mismo cliente y período. Se rechaza si parece un archivo que ya está en el borrador.
            </p>
            {error && <p className="text-[12px] font-medium text-err-700">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

/** Franja informativa con los archivos que forman el borrador (solo con 2+ partes). */
export function PartesBalanceResumen({ partes }: { partes: ParteVista[] }) {
  if (partes.length < 2) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
      <Icon name="info" size={14} />
      <span>
        <span className="font-semibold">Balance formado por {partes.length} archivos.</span>{" "}
        {partes.map((p, i) => (
          <span key={p.numero}>
            {i > 0 && " · "}
            <span className="font-semibold">Parte {p.numero}:</span> {p.archivoNombre}
          </span>
        ))}
        . Las validaciones se calculan sobre la unión y al cargar se genera una sola versión.
      </span>
    </div>
  );
}

/**
 * Cuentas de movimiento presentes en más de una parte. Con importes idénticos es un
 * probable duplicado y se ofrece omitir la ocurrencia de la parte posterior; con
 * importes distintos la carga los suma y solo se informa.
 */
export function CuentasRepetidasPartesAviso({
  repetidas,
  onOmitir,
}: {
  repetidas: CuentaRepetidaEntrePartes[];
  onOmitir: (filaNum: number) => void;
}) {
  const [verTodas, setVerTodas] = useState(false);
  if (repetidas.length === 0) return null;
  const duplicadas = repetidas.filter((r) => r.importesIguales);
  const sumadas = repetidas.filter((r) => !r.importesIguales);
  const visibles = verTodas ? repetidas : repetidas.slice(0, 8);
  return (
    <div className={`rounded-md border px-3 py-2 text-[12px] ${duplicadas.length > 0 ? "border-warn-200 bg-warn-50 text-warn-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
      <div className="flex items-start gap-2">
        <Icon name="warn" size={14} />
        <span>
          <span className="font-semibold">{repetidas.length} cuenta(s) de movimiento aparecen en más de una parte.</span>{" "}
          {duplicadas.length > 0 && (
            <>{duplicadas.length} con importes idénticos (probable duplicado: omite una para no contarla dos veces). </>
          )}
          {sumadas.length > 0 && <>{sumadas.length} con importes distintos: al cargar se suman.</>}
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {visibles.map((r) => {
          const ultima = r.ocurrencias[r.ocurrencias.length - 1];
          return (
            <li key={r.codigo} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono font-semibold">{r.codigo}</span>
              <span className="min-w-0 truncate">{r.nombre}</span>
              <span className="text-ink-500">
                {r.ocurrencias.map((o) => `parte ${o.parte}: ${fmtContable(o.saldoFinal)}`).join(" · ")}
              </span>
              {r.importesIguales && (
                <button
                  type="button"
                  onClick={() => onOmitir(ultima.filaNum)}
                  className="rounded border border-warn-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-warn-700 hover:bg-warn-100"
                >
                  Omitir la de la parte {ultima.parte}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {repetidas.length > 8 && (
        <button type="button" onClick={() => setVerTodas((v) => !v)} className="mt-1 text-[11.5px] font-semibold underline decoration-dotted">
          {verTodas ? "Ver menos" : `Ver las ${repetidas.length}`}
        </button>
      )}
    </div>
  );
}
