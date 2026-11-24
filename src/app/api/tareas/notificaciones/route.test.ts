import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/notificaciones/reporte-ejecutivo-servidor", () => ({
  procesarNotificacionesPendientes: vi.fn(),
  RUTA_REPORTES_EJECUTIVOS: "/config/reportes-ejecutivos",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn() }));
import { revalidatePath } from "next/cache";
import { procesarNotificacionesPendientes } from "@/lib/notificaciones/reporte-ejecutivo-servidor";
import { POST } from "./route";

const URL_RUTA = "http://127.0.0.1:3001/api/tareas/notificaciones";
const SECRETO = "s3creto-de-prueba-s3creto-de-prueba";
const SIN_ACTIVIDAD = { revisadas: 0, enviadas: 0, omitidas: 0, saltadas: 0, errores: 0, perdidasCerradas: 0 };

const solicitud = (autorizacion?: string) =>
  new Request(URL_RUTA, { method: "POST", headers: autorizacion ? { authorization: autorizacion } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRETO);
  vi.mocked(procesarNotificacionesPendientes).mockResolvedValue(SIN_ACTIVIDAD);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/tareas/notificaciones", () => {
  test("sin CRON_SECRET en el entorno responde 503 y no hace nada, aunque llegue un token", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await POST(solicitud(`Bearer ${SECRETO}`));
    expect(response.status).toBe(503);
    expect(procesarNotificacionesPendientes).not.toHaveBeenCalled();
  });

  test("un CRON_SECRET solo de espacios cuenta como no definido", async () => {
    vi.stubEnv("CRON_SECRET", "   ");
    expect((await POST(solicitud("Bearer "))).status).toBe(503);
    expect(procesarNotificacionesPendientes).not.toHaveBeenCalled();
  });

  test("con un secreto incorrecto responde 401 y no procesa nada", async () => {
    const response = await POST(solicitud("Bearer otro-secreto"));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(procesarNotificacionesPendientes).not.toHaveBeenCalled();
  });

  test("sin cabecera, con otro esquema o con el secreto sin «Bearer» responde 401", async () => {
    for (const autorizacion of [undefined, `Basic ${SECRETO}`, SECRETO, "Bearer", `Bearer ${SECRETO} extra`]) {
      const response = await POST(solicitud(autorizacion));
      expect(response.status, String(autorizacion)).toBe(401);
    }
    expect(procesarNotificacionesPendientes).not.toHaveBeenCalled();
  });

  test("un secreto que solo comparte el inicio no pasa", async () => {
    expect((await POST(solicitud(`Bearer ${SECRETO.slice(0, -1)}`))).status).toBe(401);
    expect((await POST(solicitud(`Bearer ${SECRETO}x`))).status).toBe(401);
  });

  test("con el secreto correcto procesa lo pendiente y devuelve el resumen", async () => {
    vi.mocked(procesarNotificacionesPendientes).mockResolvedValue({ ...SIN_ACTIVIDAD, revisadas: 1, enviadas: 1 });
    const response = await POST(solicitud(`Bearer ${SECRETO}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ...SIN_ACTIVIDAD, revisadas: 1, enviadas: 1 });
    expect(procesarNotificacionesPendientes).toHaveBeenCalledOnce();
    expect(vi.mocked(procesarNotificacionesPendientes).mock.calls[0][0]).toBeInstanceOf(Date);
    expect(revalidatePath).toHaveBeenCalledWith("/config/reportes-ejecutivos");
  });

  test("el esquema Bearer no distingue mayúsculas y tolera espacios alrededor", async () => {
    expect((await POST(solicitud(`  bearer ${SECRETO}  `))).status).toBe(200);
  });

  test("si no hubo nada que hacer, no revalida la pantalla", async () => {
    await POST(solicitud(`Bearer ${SECRETO}`));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  test("un fallo interno responde 500 sin filtrar el error original", async () => {
    vi.mocked(procesarNotificacionesPendientes).mockRejectedValue(new Error("clave secreta en el mensaje"));
    const response = await POST(solicitud(`Bearer ${SECRETO}`));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secreta");
  });
});
