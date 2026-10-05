import { describe, expect, it } from "vitest";
import {
  avisoContenidoIncompleto,
  contenidoDelCargue,
  esContenidoActivos,
  filaEsSoloDepreciacion,
  MARCA_SOLO_DEPRECIACION,
} from "./contenido-archivo";

describe("esContenidoActivos", () => {
  it("acepta las tres respuestas y rechaza cualquier otra cosa", () => {
    expect(esContenidoActivos("ambos")).toBe(true);
    expect(esContenidoActivos("costo")).toBe(true);
    expect(esContenidoActivos("depreciacion")).toBe(true);
    expect(esContenidoActivos("notas_credito")).toBe(false);
    expect(esContenidoActivos("")).toBe(false);
    expect(esContenidoActivos(null)).toBe(false);
  });
});

describe("filaEsSoloDepreciacion", () => {
  it("solo es cierto con la marca que escribe la lectura", () => {
    expect(filaEsSoloDepreciacion({ [MARCA_SOLO_DEPRECIACION]: 1 })).toBe(true);
    expect(filaEsSoloDepreciacion({ [MARCA_SOLO_DEPRECIACION]: true })).toBe(true);
    expect(filaEsSoloDepreciacion({ [MARCA_SOLO_DEPRECIACION]: "1" })).toBe(true);
    expect(filaEsSoloDepreciacion({ [MARCA_SOLO_DEPRECIACION]: 0 })).toBe(false);
    expect(filaEsSoloDepreciacion({})).toBe(false);
    expect(filaEsSoloDepreciacion(null)).toBe(false);
  });
});

describe("contenidoDelCargue", () => {
  const costo = (valor: number, depreciacion?: number) => ({ valor, datos: depreciacion == null ? {} : { depreciacion } });
  const dep = (valor: number) => ({ valor, datos: { [MARCA_SOLO_DEPRECIACION]: 1 } });

  it("un archivo con las dos columnas trae los dos lados", () => {
    expect(contenidoDelCargue([costo(1_000, 300)])).toEqual({ conCosto: true, conDepreciacion: true });
  });

  it("un archivo de solo costo no inventa depreciación", () => {
    expect(contenidoDelCargue([costo(1_000), costo(500)])).toEqual({ conCosto: true, conDepreciacion: false });
  });

  it("las filas de un archivo de solo depreciación no cuentan como costo", () => {
    expect(contenidoDelCargue([dep(300), dep(120)])).toEqual({ conCosto: false, conDepreciacion: true });
  });

  it("los dos archivos juntos completan el cargue", () => {
    expect(contenidoDelCargue([costo(1_000), dep(300)])).toEqual({ conCosto: true, conDepreciacion: true });
  });

  it("las filas que no imputan no cuentan", () => {
    expect(contenidoDelCargue([{ valor: 9_999, datos: {}, imputable: false }])).toEqual({ conCosto: false, conDepreciacion: false });
  });
});

describe("avisoContenidoIncompleto", () => {
  it("avisa cuál de los dos lados falta", () => {
    expect(avisoContenidoIncompleto({ conCosto: true, conDepreciacion: false })).toContain("solo trae el COSTO");
    expect(avisoContenidoIncompleto({ conCosto: false, conDepreciacion: true })).toContain("solo trae la DEPRECIACIÓN");
  });

  it("con los dos lados, o sin ninguno, no dice nada", () => {
    expect(avisoContenidoIncompleto({ conCosto: true, conDepreciacion: true })).toBeNull();
    expect(avisoContenidoIncompleto({ conCosto: false, conDepreciacion: false })).toBeNull();
  });
});
