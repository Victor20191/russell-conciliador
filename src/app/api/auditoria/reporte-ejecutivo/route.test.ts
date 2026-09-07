import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/app/actions/auditoria-reporte", () => ({ generarReporteEjecutivoUso: vi.fn() }));
import { generarReporteEjecutivoUso } from "@/app/actions/auditoria-reporte";
import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("POST reporte ejecutivo", () => {
  test("pasa el alcance y la señal de desconexión a la acción autorizada", async () => {
    vi.mocked(generarReporteEjecutivoUso).mockResolvedValue({ ok: false, message: "Sin permisos" });
    const input = { desde: "2026-09-01", hasta: "2026-09-07" };
    const request = new Request("https://russell.test/api/auditoria/reporte-ejecutivo", {
      method: "POST", headers: { origin: "https://russell.test" }, body: JSON.stringify(input),
    });
    const response = await POST(request);
    expect(generarReporteEjecutivoUso).toHaveBeenCalledWith(input, request.signal);
    expect(await response.json()).toEqual({ ok: false, message: "Sin permisos" });
  });

  test("rechaza solicitudes de otro origen sin generar reportes", async () => {
    const response = await POST(new Request("https://russell.test/api/auditoria/reporte-ejecutivo", {
      method: "POST", headers: { origin: "https://otro.test" }, body: "{}",
    }));
    expect(response.status).toBe(403);
    expect(generarReporteEjecutivoUso).not.toHaveBeenCalled();
  });

  test("rechaza JSON inválido sin generar reportes", async () => {
    const response = await POST(new Request("https://russell.test/api/auditoria/reporte-ejecutivo", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(generarReporteEjecutivoUso).not.toHaveBeenCalled();
  });
});
