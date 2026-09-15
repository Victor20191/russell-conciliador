import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import {
  bannerSmtp,
  ejecutarConexion,
  interpretarEstadoHttp,
  mensajeErrorRed,
  mensajeErrorS3,
  probarConexion,
  unirUrl,
} from "./pruebas";

describe("unirUrl", () => {
  it("concatena base y ruta sin duplicar ni perder barras", () => {
    expect(unirUrl("https://api.test/", "/health")).toBe("https://api.test/health");
    expect(unirUrl("https://api.test", "health")).toBe("https://api.test/health");
    expect(unirUrl("https://api.test/", "//v1/models")).toBe("https://api.test/v1/models");
  });

  it("devuelve la base cuando no hay ruta", () => {
    expect(unirUrl("https://api.test/", "")).toBe("https://api.test");
    expect(unirUrl("https://api.test", undefined)).toBe("https://api.test");
    expect(unirUrl("https://api.test/", null)).toBe("https://api.test");
  });
});

describe("interpretarEstadoHttp", () => {
  it("acepta respuestas 2xx y 3xx", () => {
    expect(interpretarEstadoHttp(200, "https://api.test").ok).toBe(true);
    expect(interpretarEstadoHttp(204, "https://api.test").ok).toBe(true);
    expect(interpretarEstadoHttp(301, "https://api.test").ok).toBe(true);
  });

  it("explica credenciales rechazadas, ruta inexistente y errores del servidor", () => {
    expect(interpretarEstadoHttp(401, "https://api.test").mensaje).toContain("credenciales");
    expect(interpretarEstadoHttp(403, "https://api.test").mensaje).toContain("credenciales");
    expect(interpretarEstadoHttp(404, "https://api.test/health").mensaje).toContain("404");
    expect(interpretarEstadoHttp(429, "https://api.test").mensaje).toContain("límite");
    expect(interpretarEstadoHttp(503, "https://api.test").mensaje).toContain("503");
    expect(interpretarEstadoHttp(200, "https://api.test").ok).toBe(true);
  });
});

describe("mensajeErrorRed", () => {
  it("traduce errores de DNS, conexión y timeout", () => {
    expect(mensajeErrorRed(Object.assign(new Error("getaddrinfo ENOTFOUND x"), { code: "ENOTFOUND" }))).toContain(
      "resolver el nombre",
    );
    expect(mensajeErrorRed(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }))).toContain(
      "rechazó la conexión",
    );
    expect(mensajeErrorRed(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }))).toContain(
      "tardó demasiado",
    );
    expect(mensajeErrorRed(new Error("cualquier cosa"))).toContain("No se pudo conectar");
  });
});

describe("mensajeErrorS3", () => {
  it("traduce los errores típicos del bucket", () => {
    const conStatus = (status: number) => ({ $metadata: { httpStatusCode: status } });
    expect(mensajeErrorS3(conStatus(403), "soportes")).toContain("permisos");
    expect(mensajeErrorS3(conStatus(404), "soportes")).toContain("no existe");
    expect(mensajeErrorS3(conStatus(301), "soportes")).toContain("región");
    expect(mensajeErrorS3({ name: "NoSuchBucket" }, "soportes")).toContain("no existe");
  });
});

describe("bannerSmtp", () => {
  it("reconoce el banner 220 de un servidor SMTP", async () => {
    const sockets: net.Socket[] = [];
    const servidor = net.createServer((socket) => {
      sockets.push(socket);
      socket.write("220 smtp.prueba.local ESMTP\r\n");
    });
    await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
    const puerto = (servidor.address() as AddressInfo).port;

    const resultado = await bannerSmtp("127.0.0.1", puerto, 1000);
    expect(resultado.ok).toBe(true);
    expect(resultado.mensaje).toContain("220");

    for (const socket of sockets) socket.destroy();
    await new Promise<void>((r) => servidor.close(() => r()));
  });

  it("falla cuando el servidor no responde dentro del tiempo", async () => {
    const sockets: net.Socket[] = [];
    const servidor = net.createServer((socket) => {
      // Servidor que acepta la conexión pero nunca saluda.
      sockets.push(socket);
    });
    await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
    const puerto = (servidor.address() as AddressInfo).port;

    const resultado = await bannerSmtp("127.0.0.1", puerto, 150);
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain("no respondió");

    for (const socket of sockets) socket.destroy();
    await new Promise<void>((r) => servidor.close(() => r()));
  });
});

describe("probarConexion contra un servidor local", () => {
  let servidor: http.Server;
  let baseUrl = "";
  const solicitudes: {
    url?: string;
    method?: string;
    authorization?: string;
    webhookSecret?: string;
  }[] = [];

  beforeAll(async () => {
    servidor = http.createServer((req, res) => {
      req.on("data", () => {});
      req.on("end", () => {
        solicitudes.push({
          url: req.url,
          method: req.method,
          authorization: req.headers.authorization as string | undefined,
          webhookSecret: req.headers["x-webhook-secret"] as string | undefined,
        });
        if (req.url === "/ok") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end("{}");
          return;
        }
        if (req.url === "/rechaza") {
          res.writeHead(401);
          res.end();
          return;
        }
        if (req.url === "/roto") {
          res.writeHead(500);
          res.end();
          return;
        }
        if (req.url === "/webhook") {
          res.writeHead(200);
          res.end("ok");
          return;
        }
        if (req.url === "/webhook-410") {
          res.writeHead(410);
          res.end();
          return;
        }
        if (req.url === "/oauth-token") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end('{"access_token":"abc"}');
          return;
        }
        if (req.url === "/oauth-rechaza") {
          res.writeHead(401);
          res.end();
          return;
        }
        res.writeHead(404);
        res.end();
      });
    });
    await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    servidor.closeAllConnections();
    await new Promise<void>((r) => servidor.close(() => r()));
  });

  it("aprueba una API que responde 200 y envía el token configurado", async () => {
    const resultado = await probarConexion({
      proveedor: "api_rest",
      configuracion: { url_base: baseUrl, ruta_prueba: "/ok", encabezado_auth: "Authorization" },
      credenciales: { token: "secreto-de-prueba" },
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.estado).toBe("ok");
    expect(resultado.mensaje).toContain("200");
    expect(resultado.mensaje).toMatch(/en \d+ ms\./);
    expect(solicitudes.at(-1)?.authorization).toBe("Bearer secreto-de-prueba");
  });

  it("falla con mensaje claro cuando la API rechaza las credenciales", async () => {
    const resultado = await probarConexion({
      proveedor: "api_rest",
      configuracion: { url_base: baseUrl, ruta_prueba: "/rechaza" },
      credenciales: { token: "incorrecto" },
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.estado).toBe("error");
    expect(resultado.mensaje).toContain("401");
    expect(resultado.mensaje).toContain("credenciales");
  });

  it("falla cuando el servidor remoto responde 5xx", async () => {
    const resultado = await probarConexion({
      proveedor: "api_rest",
      configuracion: { url_base: baseUrl, ruta_prueba: "/roto" },
      credenciales: {},
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain("500");
  });

  it("prueba un webhook con POST y envía el secreto", async () => {
    const resultado = await probarConexion({
      proveedor: "webhook_saliente",
      configuracion: { url: `${baseUrl}/webhook` },
      credenciales: { secreto: "firma-123" },
    });

    expect(resultado.ok).toBe(true);
    expect(solicitudes.at(-1)?.method).toBe("POST");
    expect(solicitudes.at(-1)?.webhookSecret).toBe("firma-123");
  });

  it("explica que el webhook ya no está activo cuando responde 410", async () => {
    const resultado = await probarConexion({
      proveedor: "webhook_saliente",
      configuracion: { url: `${baseUrl}/webhook-410` },
      credenciales: {},
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain("410");
  });

  it("obtiene un token OAuth 2.0 con client credentials", async () => {
    const resultado = await probarConexion({
      proveedor: "oauth2_client_credentials",
      configuracion: { url_token: `${baseUrl}/oauth-token`, scope: "api.read" },
      credenciales: { client_id: "cliente", client_secret: "secreto" },
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.mensaje).toContain("token");
    expect(solicitudes.at(-1)?.method).toBe("POST");
  });

  it("falla cuando el servidor OAuth rechaza las credenciales", async () => {
    const resultado = await probarConexion({
      proveedor: "oauth2_client_credentials",
      configuracion: { url_token: `${baseUrl}/oauth-rechaza` },
      credenciales: { client_id: "cliente", client_secret: "malo" },
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain("rechazó");
  });

  it("rechaza un proveedor que ya no está en el catálogo", async () => {
    const resultado = await probarConexion({
      proveedor: "proveedor_inexistente",
      configuracion: {},
      credenciales: {},
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain("catálogo");
  });

  it("omite la ejecución de conexiones sin ejecutor automático", async () => {
    const resultado = await ejecutarConexion({
      proveedor: "api_rest",
      configuracion: { url_base: baseUrl, ruta_prueba: "/ok" },
      credenciales: {},
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.estado).toBe("omitida");
    expect(resultado.mensaje).toContain("Probar");
  });
});
