// Precarga de la lectura por ejemplo: lo que el sistema YA entendió, expresado como el modelo que
// el usuario edita. Así se corrige sobre lo leído en vez de armar todo desde cero. Puro.
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { SpecModulo } from "../extraccion/esquema";
import { evaluarCondicion, ROLES_LECTURA_INVENTARIO, type TrazaRegistroLectura } from "../extraccion/lectura-estructurada";
import { ModeloUsuarioSchema, modeloVacio, type ModeloUsuarioInventario } from "./modelo-usuario";

const MAX_SUBTOTALES = 3;

export function modeloDesdeLectura(hoja: GridHoja, spec: SpecModulo, trazas: readonly TrazaRegistroLectura[]): ModeloUsuarioInventario | undefined {
  const desplazamiento = hoja.columnaInicial ?? 0;
  const filaFisica = (i: number) => hoja.filasFisicas?.[i] ?? i + 1;
  const modelo = modeloVacio(hoja.nombre);
  modelo.tipoUnico = spec.clasificadorModo === "global" || undefined;
  const reglas = spec.lecturaEstructurada;
  if (!reglas) {
    const filaTitulos = filaFisica(spec.filaEncabezado - 1);
    modelo.productos = [];
    modelo.columnas = ROLES_LECTURA_INVENTARIO
      .filter((rol) => (spec.columnas[rol] ?? 0) > 0)
      .map((rol) => ({ rol, columna: spec.columnas[rol] + desplazamiento, filaTitulos }));
  } else {
    const propios = new Set(reglas.campos.map((c) => c.rol));
    const registro = trazas.find((t) => t.tipo === "registro");
    if (registro) {
      const asignaciones = registro.campos
        .filter((c) => propios.has(c.rol) && c.fuentes[0])
        .map((c) => ({ rol: c.rol, fila: c.fuentes[0].fila, columna: c.fuentes[0].columna, inicio: c.fuentes[0].inicio, fin: c.fuentes[0].fin }))
        .filter((a) => a.fin > a.inicio);
      const primera = Math.min(...asignaciones.map((a) => a.fila));
      modelo.productos = [{ ...(registro.filaAncla !== primera ? { filaInicio: registro.filaAncla } : {}), asignaciones }];
      const tipoSeccion = !propios.has("tipo") ? registro.campos.find((c) => c.rol === "tipo")?.fuentes.at(-1) : undefined;
      if (reglas.seccion && tipoSeccion) modelo.secciones = [{ fila: tipoSeccion.fila, columna: tipoSeccion.columna, inicio: tipoSeccion.inicio, fin: tipoSeccion.fin }];
    }
    let subtotales = 0;
    for (const t of trazas) {
      if (t.tipo === "registro") continue;
      if (t.tipo === "subtotal" && subtotales++ >= MAX_SUBTOTALES) continue;
      const f = t.campos[0]?.fuentes[0];
      if (f && f.fin > f.inicio && modelo.totales.length < 12) modelo.totales.push({ fila: f.fila, columna: f.columna, inicio: f.inicio, fin: f.fin, tipo: t.tipo === "total" ? "general" : "subtotal" });
    }
    for (const regla of reglas.ignorarFilas ?? []) {
      const i = hoja.filas.findIndex((fila) => evaluarCondicion(fila, regla.condicion));
      if (i >= 0 && modelo.ignorarFilas.length < 12) modelo.ignorarFilas.push({ fila: filaFisica(i), motivo: regla.motivo });
    }
    modelo.ignorarColumnas = (reglas.ignorarColumnas ?? []).map((c) => ({ columna: c.columna + desplazamiento, motivo: c.motivo }));
  }
  // Solo se ofrece si es un modelo válido: una precarga rota obligaría a empezar de cero igual.
  const valido = ModeloUsuarioSchema.safeParse(modelo);
  return valido.success ? valido.data : undefined;
}
