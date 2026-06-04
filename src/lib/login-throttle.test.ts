import { test, expect } from "vitest";
import { isLockedOut, LOGIN_MAX_ATTEMPTS } from "./login-throttle";

test("bloquea al alcanzar el máximo de intentos", () => {
  expect(isLockedOut(LOGIN_MAX_ATTEMPTS - 1)).toBe(false);
  expect(isLockedOut(LOGIN_MAX_ATTEMPTS)).toBe(true);
  expect(isLockedOut(LOGIN_MAX_ATTEMPTS + 3)).toBe(true);
});
