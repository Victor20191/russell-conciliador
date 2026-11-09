"use client";

import Link from "next/link";
import { Fragment, useActionState, useEffect, useState } from "react";
import { Card, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { EstadoProcesando } from "@/components/estado-procesando";
import { chevronDivulgacion } from "@/lib/ui/chevron-divulgacion";
import { fmt, fmtDateTime } from "@/lib/format";
import { notifyActionState } from "@/lib/client-notifications";
import { cerrarRevisionImpuesto, desbloquearRevisionImpuesto } from "@/app/actions/impuestos-revisiones";
import type { ActionState } from "@/lib/definitions";
import { MIN_JUSTIFICACION_DESBLOQUEO } from "@/lib/conciliacion/cuentas-bloqueo";
import { etiquetaOportunidad, pagosDeFila, type EstadoOportunidad, type FilaOportunidad, type PagoOportunidad } from "@/lib/impuestos/retencion/oportunidad";
import { alertaReciboDeOtro350, alertaRecibosSin350, alertaSinRecibo, conceptosSinRecibo, etiquetaPago, type FilaPagos, type ResultadoPagos } from "@/lib/impuestos/retencion/pagos";
import { impuestoPorClave, RETENCION, type ClaveImpuesto, type ImpuestoDian } from "@/lib/impuestos/impuestos-dian";
import { esFormularioCalendario, FORMULARIOS_CALENDARIO } from "@/lib/impuestos/calendario";
import { avisoReciboDeOtro350, avisoRecibosSin350 } from "@/lib/impuestos/retencion/periodos-revision";
import type { EvaluacionCierreRetencion, TipoPendiente } from "@/lib/impuestos/retencion/cierre";
import { alcanceSaldoInicial, CLAVE_MARCA_SALDO_INICIAL, type DetalleSaldoInicialRestado } from "@/lib/impuestos/retencion/cruce";
import type { CierreRetencionVista } from "@/lib/impuestos/retencion/resultados-servidor";
import { CeldaMarca, MarcaModal } from "./marca-modal";
import type { TabRevisionRetencion } from "./tabs";

// Oportunidad, pagos efectuados, novedades (qué falta para cerrar) y la barra de cierre en firme.

const BOTON_PRIMARIO = "rounded-md bg-navy-700 px-2 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600 disabled:opacity-60";
const BOTON_SECUNDARIO = "rounded-md border border-ink-200 px-2.5 py-1 text-[12px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-60";
const NUM = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
// Oportunidad y Pagos efectuados, con el aspecto de las tablas de los módulos: encabezado gris, grupos de
// columnas con título pequeño en mayúsculas y una línea fina entre secciones. En Pagos, el total de cada
// sección va en gris claro.
const INICIO_SECCION = "border-l border-ink-200";
const TOTAL_SECCION = "bg-ink-50 font-semibold";
const BORDE_RESULTADO = "border-l border-ink-200";
const FONDO_RESULTADO = "";
const ENCABEZADO_GRUPO = "bg-ink-50 px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-600";
const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const TONO_OPORTUNIDAD: Record<EstadoOportunidad, "ok" | "warn" | "err" | "ink"> = {
  oportuno: "ok", extemporaneo: "err", sin_formulario: "ink", falta_350: "err", falta_original: "warn", sin_fecha: "warn", sin_calendario: "warn", sin_pago: "err", nada_que_pagar: "ink",
};

function EstadoOportunidadChip({ estado, dias, codigo }: { estado: EstadoOportunidad; dias: number | null; codigo: string }) {
  const etiqueta = etiquetaOportunidad(estado, codigo);
  return <Chip label={dias ? `${etiqueta} · ${dias} ${dias === 1 ? "día" : "días"}` : etiqueta} tone={TONO_OPORTUNIDAD[estado]} />;
}

/** La fecha medida junto a su veredicto: se lee «fecha → resultado» de un solo golpe. */
function FechaConEstado({ fecha: iso, estado, dias, codigo }: { fecha: string | null; estado: EstadoOportunidad; dias: number | null; codigo: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="tabular-nums font-semibold text-ink-800">{fecha(iso)}</span>
      <EstadoOportunidadChip estado={estado} dias={dias} codigo={codigo} />
    </div>
  );
}

/** El formulario que sustenta la fecha, en gris: número y autoadhesivo (996). El título de la columna ya dice cuál es. */
function Soporte({ formulario, numero, autoadhesivo }: { formulario: string; numero: string | null; autoadhesivo: string | null }) {
  if (!numero) return <div className="mt-0.5 text-[11px] text-ink-400">{formulario === "490" ? "Sin recibo" : "Sin el original"}</div>;
  return (
    <div className="mt-0.5 text-[11px] tabular-nums text-ink-400">
      {numero}{autoadhesivo ? ` · Autoadhesivo ${autoadhesivo}` : ""}
    </div>
  );
}

/** El pago de una columna (61 o 62 en Retención, el 490 en IVA): fecha con su estado y el recibo; si la declaración no lo obliga, solo el estado. */
function CeldaPago({ pago, codigo }: { pago: PagoOportunidad; codigo: string }) {
  return (
    <>
      <FechaConEstado fecha={pago.fecha} estado={pago.estado} dias={pago.dias} codigo={codigo} />
      {pago.estado !== "nada_que_pagar" && <Soporte formulario="490" numero={pago.numero} autoadhesivo={pago.autoadhesivo} />}
    </>
  );
}

function ObservacionesMarcas({ filas, etiqueta, puedeEditar, onEditar, slug }: {
  slug: string;
  filas: { clave: string; titulo: string; marca: NonNullable<FilaOportunidad["marca"]>; hoy?: number }[];
  etiqueta: string;
  puedeEditar: boolean;
  onEditar: (clave: string) => void;
}) {
  if (filas.length === 0) return null;
  return (
    <Card className="p-0">
      <div className="border-b border-ink-100 px-2 py-2">
        <h3 className="text-[12.5px] font-semibold text-navy-800">Observaciones · {etiqueta}</h3>
      </div>
      <ul className="divide-y divide-ink-100">
        {filas.map(({ clave, titulo, marca: m, hoy }) => (
          <li key={clave} id={`marca-${slug}-${m.numero}`} className="flex flex-col gap-0.5 px-3 py-2 text-[12px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border px-1 text-[11.5px] font-bold tabular-nums ${m.vigente ? "border-navy-700 text-navy-700" : "border-warn-500 bg-warn-100 text-warn-700"}`}>{m.numero}</span>
              <span className="font-semibold text-ink-800">{titulo}</span>
              {hoy !== undefined && <span className="tabular-nums text-ink-500">diferencia {fmt(m.diferencia)}</span>}
              {!m.vigente && <Chip label={hoy !== undefined ? `Desactualizada · hoy ${fmt(hoy)}` : "Ya no hace falta"} tone="warn" />}
              {puedeEditar && <button type="button" onClick={() => onEditar(clave)} className={`ml-auto ${BOTON_SECUNDARIO}`}>Editar</button>}
            </div>
            <p className="whitespace-pre-line text-ink-700">{m.nota}</p>
            <p className="text-[11px] text-ink-400">{m.referenciaAnexo ? `Ref. ${m.referenciaAnexo} · ` : ""}{m.marcadoPor ?? "—"} · {fmtDateTime(m.marcadoEn)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Qué mide la oportunidad, con el formulario y los conceptos del impuesto. */
function explicacionOportunidad(impuesto: ImpuestoDian): string {
  if (impuesto.clave === RETENCION.clave) {
    return "Vencimiento según el calendario tributario del año, el período y el último dígito del NIT (sin el dígito de verificación). La presentación es la del 350 ORIGINAL (renglón 997 del primero de la cadena, no de la corrección). El pago se mide por concepto: el 61 (renta) y, cuando el 350 declara reteIVA (renglón 134), el 62; en cada uno cuenta el último recibo 490. Igual o antes del vencimiento es «Oportuno».";
  }
  const codigo = impuesto.declaracion.codigo;
  const conceptos = impuesto.conceptosPago.map((c) => `${c.concepto} ${(c.periodicidad ?? "").toLowerCase()}`.trim()).join(", ");
  return `Vencimiento según el calendario tributario de la periodicidad del cliente (el de la declaración anual es el del año siguiente, por pares de dígitos), el período y el último dígito del NIT (sin el dígito de verificación). La presentación es la del ${codigo} ORIGINAL (renglón 997 del primero de la cadena, no de la corrección). El pago es el del último recibo 490 del concepto de la periodicidad (${conceptos}); sin saldo a pagar (renglón ${impuesto.renglones.total} en cero) no se espera recibo. Igual o antes del vencimiento es «Oportuno».`;
}

export function VistaOportunidad({
  filas,
  calendario,
  anio,
  etiquetaPeriodo,
  revisionId,
  puedeEditar,
  impuestoClave,
}: {
  filas: FilaOportunidad[];
  calendario: { cargado: boolean; aplica: boolean; anio?: number; formulario?: string };
  anio: number;
  etiquetaPeriodo: (p: number) => string;
  revisionId: number;
  puedeEditar: boolean;
  impuestoClave: ClaveImpuesto;
}) {
  const impuesto = impuestoPorClave(impuestoClave) ?? RETENCION;
  const codigo = impuesto.declaracion.codigo;
  const [marcando, setMarcando] = useState<string | null>(null);
  const fila = filas.find((f) => f.clave === marcando) ?? null;
  const anioCalendario = calendario.anio ?? anio;
  const formularioCalendario = calendario.formulario && esFormularioCalendario(calendario.formulario) ? calendario.formulario : null;
  const enlaceCalendario = `/config/calendario-tributario?anio=${anioCalendario}${formularioCalendario ? `&formulario=${formularioCalendario}` : ""}`;
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-1 p-4 text-[12px] text-ink-500">
        <p>{explicacionOportunidad(impuesto)}</p>
        {!calendario.aplica && (
          <p className="text-warn-700">
            {impuesto.clave === RETENCION.clave
              ? "La periodicidad del cliente no es mensual: el calendario no tiene una fecha límite por período."
              : "La revisión no tiene una periodicidad con calendario: no hay fecha límite por período."}
          </p>
        )}
        {calendario.aplica && !calendario.cargado && (
          <p className="text-warn-700">
            No hay calendario tributario de {anioCalendario}
            {formularioCalendario && formularioCalendario !== "RETEFUENTE" ? ` para ${FORMULARIOS_CALENDARIO[formularioCalendario].etiqueta}` : ""}. Impórtalo en{" "}
            <Link href={enlaceCalendario} className="font-semibold underline">Calendario tributario</Link>.
          </p>
        )}
      </Card>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[1100px] text-[12.5px]">
          <thead className="border-b border-ink-150 bg-ink-50 text-left font-semibold text-ink-500">
            <tr>
              <th className="w-32 px-3 py-2">Período</th>
              <th className="w-44 px-3 py-2">Fecha de vencimiento</th>
              <th className={`${INICIO_SECCION} px-3 py-2`}>Presentación · Formulario {codigo}</th>
              {impuesto.columnasPago.map((c) => (
                <th key={c.id} className={`${INICIO_SECCION} px-3 py-2`}>
                  {c.titulo}
                  {c.subtitulo && <span className="block text-[11.5px] font-normal">{c.subtitulo}</span>}
                </th>
              ))}
              <th className={`${INICIO_SECCION} w-24 px-3 py-2 text-center`}>Marca</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.periodo} className="border-b border-ink-100 align-top last:border-0">
                <td className="px-3 py-2 font-semibold text-navy-800">{etiquetaPeriodo(f.periodo)}</td>
                <td className="px-3 py-2 tabular-nums">{fecha(f.vencimiento)}</td>
                <td className={`${INICIO_SECCION} px-3 py-2`}>
                  <FechaConEstado fecha={f.presentacion} estado={f.estadoPresentacion} dias={f.diasPresentacion} codigo={codigo} />
                  <Soporte formulario={codigo} numero={f.numero350} autoadhesivo={f.autoadhesivo350} />
                </td>
                {pagosDeFila(f, impuesto).map(({ id, pago }) => (
                  <td key={id} className={`${INICIO_SECCION} px-3 py-2`}>
                    <CeldaPago pago={pago} codigo={codigo} />
                  </td>
                ))}
                <td className={`${INICIO_SECCION} px-3 py-2 text-center`}>
                  <CeldaMarca marca={f.marca} requiereMarca={false} admiteMarca={f.admiteMarca} puedeEditar={puedeEditar} ancla={`marca-${impuesto.slug}-${f.marca?.numero ?? ""}`} onMarcar={() => setMarcando(f.clave)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <ObservacionesMarcas
        slug={impuesto.slug}
        etiqueta="marcas de oportunidad"
        puedeEditar={puedeEditar}
        onEditar={setMarcando}
        filas={filas.filter((f) => f.marca).map((f) => ({ clave: f.clave, titulo: `${etiquetaPeriodo(f.periodo)} · falta el original`, marca: f.marca! }))}
      />
      {fila && (
        <MarcaModal
          key={fila.clave}
          revisionId={revisionId}
          clave={fila.clave}
          titulo={`${etiquetaPeriodo(fila.periodo)} · oportunidad`}
          marca={fila.marca}
          conCifra={false}
          diferencia={0}
          placeholder={`Ej.: el cliente no entregó el ${codigo} original; se presentó a tiempo según la DIAN (consulta del …).`}
          resumen={<>La corrección de {etiquetaPeriodo(fila.periodo).toLowerCase()} llegó sin el {codigo} original: no se puede medir la presentación. Para cerrar en firme hay que cargar el original; esta marca es opcional y solo deja la explicación.</>}
          onClose={() => setMarcando(null)}
        />
      )}
    </div>
  );
}

/** Qué compara Pagos efectuados, con los renglones y conceptos del impuesto. */
function explicacionPagos(impuesto: ImpuestoDian): string {
  if (impuesto.clave === RETENCION.clave) {
    return "Por período, el 350 vigente contra los recibos 490 de su cadena. Diferencia = Total pagado antes de intereses − Total (138): positiva si se pagó de más y negativa si se pagó de menos; los intereses de mora van aparte y no se comparan. Se compara al peso: toda diferencia exige marca para cerrar, y también un recibo que paga un 350 de otro período. Despliega un período para ver qué falta por concepto (el 61 contra el 130, el 62 contra el 134 y el 63 contra el 135). La columna Alerta dice qué recibo 490 falta adjuntar.";
  }
  const { codigo } = impuesto.declaracion;
  const { impuesto: rImp, sanciones: rSan, total: rTot } = impuesto.renglones;
  return `Por período, el ${codigo} vigente contra los recibos 490 de su cadena: el saldo a pagar por impuesto (${rImp}) contra el impuesto pagado (36) y las sanciones (${rSan}) contra la sanción pagada (34). Diferencia = Total pagado antes de intereses − Total saldo a pagar (${rTot}): positiva si se pagó de más y negativa si se pagó de menos; los intereses de mora (35) van aparte y no se comparan. Se compara al peso: toda diferencia exige marca para cerrar, y también un recibo que paga un ${codigo} de otro período. La columna Alerta dice qué recibo 490 falta adjuntar.`;
}

export function VistaPagos({
  resultado,
  etiquetaPeriodo,
  revisionId,
  puedeEditar,
  impuestoClave,
}: {
  resultado: ResultadoPagos;
  etiquetaPeriodo: (p: number) => string;
  revisionId: number;
  puedeEditar: boolean;
  impuestoClave: ClaveImpuesto;
}) {
  const impuesto = impuestoPorClave(impuestoClave) ?? RETENCION;
  const codigo = impuesto.declaracion.codigo;
  const { renglones, etiquetasPago } = impuesto;
  const [abiertas, setAbiertas] = useState<ReadonlySet<number>>(new Set());
  const [marcando, setMarcando] = useState<string | null>(null);
  const fila = resultado.filas.find((f) => f.clave === marcando) ?? null;
  const alternar = (p: number) => setAbiertas((prev) => {
    const sig = new Set(prev);
    if (sig.has(p)) sig.delete(p);
    else sig.add(p);
    return sig;
  });
  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4 text-[12px] text-ink-500">{explicacionPagos(impuesto)}</Card>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[1100px] text-[12.5px]">
          <thead className="border-b border-ink-150 bg-ink-50 text-left font-semibold text-ink-500">
            <tr>
              <th rowSpan={2} className="px-2 py-2 align-bottom">Período</th>
              <th colSpan={3} className={`${INICIO_SECCION} ${ENCABEZADO_GRUPO}`}>Valor declarado · Formulario {codigo}</th>
              <th colSpan={3} className={`${INICIO_SECCION} ${ENCABEZADO_GRUPO}`}>Valor pagado · Recibos 490</th>
              <th colSpan={3} className={`${BORDE_RESULTADO} ${ENCABEZADO_GRUPO}`}>
                Resultado · Valor declarado vs <span className="whitespace-nowrap">total pagado antes de intereses</span>
              </th>
              <th className={`${BORDE_RESULTADO} whitespace-nowrap ${ENCABEZADO_GRUPO}`}>Intereses pagados</th>
              <th rowSpan={2} className={`${INICIO_SECCION} px-3 py-2 text-center align-bottom`}>Marca</th>
            </tr>
            <tr>
              <th className={`${INICIO_SECCION} px-2 py-2 text-right`}>{etiquetasPago.impuesto} ({renglones.impuesto})</th>
              <th className="px-2 py-2 text-right">{etiquetasPago.sanciones} ({renglones.sanciones})</th>
              <th className={`${TOTAL_SECCION} px-2 py-2 text-right`}>{etiquetasPago.total} ({renglones.total})</th>
              <th className={`${INICIO_SECCION} px-2 py-2 text-right`}>Impuesto pagado</th>
              <th className="px-2 py-2 text-right">Sanción pagada</th>
              <th className={`${TOTAL_SECCION} px-2 py-2 text-right`}>Total pagado antes de intereses</th>
              <th className={`${BORDE_RESULTADO} px-2 py-2 text-right`}>Diferencia</th>
              <th className="px-2 py-2">Estado</th>
              <th className="px-2 py-2">Alerta</th>
              <th className={`${BORDE_RESULTADO} whitespace-nowrap px-2 py-2 text-right`}>Informativo-No se comparan</th>
            </tr>
          </thead>
          <tbody>
            {resultado.filas.map((f) => (
              <FilaPago key={f.periodo} f={f} impuesto={impuesto} etiqueta={etiquetaPeriodo(f.periodo)} abierta={abiertas.has(f.periodo)} onAlternar={() => alternar(f.periodo)} puedeEditar={puedeEditar} onMarcar={() => setMarcando(f.clave)} />
            ))}
            <tr className="border-t-2 border-ink-200 bg-ink-50 font-semibold text-ink-800">
              <td className="px-2 py-1.5">Total</td>
              <td className={`${NUM} ${INICIO_SECCION}`}>{fmt(resultado.total.retenciones)}</td>
              <td className={NUM}>{fmt(resultado.total.sanciones)}</td>
              <td className={NUM}>{fmt(resultado.total.totalDeclarado)}</td>
              <td className={`${NUM} ${INICIO_SECCION}`}>{fmt(resultado.total.impuestoPagado)}</td>
              <td className={NUM}>{fmt(resultado.total.sancionPagada)}</td>
              <td className={NUM}>{fmt(resultado.total.totalPagado)}</td>
              <td className={`${NUM} ${BORDE_RESULTADO} font-semibold`}>{fmt(resultado.total.diferencia)}</td>
              <td colSpan={2} />
              <td className={`${NUM} ${BORDE_RESULTADO}`}>{fmt(resultado.total.intereses)}</td>
              <td className={INICIO_SECCION} />
            </tr>
          </tbody>
        </table>
      </Card>
      <ObservacionesMarcas
        slug={impuesto.slug}
        etiqueta="marcas de pagos"
        puedeEditar={puedeEditar}
        onEditar={setMarcando}
        filas={resultado.filas.filter((f) => f.marca).map((f) => ({ clave: f.clave, titulo: `${etiquetaPeriodo(f.periodo)} · pagos`, marca: f.marca!, hoy: f.diferencia }))}
      />
      {fila && (
        <MarcaModal
          key={fila.clave}
          revisionId={revisionId}
          clave={fila.clave}
          titulo={`${etiquetaPeriodo(fila.periodo)} · pagos`}
          marca={fila.marca}
          diferencia={fila.diferencia}
          placeholder={impuesto.clave === RETENCION.clave ? "Ej.: el recibo del reteIVA (concepto 62) se pagó en el mes siguiente; ver anexo." : "Ej.: la sanción se pagó en un recibo del período siguiente; ver anexo."}
          resumen={
            <>
              {(fila.recibosSin350 ?? []).length > 0 ? (
                <span className="block">{avisoRecibosSin350(fila.recibosSin350 ?? [], codigo)} Pagaron <span className="font-semibold tabular-nums text-ink-800">{fmt(fila.totalPagado)}</span>.</span>
              ) : fila.diferencia !== 0 && (
                <span className="block">Diferencia en el pago: <span className="font-semibold tabular-nums text-ink-800">{fmt(fila.diferencia)}</span> (pagado {fmt(fila.impuestoPagado + fila.sancionPagada)} − declarado {fmt(fila.retenciones + fila.sanciones)}).</span>
              )}
              {(fila.recibosDeOtro350 ?? []).map((r) => <span key={r.numero} className="block">{avisoReciboDeOtro350(r, codigo)}</span>)}
            </>
          }
          onClose={() => setMarcando(null)}
        />
      )}
    </div>
  );
}

function FilaPago({ f, impuesto, etiqueta, abierta, onAlternar, puedeEditar, onMarcar }: { f: FilaPagos; impuesto: ImpuestoDian; etiqueta: string; abierta: boolean; onAlternar: () => void; puedeEditar: boolean; onMarcar: () => void }) {
  const codigo = impuesto.declaracion.codigo;
  const conFormulario = f.estado === "completo" || f.estado === "diferencia";
  // Un mes sin 350 con recibos 490 muestra lo pagado; lo declarado queda en «—».
  const sin350 = f.recibosSin350 ?? [];
  const conPagos = conFormulario || sin350.length > 0;
  return (
    <Fragment>
      <tr className="border-b border-ink-100 align-top">
        <td className="px-2 py-1.5">
          {conFormulario ? (
            <button type="button" onClick={onAlternar} aria-expanded={abierta} className="flex items-center gap-1.5 font-semibold text-navy-800">
              <Icon name={chevronDivulgacion(abierta)} size={13} className="text-ink-400" />
              {etiqueta}
            </button>
          ) : (
            <span className="pl-5 font-semibold text-navy-800">{etiqueta}</span>
          )}
        </td>
        {conFormulario ? (
          <>
            <td className={`${NUM} ${INICIO_SECCION}`}>{fmt(f.retenciones)}</td>
            <td className={NUM}>{fmt(f.sanciones)}</td>
            <td className={`${NUM} ${TOTAL_SECCION}`}>{fmt(f.totalDeclarado)}</td>
          </>
        ) : (
          <>
            <td colSpan={2} className={INICIO_SECCION} />
            <td className={`${NUM} ${TOTAL_SECCION} text-ink-400`}>—</td>
          </>
        )}
        {conPagos ? (
          <>
            <td className={`${NUM} ${INICIO_SECCION}`}>{fmt(f.impuestoPagado)}</td>
            <td className={NUM}>{fmt(f.sancionPagada)}</td>
            <td className={`${NUM} ${TOTAL_SECCION}`}>{fmt(f.totalPagado)}</td>
            <td className={`${NUM} ${BORDE_RESULTADO} ${FONDO_RESULTADO} font-semibold ${f.diferencia === 0 ? "text-ok-700" : "text-err-700"}`}>{fmt(f.diferencia)}</td>
          </>
        ) : (
          <>
            <td colSpan={2} className={INICIO_SECCION} />
            <td className={`${NUM} ${TOTAL_SECCION} text-ink-400`}>—</td>
            <td className={`${NUM} ${BORDE_RESULTADO} ${FONDO_RESULTADO} text-ink-400`}>—</td>
          </>
        )}
        <td className={`${FONDO_RESULTADO} px-2 py-1.5`}>
          <Chip label={f.estado === "diferencia" && f.marca?.vigente ? "Marcada" : etiquetaPago(f.estado, codigo)} tone={f.estado === "completo" ? "ok" : f.estado === "diferencia" ? (f.marca?.vigente ? "blue" : "warn") : f.estado === "falta_350" ? "err" : "ink"} />
        </td>
        <td className={`${FONDO_RESULTADO} whitespace-nowrap px-2 py-1.5 text-[11.5px] font-semibold leading-5 text-err-700`}>
          {conceptosSinRecibo(f).map((d) => (
            <div key={d.concepto} title={`Paga el renglón ${d.renglon}: ${fmt(d.declarado)}`}>{alertaSinRecibo(d)}</div>
          ))}
          {(f.recibosDeOtro350 ?? []).map((r) => (
            <div key={r.numero} title={avisoReciboDeOtro350(r, codigo)}>{alertaReciboDeOtro350(r, codigo)}</div>
          ))}
          {sin350.length > 0 && <div title={avisoRecibosSin350(sin350, codigo)}>{alertaRecibosSin350(sin350, codigo)}</div>}
        </td>
        <td className={`${NUM} ${BORDE_RESULTADO} ${conPagos ? "" : "text-ink-400"}`}>{conPagos ? fmt(f.intereses) : "—"}</td>
        <td className={`${INICIO_SECCION} px-2 py-1.5 text-center`}>
          <CeldaMarca
            marca={f.marca}
            requiereMarca={f.requiereMarca}
            admiteMarca={f.requiereMarca}
            puedeEditar={puedeEditar}
            ancla={`marca-${impuesto.slug}-${f.marca?.numero ?? ""}`}
            tituloDesactualizada={f.marca ? `Marca ${f.marca.numero} · la diferencia era ${fmt(f.marca.diferencia)} y hoy es ${fmt(f.diferencia)}` : undefined}
            onMarcar={onMarcar}
          />
        </td>
      </tr>
      {abierta && (
        <tr className="border-b border-ink-100 bg-ink-50/40">
          <td colSpan={12} className="px-6 py-2">
            <table className="text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
                  <th className="py-1 pr-6">Concepto</th>
                  <th className="py-1 pr-6 text-right">Declarado</th>
                  <th className="py-1 pr-6 text-right">Pagado (36)</th>
                  <th className="py-1 pr-6 text-right">Diferencia</th>
                  <th className="py-1">Recibos</th>
                </tr>
              </thead>
              <tbody>
                {f.desglose.map((d) => (
                  <tr key={d.concepto}>
                    <td className="py-0.5 pr-6 text-ink-700">Concepto {d.concepto} contra el {d.renglon}</td>
                    <td className="py-0.5 pr-6 text-right tabular-nums">{fmt(d.declarado)}</td>
                    <td className="py-0.5 pr-6 text-right tabular-nums">{fmt(d.pagado)}</td>
                    <td className={`py-0.5 pr-6 text-right tabular-nums ${d.diferencia === 0 ? "text-ink-500" : "font-semibold text-err-700"}`}>{fmt(d.diferencia)}</td>
                    <td className="py-0.5 tabular-nums text-ink-500">{d.recibos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

const TITULO_SALDOS_RESTADOS = "Saldos restados: NITs con saldo inicial a enero";

const ETIQUETA_PENDIENTE: Record<TipoPendiente, { titulo: string; tab: TabRevisionRetencion }> = {
  formularios: { titulo: "Formularios", tab: "formularios" },
  cruce: { titulo: "Cruce contable", tab: "cruce" },
  pagos: { titulo: "Pagos efectuados", tab: "pagos" },
  saldo_inicial: { titulo: TITULO_SALDOS_RESTADOS, tab: "novedades" },
};

const ANCLA_SALDO_INICIAL = "saldo-inicial-restado";

export function VistaNovedades({
  evaluacion,
  enFirme,
  onIr,
  saldoInicial,
  revisionId,
  puedeEditar,
  impuestoClave,
}: {
  evaluacion: EvaluacionCierreRetencion;
  enFirme: boolean;
  onIr: (tab: TabRevisionRetencion) => void;
  saldoInicial: DetalleSaldoInicialRestado | null;
  revisionId: number;
  puedeEditar: boolean;
  impuestoClave: ClaveImpuesto;
}) {
  const impuesto = impuestoPorClave(impuestoClave) ?? RETENCION;
  const tipos = (Object.keys(ETIQUETA_PENDIENTE) as TipoPendiente[]).filter((t) => evaluacion.pendientes.some((p) => p.tipo === t));
  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4 text-[12.5px]">
        <h3 className="text-[12.5px] font-semibold text-navy-800">Para cerrar en firme</h3>
        {enFirme ? (
          <p className="mt-1 text-ink-500">La revisión está en firme.</p>
        ) : evaluacion.pendientes.length === 0 ? (
          <p className="mt-1 text-ok-700">No falta nada: el senior o el gerente asignado puede cerrarla en firme.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-3">
            {tipos.map((t) => (
              <div key={t}>
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-500">{ETIQUETA_PENDIENTE[t].titulo}</span>
                  {ETIQUETA_PENDIENTE[t].tab === "novedades" ? (
                    <a href={`#${ANCLA_SALDO_INICIAL}`} className="text-[11.5px] font-semibold text-blue-700 hover:underline">Ver el detalle abajo</a>
                  ) : (
                    <button type="button" onClick={() => onIr(ETIQUETA_PENDIENTE[t].tab)} className="text-[11.5px] font-semibold text-blue-700 hover:underline">Ir →</button>
                  )}
                </div>
                <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-ink-700">
                  {evaluacion.pendientes.filter((p) => p.tipo === t).map((p, i) => <li key={i}>{p.texto}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
      {saldoInicial && <SaldoInicialRestado detalle={saldoInicial} impuesto={impuesto} revisionId={revisionId} puedeEditar={puedeEditar && !enFirme} />}
      <Card className="p-4 text-[12.5px]">
        <h3 className="text-[12.5px] font-semibold text-navy-800">Avisos</h3>
        {evaluacion.avisos.length === 0 ? (
          <p className="mt-1 text-ink-400">Sin avisos.</p>
        ) : (
          <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-ink-700">
            {evaluacion.avisos.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        )}
        <p className="mt-2 text-[11.5px] text-ink-400">Los avisos no impiden cerrar. Las alertas de la carga y del cruce aún no están diseñadas.</p>
      </Card>
    </div>
  );
}

/**
 * Lo que el cruce contable restó como saldo inicial, tercero por tercero y cuenta por cuenta, para
 * analizarlo y documentarlo. La marca es una sola, obligatoria para cerrar, y guarda el total.
 */
function SaldoInicialRestado({ detalle, impuesto, revisionId, puedeEditar }: { detalle: DetalleSaldoInicialRestado; impuesto: ImpuestoDian; revisionId: number; puedeEditar: boolean }) {
  const [marcando, setMarcando] = useState(false);
  const { marca } = detalle;
  return (
    <div id={ANCLA_SALDO_INICIAL} className="flex flex-col gap-3">
      <Card className="overflow-x-auto p-0 text-[12.5px]">
        <div className="flex flex-wrap items-start gap-3 border-b border-ink-100 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[12.5px] font-semibold text-navy-800">{TITULO_SALDOS_RESTADOS}</h3>
            <p className="mt-0.5 text-[12px] text-ink-500">
              A estos NITs ({alcanceSaldoInicial(detalle)}) el cruce contable les resta de su saldo final el saldo inicial que traían a enero, por {fmt(detalle.total)}: se hace siempre que el balance del corte empieza el 1 de enero. Revisa cada tercero y documenta con una marca por qué se resta: es obligatoria para cerrar en firme y guarda el total; si el total cambia, queda desactualizada.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Chip label={marca?.vigente ? "Marcada" : marca ? "Marca desactualizada" : "Exige marca"} tone={marca?.vigente ? "blue" : "warn"} />
            <CeldaMarca
              marca={marca}
              requiereMarca
              admiteMarca
              puedeEditar={puedeEditar}
              ancla={`marca-${impuesto.slug}-${marca?.numero ?? ""}`}
              tituloDesactualizada={marca ? `Marca ${marca.numero} · el total era ${fmt(marca.diferencia)} y hoy es ${fmt(detalle.total)}` : undefined}
              onMarcar={() => setMarcando(true)}
            />
          </div>
        </div>
        {detalle.filas.length === 0 ? (
          <p className="px-4 py-3 text-ink-400">Esta revisión no guardó el detalle por tercero.</p>
        ) : (
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-ink-150 bg-ink-50 text-left font-semibold text-ink-500">
              <tr>
                <th className="px-3 py-2">Tercero</th>
                <th className="px-3 py-2">Cuenta del cliente</th>
                <th className="px-3 py-2">Cuenta Russell</th>
                <th className="px-3 py-2 text-right">Saldo inicial</th>
                <th className="px-3 py-2 text-right">Saldo final</th>
                <th className="px-3 py-2 text-right">Restado</th>
              </tr>
            </thead>
            <tbody>
              {detalle.filas.map((f) => (
                <tr key={`${f.cuentaCliente}|${f.nit ?? ""}|${f.nombre ?? ""}`} className="border-b border-ink-100 align-top">
                  <td className="px-3 py-1.5">
                    <div className="font-semibold text-ink-800">{f.nombre ?? "Sin nombre"}</div>
                    <div className="text-[11px] tabular-nums text-ink-400">{f.nit ? `NIT ${f.nit}` : "Sin NIT"}</div>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="tabular-nums text-ink-800">{f.cuentaCliente}</div>
                    <div className="text-[11px] text-ink-400">{f.nombreCuenta}</div>
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-ink-700">{f.cuentaRussell ?? "—"}</td>
                  <td className={NUM}>{fmt(f.saldoInicial)}</td>
                  <td className={NUM}>{fmt(f.saldoFinal)}</td>
                  <td className={`${NUM} font-semibold text-ink-800`}>{fmt(f.restado)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-ink-200 bg-ink-50 font-semibold text-ink-800">
                <td colSpan={5} className="px-3 py-1.5">Total restado</td>
                <td className={NUM}>{fmt(detalle.total)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>
      {marca && (
        <ObservacionesMarcas
          slug={impuesto.slug}
          etiqueta="saldos restados"
          puedeEditar={puedeEditar}
          onEditar={() => setMarcando(true)}
          filas={[{ clave: CLAVE_MARCA_SALDO_INICIAL, titulo: "Saldos restados", marca, hoy: detalle.total }]}
        />
      )}
      {marcando && (
        <MarcaModal
          revisionId={revisionId}
          clave={CLAVE_MARCA_SALDO_INICIAL}
          titulo="Saldos restados"
          marca={marca}
          diferencia={detalle.total}
          placeholder={impuesto.clave === RETENCION.clave ? "Ej.: el saldo inicial son retenciones de diciembre del año anterior que se pagaron en enero; ver anexo." : "Ej.: el saldo inicial es el IVA del último período del año anterior, que se declaró y pagó en enero; ver anexo."}
          resumen={<>Saldo inicial a enero restado del saldo final ({alcanceSaldoInicial(detalle)}): <span className="font-semibold tabular-nums text-ink-800">{fmt(detalle.total)}</span>.</>}
          onClose={() => setMarcando(false)}
        />
      )}
    </div>
  );
}

/** Estado del cierre en firme con «Cerrar en firme» o «Desbloquear». */
export function BarraCierre({
  revisionId,
  enFirme,
  cierre,
  pendientes,
  puedeCerrar,
  puedeDesbloquear,
  onVerNovedades,
  balanceId,
  impuestoClave,
}: {
  impuestoClave: ClaveImpuesto;
  revisionId: number;
  enFirme: boolean;
  cierre: CierreRetencionVista | null;
  pendientes: number;
  puedeCerrar: boolean;
  puedeDesbloquear: boolean;
  onVerNovedades: () => void;
  /** Balance contra el que el usuario ve el cruce: el cierre se niega si entretanto se escogió otro. */
  balanceId?: number | null;
}) {
  const [panel, setPanel] = useState<"cerrar" | "desbloquear" | null>(null);
  if (enFirme && cierre) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-navy-300 bg-navy-50 px-3 py-2 text-[12px] text-ink-800">
        <Icon name="shield" size={13} className="text-navy-700" />
        <span>
          <b className="text-navy-800">En firme</b> · cerró {cierre.cerradoPor} el {fmtDateTime(cierre.cerradoEn)} · {cierre.cuentasBloqueadas} cuenta(s) del balance {cierre.balancePeriodo} bloqueada(s)
          {cierre.huella ? <span className="text-ink-500"> · copia congelada {cierre.huella.slice(0, 12)}</span> : null}
        </span>
        {puedeDesbloquear && <button type="button" onClick={() => setPanel("desbloquear")} className={`ml-auto ${BOTON_SECUNDARIO}`}>Desbloquear</button>}
        {panel === "desbloquear" && <PanelDesbloquear revisionId={revisionId} codigo={(impuestoPorClave(impuestoClave) ?? RETENCION).declaracion.codigo} onClose={() => setPanel(null)} />}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      {pendientes > 0 ? (
        <button type="button" onClick={onVerNovedades} className="font-semibold text-warn-700 hover:underline">
          {pendientes} {pendientes === 1 ? "pendiente" : "pendientes"} para cerrar
        </button>
      ) : (
        <span className="font-semibold text-ok-700">Lista para cerrar en firme</span>
      )}
      {cierre?.estado === "desbloqueado" && (
        <span className="text-ink-500">· desbloqueada por {cierre.desbloqueadoPor} el {fmtDateTime(cierre.desbloqueadoEn)}</span>
      )}
      {puedeCerrar && (
        <button type="button" disabled={pendientes > 0} onClick={() => setPanel("cerrar")} className={BOTON_PRIMARIO} title={pendientes > 0 ? "Resuelve los pendientes de Novedades" : undefined}>
          Cerrar en firme
        </button>
      )}
      {panel === "cerrar" && <PanelCerrar revisionId={revisionId} balanceId={balanceId ?? null} onClose={() => setPanel(null)} />}
    </div>
  );
}

function PanelCerrar({ revisionId, balanceId, onClose }: { revisionId: number; balanceId: number | null; onClose: () => void }) {
  const [state, action, cerrando] = useActionState<ActionState, FormData>(cerrarRevisionImpuesto, {});
  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);
  useEffect(() => {
    notifyActionState(state, { success: state.message ?? "Revisión en firme.", error: "No se pudo cerrar la revisión." });
  }, [state]);
  return (
    <Modal open onClose={onClose} title="Cerrar en firme" size="lg" footer={
      <button type="submit" form="cerrar-revision" disabled={cerrando} className={BOTON_PRIMARIO}>
        {cerrando ? <EstadoProcesando>Cerrando</EstadoProcesando> : "Sí, cerrar en firme"}
      </button>
    }>
      <form id="cerrar-revision" action={action} className="flex flex-col gap-2 text-[12.5px] text-ink-700">
        <input type="hidden" name="revisionId" value={revisionId} />
        {balanceId != null && <input type="hidden" name="balanceId" value={balanceId} />}
        <p>Al cerrar en firme:</p>
        <ul className="list-disc pl-5">
          <li>La revisión queda de solo lectura y guarda una copia congelada de sus resultados.</li>
          <li>Queda bloqueado el saldo final y la homologación de las cuentas del cliente que entraron al cruce, en el balance del corte.</li>
          <li>Para cambiar algo después, el senior o el gerente asignado la desbloquea con una justificación.</li>
        </ul>
      </form>
    </Modal>
  );
}

function PanelDesbloquear({ revisionId, codigo, onClose }: { revisionId: number; codigo: string; onClose: () => void }) {
  const [state, action, desbloqueando] = useActionState<ActionState, FormData>(desbloquearRevisionImpuesto, {});
  const [justificacion, setJustificacion] = useState("");
  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);
  useEffect(() => {
    notifyActionState(state, { success: state.message ?? "Revisión desbloqueada.", error: "No se pudo desbloquear la revisión." });
  }, [state]);
  return (
    <Modal open onClose={onClose} title="Desbloquear la revisión" size="lg" footer={
      <button type="submit" form="desbloquear-revision" disabled={desbloqueando || justificacion.trim().length < MIN_JUSTIFICACION_DESBLOQUEO} className={BOTON_PRIMARIO}>
        {desbloqueando ? <EstadoProcesando>Desbloqueando</EstadoProcesando> : "Desbloquear"}
      </button>
    }>
      <form id="desbloquear-revision" action={action} className="flex flex-col gap-2 text-[12.5px]">
        <input type="hidden" name="revisionId" value={revisionId} />
        <p className="text-ink-600">La revisión vuelve a estar en proceso y se liberan las cuentas bloqueadas. La justificación queda en la bitácora.</p>
        <textarea
          name="justificacion"
          value={justificacion}
          onChange={(e) => setJustificacion(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={codigo === "350" ? "Ej.: llegó la corrección del 350 de marzo." : `Ej.: llegó la corrección del ${codigo} del primer período.`}
          aria-label="Justificación"
          className="rounded-md border border-ink-200 bg-white px-2 py-1.5"
        />
      </form>
    </Modal>
  );
}
