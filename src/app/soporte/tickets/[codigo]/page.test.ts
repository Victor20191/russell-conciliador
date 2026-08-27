import { beforeEach, describe, expect, test, vi } from "vitest";
import { huellaTokenAcceso } from "@/lib/soporte";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  }),
}));

vi.mock("@/lib/prisma", () => ({
  default: { supportTicket: { findFirst: mocks.findFirst } },
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

vi.mock("@/lib/soporte-historial", () => ({
  historialDeTicket: vi.fn(() => []),
  SELECT_HISTORIAL: {},
}));

import SeguimientoTicketPage from "./page";

const TOKEN = "token-publico-de-prueba-1234567890";

function abrir(codigo: string, token = TOKEN) {
  return SeguimientoTicketPage({
    params: Promise.resolve({ codigo }),
    searchParams: Promise.resolve({ acceso: token }),
  });
}

describe("seguimiento público de tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("un enlace histórico resuelve por el token único y redirige al código actual", async () => {
    mocks.findFirst.mockResolvedValue({ code: "TKT-7" });

    await expect(abrir("TKT-20260807-A1B2C3D4")).rejects.toThrow(
      "NEXT_REDIRECT:/soporte/tickets/TKT-7?acceso=token-publico-de-prueba-1234567890",
    );

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { publicAccessTokenHash: huellaTokenAcceso(TOKEN) },
      }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/soporte/tickets/TKT-7?acceso=token-publico-de-prueba-1234567890",
    );
  });

  test("un código actual exige que código y token pertenezcan al mismo ticket", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(abrir("TKT-7")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          code: "TKT-7",
          publicAccessTokenHash: huellaTokenAcceso(TOKEN),
        },
      }),
    );
  });

  test("un ticket todavía almacenado con código histórico no entra en un bucle de redirección", async () => {
    const codigo = "TKT-20260807-A1B2C3D4";
    mocks.findFirst.mockResolvedValue({ code: codigo });

    await expect(abrir(codigo)).resolves.toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("rechaza formatos ajenos antes de consultar la base", async () => {
    await expect(abrir("TKT-cualquier-cosa")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
