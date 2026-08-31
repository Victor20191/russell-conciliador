import { Chip } from "@/components/ui";
import { fmtContable } from "@/lib/format";
import {
  estadoGeneralControlSubtotales,
  type ControlGrupo,
  type ControlGranTotal,
  type ControlSubtotales,
} from "@/lib/modulos/subtotales";

const tonos = {
  cuadra: "border-ok-100 bg-ok-100/40 text-ok-700",
  descuadre: "border-err-200 bg-err-50 text-err-700",
  no_validado: "border-ink-150 bg-ink-50 text-ink-600",
} as const;

function ResultadoArchivo({
  estado,
  valor,
  diferencia,
}: {
  estado: ControlGrupo["estado"];
  valor: number;
  diferencia: number | null;
}) {
  if (estado === "no_validado") {
    return (
      <>
        <span className="font-semibold">Archivo {fmtContable(valor)} — NO VALIDADO</span>
        <span className="mt-0.5 block text-[11px] opacity-80">No hay al menos 2 movimientos comparables.</span>
      </>
    );
  }
  if (estado === "cuadra") {
    return <span className="font-semibold">✓ Archivo {fmtContable(valor)} — SÍ COINCIDE</span>;
  }
  return (
    <span className="font-semibold">
      Archivo {fmtContable(valor)} · Δ {fmtContable(diferencia ?? 0)} — NO COINCIDE
    </span>
  );
}

function TarjetaSubtotal({ grupo }: { grupo: ControlGrupo }) {
  return (
    <div className={`rounded-md border px-3 py-2.5 text-[12px] ${tonos[grupo.estado]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide opacity-75">Subtotal · {grupo.clasificador}</div>
          <div className="mt-1 text-[16px] font-semibold tabular-nums">Σ movimientos {fmtContable(grupo.sumaMovimientos)}</div>
        </div>
        <Chip
          label={grupo.estado === "cuadra" ? "Cuadra" : grupo.estado === "descuadre" ? "Descuadra" : "No validado"}
          tone={grupo.estado === "cuadra" ? "ok" : grupo.estado === "descuadre" ? "err" : "ink"}
        />
      </div>
      <div className="mt-1 text-[11px] opacity-80">
        Fila subtotal {grupo.filaSubtotal} · {grupo.bloque.items} movimiento{grupo.bloque.items === 1 ? "" : "s"}
        {grupo.bloque.items > 0 ? ` · filas ${grupo.bloque.desde}–${grupo.bloque.hasta}` : ""}
      </div>
      <div className="mt-1.5 border-t border-current/10 pt-1.5">
        <ResultadoArchivo estado={grupo.estado} valor={grupo.subtotalArchivo} diferencia={grupo.diferencia} />
      </div>
    </div>
  );
}

function TarjetaGranTotal({ granTotal }: { granTotal: ControlGranTotal }) {
  return (
    <div className={`rounded-md border px-3 py-2.5 text-[12px] ${tonos[granTotal.estado]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide opacity-75">Total general</div>
          <div className="mt-1 text-[16px] font-semibold tabular-nums">Σ movimientos {fmtContable(granTotal.sumaMovimientos)}</div>
        </div>
        <Chip
          label={granTotal.estado === "cuadra" ? "Cuadra" : granTotal.estado === "descuadre" ? "Descuadra" : "No validado"}
          tone={granTotal.estado === "cuadra" ? "ok" : granTotal.estado === "descuadre" ? "err" : "ink"}
        />
      </div>
      <div className="mt-1 text-[11px] opacity-80">Fila total general {granTotal.filaNum}</div>
      <div className="mt-1.5 border-t border-current/10 pt-1.5">
        <ResultadoArchivo estado={granTotal.estado} valor={granTotal.subtotalArchivo} diferencia={granTotal.diferencia} />
      </div>
    </div>
  );
}

function TarjetaNoDetectado({ tipo }: { tipo: "subtotales" | "total" }) {
  return (
    <div className="rounded-md border border-ink-150 bg-ink-50 px-3 py-2.5 text-[12px] text-ink-600">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">
          {tipo === "subtotales" ? "Subtotales" : "Total general"}
        </div>
        <Chip label="No detectado" tone="ink" />
      </div>
      <div className="mt-2 font-semibold">NO VALIDADO</div>
      <div className="mt-0.5 text-[11px] text-ink-500">
        {tipo === "subtotales"
          ? "No se identificó una fila de subtotal para comparar."
          : "No se identificó una fila de total general para comparar."}
      </div>
    </div>
  );
}

export function ValidacionSubtotales({ control }: { control: ControlSubtotales }) {
  const estado = estadoGeneralControlSubtotales(control);
  const controles = control.grupos.length + (control.granTotal ? 1 : 0);
  const chip = estado === "coincide"
    ? { label: "Sí coincide", tone: "ok" as const }
    : estado === "no_coincide"
      ? { label: "No coincide", tone: "err" as const }
      : { label: "No validado", tone: "ink" as const };

  return (
    <section className="flex flex-col gap-2.5" aria-label="Validación de subtotales">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Validación de subtotales</span>
        <Chip label={chip.label} tone={chip.tone} />
      </div>

      <div className={`rounded-md border px-3 py-2 text-[12px] ${tonos[estado === "coincide" ? "cuadra" : estado === "no_coincide" ? "descuadre" : "no_validado"]}`}>
        {estado === "coincide" ? (
          <>
            <span className="font-semibold">SÍ COINCIDE:</span>{" "}
            {controles === 1
              ? "el control identificado cuadra con la suma de sus movimientos."
              : `los ${controles} controles identificados cuadran con la suma de sus movimientos.`}
          </>
        ) : estado === "no_coincide" ? (
          <><span className="font-semibold">NO COINCIDE:</span> {control.descuadres} control{control.descuadres === 1 ? "" : "es"} no cuadra{control.descuadres === 1 ? "" : "n"} con la suma de sus movimientos.</>
        ) : controles === 0 ? (
          <><span className="font-semibold">NO VALIDADO:</span> no se identificaron filas de subtotal ni de total general para comparar.</>
        ) : (
          <><span className="font-semibold">NO VALIDADO:</span> {control.noValidados} control{control.noValidados === 1 ? "" : "es"} no tiene{control.noValidados === 1 ? "" : "n"} suficientes movimientos comparables.</>
        )}
        <span className="ml-1 opacity-80">Tolerancia: $1. Los subtotales no se cargan; el consolidado sale de los movimientos.</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {control.grupos.length > 0
          ? control.grupos.map((grupo) => <TarjetaSubtotal key={grupo.filaSubtotal} grupo={grupo} />)
          : <TarjetaNoDetectado tipo="subtotales" />}
        {control.granTotal
          ? <TarjetaGranTotal granTotal={control.granTotal} />
          : <TarjetaNoDetectado tipo="total" />}
      </div>
    </section>
  );
}
