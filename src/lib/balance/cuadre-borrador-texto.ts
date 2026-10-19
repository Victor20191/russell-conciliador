// Texto de cada condición que hace «Descuadrado» un borrador. Aparte de `cuadre-borrador.ts`
// para que la lista lo use sin cargar el view-model del borrador en su bundle.
import { fmt } from "@/lib/format";
import type { MotivoDescuadre } from "./cuadre-borrador";

/** Una línea por condición que falla (lista de borradores y recuadro del detalle). */
export function textoMotivoDescuadre(m: MotivoDescuadre): { texto: string; titulo: string } {
  switch (m.tipo) {
    case "ecuacion":
      return {
        texto: `Ecuación · Δ ${fmt(m.monto)}`,
        titulo: `Activo = Pasivo + Patrimonio + Resultado no cuadra: diferencia ${fmt(m.monto)}.`,
      };
    case "partida_doble":
      return {
        texto: `Partida doble · Δ ${fmt(m.monto)}`,
        titulo: `Total débitos ≠ total créditos: diferencia ${fmt(m.monto)}.`,
      };
    case "clases":
      return {
        texto: m.clases.length <= 2
          ? `Clases vs archivo · ${m.clases.map((c) => c.clase).join(", ")}`
          : `Clases vs archivo · ${m.clases.length} clases`,
        titulo: `Total del archivo ≠ suma del detalle: ${m.clases.map((c) => `${c.clase} Δ ${fmt(c.diff)}`).join(" · ")}.`,
      };
    case "agrupadoras": {
      const cantidad = `${m.masDe ? "más de " : ""}${m.cantidad}`;
      return {
        texto: `Agrupadoras · ${cantidad} sin cuadrar`,
        titulo: `${m.cantidad === 1 && !m.masDe ? "Una agrupadora no cuadra" : `${cantidad} agrupadoras no cuadran`} con su desglose: ${m.codigos.join(", ")}${m.cantidad > m.codigos.length || m.masDe ? "…" : ""}.`,
      };
    }
  }
}
