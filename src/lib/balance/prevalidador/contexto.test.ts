import { describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import type { FilaCatalogoCruda } from "./catalogo";
import {
  leerCatalogoCongelado,
  mismoCatalogo,
  resolverContextoPrevalidador,
  type DatosPrevalidador,
} from "./contexto";
import { mapearCatalogoPrevalidador } from "./catalogo";

// Catálogo tal como lo devolvía la BD antes del 28/Sep/2026: Ingresos y Nómina por movimiento.
const CATALOGO_MOVIMIENTO: FilaCatalogoCruda[] = [
  { id: 1, cuentaRussell: "41", etiqueta: "Ingresos operacionales", baseCalculo: "movimiento", orden: 10, activa: true, module: { code: "ING", name: "Ingresos" } },
  { id: 3, cuentaRussell: "13", etiqueta: "Deudores", baseCalculo: "saldo", orden: 20, activa: true, module: { code: "CAR", name: "Cartera" } },
  { id: 2, cuentaRussell: "5105", etiqueta: "Gastos de personal", baseCalculo: "movimiento", orden: 60, activa: true, module: { code: "NOM", name: "Nómina" } },
];
const CATALOGO_SALDO: FilaCatalogoCruda[] = CATALOGO_MOVIMIENTO.map((f) => ({ ...f, baseCalculo: "saldo" }));

const APROBADA_EN = new Date("2026-09-20T15:30:00.000Z");

function datosBase(catalogoVigente: FilaCatalogoCruda[] = CATALOGO_MOVIMIENTO): DatosPrevalidador {
  return {
    balance: {
      id: 215,
      clienteId: 9,
      nombreCliente: "Cliente de prueba",
      periodo: "Diciembre 2025",
      periodoInicio: new Date("2025-12-01T00:00:00.000Z"),
      periodoFin: new Date("2025-12-31T00:00:00.000Z"),
      version: "1",
      esOficial: true,
      estaCongelado: false,
      detalles: [
        // Saldo final ≠ débitos − créditos: así la base de cálculo cambia el informe.
        { cuenta8: "41350501", nombreCuenta: "Ventas", cuenta6Russell: "413505", debitos: "100.00", creditos: "400.00", saldoFinal: "-900.00" },
        { cuenta8: "51050601", nombreCuenta: "Sueldos", cuenta6Russell: "510506", debitos: "300.00", creditos: "0.00", saldoFinal: "1000.00" },
        { cuenta8: "13050501", nombreCuenta: "Clientes", cuenta6Russell: "130505", debitos: "50.00", creditos: "10.00", saldoFinal: "250.00" },
      ],
    },
    catalogoVigente,
    overrides: [],
    ultimaRevision: null,
  };
}

/** La aprobación que habría quedado al aprobar `datos` tal como están (con o sin catálogo congelado). */
function aprobar(datos: DatosPrevalidador, opciones: { congelar?: boolean } = {}): DatosPrevalidador["ultimaRevision"] {
  const contexto = resolverContextoPrevalidador(datos);
  return {
    id: 1,
    estado: "aprobada",
    justificacion: "Revisado contra el balance",
    actor: "Revisor",
    creadoEn: APROBADA_EN,
    huella: contexto.huella,
    instantanea: { prevalidador: "instantánea" },
    catalogoCongelado: (opciones.congelar ?? true)
      ? { catalogo: contexto.catalogoCrudo as unknown as Prisma.JsonValue, origen: "aprobacion", creadoEn: APROBADA_EN }
      : null,
  };
}

/** Los datos de hoy (catálogo en saldo) con la aprobación hecha cuando el catálogo iba por movimiento. */
function aprobadoConMovimientoYHoySaldo(opciones: { congelar?: boolean } = {}): DatosPrevalidador {
  const revision = aprobar(datosBase(CATALOGO_MOVIMIENTO), opciones);
  return { ...datosBase(CATALOGO_SALDO), ultimaRevision: revision };
}

const baseDe = (catalogo: { cuentaRussell: string; baseCalculo: string }[], cuenta: string) =>
  catalogo.find((f) => f.cuentaRussell === cuenta)?.baseCalculo;

describe("resolverContextoPrevalidador — la aprobación conserva su catálogo", () => {
  it("sin revisión: pendiente y calculado con el catálogo vigente", () => {
    const contexto = resolverContextoPrevalidador(datosBase(CATALOGO_SALDO));
    expect(contexto.revision).toMatchObject({ estado: "pendiente", vigente: false, catalogoCongelado: null });
    expect(baseDe(contexto.catalogo, "41")).toBe("saldo");
    expect(contexto.catalogoCrudo).toEqual(CATALOGO_SALDO);
  });

  it("aprobado y el catálogo no cambió: vigente, con el congelado idéntico al vigente", () => {
    const datos = datosBase();
    const contexto = resolverContextoPrevalidador({ ...datos, ultimaRevision: aprobar(datos) });
    expect(contexto.revision).toMatchObject({
      estado: "aprobada",
      vigente: true,
      catalogoCongelado: { desde: APROBADA_EN.toISOString(), origen: "aprobacion", difiereDelVigente: false },
    });
  });

  it("aprobado con Ingresos y Nómina por movimiento: sigue vigente aunque hoy vayan por saldo, y se muestra como se aprobó", () => {
    const datos = aprobadoConMovimientoYHoySaldo();
    const contexto = resolverContextoPrevalidador(datos);
    expect(contexto.revision).toMatchObject({ estado: "aprobada", vigente: true });
    expect(contexto.revision.catalogoCongelado).toMatchObject({ difiereDelVigente: true });
    expect(baseDe(contexto.catalogo, "41")).toBe("movimiento");
    expect(baseDe(contexto.catalogo, "5105")).toBe("movimiento");
    expect(baseDe(contexto.catalogoCrudo, "41")).toBe("movimiento");
    // El informe es el que se aprobó, no el del catálogo vigente.
    const conMovimiento = resolverContextoPrevalidador(datosBase(CATALOGO_MOVIMIENTO));
    const conSaldo = resolverContextoPrevalidador(datosBase(CATALOGO_SALDO));
    expect(conMovimiento.prevalidador).not.toEqual(conSaldo.prevalidador);
    expect(contexto.prevalidador).toEqual(conMovimiento.prevalidador);
    expect(contexto.huella).toBe(datos.ultimaRevision?.huella);
  });

  it("si cambia un saldo del balance, la aprobación queda desactualizada y el informe usa el catálogo vigente", () => {
    const datos = aprobadoConMovimientoYHoySaldo();
    datos.balance.detalles[0] = { ...datos.balance.detalles[0], saldoFinal: "-901.00" };
    const contexto = resolverContextoPrevalidador(datos);
    expect(contexto.revision).toMatchObject({ estado: "desactualizada", vigente: false, catalogoCongelado: null });
    expect(baseDe(contexto.catalogo, "41")).toBe("saldo");
    expect(baseDe(contexto.catalogoCrudo, "41")).toBe("saldo");
  });

  it("si cambia la homologación, también queda desactualizada", () => {
    const datos = aprobadoConMovimientoYHoySaldo();
    datos.balance.detalles[1] = { ...datos.balance.detalles[1], cuenta6Russell: "510530" };
    expect(resolverContextoPrevalidador(datos).revision.estado).toBe("desactualizada");
  });

  it("si cambia la cuenta alternativa del balance, queda desactualizada", () => {
    const datos = { ...aprobadoConMovimientoYHoySaldo(), overrides: [{ catalogoId: 1, cuentaCliente: "42" }] };
    const contexto = resolverContextoPrevalidador(datos);
    expect(contexto.revision).toMatchObject({ estado: "desactualizada", catalogoCongelado: null });
  });

  it("una aprobación anterior sin catálogo congelado se evalúa como antes: vigente solo si el catálogo no cambió", () => {
    const igual = datosBase();
    const vigente = resolverContextoPrevalidador({ ...igual, ultimaRevision: aprobar(igual, { congelar: false }) });
    expect(vigente.revision).toMatchObject({ estado: "aprobada", vigente: true, catalogoCongelado: null });

    const cambiado = resolverContextoPrevalidador(aprobadoConMovimientoYHoySaldo({ congelar: false }));
    expect(cambiado.revision).toMatchObject({ estado: "desactualizada", vigente: false, catalogoCongelado: null });
    expect(baseDe(cambiado.catalogo, "41")).toBe("saldo");
  });

  it("revocada: no usa ningún catálogo congelado y calcula con el vigente", () => {
    const datos = aprobadoConMovimientoYHoySaldo();
    datos.ultimaRevision = { ...datos.ultimaRevision!, id: 2, estado: "revocada", catalogoCongelado: null };
    const contexto = resolverContextoPrevalidador(datos);
    expect(contexto.revision).toMatchObject({ estado: "revocada", vigente: false, catalogoCongelado: null });
    expect(baseDe(contexto.catalogo, "41")).toBe("saldo");
  });

  it("aprobación sin instantánea: desactualizada aunque tenga catálogo congelado", () => {
    const datos = aprobadoConMovimientoYHoySaldo();
    datos.ultimaRevision = { ...datos.ultimaRevision!, instantanea: null };
    expect(resolverContextoPrevalidador(datos).revision).toMatchObject({ estado: "desactualizada", catalogoCongelado: null });
  });

  it("un catálogo congelado inválido se ignora (falla cerrado: se evalúa con el vigente)", () => {
    for (const invalido of [[], {}, "catalogo", [{ id: 1 }], [{ ...CATALOGO_MOVIMIENTO[0], module: { code: "DIAN", name: "DIAN" } }]]) {
      const datos = aprobadoConMovimientoYHoySaldo();
      datos.ultimaRevision = {
        ...datos.ultimaRevision!,
        catalogoCongelado: { catalogo: invalido as Prisma.JsonValue, origen: "aprobacion", creadoEn: APROBADA_EN },
      };
      const contexto = resolverContextoPrevalidador(datos);
      expect(contexto.revision, JSON.stringify(invalido)).toMatchObject({ estado: "desactualizada", catalogoCongelado: null });
    }
  });

  it("el orden del JSON congelado no importa", () => {
    const datos = aprobadoConMovimientoYHoySaldo();
    const congelado = datos.ultimaRevision!.catalogoCongelado!;
    datos.ultimaRevision = {
      ...datos.ultimaRevision!,
      catalogoCongelado: { ...congelado, catalogo: [...(congelado.catalogo as unknown[])].reverse() as Prisma.JsonValue },
    };
    expect(resolverContextoPrevalidador(datos).revision).toMatchObject({ estado: "aprobada", vigente: true });
  });

  it("una cuenta nueva, una fila inactivada o una etiqueta u orden cambiados en el catálogo no invalidan la aprobación", () => {
    const aprobado = datosBase();
    const revision = aprobar(aprobado);
    const cambios: FilaCatalogoCruda[][] = [
      [...CATALOGO_MOVIMIENTO, { id: 7, cuentaRussell: "14", etiqueta: "Inventarios", baseCalculo: "saldo", orden: 30, activa: true, module: { code: "INV", name: "Inventarios" } }],
      CATALOGO_MOVIMIENTO.filter((f) => f.id !== 3), // la consulta del vigente solo trae las activas
      CATALOGO_MOVIMIENTO.map((f) => (f.id === 1 ? { ...f, etiqueta: "Ingresos" } : f)),
      CATALOGO_MOVIMIENTO.map((f) => (f.id === 2 ? { ...f, orden: 5 } : f)),
    ];
    for (const catalogoVigente of cambios) {
      const contexto = resolverContextoPrevalidador({ ...aprobado, catalogoVigente, ultimaRevision: revision });
      expect(contexto.revision).toMatchObject({ estado: "aprobada", vigente: true, catalogoCongelado: { difiereDelVigente: true } });
    }
  });

  it("ignorarCatalogoCongelado reproduce la lógica anterior: el cambio del catálogo invalida", () => {
    const datos = aprobadoConMovimientoYHoySaldo();
    const contexto = resolverContextoPrevalidador(datos, { ignorarCatalogoCongelado: true });
    expect(contexto.revision).toMatchObject({ estado: "desactualizada", vigente: false, catalogoCongelado: null });
  });

  it("una aprobación nueva congela el catálogo con que se calculó", () => {
    // Pendiente con el vigente en saldo → lo que se congela es ese mismo catálogo crudo.
    const contexto = resolverContextoPrevalidador(datosBase(CATALOGO_SALDO));
    expect(contexto.catalogoCrudo).toEqual(CATALOGO_SALDO);
    expect(mismoCatalogo(mapearCatalogoPrevalidador(contexto.catalogoCrudo), contexto.catalogo)).toBe(true);
  });
});

describe("leerCatalogoCongelado", () => {
  it("valida la forma y ordena como la consulta del catálogo (orden, cuenta)", () => {
    const leido = leerCatalogoCongelado([...CATALOGO_MOVIMIENTO].reverse());
    expect(leido?.map((f) => f.id)).toEqual([1, 3, 2]);
    expect(leerCatalogoCongelado(null)).toBeNull();
    expect(leerCatalogoCongelado([])).toBeNull();
    expect(leerCatalogoCongelado([{ ...CATALOGO_MOVIMIENTO[0], activa: "sí" }])).toBeNull();
    expect(leerCatalogoCongelado([{ ...CATALOGO_MOVIMIENTO[0], module: null }])).toBeNull();
  });
});

describe("mismoCatalogo", () => {
  it("compara como la huella: sin importar el orden, pero sí la base de cálculo", () => {
    const a = mapearCatalogoPrevalidador(CATALOGO_MOVIMIENTO);
    expect(mismoCatalogo(a, [...a].reverse())).toBe(true);
    expect(mismoCatalogo(a, mapearCatalogoPrevalidador(CATALOGO_SALDO))).toBe(false);
  });
});
