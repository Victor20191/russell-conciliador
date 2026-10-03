import type { CondicionLectura, FuenteLectura, LecturaEstructurada } from "@/lib/modulos/extraccion/lectura-estructurada";
import { letraColumnaModulo } from "@/lib/modulos/perfil-modulo";

const roles: Record<string, string> = { referencia: "Referencia", descripcion: "Descripción", tipo: "Tipo de inventario", cantidad: "Cantidad", valorUnitario: "Valor unitario", valorTotal: "Valor total" };

function condicionTexto(condicion: CondicionLectura): string {
  const columna = `la columna ${letraColumnaModulo(condicion.columna)}`;
  if (condicion.operador === "no_vacia") return `${columna} tiene contenido`;
  return `${columna} ${condicion.operador === "igual" ? "dice" : condicion.operador === "empieza" ? "empieza por" : "contiene"} «${condicion.texto}»`;
}

function fuenteTexto(fuente: FuenteLectura): string {
  const selector = fuente.selector;
  const posicion = `Columna ${letraColumnaModulo(fuente.columna)}, ${fuente.desplazamientoFila ? `${fuente.desplazamientoFila} fila(s) después del inicio` : "en la misma fila"}`;
  if (selector.tipo === "completa") return `${posicion}: celda completa.`;
  if (selector.tipo === "etiqueta") return `${posicion}: después de «${selector.inicio}»${selector.fin ? ` y antes de «${selector.fin}»` : ", hasta el final"}.`;
  if (selector.tipo === "separador") return `${posicion}: parte ${selector.indice}, separada por «${selector.separador}».`;
  return `${posicion}: ${selector.longitud} caracteres desde la posición ${selector.inicio}.`;
}

/** Descripción para revisar un patrón irregular sin mostrar controles de columnas que no le aplican. */
export function ResumenLecturaEstructurada({ reglas }: { reglas: LecturaEstructurada }) {
  return <div className="space-y-2 text-[11.5px] leading-relaxed text-ink-600">
    <p className="font-semibold text-ink-800">Lectura de datos combinados</p>
    <p>Cada producto empieza cuando {condicionTexto(reglas.registro.ancla)}. Puede ocupar hasta {reglas.registro.maxFilas} fila(s).</p>
    <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[max-content_1fr]">{reglas.campos.map((campo) => <div key={campo.rol} className="contents">
      <dt className="font-medium text-ink-700">{roles[campo.rol]}</dt><dd className="break-words">{fuenteTexto(campo.fuente)}</dd>
    </div>)}</dl>
    {reglas.seccion && <p><b>Tipo por sección:</b> cuando {condicionTexto(reglas.seccion.condicion)}. {fuenteTexto(reglas.seccion.fuente)}</p>}
    {reglas.totales?.map((total, i) => <p key={i}><b>{total.tipo === "general" ? "Total general" : "Subtotal"}:</b> cuando {condicionTexto(total.condicion)}. {fuenteTexto(total.fuente)}</p>)}
    {reglas.ignorarFilas?.map((omision, i) => <p key={`fila-${i}`}><b>Filas omitidas:</b> cuando {condicionTexto(omision.condicion)}. Motivo: {omision.motivo}</p>)}
    {reglas.ignorarColumnas?.map((omision) => <p key={`col-${omision.columna}`}><b>Columna omitida {letraColumnaModulo(omision.columna)}:</b> {omision.motivo}</p>)}
  </div>;
}
