import { describe, expect, it } from "vitest";
import {
  carpetaArchivoOriginalModulo,
  claveArchivoOriginalModulo,
  datosArchivoOriginalConservado,
  datosArchivoOriginalConCargueEliminado,
  datosArchivoOriginalDescartado,
  datosArchivoOriginalNoProcesable,
  datosArchivoOriginalPromovido,
  datosArchivoOriginalRecibido,
  documentacionArchivoCompleta,
  huellaSha256Archivo,
  nombreArchivoOriginalSeguro,
  resumirRecoleccionModulos,
  resumirRecoleccionModulosAgrupada,
  tipoContenidoArchivo,
} from "./archivo-original";

describe("archivo original de módulos", () => {
  it("calcula SHA-256 sobre los bytes exactos", () => {
    const original = new Uint8Array([0, 1, 2, 255, 10, 13]);
    expect(huellaSha256Archivo(original)).toBe(
      "dd690e46af9837dedcd9b47e9c1ac89b954f2c829f24c2dc2c38a774d046be40",
    );
    expect(huellaSha256Archivo(Uint8Array.from(original))).toBe(
      huellaSha256Archivo(original),
    );
  });

  it("crea una carpeta de Software y una clave estable sin aceptar rutas del navegador", () => {
    expect(carpetaArchivoOriginalModulo({
      moduloLabel: "Ingresos / Facturación",
      clienteId: 17,
      nitCliente: "900.123.456-7",
    })).toBe("Software/ingresos-facturacion/900-123-456-7/Originales");
    expect(claveArchivoOriginalModulo({
      moduloCodigo: "ING",
      clienteId: 17,
      loteId: "7ef6f2e4-cdb7-42da-a68c-cbd5240cc8a2",
      nombreArchivo: "../Facturación agosto.xlsx",
    })).toBe(
      "software/modulos/ing/clientes/17/originales/7ef6f2e4-cdb7-42da-a68c-cbd5240cc8a2/Facturación agosto.xlsx",
    );
    expect(nombreArchivoOriginalSeguro("C:\\temporal\\reporte?.csv")).toBe("reporte_.csv");
    expect(tipoContenidoArchivo("reporte.xlsx", "")).toContain("spreadsheetml");
  });

  it("deja la documentación pendiente hasta completar origen, ubicación y reflejo contable", () => {
    expect(documentacionArchivoCompleta({
      softwareOrigen: "SIIGO",
      ubicacionOrigen: "Facturación / agosto",
      reflejoContableEsperado: null,
    })).toBe(false);
    expect(documentacionArchivoCompleta({
      softwareOrigen: "SIIGO",
      ubicacionOrigen: "Facturación / agosto",
      reflejoContableEsperado: "Ventas operacionales en cuentas 41xx.",
    })).toBe(true);
  });

  it("promueve, descarta o retira el cargue sin cambiar disponibilidad, clave ni huella", () => {
    expect(datosArchivoOriginalRecibido()).toEqual({
      estado: "recibido",
      disponible: false,
    });
    expect(datosArchivoOriginalConservado()).toEqual({ disponible: true });
    expect(datosArchivoOriginalNoProcesable(true)).toEqual({
      estado: "no_procesable",
      disponible: true,
    });
    expect(datosArchivoOriginalNoProcesable(false)).toEqual({
      estado: "no_procesable",
    });
    expect(datosArchivoOriginalPromovido({
      encabezadoId: 81,
      periodo: "2026-08",
      esAnexo: true,
    })).toEqual({
      encabezadoId: 81,
      periodo: "2026-08",
      estado: "cargado",
      esAnexo: true,
    });
    expect(datosArchivoOriginalDescartado()).toEqual({
      encabezadoId: null,
      estado: "descartado",
    });
    expect(datosArchivoOriginalConCargueEliminado()).toEqual({
      encabezadoId: null,
      estado: "cargue_eliminado",
    });
  });

  it("deriva disponible/pendiente de cualquier original verificable aunque cambie su estado operativo", () => {
    const resumen = resumirRecoleccionModulos(
      [
        { codigo: "ING", label: "Ingresos" },
        { codigo: "INV", label: "Inventarios" },
        { codigo: "NOM", label: "Nómina" },
      ],
      [
        { moduloCodigo: "ING", estado: "cargado", disponible: true },
        { moduloCodigo: "ING", estado: "descartado", disponible: true },
        { moduloCodigo: "INV", estado: "cargado", disponible: false },
      ],
    );
    expect(resumen).toEqual([
      { codigo: "ING", label: "Ingresos", archivosRegistrados: 2, archivosDisponibles: 2, estado: "disponible" },
      { codigo: "INV", label: "Inventarios", archivosRegistrados: 1, archivosDisponibles: 0, estado: "pendiente" },
      { codigo: "NOM", label: "Nómina", archivosRegistrados: 0, archivosDisponibles: 0, estado: "pendiente" },
    ]);
    expect(resumirRecoleccionModulosAgrupada(
      [{ codigo: "ING", label: "Ingresos" }],
      [
        { moduloCodigo: "ING", estado: "cargado", disponible: true, cantidad: 3 },
        { moduloCodigo: "ING", estado: "descartado", disponible: true, cantidad: 2 },
      ],
    )).toEqual([
      { codigo: "ING", label: "Ingresos", archivosRegistrados: 5, archivosDisponibles: 5, estado: "disponible" },
    ]);
  });
});
