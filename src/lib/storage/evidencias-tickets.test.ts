import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configuraciones: [] as unknown[],
  enviados: [] as unknown[],
  send: vi.fn(async (comando: unknown) => {
    void comando;
    return {};
  }),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(configuracion: unknown) {
      mocks.configuraciones.push(configuracion);
    }

    send(comando: unknown) {
      mocks.enviados.push(comando);
      return mocks.send(comando);
    }
  },
  PutObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
}));

const variables = [
  "S3_TICKETS_BUCKET",
  "S3_TICKETS_ACCESS_KEY_ID",
  "S3_TICKETS_SECRET_ACCESS_KEY",
  "S3_REGION",
  "S3_ENDPOINT",
  "S3_FORCE_PATH_STYLE",
] as const;

const entornoOriginal = Object.fromEntries(
  variables.map((variable) => [variable, process.env[variable]]),
);

describe("almacenamiento aislado de evidencias", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.configuraciones.length = 0;
    mocks.enviados.length = 0;
    mocks.send.mockClear();
    process.env.S3_TICKETS_BUCKET = "bucket-evidencias";
    process.env.S3_TICKETS_ACCESS_KEY_ID = "access-tickets";
    process.env.S3_TICKETS_SECRET_ACCESS_KEY = "secret-tickets";
    process.env.S3_REGION = "auto";
    process.env.S3_ENDPOINT = "https://cuenta.r2.cloudflarestorage.com";
    delete process.env.S3_FORCE_PATH_STYLE;
  });

  afterEach(() => {
    for (const variable of variables) {
      const valor = entornoOriginal[variable];
      if (valor === undefined) delete process.env[variable];
      else process.env[variable] = valor;
    }
  });

  it("usa exclusivamente el bucket y las credenciales de tickets", async () => {
    const storage = await import("./evidencias-tickets");

    expect(storage.almacenamientoEvidenciasTicketsDisponible()).toBe(true);
    await storage.subirEvidenciaTicket({
      key: "tickets/14/captura.jpg",
      cuerpo: new Uint8Array([0xff, 0xd8, 0xff]),
      contentType: "image/jpeg",
    });

    expect(mocks.configuraciones).toEqual([
      expect.objectContaining({
        region: "auto",
        endpoint: "https://cuenta.r2.cloudflarestorage.com",
        credentials: {
          accessKeyId: "access-tickets",
          secretAccessKey: "secret-tickets",
        },
      }),
    ]);
    expect(mocks.enviados[0]).toEqual(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "bucket-evidencias",
          Key: "tickets/14/captura.jpg",
          ContentType: "image/jpeg",
        }),
      }),
    );
  });

  it("falla cerrado cuando falta la credencial dedicada", async () => {
    delete process.env.S3_TICKETS_SECRET_ACCESS_KEY;
    const storage = await import("./evidencias-tickets");

    expect(storage.almacenamientoEvidenciasTicketsDisponible()).toBe(false);
    await expect(
      storage.subirEvidenciaTicket({
        key: "tickets/14/captura.jpg",
        cuerpo: new Uint8Array([0xff, 0xd8, 0xff]),
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow(/S3_TICKETS_SECRET_ACCESS_KEY/);
    expect(mocks.configuraciones).toHaveLength(0);
  });
});
