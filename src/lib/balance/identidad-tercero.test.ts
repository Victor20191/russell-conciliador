import { describe, expect, it } from "vitest";
import {
  claveIdentidadTercero,
  completarNombresDelMismoArchivo,
  diagnosticarIdentidadTerceros,
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

  it("una letra pegada al número sin prefijo configurado queda «por revisar» (comportamiento actual, sin cambios)", () => {
    const identidad = reconocerIdentidadTercero({ documento: "C0709802" });
    expect(identidad.numeroDocumento).toBe("C0709802");
    expect(identidad.observaciones).toHaveLength(1);
    expect(estadoIdentidadTercero(identidad)).toBe("revisar");
  });

  it("con el prefijo declarado, quita la letra pegada y reconoce el documento limpio", () => {
    const identidad = reconocerIdentidadTercero({ documento: "C0709802" }, "C");
    expect(identidad.numeroDocumento).toBe("0709802");
    expect(identidad.observaciones).toHaveLength(0);
    // documentoOriginal conserva el valor crudo del archivo, sin recortar.
    expect(identidad.documentoOriginal).toBe("C0709802");
  });

  it("el prefijo también limpia documentos largos (C1000016474 → 1000016474)", () => {
    const identidad = reconocerIdentidadTercero({ documento: "C1000016474" }, "C");
    expect(identidad.numeroDocumento).toBe("1000016474");
    expect(identidad.observaciones).toHaveLength(0);
  });

  it("el prefijo no afecta documentos que ya empiezan por dígito", () => {
    const identidad = reconocerIdentidadTercero({ documento: "0012345678", tipo: "CC" }, "C");
    expect(identidad.numeroDocumento).toBe("0012345678");
  });
});

describe("diagnosticarIdentidadTerceros", () => {
  it("cuenta sin-documento y sin-nombre, y junta ejemplos crudos del primer grupo", () => {
    const filas = [
      { identidadTercero: reconocerIdentidadTercero({ documento: "C0709802" }) }, // revisar → sin documento
      { identidadTercero: reconocerIdentidadTercero({ documento: "C1000016474" }) }, // revisar → sin documento
      { identidadTercero: reconocerIdentidadTercero({ documento: "900123456", tipo: "NIT" }) }, // sin nombre
      { identidadTercero: reconocerIdentidadTercero({ documento: "0012345678", tipo: "CC", nombre: "Ana Pérez" }) }, // identificado
    ];
    const diag = diagnosticarIdentidadTerceros(filas);
    expect(diag.totalFilas).toBe(4);
    expect(diag.sinDocumento).toBe(2);
    expect(diag.sinNombre).toBe(1);
    expect(diag.ejemplos).toEqual(["C0709802", "C1000016474"]);
  });

  it("con el prefijo aplicado, esas mismas filas dejan de contar como sin documento", () => {
    const filas = [
      { identidadTercero: reconocerIdentidadTercero({ documento: "C0709802" }, "C") },
      { identidadTercero: reconocerIdentidadTercero({ documento: "C1000016474" }, "C") },
    ];
    const diag = diagnosticarIdentidadTerceros(filas);
    expect(diag.sinDocumento).toBe(0);
    // Sin nombre en el archivo, quedan como "sin_nombre".
    expect(diag.sinNombre).toBe(2);
  });

  it("un NIT + nombre en la misma celda sin columna de tipo cuenta como reconocido", () => {
    // Formato Zarzal: « 900359070           1900 CAFE SAS» en la columna de código.
    const filas = [
      { identidadTercero: reconocerIdentidadTercero({ documento: " 900359070           1900 CAFE SAS" }) },
      { identidadTercero: reconocerIdentidadTercero({ documento: " 9019342067          24/7 STOP S.A.S" }) },
    ];
    const diag = diagnosticarIdentidadTerceros(filas);
    expect(diag.sinDocumento).toBe(0);
    expect(diag.sinNombre).toBe(0);
    expect(diag.ejemplos).toEqual([]);
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
