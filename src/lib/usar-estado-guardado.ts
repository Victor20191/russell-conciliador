"use client";

import { useState, useSyncExternalStore } from "react";
import { crearEstadoGuardado } from "./estado-guardado";

export function useEstadoGuardado() {
  const [controlador] = useState(crearEstadoGuardado);
  const snapshot = useSyncExternalStore(
    controlador.suscribir,
    controlador.obtenerSnapshot,
    controlador.obtenerSnapshot,
  );
  return { ...snapshot, ejecutar: controlador.ejecutar, descartar: controlador.descartar };
}
