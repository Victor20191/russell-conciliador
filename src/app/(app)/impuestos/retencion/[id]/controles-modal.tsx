"use client";

import { Modal } from "@/components/modal";

// Consulta: qué revisa el sistema para decir «Cuadrado» o «N por corregir».
// Tiene que decir lo mismo que `controlesLectura` (`src/lib/impuestos/retencion/lectura.ts`).

const TITULO = "mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500";

const EN_LOS_DOS = [
  "Se reconoce si es 350 o 490.",
  "El número tiene 13 dígitos y empieza por 35 o 49, según el formulario.",
  "El NIT es el del cliente de la revisión.",
  "El año es el de la revisión.",
  "El período está entre 1 y 12.",
  "Trae la fecha del sello de la entidad recaudadora (renglón 997).",
];

const TOTALES_350 = [
  ["130", "La suma de los renglones de renta, menos el 129"],
  ["134", "131 + 132 − 133"],
  ["136", "130 + 134 + 135"],
  ["138", "136 + 137"],
  ["150, 151, 154 y 155 (pagos al exterior)", "57, 111, 58 y 112"],
];

const SOLO_490 = [
  "El concepto es 61, 62 o 63.",
  "Trae un número válido del 350 que paga (renglón 29).",
  "El total da exacto: 980 = 34 + 35 + 36.",
];

function Lista({ items }: { items: readonly string[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((t) => <li key={t}>{t}</li>)}
    </ul>
  );
}

export function ControlesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Qué revisa el sistema" size="xl">
      <div className="flex flex-col gap-4 text-[12.5px] text-ink-700">
        <section>
          <h3 className={TITULO}>En los dos formularios</h3>
          <Lista items={EN_LOS_DOS} />
        </section>

        <section>
          <h3 className={TITULO}>Solo en el 350</h3>
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
                {TOTALES_350.map(([total, contra]) => (
                  <tr key={total} className="border-t border-ink-100">
                    <td className="px-3 py-1.5 tabular-nums">{total}</td>
                    <td className="px-3 py-1.5 tabular-nums">{contra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5">Si es una corrección (renglón 25 = 1), trae un número válido del formulario que corrige (renglón 26).</p>
        </section>

        <section>
          <h3 className={TITULO}>Solo en el 490</h3>
          <Lista items={SOLO_490} />
        </section>

        <p className="border-t border-ink-100 pt-3 font-medium text-ink-800">
          Si alguno falla, en vez de «Cuadrado» sale «N por corregir» en rojo, y no se puede confirmar hasta corregirlo.
        </p>
      </div>
    </Modal>
  );
}
