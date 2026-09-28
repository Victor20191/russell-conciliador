"use client";

// El campo del VALOR en el editor de mapeo, en sus dos formas: una columna, o una FÓRMULA de
// varias columnas con signo (SAP Business One: el ingreso neto es «Total sin Descuento» + los tres
// «Total Fletes»). Y, en Ingresos, la pregunta que reemplazó a la verificación del borrador:
// cuando el valor sale de una columna de «total», «¿confirmas que excluye el IVA?». Sí la guarda
// en el spec; No deja el valor sin mapear, así que no se puede seguir con esa columna.
import { useState, type Dispatch, type SetStateAction } from "react";
import { columnaLetra } from "@/lib/balance/extraccion/hojas-cliente";
import { fmtContable } from "@/lib/format";
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";
import { MINIMO_TERMINOS_FORMULA, tieneValorFormula, type TerminoFormula } from "@/lib/modulos/extraccion/valor-formula";
import {
  avisoValorSinProponer,
  confirmacionValor,
  confirmarValorSinImpuestos,
  firmaValor,
  retirarConfirmacionValor,
} from "@/lib/modulos/extraccion/valor-sin-impuestos";
import type { CeldaMuestra } from "@/lib/modulos/extraccion/vista-analisis";

const claseCampo = "w-full min-w-0 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700 outline-none focus:border-blue-400";

type Opcion = { index1: number; label: string };

/** Celda numérica de la muestra; un texto que no es número no suma en la vista previa. */
const numeroDe = (v: CeldaMuestra): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Cambia el spec del valor y retira una confirmación que ya no corresponde a lo mapeado. */
const conCambio = (s: SpecModulo, cambio: Partial<SpecModulo>): SpecModulo => retirarConfirmacionValor({ ...s, ...cambio });

/**
 * La fórmula del valor: una lista de columnas con su signo, sin texto libre. Cada término elige
 * siempre una columna real (nunca «sin elegir»), así la fórmula no pasa por estados inválidos.
 */
export function FormulaValor({
  spec,
  setSpec,
  rolValor,
  opciones,
  muestraFilas,
  columnaInicial,
}: {
  spec: SpecModulo;
  setSpec: Dispatch<SetStateAction<SpecModulo | null>>;
  rolValor: string;
  opciones: Opcion[];
  muestraFilas: CeldaMuestra[][];
  columnaInicial: number;
}) {
  const formula = spec.valorFormula ?? [];
  const letra = (columna: number) => columnaLetra(columna - 1 + columnaInicial);
  const ancho = opciones.length;
  const actualizar = (nueva: TerminoFormula[]) => setSpec((s) => (s ? conCambio(s, { valorFormula: nueva }) : s));
  const setTermino = (i: number, termino: Partial<TerminoFormula>) =>
    actualizar(formula.map((t, j) => (j === i ? { ...t, ...termino } : t)));
  const agregar = () => {
    const usadas = new Set(formula.map((t) => t.columna));
    const ultima = formula.at(-1)?.columna ?? 0;
    // La siguiente columna libre a la derecha; si no hay, la primera libre.
    const siguiente = [...Array(ancho).keys()].map((c) => c + 1).find((c) => c > ultima && !usadas.has(c))
      ?? [...Array(ancho).keys()].map((c) => c + 1).find((c) => !usadas.has(c));
    if (siguiente != null) actualizar([...formula, { columna: siguiente, signo: "+" }]);
  };
  const quitar = (i: number) => actualizar(formula.filter((_, j) => j !== i));
  const usarUnaColumna = () =>
    setSpec((s) => {
      if (!s) return s;
      const { valorFormula: _fuera, ...resto } = s;
      void _fuera;
      return conCambio(resto as SpecModulo, { columnas: { ...s.columnas, [rolValor]: formula[0]?.columna ?? 0 } });
    });

  // Vista previa con las primeras filas de la muestra que traen algo en la fórmula.
  const filasConDato = muestraFilas
    .map((fila, i) => ({ fila, filaNum: spec.primeraFilaDatos + i }))
    .filter(({ fila }) => formula.some((t) => numeroDe(fila[t.columna - 1] ?? null) != null))
    .slice(0, 2);

  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-md border border-blue-200 bg-blue-50/40 px-2.5 py-2">
      {formula.map((t, i) => (
        <div key={i} className="flex min-w-0 items-center gap-1.5">
          <select
            value={t.signo}
            onChange={(e) => setTermino(i, { signo: e.target.value === "-" ? "-" : "+" })}
            aria-label={`Signo del término ${i + 1}`}
            className="w-12 shrink-0 rounded-md border border-ink-200 bg-white px-1 py-1.5 text-center text-[12px] font-semibold text-ink-700 outline-none focus:border-blue-400"
          >
            <option value="+">+</option>
            <option value="-">−</option>
          </select>
          <select
            value={t.columna}
            onChange={(e) => setTermino(i, { columna: Number(e.target.value) })}
            aria-label={`Columna del término ${i + 1}`}
            className={`${claseCampo} flex-1`}
          >
            {opciones.map((o) => (
              <option key={o.index1} value={o.index1} disabled={o.index1 !== t.columna && formula.some((x) => x.columna === o.index1)}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => quitar(i)}
            disabled={formula.length <= MINIMO_TERMINOS_FORMULA}
            title={formula.length <= MINIMO_TERMINOS_FORMULA ? "La fórmula necesita al menos dos columnas" : "Quitar esta columna"}
            className="shrink-0 rounded px-1.5 text-[14px] leading-none text-ink-400 hover:text-err-700 disabled:opacity-30"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
        <button type="button" onClick={agregar} disabled={formula.length >= ancho} className="font-semibold text-navy-700 hover:underline disabled:opacity-40">
          + Agregar columna
        </button>
        <button type="button" onClick={usarUnaColumna} className="text-ink-500 hover:underline">
          Usar una sola columna
        </button>
      </div>
      <p className="break-words text-[11.5px] text-ink-600">
        <span className="font-semibold">= </span>
        {formula.map((t, i) => `${i === 0 ? (t.signo === "-" ? "−" : "") : t.signo === "-" ? " − " : " + "}${letra(t.columna)}`).join("")}
      </p>
      {filasConDato.map(({ fila, filaNum }) => {
        const partes = formula.map((t) => ({ signo: t.signo, v: numeroDe(fila[t.columna - 1] ?? null) }));
        const total = partes.reduce((s, p) => s + (p.signo === "-" ? -(p.v ?? 0) : p.v ?? 0), 0);
        return (
          <p key={filaNum} className="break-words text-[11px] tabular-nums text-ink-500">
            Fila {filaNum}:{" "}
            {partes.map((p, i) => `${i === 0 ? (p.signo === "-" ? "−" : "") : p.signo === "-" ? " − " : " + "}${p.v == null ? "0" : fmtContable(p.v)}`).join("")}
            {" = "}
            <span className="font-semibold text-ink-700">{fmtContable(Math.round(total * 100) / 100)}</span>
          </p>
        );
      })}
    </div>
  );
}

/** Enlace para pasar el valor de una columna a una fórmula (arranca con la columna actual y la siguiente). */
export function EnlaceFormula({
  spec,
  setSpec,
  rolValor,
  ancho,
}: {
  spec: SpecModulo;
  setSpec: Dispatch<SetStateAction<SpecModulo | null>>;
  rolValor: string;
  ancho: number;
}) {
  if (tieneValorFormula(spec) || ancho < MINIMO_TERMINOS_FORMULA) return null;
  const pasarAFormula = () =>
    setSpec((s) => {
      if (!s) return s;
      const actual = s.columnas[rolValor] ?? 0;
      const primera = actual >= 1 ? actual : 1;
      const segunda = primera < ancho ? primera + 1 : primera - 1;
      return conCambio(s, {
        columnas: { ...s.columnas, [rolValor]: 0 },
        valorFormula: [{ columna: primera, signo: "+" }, { columna: segunda, signo: "+" }],
      });
    });
  return (
    <button type="button" onClick={pasarAFormula} className="self-start text-[11.5px] font-semibold text-navy-700 hover:underline">
      Es una fórmula (sumar o restar varias columnas)
    </button>
  );
}

/**
 * «¿Confirmas que excluye el IVA?» Solo aparece en los módulos que concilian contra cuentas sin
 * impuestos (Ingresos) y cuando el valor sale de una columna de «total».
 */
export function ConfirmacionIvaValor({
  spec,
  setSpec,
  rolValor,
  encabezado,
}: {
  spec: SpecModulo;
  setSpec: Dispatch<SetStateAction<SpecModulo | null>>;
  rolValor: string;
  encabezado: readonly unknown[];
}) {
  const modulo = { valor: rolValor, confirmarValorSinImpuestos: true };
  const [rechazado, setRechazado] = useState<string | null>(null);
  const { rotulo, confirmado } = confirmacionValor(modulo, spec, encabezado);
  const sinProponer = avisoValorSinProponer(modulo, spec, encabezado);

  if (rotulo && confirmado) {
    return (
      <p className="rounded-md border border-ok-100 bg-ok-100/40 px-2.5 py-1.5 text-[11.5px] leading-snug text-ok-700">
        Confirmado: «{rotulo}» excluye el IVA.{" "}
        <button type="button" onClick={() => setSpec((s) => (s ? retirarConfirmacionValor(s) : s))} className="font-semibold underline-offset-2 hover:underline">
          Cambiar
        </button>
      </p>
    );
  }
  if (rotulo) {
    const si = () => {
      const { firma } = firmaValor(modulo, spec, encabezado);
      setRechazado(null);
      setSpec((s) => (s ? confirmarValorSinImpuestos(s, firma) : s));
    };
    const no = () => {
      setRechazado(rotulo);
      setSpec((s) => {
        if (!s) return s;
        const { valorFormula: _fuera, ...resto } = s;
        void _fuera;
        return retirarConfirmacionValor({ ...(resto as SpecModulo), columnas: { ...s.columnas, [rolValor]: 0 } });
      });
    };
    return (
      <div className="flex flex-col gap-1.5 rounded-md border border-warn-500 bg-warn-100/30 px-2.5 py-2 text-[11.5px] leading-snug text-warn-700">
        <p>
          Mapeaste como valor <b>«{rotulo}»</b>, que es una columna de total. <b>¿Confirmas que excluye el IVA?</b>
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={si} className="rounded-md bg-navy-700 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-navy-600">
            Sí, excluye el IVA
          </button>
          <button type="button" onClick={no} className="rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ink-700 hover:bg-ink-50">
            No
          </button>
        </div>
      </div>
    );
  }
  if (rechazado) {
    return (
      <p className="rounded-md border border-err-200 bg-err-50 px-2.5 py-1.5 text-[11.5px] leading-snug text-err-700">
        «{rechazado}» incluye el IVA, así que no puede ser el valor. Elige la columna del ingreso neto sin impuestos, o arma una fórmula.
      </p>
    );
  }
  if (sinProponer) {
    return <p className="rounded-md border border-ink-150 bg-ink-50 px-2.5 py-1.5 text-[11.5px] leading-snug text-ink-600">{sinProponer}</p>;
  }
  return null;
}
