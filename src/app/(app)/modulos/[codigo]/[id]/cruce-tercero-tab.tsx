"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Chip } from "@/components/ui";
import { fmtContable } from "@/lib/format";
import { notifyError, notifySuccess } from "@/lib/client-notifications";
import { quitarEmparejamientoTercero, quitarMarcaCruce, separarTerceroAutomatico } from "@/app/actions/modulos-datos";
import type { EstadoCruceTercero } from "@/lib/modulos/cartera/cruce-tercero-cartera";
import { describirSenales } from "@/lib/modulos/cartera/coherencia-tercero";
import { coincidenciaTercero, type CoincidenciaTercero } from "@/lib/modulos/cartera/coincidencia-tercero";
import { anclaCruceTercero, type FilaCruceTerceroMarcada, type ResumenMarcas } from "@/lib/modulos/marcas-cruce";
import type { EmparejamientoTerceroVm, ResumenCruceTerceroMarcado } from "@/lib/modulos/cruce-tercero-servidor";
import { CeldaMarcaTercero, ModalMarcaTercero, ObservacionesMarcasTercero } from "./marca-tercero";
import type { ReferenciaMarcaVm } from "./soportes-marca";
import { ModalEmparejarTercero } from "./emparejar-tercero";
import { ModalValidarCoherencia } from "./validar-coherencia-tercero";
import { ParametrosCargue, type ParametrosCargueVm } from "./parametros-cargue";

// Cruce por tercero: el balance por terceros ligado al balance del período contra el auxiliar
// del módulo, un renglón por tercero. Lo calcula `cruce-tercero-servidor.ts` con el mismo
// balance y las mismas compuertas del cruce contable. Las diferencias se explican con marcas
// y los terceros que el auxiliar trae con otra identificación se emparejan: solos cuando la
// diferencia es el dígito de verificación (reversible con «Separar»), y a mano —uno a uno o en
// lote desde «Validar coherencia…»— cuando la evidencia es el saldo, un sufijo o el nombre.
export type CruceTerceroVm = {
  aplica: boolean;
  periodo: string;
  nombreCliente: string;
  estado: "sin_balance" | "sin_detalle_tercero" | "bloqueado" | "listo";
  mensaje: string | null;
  /** Balance de comprobación del período (el mismo del cruce contable). */
  balance: { id: number; version: string; periodoFin: string; esOficial: boolean; estaCongelado: boolean; descripcion: string } | null;
  /** Cartera y CxP: por qué se cruza contra esta versión del balance (no es la oficial, o hay varias). */
  avisoBalance: string | null;
  balanceTercero: { id: number; version: string } | null;
  resumen: ResumenCruceTerceroMarcado | null;
  /** Diferencias que exigen marca para cerrar, y cuántas la tienen. */
  resumenMarcas: ResumenMarcas | null;
  emparejamientos: EmparejamientoTerceroVm[];
  /** Umbral de descuadre desde el que una diferencia exige marca. */
  umbralDescuadre: number;
  /** Fecha de corte y divisa del cargue (Cartera, CxP); null en los demás módulos. */
  parametros: ParametrosCargueVm | null;
  contableExcluidoFilas: number;
  /** Cuentas marcadas «no modulares» en el cruce contable: sus NIT no se listan. */
  contableNoModular: { total: number; filas: number; cuentas: string[] };
  moduloDerivadoDelDetalle: boolean;
  moduloNoAtribuido: number;
  /** Rótulos de la clave del cruce: «NIT»/«Nombre», o «Cédula»/«Empleado» en Nómina. */
  etiquetaClave: string;
  etiquetaNombre: string;
};

type Filtro = "todos" | EstadoCruceTercero | "sin_nit" | "por_dv" | "por_nucleo" | "sugeridos" | "pendientes";

const PAGINA = 200;

const ESTADO: Record<EstadoCruceTercero, { label: string; tone: "ok" | "warn" | "err" | "ink" }> = {
  cuadra: { label: "Cuadra", tone: "ok" },
  descuadre: { label: "Diferencia", tone: "err" },
  solo_contable: { label: "Solo en contabilidad", tone: "warn" },
  solo_modulo: { label: "Solo en el módulo", tone: "warn" },
  sin_saldo: { label: "Sin saldo", tone: "ink" },
};

/**
 * El % de coincidencia del renglón: verde si cruzó bien, ámbar a medias, rojo si no cruzó con
 * nada; azul si solo hay un candidato. Contra qué se calculó aparece SOLO al pasar el mouse (una
 * burbuja fija al viewport, para que la tabla con scroll no la recorte).
 */
function PorcentajeCoincidencia({ coincidencia }: { coincidencia: CoincidenciaTercero | null }) {
  const [burbuja, setBurbuja] = useState<{ top: number; left: number } | null>(null);
  if (!coincidencia) return null;
  const { porcentaje, tipo } = coincidencia;
  const color = tipo === "candidato"
    ? "border-blue-400 bg-blue-50 text-blue-500"
    : porcentaje >= 95 ? "border-ok-500 bg-ok-100 text-ok-700"
      : porcentaje >= 60 ? "border-warn-500 bg-warn-100 text-warn-700"
        : "border-err-500 bg-err-100 text-err-700";
  const etiqueta = tipo === "candidato" ? `${porcentaje} % candidato` : tipo === "sin_cruce" ? "0 % sin cruce" : `${porcentaje} %`;
  const ANCHO = 300;
  const mostrar = (e: React.MouseEvent<HTMLSpanElement> | React.FocusEvent<HTMLSpanElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setBurbuja({ top: r.bottom + 6, left: Math.max(8, Math.min(r.right - ANCHO, window.innerWidth - ANCHO - 8)) });
  };
  return (
    <span
      tabIndex={0}
      onMouseEnter={mostrar}
      onFocus={mostrar}
      onMouseLeave={() => setBurbuja(null)}
      onBlur={() => setBurbuja(null)}
      className={`inline-flex cursor-help items-center rounded-full border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums outline-none ${color}`}
    >
      {etiqueta}
      {burbuja && (
        <span
          role="tooltip"
          style={{ top: burbuja.top, left: burbuja.left, width: ANCHO }}
          className="pointer-events-none fixed z-50 rounded-md border border-ink-200 bg-white px-3 py-2 text-left text-[11.5px] font-normal leading-snug text-ink-600 shadow-lg"
        >
          <span className="mb-1 block font-semibold text-ink-800">{coincidencia.contra}</span>
          {coincidencia.explicacion}
        </span>
      )}
    </span>
  );
}

const normalizar = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const contar = (n: number) => n.toLocaleString("es-CO");

function cumpleFiltro(fila: FilaCruceTerceroMarcada, filtro: Filtro): boolean {
  if (filtro === "todos") return true;
  if (filtro === "sin_nit") return fila.sinNit;
  if (filtro === "por_dv") return fila.claveModuloPorDv != null;
  if (filtro === "por_nucleo") return fila.claveModuloPorNucleo != null;
  if (filtro === "sugeridos") return fila.sugerencia != null;
  if (filtro === "pendientes") return fila.requiereMarca && (!fila.marca || fila.desactualizada);
  return fila.estado === filtro;
}

function EstadoVacio({ titulo, children, enlace }: { titulo: string; children: React.ReactNode; enlace: { href: string; texto: string } }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <div className="text-[13px] font-semibold text-ink-800">{titulo}</div>
      <p className="max-w-2xl text-[12.5px] text-ink-500">{children}</p>
      <Link href={enlace.href} className="mt-1 text-[12.5px] font-semibold text-blue-700 hover:underline">{enlace.texto}</Link>
    </Card>
  );
}

export function CruceTerceroTab({
  cruceTercero,
  referenciasMarcas = [],
  cuentasPeriodo = [],
  encabezadoId,
  comentarios,
  puedeEditar,
}: {
  cruceTercero: CruceTerceroVm;
  /** Todas las marcas del período (numeración compartida con el cruce contable). */
  referenciasMarcas?: ReferenciaMarcaVm[];
  /** Cuentas fuera de la cédula que el Consolidado asignó solo para este período. */
  cuentasPeriodo?: string[];
  encabezadoId: number;
  comentarios: Record<string, number>;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const { resumen, balance, resumenMarcas } = cruceTercero;
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [limite, setLimite] = useState(PAGINA);
  // Terceros en cero en los dos lados: ocultos de entrada. Se ven con su tarjeta, al buscarlos o a pedido.
  const [verSinSaldo, setVerSinSaldo] = useState(false);
  const [marcando, setMarcando] = useState<FilaCruceTerceroMarcada | null>(null);
  const [emparejando, setEmparejando] = useState<FilaCruceTerceroMarcada | null>(null);
  const [validando, setValidando] = useState(false);
  const [ocupado, startAccion] = useTransition();

  const filtradas = useMemo(() => {
    if (!resumen) return [];
    const consulta = normalizar(busqueda);
    const ocultarSinSaldo = filtro === "todos" && !verSinSaldo && !consulta;
    return resumen.filas.filter((f) =>
      cumpleFiltro(f, filtro)
      && !(ocultarSinSaldo && f.estado === "sin_saldo")
      && (!consulta || normalizar(`${f.clave} ${f.nombre ?? ""}`).includes(consulta)));
  }, [resumen, filtro, busqueda, verSinSaldo]);
  const coincidencias = useMemo(
    () => new Map((resumen?.filas ?? []).map((f) => [f.clave, coincidenciaTercero(f)] as const)),
    [resumen],
  );
  const cantidadSinSaldo = useMemo(() => (resumen?.filas ?? []).filter((f) => f.estado === "sin_saldo").length, [resumen]);
  const observaciones = useMemo(
    () => (resumen?.filas ?? []).filter((f) => f.marca != null).sort((a, b) => a.marca!.numero - b.marca!.numero),
    [resumen],
  );
  const candidatosBalance = useMemo(
    () => (resumen?.filas ?? []).filter((f) => Object.keys(f.contable.porCuenta).length > 0),
    [resumen],
  );
  const emparejamientoPorClave = useMemo(
    () => new Map(cruceTercero.emparejamientos.filter((e) => e.tipo === "union").map((e) => [e.claveModulo, e])),
    [cruceTercero.emparejamientos],
  );
  const separacionPorClave = useMemo(
    () => new Map(cruceTercero.emparejamientos.filter((e) => e.tipo === "separacion").map((e) => [e.claveModulo, e])),
    [cruceTercero.emparejamientos],
  );

  const quitarMarca = (fila: FilaCruceTerceroMarcada) => {
    startAccion(async () => {
      const r = await quitarMarcaCruce({ encabezadoId, clave: fila.clave });
      if (r.ok) notifySuccess(r.message ?? "Marca retirada.");
      else notifyError(r.message ?? "No se pudo retirar la marca.");
      router.refresh();
    });
  };
  const deshacerEmparejamiento = (emparejamiento: EmparejamientoTerceroVm) => {
    startAccion(async () => {
      const r = await quitarEmparejamientoTercero({ encabezadoId, emparejamientoId: emparejamiento.id });
      if (r.ok) notifySuccess(r.message ?? "Emparejamiento deshecho.");
      else notifyError(r.message ?? "No se pudo deshacer el emparejamiento.");
      router.refresh();
    });
  };
  // Separar un par unido solo (por DV o por núcleo): memoria del cliente para todos sus períodos,
  // porque la forma en que cada lado escribe el NIT es del ERP, no del mes.
  const separar = (fila: FilaCruceTerceroMarcada, claveModulo: string) => {
    startAccion(async () => {
      const r = await separarTerceroAutomatico({ encabezadoId, claveModulo, claveBalance: fila.clave, alcance: "todos" });
      if (r.ok) notifySuccess(r.message ?? "Terceros separados.");
      else notifyError(r.message ?? "No se pudieron separar.");
      router.refresh();
    });
  };

  if (cruceTercero.estado === "sin_balance" || !balance) {
    return (
      <EstadoVacio titulo="No hay balance de comprobación confirmado para este período" enlace={{ href: "/balance", texto: "Ir a Balance de comprobación →" }}>
        No hay un balance confirmado para <b className="text-ink-700">{cruceTercero.nombreCliente}</b> en el período <b className="text-ink-700">{cruceTercero.periodo}</b>. El cruce por tercero usa el mismo balance que el cruce contable.
      </EstadoVacio>
    );
  }
  if (cruceTercero.estado !== "listo" || !resumen) {
    return (
      <EstadoVacio
        titulo={cruceTercero.estado === "bloqueado" ? "Cruce por tercero no habilitado" : "El balance del período no tiene detalle por tercero"}
        enlace={{ href: `/balance/${balance.id}`, texto: `Revisar balance ${balance.descripcion} →` }}
      >
        <span className={cruceTercero.estado === "bloqueado" ? "text-warn-700" : undefined}>{cruceTercero.mensaje}</span>
        {cruceTercero.avisoBalance ? <span className="mt-1 block text-warn-700">{cruceTercero.avisoBalance}</span> : null}
      </EstadoVacio>
    );
  }

  const { conteo, totales, cuentas } = resumen;
  const mostrarCuentas = cuentas.length > 1;
  const delPeriodo = new Set(cuentasPeriodo);
  const cuentasDelPeriodo = cuentas.filter((c) => delPeriodo.has(c));
  const sumaDe = (estado: EstadoCruceTercero, lado: (f: FilaCruceTerceroMarcada) => number) =>
    resumen.filas.filter((f) => f.estado === estado).reduce((suma, f) => suma + lado(f), 0);
  const porMarcar = resumenMarcas ? resumenMarcas.pendientes + resumenMarcas.desactualizadas : 0;
  const tarjetas: { filtro: Filtro; titulo: string; cantidad: number; monto: number | null; tono: string }[] = [
    { filtro: "cuadra", titulo: "Cuadran", cantidad: conteo.cuadra, monto: null, tono: "text-ok-700" },
    { filtro: "descuadre", titulo: "Con diferencia", cantidad: conteo.descuadre, monto: sumaDe("descuadre", (f) => Math.abs(f.diferencia)), tono: "text-err-700" },
    { filtro: "solo_contable", titulo: "Solo en contabilidad", cantidad: conteo.solo_contable, monto: sumaDe("solo_contable", (f) => f.contable.total), tono: "text-warn-700" },
    { filtro: "solo_modulo", titulo: "Solo en el módulo", cantidad: conteo.solo_modulo, monto: sumaDe("solo_modulo", (f) => f.modulo.total), tono: "text-warn-700" },
    ...(resumenMarcas && resumenMarcas.conDiferencia > 0
      ? [{ filtro: "pendientes" as const, titulo: "Por marcar para cerrar", cantidad: porMarcar, monto: porMarcar > 0 ? resumenMarcas.montoPendiente : null, tono: porMarcar > 0 ? "text-err-700" : "text-ok-700" }]
      : []),
    ...(resumen.sinNit > 0 ? [{ filtro: "sin_nit" as const, titulo: "Sin NIT", cantidad: resumen.sinNit, monto: null, tono: "text-ink-700" }] : []),
    ...(resumen.porDv > 0 ? [{ filtro: "por_dv" as const, titulo: "Emparejados por DV", cantidad: resumen.porDv, monto: null, tono: "text-warn-700" }] : []),
    ...(resumen.porNucleo > 0 ? [{ filtro: "por_nucleo" as const, titulo: "Emparejados por núcleo", cantidad: resumen.porNucleo, monto: null, tono: "text-warn-700" }] : []),
    ...(resumen.sugerencias.length > 0 ? [{ filtro: "sugeridos" as const, titulo: "Coincidencias por validar", cantidad: resumen.sugerencias.length * 2, monto: null, tono: "text-blue-700" }] : []),
    ...(cantidadSinSaldo > 0 ? [{ filtro: "sin_saldo" as const, titulo: "Sin saldo", cantidad: cantidadSinSaldo, monto: null, tono: "text-ink-500" }] : []),
  ];
  const elegir = (siguiente: Filtro) => {
    setFiltro((actual) => (actual === siguiente ? "todos" : siguiente));
    setLimite(PAGINA);
  };

  const fuera = resumen.contableFueraDelModulo;
  const sinTercero = resumen.contableSinTercero;
  const contableGrupo = totales.contable + fuera.total + sinTercero.total;
  const columnas = 7 + (mostrarCuentas ? cuentas.length : 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11.5px] text-ink-500">
        Lado contable: balance <b className="text-ink-700">{balance.descripcion}</b>
        {balance.esOficial ? " · oficial" : ""}{balance.estaCongelado ? " · congelado" : ""}
        {cruceTercero.balanceTercero ? <> · detalle por tercero <b className="text-ink-700">{cruceTercero.balanceTercero.version}</b></> : null}
        {" · "}
        <Link href={`/balance/${balance.id}/terceros`} className="font-semibold text-blue-700 hover:underline">Ver por terceros</Link>
      </p>
      {cruceTercero.avisoBalance && (
        <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] leading-snug text-warn-700">{cruceTercero.avisoBalance}</div>
      )}
      {cuentasDelPeriodo.length > 0 && (
        <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] leading-snug text-warn-700">
          {cuentasDelPeriodo.length === 1 ? "La cuenta" : "Las cuentas"} <b>{cuentasDelPeriodo.map((c) => `R - ${c}`).join(", ")}</b>{" "}
          {cuentasDelPeriodo.length === 1 ? "no es" : "no son"} de la cédula del módulo: el Consolidado {cuentasDelPeriodo.length === 1 ? "la asignó" : "las asignó"} solo
          para {cruceTercero.periodo}, así que sus terceros entran a este cruce únicamente en ese período.
        </div>
      )}
      {cruceTercero.parametros && (
        <ParametrosCargue parametros={cruceTercero.parametros} encabezadoId={encabezadoId} puedeEditar={puedeEditar} />
      )}

      {resumenMarcas && (resumenMarcas.conDiferencia > 0 || (resumenMarcas.bajoUmbral ?? 0) > 0) && (
        <div
          className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border px-3 py-2 text-[12px] ${
            porMarcar === 0 ? "border-ok-500 bg-ok-100/30 text-ok-700" : "border-warn-500 bg-warn-100/30 text-warn-700"
          }`}
        >
          <span className="font-semibold">
            {resumenMarcas.marcadas} de {resumenMarcas.conDiferencia} {resumenMarcas.conDiferencia === 1 ? "diferencia" : "diferencias"} desde {fmtContable(cruceTercero.umbralDescuadre)} con marca
          </span>
          {resumenMarcas.pendientes > 0 && (
            <span>Sin marcar: <b>{resumenMarcas.pendientes}</b> ({fmtContable(resumenMarcas.montoPendiente)})</span>
          )}
          {resumenMarcas.desactualizadas > 0 && (
            <span title="La diferencia cambió después de escribir la marca.">Por revisar: <b>{resumenMarcas.desactualizadas}</b></span>
          )}
          {(resumenMarcas.bajoUmbral ?? 0) > 0 && (
            <span className="text-ink-500">{contar(resumenMarcas.bajoUmbral ?? 0)} bajo el umbral: la marca es opcional.</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tarjetas.map((t) => (
          <button
            key={t.filtro}
            type="button"
            onClick={() => elegir(t.filtro)}
            className={`rounded-md border px-3 py-2 text-left ${filtro === t.filtro ? "border-navy-700 bg-blue-50" : "border-ink-150 bg-white hover:border-ink-300"}`}
          >
            <div className="text-[11.5px] text-ink-500">{t.titulo}</div>
            <div className={`text-[16px] font-semibold tabular-nums ${t.tono}`}>{contar(t.cantidad)}</div>
            {t.monto != null && <div className="text-[11px] tabular-nums text-ink-500">{fmtContable(t.monto)}</div>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => { setBusqueda(e.target.value); setLimite(PAGINA); }}
          placeholder={`Buscar por ${cruceTercero.etiquetaClave} o ${cruceTercero.etiquetaNombre.toLocaleLowerCase("es")}`}
          className="w-72 rounded-md border border-ink-200 px-2.5 py-1.5 text-[12.5px]"
        />
        <span className="text-[12px] text-ink-500">
          {contar(filtradas.length)} de {contar(resumen.filas.length)} terceros
          {filtro === "todos" && !busqueda.trim() && cantidadSinSaldo > 0 && (
            <button
              type="button"
              onClick={() => { setVerSinSaldo((v) => !v); setLimite(PAGINA); }}
              className="ml-2 font-semibold text-blue-700 hover:underline"
              title="Terceros en cero en la contabilidad y en el auxiliar"
            >
              {verSinSaldo ? `Ocultar los ${contar(cantidadSinSaldo)} sin saldo` : `Mostrar los ${contar(cantidadSinSaldo)} sin saldo`}
            </button>
          )}
          {filtro !== "todos" && (
            <button type="button" onClick={() => elegir(filtro)} className="ml-2 font-semibold text-blue-700 hover:underline">Quitar filtro</button>
          )}
        </span>
        {puedeEditar && resumen.sugerencias.length > 0 && (
          <button
            type="button"
            onClick={() => setValidando(true)}
            className="ml-auto rounded-md border border-navy-700 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-navy-700 transition hover:bg-blue-50"
            title="Revisa y aplica en lote las coincidencias entre terceros sueltos: mismo saldo, NIT con sufijo o nombre parecido."
          >
            Validar coherencia… ({contar(resumen.sugerencias.length)})
          </button>
        )}
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-ink-50 text-left text-ink-500">
              <tr>
                <th className="px-3 py-2 font-semibold">{cruceTercero.etiquetaClave}</th>
                <th className="px-3 py-2 font-semibold">{cruceTercero.etiquetaNombre}</th>
                {mostrarCuentas && cuentas.map((c) => (
                  <th key={c} className="px-3 py-2 text-right font-semibold" title={delPeriodo.has(c) ? `Fuera de la cédula: vale solo para ${cruceTercero.periodo}` : undefined}>
                    {c}
                    {delPeriodo.has(c) && <span className="block text-[10px] font-semibold uppercase tracking-wide text-warn-700">solo {cruceTercero.periodo}</span>}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold">Contabilidad</th>
                <th className="px-3 py-2 text-right font-semibold">Auxiliar (módulo)</th>
                <th className="px-3 py-2 text-right font-semibold">Diferencia</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="w-px px-3 py-2 text-center font-semibold" title="Marca de auditoría: el detalle está al pie, en observaciones.">Marca</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={columnas} className="px-3 py-6 text-center text-ink-400">Sin terceros para mostrar.</td>
                </tr>
              )}
              {filtradas.slice(0, limite).map((f) => (
                <tr key={f.clave} className={`border-t border-ink-100 ${f.estado === "descuadre" ? "bg-err-100/30" : f.estado === "sin_saldo" ? "text-ink-400" : ""}`}>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-ink-800">{f.sinNit ? "—" : f.clave}</td>
                  <td className="px-3 py-2 text-ink-700">{f.nombre ?? "—"}</td>
                  {mostrarCuentas && cuentas.map((c) => (
                    <td key={c} className="px-3 py-2 text-right tabular-nums text-ink-600">{f.contable.porCuenta[c] ? fmtContable(f.contable.porCuenta[c]) : ""}</td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums text-ink-700">{fmtContable(f.contable.total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-700">
                    {fmtContable(f.modulo.total)}
                    {f.modulo.exterior !== 0 && (
                      <div className="text-[11px] text-ink-500">Nal. {fmtContable(f.modulo.nacional + f.modulo.sinOrigen)} · Ext. {fmtContable(f.modulo.exterior)}</div>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${Math.abs(f.diferencia) <= 0.01 ? "text-ok-700" : "text-err-700"}`}>{fmtContable(f.diferencia)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <Chip label={ESTADO[f.estado].label} tone={ESTADO[f.estado].tone} />
                      <PorcentajeCoincidencia coincidencia={coincidencias.get(f.clave) ?? null} />
                      {f.sinNit && <Chip label="Sin NIT" tone="ink" />}
                      {f.claveModuloPorDv && (
                        <span className="inline-flex items-center gap-1" title={`Unido con ${f.claveModuloPorDv} del auxiliar: su NIT más el dígito de verificación es este. Si no es el mismo tercero, sepáralos.`}>
                          <Chip label="Por DV" tone="warn" />
                          {puedeEditar && (
                            <button type="button" onClick={() => separar(f, f.claveModuloPorDv!)} disabled={ocupado} className="text-[11px] font-semibold text-blue-700 hover:underline disabled:opacity-50">
                              Separar
                            </button>
                          )}
                        </span>
                      )}
                      {f.claveModuloPorNucleo && (
                        <span className="inline-flex items-center gap-1" title={`Emparejado con ${f.claveModuloPorNucleo} del auxiliar por sus nueve primeros dígitos: revisa que sea el mismo tercero.`}>
                          <Chip label="Por núcleo" tone="warn" />
                          {puedeEditar && (
                            <button type="button" onClick={() => separar(f, f.claveModuloPorNucleo!)} disabled={ocupado} className="text-[11px] font-semibold text-blue-700 hover:underline disabled:opacity-50">
                              Separar
                            </button>
                          )}
                        </span>
                      )}
                      {f.separadoDe.map((claveModulo) => {
                        const separacion = separacionPorClave.get(claveModulo);
                        return (
                          <span
                            key={claveModulo}
                            className="inline-flex items-center gap-1"
                            title={separacion
                              ? `Separado por ${separacion.creadoPor ?? "—"} · ${separacion.creadoEn} · ${separacion.periodo ? `solo ${separacion.periodo}` : "todos los períodos"}: no se une solo con ${claveModulo}.`
                              : `No se une solo con ${claveModulo}.`}
                          >
                            <Chip label={`Separado de ${claveModulo}`} tone="ink" />
                            {puedeEditar && separacion && (
                              <button type="button" onClick={() => deshacerEmparejamiento(separacion)} disabled={ocupado} className="text-[11px] font-semibold text-blue-700 hover:underline disabled:opacity-50">
                                Volver a unir
                              </button>
                            )}
                          </span>
                        );
                      })}
                      {f.sugerencia && (
                        <span title={`Posible ${f.sugerencia.nombre ? `«${f.sugerencia.nombre}»` : f.sugerencia.clave}, que solo está en ${f.estado === "solo_modulo" ? "la contabilidad" : "el auxiliar"}: ${describirSenales(f.sugerencia.senales)} (confianza ${f.sugerencia.confianza}). Confírmalo con «Emparejar…» o en «Validar coherencia…».`}>
                          <Chip label={f.sugerencia.clave.startsWith("~") ? "Posible: sin NIT" : `Posible: ${f.sugerencia.clave}`} tone={f.sugerencia.confianza === "alta" ? "blue" : "ink"} />
                        </span>
                      )}
                      {f.emparejadoDesde.map((claveModulo) => {
                        const emparejamiento = emparejamientoPorClave.get(claveModulo);
                        const nombre = claveModulo.startsWith("~") ? (emparejamiento?.nombreModulo ?? claveModulo.slice(1)) : claveModulo;
                        return (
                          <span
                            key={claveModulo}
                            className="inline-flex items-center gap-1"
                            title={emparejamiento
                              ? `Emparejado por ${emparejamiento.creadoPor ?? "—"} · ${emparejamiento.creadoEn} · ${emparejamiento.periodo ? `solo ${emparejamiento.periodo}` : "todos los períodos"}${emparejamiento.nota ? ` · ${emparejamiento.nota}` : ""}`
                              : undefined}
                          >
                            <Chip label={`Incluye ${nombre}`} tone="blue" />
                            {puedeEditar && emparejamiento && (
                              <button
                                type="button"
                                onClick={() => deshacerEmparejamiento(emparejamiento)}
                                disabled={ocupado}
                                className="text-[11px] font-semibold text-blue-700 hover:underline disabled:opacity-50"
                              >
                                Deshacer
                              </button>
                            )}
                          </span>
                        );
                      })}
                      {puedeEditar && f.estado === "solo_modulo" && (
                        <button
                          type="button"
                          onClick={() => setEmparejando(f)}
                          className="rounded border border-ink-200 px-1.5 py-0.5 text-[11px] font-semibold text-ink-600 transition hover:border-navy-700 hover:text-navy-700"
                        >
                          Emparejar…
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-center align-middle">
                    <CeldaMarcaTercero
                      fila={f}
                      encabezadoId={encabezadoId}
                      comentarios={comentarios[anclaCruceTercero(f.clave)] ?? 0}
                      puedeEditar={puedeEditar}
                      onMarcar={() => setMarcando(f)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            {resumen.filas.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-ink-200 bg-ink-50 font-semibold text-ink-800">
                  <td className="px-3 py-2" colSpan={2}>Totales</td>
                  {mostrarCuentas && cuentas.map((c) => <td key={c} className="px-3 py-2 text-right tabular-nums">{fmtContable(totales.porCuenta[c] ?? 0)}</td>)}
                  <td className="px-3 py-2 text-right tabular-nums">{fmtContable(totales.contable)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtContable(totales.modulo)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${Math.abs(totales.diferencia) <= 0.01 ? "text-ok-700" : "text-err-700"}`}>{fmtContable(totales.diferencia)}</td>
                  <td className="px-3 py-2" colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {filtradas.length > limite && (
          <div className="border-t border-ink-100 px-3 py-2 text-center">
            <button type="button" onClick={() => setLimite((l) => l + PAGINA)} className="text-[12.5px] font-semibold text-blue-700 hover:underline">
              Mostrar {contar(Math.min(PAGINA, filtradas.length - limite))} más
            </button>
          </div>
        )}
      </Card>

      {(observaciones.length > 0 || referenciasMarcas.length > 0 || (resumenMarcas?.conDiferencia ?? 0) > 0) && (
        <ObservacionesMarcasTercero
          observaciones={observaciones}
          referencias={referenciasMarcas}
          encabezadoId={encabezadoId}
          comentarios={comentarios}
          puedeEditar={puedeEditar}
          ocupado={ocupado}
          onEditar={(fila) => setMarcando(fila)}
          onQuitar={quitarMarca}
        />
      )}

      <div className="flex flex-col gap-2">
        <div className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[12px] text-ink-700">
          <div>
            Contabilidad del grupo: <b>{fmtContable(contableGrupo)}</b> = en el cruce {fmtContable(totales.contable)}
            {fuera.filas > 0 && <> + cuentas que no hacen parte del módulo {fmtContable(fuera.total)}</>}
            {sinTercero.filas > 0 && <> + cuentas sin detalle por tercero {fmtContable(sinTercero.total)}</>}.
          </div>
          {fuera.filas > 0 && (
            <div className="mt-0.5 text-ink-500">
              No se concilian aquí: {Object.entries(fuera.porCuenta).map(([cuenta, valor]) => `${cuenta} ${fmtContable(valor)}`).join(" · ")}.
            </div>
          )}
          {sinTercero.filas > 0 && (
            <div className="mt-0.5 text-ink-500">
              Sin detalle por tercero: {Object.entries(sinTercero.porCuenta).map(([cuenta, valor]) => `${cuenta} ${fmtContable(valor)}`).join(" · ")}.
            </div>
          )}
        </div>
        {(resumen.moduloFueraDelModulo.filas > 0 || resumen.moduloSinTercero.filas > 0 || cruceTercero.moduloNoAtribuido !== 0) && (
          <div className="rounded-md border border-warn-500 bg-warn-100/30 px-3 py-2 text-[12px] text-warn-700">
            Del auxiliar no entraron al cruce:
            {resumen.moduloFueraDelModulo.filas > 0 && <> <b>{fmtContable(resumen.moduloFueraDelModulo.total)}</b> en cuentas del archivo sin una cuenta del módulo asignada en Consolidado ({Object.entries(resumen.moduloFueraDelModulo.porCuenta).map(([cuenta, valor]) => `${cuenta} ${fmtContable(valor)}`).join(" · ")});</>}
            {resumen.moduloSinTercero.filas > 0 && <> <b>{fmtContable(resumen.moduloSinTercero.total)}</b> en {contar(resumen.moduloSinTercero.filas)} {resumen.moduloSinTercero.filas === 1 ? "fila" : "filas"} sin tercero identificado;</>}
            {cruceTercero.moduloNoAtribuido !== 0 && <> <b>{fmtContable(cruceTercero.moduloNoAtribuido)}</b> que no quedaron atribuidos a ningún tercero al cargar;</>}
            {resumen.moduloFueraDelModulo.filas > 0 ? " asigna esas cuentas en la pestaña Consolidado o" : ""}{" "}revísalos en el detalle del cargue.
          </div>
        )}
        {cruceTercero.contableNoModular.filas > 0 && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
            Se excluyeron <b>{fmtContable(cruceTercero.contableNoModular.total)}</b> de {contar(cruceTercero.contableNoModular.filas)}{" "}
            {cruceTercero.contableNoModular.filas === 1 ? "cuenta marcada no modular" : "cuentas marcadas no modulares"} en el cruce contable
            ({cruceTercero.contableNoModular.cuentas.join(", ")}): sus NIT no se listan.
          </div>
        )}
        {cruceTercero.contableExcluidoFilas > 0 && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
            Se excluyeron <b>{contar(cruceTercero.contableExcluidoFilas)}</b> {cruceTercero.contableExcluidoFilas === 1 ? "fila contable" : "filas contables"} del cruce por falta de homologación Russell o de una regla activa del prevalidador para el módulo.
          </div>
        )}
        {cruceTercero.moduloDerivadoDelDetalle && (
          <div className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[12px] text-ink-600">
            Este cargue es anterior a los saldos por tercero: el lado del módulo se calculó directamente de su detalle.
          </div>
        )}
      </div>

      {marcando && (
        <ModalMarcaTercero
          fila={marcando}
          encabezadoId={encabezadoId}
          onClose={() => setMarcando(null)}
          onGuardado={() => {
            setMarcando(null);
            router.refresh();
          }}
        />
      )}
      {validando && (
        <ModalValidarCoherencia
          sugerencias={resumen.sugerencias}
          encabezadoId={encabezadoId}
          etiquetaClave={cruceTercero.etiquetaClave}
          onClose={() => setValidando(false)}
          onGuardado={() => {
            setValidando(false);
            router.refresh();
          }}
        />
      )}
      {emparejando && (
        <ModalEmparejarTercero
          fila={emparejando}
          candidatos={candidatosBalance}
          encabezadoId={encabezadoId}
          onClose={() => setEmparejando(null)}
          onGuardado={() => {
            setEmparejando(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
