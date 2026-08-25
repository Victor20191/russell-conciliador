import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ClienteBorradorCelda,
  coincideBusquedaBorrador,
  direccionInicialColumna,
  ordenarBorradoresListado,
  ordenarBorradoresPorColumna,
  type BorradorRow,
} from "./borradores-index-client";
import type { VinculoClienteBorrador } from "@/lib/balance/autorizacion-borrador";

const fila = {
  archivoNombre: "Balance por tercero GRUPO FORMARTE (1).xlsx",
  cliente: {
    tipo: "asignado",
    id: 7,
    nombre: "GRUPO FORMARTE S.A.S.",
    nit: "830515061-1",
  } satisfies VinculoClienteBorrador,
  nitDetectado: "830515061-1",
};

function filaListado(
  loteId: string,
  cliente: VinculoClienteBorrador,
  creadoEn: string,
  apertura: string | null = "cuenta",
): BorradorRow {
  return {
    loteId,
    archivoNombre: `${loteId}.xlsx`,
    conEncabezado: true,
    nitDetectado: null,
    cliente,
    periodo: "Mayo 2026",
    cuentasMovimiento: 10,
    cuadrado: true,
    partidaDobleDiff: 0,
    apertura,
    cargadoPor: "Analista",
    creadoEn,
    fecha: "1 may 2026",
    hora: "08:00 a. m.",
    version: 1,
    versionesGrupo: 1,
    claveGrupo: null,
  };
}

describe("coincideBusquedaBorrador", () => {
  it("sin término devuelve todos", () => {
    expect(coincideBusquedaBorrador(fila, "")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "   ")).toBe(true);
  });

  it("busca por razón social (parcial, sin acentos/mayúsculas)", () => {
    expect(coincideBusquedaBorrador(fila, "formarte")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "GRUPO FORMARTE")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "s.a.s")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "inexistente")).toBe(false);
  });

  it("busca por NIT con o sin dígito de verificación", () => {
    expect(coincideBusquedaBorrador(fila, "830515061")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "830.515.061-1")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "999999")).toBe(false);
  });

  it("busca por nombre de archivo cargado", () => {
    expect(coincideBusquedaBorrador(fila, "Balance por tercero")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "(1).xlsx")).toBe(true);
    expect(coincideBusquedaBorrador(fila, "otro-archivo")).toBe(false);
  });

  it("encuentra por archivo aunque no haya cliente ni NIT", () => {
    const sinCliente = {
      archivoNombre: "05 3ROS - BCE MAYO 2026 -GC.xlsx",
      cliente: { tipo: "sin_cliente" } satisfies VinculoClienteBorrador,
      nitDetectado: null,
    };
    expect(coincideBusquedaBorrador(sinCliente, "3ROS")).toBe(true);
    expect(coincideBusquedaBorrador(sinCliente, "MAYO")).toBe(true);
    expect(coincideBusquedaBorrador(sinCliente, "formarte")).toBe(false);
  });
});

describe("presentación de borradores vigentes e históricos", () => {
  it("ordena todos los asignados antes de los históricos sin ocultarlos", () => {
    const asignado = {
      tipo: "asignado",
      id: 7,
      nombre: "Cliente vigente",
      nit: "900123456-7",
    } satisfies VinculoClienteBorrador;
    const sugerido = {
      tipo: "sugerido",
      id: 9,
      nombre: "Cliente sugerido",
      nit: "830515061-1",
    } satisfies VinculoClienteBorrador;
    const rows = [
      filaListado("historico-reciente", { tipo: "sin_cliente" }, "2026-07-29T15:00:00.000Z"),
      filaListado("asignado-antiguo", asignado, "2026-06-01T15:00:00.000Z"),
      filaListado("sugerido", sugerido, "2026-07-28T15:00:00.000Z"),
      filaListado("asignado-reciente", asignado, "2026-07-20T15:00:00.000Z"),
    ];

    expect(ordenarBorradoresListado(rows).map((row) => row.loteId)).toEqual([
      "asignado-reciente",
      "asignado-antiguo",
      "historico-reciente",
      "sugerido",
    ]);
  });

  it("mantiene juntas las versiones de un mismo (cliente, período), de la más nueva a la más vieja", () => {
    const asignado = {
      tipo: "asignado",
      id: 7,
      nombre: "Cliente vigente",
      nit: "900123456-7",
    } satisfies VinculoClienteBorrador;
    const conVersion = (
      loteId: string,
      creadoEn: string,
      version: number,
      claveGrupo: string | null,
      versionesGrupo = 1,
    ): BorradorRow => ({
      ...filaListado(loteId, asignado, creadoEn),
      version,
      versionesGrupo,
      claveGrupo,
    });
    // El grupo «mayo» tiene el cargue más reciente (v2), así que va primero
    // entero; suelto-junio queda debajo pese a ser más nuevo que mayo-v1.
    const rows = [
      conVersion("mayo-v1", "2026-07-01T12:00:00.000Z", 1, "c:7|Mayo 2026", 2),
      conVersion("suelto-junio", "2026-07-10T12:00:00.000Z", 1, "c:7|Junio 2026"),
      conVersion("mayo-v2", "2026-07-20T12:00:00.000Z", 2, "c:7|Mayo 2026", 2),
    ];

    expect(ordenarBorradoresListado(rows).map((row) => row.loteId)).toEqual([
      "mayo-v2",
      "mayo-v1",
      "suelto-junio",
    ]);
  });

  it("muestra el cliente persistido sin etiqueta de estado", () => {
    const html = renderToStaticMarkup(
      createElement(ClienteBorradorCelda, {
        cliente: fila.cliente,
        nitDetectado: fila.nitDetectado,
      }),
    );

    expect(html).toContain("GRUPO FORMARTE S.A.S.");
    expect(html).not.toContain("Cliente asignado");
    expect(html).not.toContain("Sugerencia por NIT");
  });

  it("presenta la coincidencia por NIT como sugerencia histórica no asignada", () => {
    const html = renderToStaticMarkup(
      createElement(ClienteBorradorCelda, {
        cliente: {
          tipo: "sugerido",
          id: 9,
          nombre: "Cliente sugerido",
          nit: "830515061-1",
        },
        nitDetectado: "830515061-1",
      }),
    );

    expect(html).toContain("Histórico · sugerencia por NIT");
    expect(html).toContain("Aún no está asignado");
    expect(html).not.toContain("Cliente asignado");
  });

  it("mantiene visible el histórico sin coincidencia de cliente", () => {
    const html = renderToStaticMarkup(
      createElement(ClienteBorradorCelda, {
        cliente: { tipo: "sin_cliente" },
        nitDetectado: "900000000-1",
      }),
    );

    expect(html).toContain("Histórico · sin cliente asignado");
    expect(html).toContain("NIT detectado: 900000000-1");
  });
});

describe("ordenarBorradoresPorColumna", () => {
  const baseCliente = {
    tipo: "asignado",
    id: 1,
    nombre: "BETA SAS",
    nit: "9001",
  } satisfies VinculoClienteBorrador;

  function fila(
    parcial: Partial<BorradorRow> & Pick<BorradorRow, "loteId">,
  ): BorradorRow {
    return {
      archivoNombre: `${parcial.loteId}.xlsx`,
      conEncabezado: true,
      nitDetectado: null,
      cliente: baseCliente,
      periodo: "01/Ene/2026 → 31/Ene/2026",
      cuentasMovimiento: 10,
      cuadrado: true,
      partidaDobleDiff: 0,
      apertura: "cuenta",
      cargadoPor: "Analista",
      creadoEn: "2026-07-01T12:00:00.000Z",
      fecha: "1 jul 2026",
      hora: "07:00 a. m.",
      version: 1,
      versionesGrupo: 1,
      claveGrupo: null,
      ...parcial,
    };
  }

  it("ordena archivo alfabéticamente", () => {
    const rows = [
      fila({ loteId: "b", archivoNombre: "zeta.xlsx" }),
      fila({ loteId: "a", archivoNombre: "alfa.xlsx" }),
      fila({ loteId: "c", archivoNombre: "medio.xlsx" }),
    ];
    expect(
      ordenarBorradoresPorColumna(rows, "archivo", "asc").map((r) => r.loteId),
    ).toEqual(["a", "c", "b"]);
  });

  it("ordena cuentas de mayor a menor", () => {
    const rows = [
      fila({ loteId: "poco", cuentasMovimiento: 10 }),
      fila({ loteId: "mucho", cuentasMovimiento: 500 }),
      fila({ loteId: "medio", cuentasMovimiento: 100 }),
    ];
    expect(
      ordenarBorradoresPorColumna(rows, "cuentas", "desc").map((r) => r.loteId),
    ).toEqual(["mucho", "medio", "poco"]);
  });

  it("ordena estado como texto (Cuadrado / Descuadrado)", () => {
    const rows = [
      fila({ loteId: "ok", cuadrado: true }),
      fila({ loteId: "malo", cuadrado: false, partidaDobleDiff: 100 }),
    ];
    expect(
      ordenarBorradoresPorColumna(rows, "estado", "asc").map((r) => r.loteId),
    ).toEqual(["ok", "malo"]);
  });

  it("ordena el tipo de balance y deja al final los borradores sin declarar", () => {
    const rows = [
      fila({ loteId: "pendiente", apertura: null }),
      fila({ loteId: "terceros", apertura: "tercero" }),
      fila({ loteId: "cuenta", apertura: "cuenta" }),
    ];
    expect(
      ordenarBorradoresPorColumna(rows, "tipo", "asc").map((r) => r.loteId),
    ).toEqual(["cuenta", "terceros", "pendiente"]);
  });

  it("elige dirección inicial según tipo de columna", () => {
    expect(direccionInicialColumna("archivo")).toBe("asc");
    expect(direccionInicialColumna("cliente")).toBe("asc");
    expect(direccionInicialColumna("cuentas")).toBe("desc");
    expect(direccionInicialColumna("fecha")).toBe("desc");
  });
});
