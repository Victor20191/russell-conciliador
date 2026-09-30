import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import proxy from "./proxy";
import { encrypt } from "@/lib/jwt";
import { getEncodedSessionSecret } from "@/lib/session-secret";

describe("preferencia de navegación al expirar sesión", () => {
  it.each(["ausente", "inválida", "expirada"])("elimina la preferencia al redirigir por sesión %s", async (tipo) => {
    const token = tipo === "expirada"
      ? await new SignJWT({ userId: 41 })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
        .sign(getEncodedSessionSecret())
      : tipo === "inválida" ? "token-invalido" : null;
    const req = new NextRequest("http://localhost/dashboard", {
      headers: { cookie: `${token ? `session=${token}; ` : ""}nav_colapsada=1` },
    });
    const res = await proxy(req);
    expect(res.headers.get("location")).toBe("http://localhost/login");
    expect(res.cookies.get("nav_colapsada")?.expires).toEqual(new Date(0));
    if (token) expect(res.cookies.get("session")?.expires).toEqual(new Date(0));
  });

  it("una recarga autenticada mantiene la cookie del menú", async () => {
    const token = await encrypt({
      userId: 41,
      role: "Staff",
      sessionVersion: 3,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const req = new NextRequest("http://localhost/dashboard", {
      headers: { cookie: `session=${token}; nav_colapsada=1` },
    });
    const res = await proxy(req);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.has("set-cookie")).toBe(false);
    expect(req.cookies.get("nav_colapsada")?.value).toBe("1");
  });
});
