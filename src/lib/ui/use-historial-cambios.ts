"use client";

import { useCallback, useRef, useState } from "react";
import {
  apilarCambio,
  desapilarCambio,
  ultimoCambio,
  type EntradaHistorial,
} from "./historial-cambios";

/**
 * Pila de deshacer para los cambios sin guardar de una pantalla.
 *
 * Uso: llamar `registrar(estadoActual, "qué se hizo")` JUSTO ANTES de aplicar
 * cada edición; `deshacerUltimo()` devuelve la fotografía a restaurar (o null)
 * y `limpiar()` se usa al guardar o al descartar todo.
 *
 * La pila se guarda además en un ref para que los callbacks sean estables y no
 * dependan del estado capturado en el render.
 */
export function useHistorialCambios<T>() {
  const pilaRef = useRef<EntradaHistorial<T>[]>([]);
  const [pila, setPila] = useState<EntradaHistorial<T>[]>([]);

  const registrar = useCallback((estado: T, descripcion: string) => {
    const siguiente = apilarCambio(pilaRef.current, { estado, descripcion });
    pilaRef.current = siguiente;
    setPila(siguiente);
  }, []);

  const deshacerUltimo = useCallback((): EntradaHistorial<T> | null => {
    const { pila: resto, entrada } = desapilarCambio(pilaRef.current);
    if (!entrada) return null;
    pilaRef.current = resto;
    setPila(resto);
    return entrada;
  }, []);

  const limpiar = useCallback(() => {
    pilaRef.current = [];
    setPila([]);
  }, []);

  return {
    registrar,
    deshacerUltimo,
    limpiar,
    total: pila.length,
    puedeDeshacer: pila.length > 0,
    ultimo: ultimoCambio(pila),
  };
}
