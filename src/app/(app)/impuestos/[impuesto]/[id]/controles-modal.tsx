"use client";

import { Modal } from "@/components/modal";
import type { ClaveImpuesto } from "@/lib/impuestos/impuestos-dian";

// Consulta: qué revisa el sistema para decir «Cuadrado» o «N por corregir».
// Tiene que decir lo mismo que `controlesLectura` (`src/lib/impuestos/retencion/lectura.ts`).

const TITULO = "mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500";

type Contenido = {
  codigo: string;
  enLosDos: readonly string[];
  totales: readonly (readonly [string, string])[];
  soloDeclaracion: readonly string[];
  solo490: readonly string[];
};

const RETENCION: Contenido = {
  codigo: "350",
  enLosDos: [
    "Se reconoce si es 350 o 490. Un 300 o un 490 de IVA no se cargan aquí: se rechazan sin guardarlos.",
    "El número tiene 13 dígitos y empieza por 35 o 49, según el formulario.",
    "El NIT es el del cliente de la revisión.",
    "El año es el de la revisión.",
    "El período está entre 1 y 12.",
    "Trae la fecha del sello de la entidad recaudadora (renglón 997).",
  ],
  totales: [
    ["130", "La suma de los renglones de renta, menos el 129"],
    ["134", "131 + 132 − 133"],
    ["136", "130 + 134 + 135"],
    ["138", "136 + 137"],
    ["150, 151, 154 y 155 (pagos al exterior)", "57, 111, 58 y 112"],
  ],
  soloDeclaracion: ["Si es una corrección (renglón 25 = 1), trae un número válido del formulario que corrige (renglón 26)."],
  solo490: [
    "El concepto es 61, 62 o 63.",
    "Trae un número válido del 350 que paga (renglón 29).",
    "El total da exacto: 980 = 34 + 35 + 36.",
  ],
};

const IVA: Contenido = {
  codigo: "300",
  enLosDos: [
    "Se reconoce si es 300 o 490. Un 350 o un 490 de Retención en la fuente no se cargan aquí: se rechazan sin guardarlos.",
    "El número tiene 13 dígitos y empieza por 30 o 49, según el formulario.",
    "El NIT es el del cliente de la revisión.",
    "El año es el de la revisión.",
    "El período existe con la periodicidad del cliente: 1 a 6 bimestral, 1 a 3 cuatrimestral y 1 anual.",
    "Trae la fecha del sello de la entidad recaudadora (renglón 997).",
  ],
  totales: [
    ["41", "27 a 40"],
    ["43", "41 − 42"],
    ["67", "58 a 66"],
    ["77", "68 a 76"],
    ["81", "77 + 78 + 79 − 80"],
    ["82", "67 − 81, o cero si da negativo"],
    ["83", "81 − 67, o cero si da negativo"],
    ["86", "82 − 84 − 85, o cero si da negativo"],
    ["88", "82 − 84 − 85 + 87, o cero si da negativo"],
    ["89", "83 + 84 + 85 − 82 − 87, o cero si da negativo (con saldo a pagar, el 84 y el 85 ya se descontaron)"],
    ["93", "89 − 90"],
  ],
  soloDeclaracion: [
    "La periodicidad marcada en la casilla 24 es la del cliente. Si no se leyó, solo se avisa.",
    "Si es una corrección (renglón 25 = 1), trae un número válido del formulario que corrige (renglón 26).",
    "90 + 91 + 92 da el total saldo a favor (89). Si no, solo se avisa: se puede confirmar.",
  ],
  solo490: [
    "El concepto es el de la periodicidad del cliente: 05 bimestral, 57 cuatrimestral o 58 anual.",
    "Trae un número válido del 300 que paga (renglón 29).",
    "El total da exacto: 980 = 34 + 35 + 36.",
  ],
};

function Lista({ items }: { items: readonly string[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((t) => <li key={t}>{t}</li>)}
    </ul>
  );
}

export function ControlesModal({ impuestoClave, onClose }: { impuestoClave: ClaveImpuesto; onClose: () => void }) {
  const c = impuestoClave === "IVA" ? IVA : RETENCION;
  return (
    <Modal open onClose={onClose} title="Qué revisa el sistema" size="xl">
      <div className="flex flex-col gap-4 text-[12.5px] text-ink-700">
        <section>
          <h3 className={TITULO}>En los dos formularios</h3>
          <Lista items={c.enLosDos} />
        </section>

        <section>
          <h3 className={TITULO}>Solo en el {c.codigo}</h3>
          <p className="mb-1.5">Los totales dan exacto, al peso, con sus renglones:</p>
          <div className="overflow-hidden rounded-md border border-ink-150">
            <table className="w-full">
              <thead className="bg-ink-50 text-left font-semibold text-ink-500">
                <tr>
                  <th className="px-3 py-1.5">Total</th>
                  <th className="px-3 py-1.5">Se compara contra</th>
                </tr>
              </thead>
              <tbody>
                {c.totales.map(([total, contra]) => (
                  <tr key={total} className="border-t border-ink-100">
                    <td className="px-3 py-1.5 tabular-nums">{total}</td>
                    <td className="px-3 py-1.5 tabular-nums">{contra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1.5"><Lista items={c.soloDeclaracion} /></div>
        </section>

        <section>
          <h3 className={TITULO}>Solo en el 490</h3>
          <Lista items={c.solo490} />
        </section>

        <p className="border-t border-ink-100 pt-3 font-medium text-ink-800">
          Si alguno falla, en vez de «Cuadrado» sale «N por corregir» en rojo, y no se puede confirmar hasta corregirlo.
        </p>
      </div>
    </Modal>
  );
}
