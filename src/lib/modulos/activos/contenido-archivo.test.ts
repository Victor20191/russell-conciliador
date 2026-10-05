import { describe, expect, it } from "vitest";
import {
  avisoContenidoIncompleto,
  contenidoDelCargue,
  esContenidoActivos,
  filaEsSoloDepreciacion,
  MARCA_SOLO_DEPRECIACION,
  ofertaAnexoActivos,
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

describe("ofertaAnexoActivos", () => {
  const vigente = (lados: { conCosto: boolean; conDepreciacion: boolean } | null, extra?: { congelado?: boolean; enFirme?: boolean }) => ({
    version: 2,
    periodo: "2025-12",
    congelado: extra?.congelado ?? false,
    enFirme: extra?.enFirme ?? false,
    lados,
  });

  it("ofrece agregar la depreciación a un cargue que solo tiene el costo", () => {
    expect(ofertaAnexoActivos("depreciacion", vigente({ conCosto: true, conDepreciacion: false }))).toEqual({ ofrecer: true, aviso: null });
  });

  it("ofrece agregar el costo a un cargue que solo tiene la depreciación", () => {
    expect(ofertaAnexoActivos("costo", vigente({ conCosto: false, conDepreciacion: true }))).toEqual({ ofrecer: true, aviso: null });
  });

  it("no ofrece cuando el vigente ya tiene ese lado: sería duplicarlo", () => {
    expect(ofertaAnexoActivos("depreciacion", vigente({ conCosto: true, conDepreciacion: true }))).toEqual({ ofrecer: false, aviso: null });
    expect(ofertaAnexoActivos("costo", vigente({ conCosto: true, conDepreciacion: false }))).toEqual({ ofrecer: false, aviso: null });
  });

  it("un archivo con las dos cosas es un cargue completo: no se anexa", () => {
    expect(ofertaAnexoActivos("ambos", vigente({ conCosto: true, conDepreciacion: false }))).toEqual({ ofrecer: false, aviso: null });
  });

  it("sin cargue vigente o sin respuesta no hay nada que ofrecer", () => {
    expect(ofertaAnexoActivos("costo", null)).toEqual({ ofrecer: false, aviso: null });
    expect(ofertaAnexoActivos(null, vigente(null))).toEqual({ ofrecer: false, aviso: null });
  });

  it("un cargue anterior a este dato se ofrece igual: completar es lo más probable", () => {
    expect(ofertaAnexoActivos("depreciacion", vigente(null))).toEqual({ ofrecer: true, aviso: null });
  });

  it("en firme no se anexa y lo explica", () => {
    const r = ofertaAnexoActivos("depreciacion", vigente({ conCosto: true, conDepreciacion: false }, { enFirme: true }));
    expect(r.ofrecer).toBe(false);
    expect(r.aviso).toContain("está en firme");
  });

  it("congelada avisa que se creará una versión nueva", () => {
    const r = ofertaAnexoActivos("depreciacion", vigente({ conCosto: true, conDepreciacion: false }, { congelado: true }));
    expect(r.ofrecer).toBe(false);
    expect(r.aviso).toContain("congelada");
  });
});
