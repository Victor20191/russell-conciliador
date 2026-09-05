import { describe, expect, it } from "vitest";
import {
  claveIdentidadTercero,
  completarNombresDelMismoArchivo,
  estadoIdentidadTercero,
  reconocerIdentidadTercero,
} from "./identidad-tercero";

describe("reconocerIdentidadTercero", () => {
  it("conserva completa una cédula de diez dígitos y no la confunde con un NIT", () => {
    const identidad = reconocerIdentidadTercero({ documento: "0012345678", tipo: "CC", nombre: "Ana Pérez" });
    expect(identidad).toMatchObject({
      documentoOriginal: "0012345678",
      tipoDocumento: "CC",
      numeroDocumento: "0012345678",
      digitoVerificacion: null,
      nombre: "Ana Pérez",
      observaciones: [],
    });
    expect(estadoIdentidadTercero(identidad)).toBe("identificado");
  });

  it("separa el DV solo cuando la fuente lo entrega de forma explícita", () => {
    const identidad = reconocerIdentidadTercero({ documento: "NIT: 900.123.456-7", nombre: "ACME SAS" });
    expect(identidad).toMatchObject({ tipoDocumento: "NIT", numeroDocumento: "900123456", digitoVerificacion: "7" });
    expect(claveIdentidadTercero(identidad)).toBe("NIT:900123456");
  });

  it("marca para revisión un tipo desconocido y conserva el valor original", () => {
    const identidad = reconocerIdentidadTercero({ documento: "AB-12345", tipo: "RUT", nombre: "Proveedor" });
    expect(identidad.documentoOriginal).toBe("AB-12345");
    expect(identidad.observaciones).toHaveLength(2);
    expect(estadoIdentidadTercero(identidad)).toBe("revisar");
  });

  it("no trata el rótulo genérico como una identificación", () => {
    const identidad = reconocerIdentidadTercero({ documento: "0", nombre: "Genérico" });
    expect(identidad).toMatchObject({ numeroDocumento: null, nombre: null });
    expect(estadoIdentidadTercero(identidad)).toBe("sin_documento");
  });
});

describe("completarNombresDelMismoArchivo", () => {
  it("completa solo con tipo y documento completo iguales dentro del archivo", () => {
    const base = reconocerIdentidadTercero({ documento: "0012345678", tipo: "CC" });
    const conNombre = reconocerIdentidadTercero({ documento: "0012345678", tipo: "CC", nombre: "Ana Pérez" });
    const [completada] = completarNombresDelMismoArchivo([{ identidadTercero: base }, { identidadTercero: conNombre }]);
    expect(completada.identidadTercero?.nombre).toBe("Ana Pérez");
    expect(completada.identidadTercero?.fuenteNombre).toContain("mismo archivo");
  });

  it("no completa cuando hay dos nombres distintos para la misma identificación", () => {
    const sinNombre = reconocerIdentidadTercero({ documento: "900123456", tipo: "NIT" });
    const a = reconocerIdentidadTercero({ documento: "900123456", tipo: "NIT", nombre: "ACME SAS" });
    const b = reconocerIdentidadTercero({ documento: "900123456", tipo: "NIT", nombre: "OTRA SAS" });
    const [resultado] = completarNombresDelMismoArchivo([
      { identidadTercero: sinNombre }, { identidadTercero: a }, { identidadTercero: b },
    ]);
    expect(resultado.identidadTercero?.nombre).toBeNull();
  });
});
