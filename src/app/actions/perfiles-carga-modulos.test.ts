import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";

const mocks = vi.hoisted(() => ({
  authorizePermiso: vi.fn(),
  getCurrentUser: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
  perfilFindUnique: vi.fn(),
  perfilFindMany: vi.fn(),
  perfilUpdateMany: vi.fn(),
  perfilDeleteMany: vi.fn(),
  correccionDeleteMany: vi.fn(),
  ajustesFindUnique: vi.fn(),
  ajustesDeleteMany: vi.fn(),
  clientFindUnique: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    perfilCargaModulo: {
      findUnique: mocks.perfilFindUnique,
      findMany: mocks.perfilFindMany,
      updateMany: mocks.perfilUpdateMany,
      deleteMany: mocks.perfilDeleteMany,
    },
    correccionCargaModulo: { deleteMany: mocks.correccionDeleteMany },
    ajustesCargaModulo: { findUnique: mocks.ajustesFindUnique, deleteMany: mocks.ajustesDeleteMany },
    client: { findUnique: mocks.clientFindUnique },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/rbac", () => ({
  authorizePermiso: mocks.authorizePermiso,
}));

vi.mock("@/lib/dal", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: mocks.logAudit,
}));

vi.mock("@/lib/errores", () => ({
  mensajeErrorBD: (_contexto: string, error: unknown) => String(error),
}));

import {
  actualizarPerfilCargaModulo,
  limpiarMemoriaCargaModuloCliente,
  listarPerfilesCargaModulo,
} from "./perfiles-carga-modulos";

const ACTUALIZADO_EN = "2026-08-10T15:00:00.000Z";

const ESTRUCTURA: SpecModulo = {
  hoja: "Inventario",
  filaEncabezado: 3,
  primeraFilaDatos: 4,
  columnas: { tipo: 2, referencia: 1, descripcion: 3, cantidad: 4, valorUnitario: 5, valorTotal: 6 },
  clasificadorModo: "columna",
};

describe("actualizarPerfilCargaModulo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermiso.mockResolvedValue({ ok: true });
    mocks.getCurrentUser.mockResolvedValue({ id: 9, name: "Analista" });
    mocks.perfilFindUnique.mockResolvedValue({
      clienteId: 23,
      moduloCodigo: "INV",
      huella: "abc123",
      specJson: { ...ESTRUCTURA, hoja: "Anterior" },
      actualizadoEn: new Date(ACTUALIZADO_EN),
    });
    mocks.perfilUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("normaliza el spec contra el descriptor, lo guarda como manual y registra auditoría", async () => {
    const res = await actualizarPerfilCargaModulo({
      id: 7,
      actualizadoEn: ACTUALIZADO_EN,
      // Trae el rol histórico `tercero`, otro rol ajeno y el legado
      // `arrastrarClasificador`: todos se normalizan contra el descriptor vigente.
      estructura: { ...ESTRUCTURA, clasificadorModo: undefined, arrastrarClasificador: true, columnas: { ...ESTRUCTURA.columnas, tercero: 7, ajena: 9 } },
    });
    expect(res.ok).toBe(true);
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("perfiles_carga:administrar", { clientId: 23 });
    expect(mocks.perfilUpdateMany).toHaveBeenCalledTimes(1);
    const llamada = mocks.perfilUpdateMany.mock.calls[0][0];
    expect(llamada.where).toEqual({ id: 7, clienteId: 23, actualizadoEn: new Date(ACTUALIZADO_EN) });
    expect(llamada.data.origen).toBe("manual");
    expect(llamada.data.specJson).toEqual({
      hoja: "Inventario",
      filaEncabezado: 3,
      primeraFilaDatos: 4,
      columnas: { tipo: 2, referencia: 1, descripcion: 3, cantidad: 4, valorUnitario: 5, valorTotal: 6 },
      clasificadorModo: "arrastrar",
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "EDITÓ PERFIL de carga de Inventarios",
      clientId: 23,
      detail: expect.stringContaining("hoja «Anterior» → «Inventario»"),
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/config/perfiles-carga");
  });

  it("rechaza un mapeo sin la columna obligatoria del módulo", async () => {
    const res = await actualizarPerfilCargaModulo({
      id: 7,
      actualizadoEn: ACTUALIZADO_EN,
      estructura: { ...ESTRUCTURA, columnas: { ...ESTRUCTURA.columnas, valorTotal: 0 } },
    });
    expect(res.ok).toBe(false);
    expect(res.message).toBe("Falta la columna obligatoria «Valor total».");
    expect(mocks.perfilUpdateMany).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("no pisa un perfil que cambió mientras estaba abierto", async () => {
    mocks.perfilFindUnique.mockResolvedValueOnce({
      clienteId: 23,
      moduloCodigo: "INV",
      huella: "abc123",
      specJson: ESTRUCTURA,
      actualizadoEn: new Date("2026-08-11T09:00:00.000Z"),
    });
    const res = await actualizarPerfilCargaModulo({ id: 7, actualizadoEn: ACTUALIZADO_EN, estructura: ESTRUCTURA });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/cambió mientras lo estabas revisando/);
    expect(mocks.perfilUpdateMany).not.toHaveBeenCalled();
  });

  it("falla cerrado si el perfil pertenece a un módulo que ya no está soportado", async () => {
    mocks.perfilFindUnique.mockResolvedValueOnce({
      clienteId: 23,
      moduloCodigo: "XYZ",
      huella: "abc123",
      specJson: ESTRUCTURA,
      actualizadoEn: new Date(ACTUALIZADO_EN),
    });
    const res = await actualizarPerfilCargaModulo({ id: 7, actualizadoEn: ACTUALIZADO_EN, estructura: ESTRUCTURA });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/ya no está soportado/);
    expect(mocks.perfilUpdateMany).not.toHaveBeenCalled();
  });

  it("no toca nada cuando falta el permiso", async () => {
    mocks.authorizePermiso.mockResolvedValueOnce({ ok: false, message: "Sin permiso." });
    const res = await actualizarPerfilCargaModulo({ id: 7, actualizadoEn: ACTUALIZADO_EN, estructura: ESTRUCTURA });
    expect(res).toEqual({ ok: false, message: "Sin permiso." });
    expect(mocks.perfilFindUnique).not.toHaveBeenCalled();
  });
});

describe("listarPerfilesCargaModulo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermiso.mockResolvedValue({ ok: true });
  });

  it("devuelve los roles del descriptor, los perfiles con su resumen y las preferencias", async () => {
    mocks.perfilFindMany.mockResolvedValue([
      {
        id: 1,
        huella: "h1",
        origen: "ia",
        vecesUsado: 3,
        ultimoUsoEn: new Date("2026-08-05T10:00:00.000Z"),
        archivoEjemplo: "inv.xlsx",
        specJson: {
          ...ESTRUCTURA,
          columnas: { ...ESTRUCTURA.columnas, tercero: 7 },
          arrastrarClasificador: true,
          clasificadorModo: undefined,
        },
        actualizadoEn: new Date(ACTUALIZADO_EN),
      },
      {
        id: 2,
        huella: "h2",
        origen: "manual",
        vecesUsado: 0,
        ultimoUsoEn: null,
        archivoEjemplo: null,
        specJson: { roto: true }, // ilegible → estructura vacía para poder eliminarlo
        actualizadoEn: new Date(ACTUALIZADO_EN),
      },
    ]);
    mocks.ajustesFindUnique.mockResolvedValue({ hojaPreferida: "Inventario", observaciones: null });

    const res = await listarPerfilesCargaModulo(23, "inv");
    expect(res.ok).toBe(true);
    expect(res.moduloCodigo).toBe("INV");
    expect(res.moduloLabel).toBe("Inventarios");
    expect(res.clasificadorRol).toBe("tipo");
    expect(res.roles.map((r) => r.nombre)).toEqual(["tipo", "referencia", "descripcion", "cantidad", "valorUnitario", "valorTotal"]);
    expect(res.perfiles).toHaveLength(2);
    expect(res.perfiles[0].resumenColumnas).toBe("tipo de inventario B · referencia A · descripción C · cantidad D · valor unitario E · valor total F");
    expect(res.perfiles[0].estructura.clasificadorModo).toBe("arrastrar");
    expect(res.perfiles[1].estructura.columnas).toEqual({ tipo: 0, referencia: 0, descripcion: 0, cantidad: 0, valorUnitario: 0, valorTotal: 0 });
    expect(res.ajustes).toEqual({ hojaPreferida: "Inventario", observaciones: null });
    expect(mocks.authorizePermiso).toHaveBeenCalledWith("perfiles_carga:administrar", { clientId: 23, modo: "lectura" });
  });

  it("rechaza un módulo no soportado sin consultar la BD", async () => {
    const res = await listarPerfilesCargaModulo(23, "ZZZ");
    expect(res.ok).toBe(false);
    expect(res.message).toBe("Módulo no soportado.");
    expect(mocks.perfilFindMany).not.toHaveBeenCalled();
  });
});

describe("limpiarMemoriaCargaModuloCliente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermiso.mockResolvedValue({ ok: true });
    mocks.getCurrentUser.mockResolvedValue({ id: 9, name: "Analista" });
    mocks.clientFindUnique.mockResolvedValue({ name: "Alfa SAS" });
    mocks.transaction.mockResolvedValue([{ count: 2 }, { count: 0 }, { count: 1 }]);
  });

  it("borra formatos, correcciones y preferencias del (cliente, módulo) y lo audita", async () => {
    const res = await limpiarMemoriaCargaModuloCliente(23, "car");
    expect(res.ok).toBe(true);
    expect(res.message).toBe("Memoria de Cartera borrada: 2 formato(s) y las preferencias.");
    expect(mocks.perfilDeleteMany).toHaveBeenCalledWith({ where: { clienteId: 23, moduloCodigo: "CAR" } });
    expect(mocks.correccionDeleteMany).toHaveBeenCalledWith({ where: { clienteId: 23, moduloCodigo: "CAR" } });
    expect(mocks.ajustesDeleteMany).toHaveBeenCalledWith({ where: { clienteId: 23, moduloCodigo: "CAR" } });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "BORRÓ LA MEMORIA de carga de Cartera",
      entity: "Alfa SAS",
      detail: "2 formato(s) · preferencias",
      clientId: 23,
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/config/perfiles-carga");
  });

  it("exige alcance sobre el cliente antes de borrar", async () => {
    mocks.authorizePermiso
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, message: "Sin alcance sobre el cliente." });
    const res = await limpiarMemoriaCargaModuloCliente(23, "CAR");
    expect(res).toEqual({ ok: false, message: "Sin alcance sobre el cliente." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
