import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MappingSpecSchema, SpecCargaSchema, type MappingSpec } from "./esquema";
import { aplanarSpec, specDesdePerfil } from "./perfil";
import { transformarTabular } from "./transformar";

const spec: MappingSpec = {
  hoja: "Balance", filaEncabezado: 1, primeraFilaDatos: 2,
  columnas: {
    codigo: 1, codigoFragmentos: [], nombre: 2, tercero: 3, nombreTercero: 4,
    saldoInicial: 5, debitos: 6, creditos: 7, saldoFinal: 8,
    saldoFinalDebito: 0, saldoFinalCredito: 0,
  },
  signoCredito: "firmado", reglaDetalle: { tipo: "prefijo", columna: null, valor: null },
  agregarPorTercero: true, prefijoDocumentoTercero: null, subtotalesTercero: "auto",
  nit: { valor: null, fuente: "NINGUNO" },
  periodoInicial: { valor: null, fuente: "NINGUNO" }, periodoFinal: { valor: null, fuente: "NINGUNO" },
  estandar: "AUTO", importable: true, motivoNoImportable: null, excepciones: [], confianza: 1, notas: null,
};

describe("contrato de identidad de terceros", () => {
  it("incluye el nombre separado en la salida estructurada enviada a Anthropic", () => {
    const formato = zodOutputFormat(MappingSpecSchema);
    expect(formato.schema).toMatchObject({
      properties: {
        columnas: {
          properties: { tercero: expect.any(Object), nombreTercero: expect.any(Object) },
          required: expect.arrayContaining(["tercero", "nombreTercero"]),
        },
      },
    });
    expect(formato.parse(JSON.stringify(spec)).columnas).toMatchObject({ tercero: 3, nombreTercero: 4 });
  });

  it("acepta perfiles/specs históricos sin nombreTercero y permite 0 como columna ausente", () => {
    const anterior = structuredClone(spec);
    delete anterior.columnas.nombreTercero;
    const carga = SpecCargaSchema.parse(anterior);
    expect(specDesdePerfil(aplanarSpec(carga)).columnas.nombreTercero).toBeUndefined();
    expect(MappingSpecSchema.parse({ ...spec, columnas: { ...spec.columnas, nombreTercero: 0 } }).columnas.nombreTercero).toBe(0);
  });

  it.each(["Tercero", "Nombre NIT"])("conserva documento y nombre desde IA hasta reutilizar el perfil con encabezado %s", (encabezadoNombre) => {
    const salidaIA = MappingSpecSchema.parse(spec);
    const reconstruido = specDesdePerfil(aplanarSpec(SpecCargaSchema.parse(salidaIA)));
    const resultado = transformarTabular(reconstruido, [{
      nombre: "Balance",
      filas: [
        ["Cuenta", "Descripción", "Identificación", encabezadoNombre, "SI", "DB", "CR", "Saldo"],
        ["130505", "Clientes", "0012345678", "Ana Pérez", 0, 100, 0, 100],
        ["220505", "Proveedores", "900123456-7", "Proveedor SAS", 0, 0, 100, -100],
      ],
    }], { nit: null, periodoInicial: null, periodoFinal: null, estandar: "AUTO" });

    expect(resultado.filasTercero).toHaveLength(2);
    expect(resultado.filasTercero?.[0].identidadTercero).toMatchObject({ numeroDocumento: "0012345678", nombre: "Ana Pérez" });
    expect(resultado.filasTercero?.[1]).toMatchObject({ nitTercero: "900123456", nombreTercero: "Proveedor SAS" });
    expect(resultado.cuadre.partidaDobleCuadra).toBe(true);
  });
});
