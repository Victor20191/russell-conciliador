import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/app/actions/auditoria-reporte", () => ({ generarReporteEjecutivoUso: vi.fn() }));
vi.mock("@/lib/rbac/reporte-ejecutivo", () => ({ authorizeReporteEjecutivo: vi.fn() }));
import { generarReporteEjecutivoUso } from "@/app/actions/auditoria-reporte";
import { authorizeReporteEjecutivo } from "@/lib/rbac/reporte-ejecutivo";
import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorizeReporteEjecutivo).mockResolvedValue({ ok: true, userId: 1, role: "Superadministrador" });
});

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

  test("conserva la redirección de sesión expirada sin convertirla en un error 500", async () => {
    const redireccion = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sesion-expirada;307;" });
    vi.mocked(authorizeReporteEjecutivo).mockRejectedValueOnce(redireccion);
    const request = new Request("https://russell.test/api/auditoria/reporte-ejecutivo", { method: "POST", body: "{}" });
    await expect(POST(request)).rejects.toBe(redireccion);
    expect(generarReporteEjecutivoUso).not.toHaveBeenCalled();
  });

  test("devuelve 403 sin generar reportes si falta permiso o el rol exacto", async () => {
    vi.mocked(authorizeReporteEjecutivo).mockResolvedValueOnce({ ok: false, message: "Sin permisos" });
    const response = await POST(new Request("https://russell.test/api/auditoria/reporte-ejecutivo", { method: "POST", body: "{}" }));
    expect(response.status).toBe(403);
    expect(generarReporteEjecutivoUso).not.toHaveBeenCalled();
  });
});
