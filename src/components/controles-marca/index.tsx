"use client";

import { AvisosDeMarca } from "./avisos";
import { ConfirmacionDeMarca } from "./confirmacion";
import { DesplegablesDeMarca } from "./desplegables";
import { FechasDeMarca } from "./fechas";
import { GlifosDeMarca } from "./glifos";
import { SugerenciasDeMarca } from "./sugerencias";
import { ValidacionDeMarca } from "./validacion";

export { confirmarDeMarca } from "./confirmacion";

/**
 * Lo que el navegador dibujaría con la fuente y los colores del sistema operativo,
 * dibujado por la plataforma con la marca: listas de `<select>`, calendarios,
 * sugerencias de `<datalist>`, avisos de `title`, mensajes de validación y
 * confirmaciones; y los glifos de lo que se muestra y se escribe. Va una vez, en
 * el layout raíz: cubre la app y las páginas públicas.
 */
export function ControlesDeMarca() {
  return (
    <>
      <GlifosDeMarca />
      <AvisosDeMarca />
      <ValidacionDeMarca />
      <DesplegablesDeMarca />
      <SugerenciasDeMarca />
      <FechasDeMarca />
      <ConfirmacionDeMarca />
    </>
  );
}
