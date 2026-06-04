import { test, expect } from "vitest";
import { encrypt, decrypt } from "./jwt";

test("encrypt → decrypt recupera el payload", async () => {
  const token = await encrypt({
    userId: "u1",
    role: "Auditor",
    sessionVersion: 3,
    expiresAt: "2030-01-01T00:00:00.000Z",
  });
  const payload = await decrypt(token);
  expect(payload?.userId).toBe("u1");
  expect(payload?.role).toBe("Auditor");
  expect(payload?.sessionVersion).toBe(3);
});

test("decrypt devuelve null con token vacío o inválido", async () => {
  expect(await decrypt("")).toBeNull();
  expect(await decrypt("no-es-un-jwt")).toBeNull();
});
