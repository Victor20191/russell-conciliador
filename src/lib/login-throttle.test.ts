import { test, expect } from "vitest";
import {
  isAccountBlocked,
  isLockedOut,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
  nextFailedLoginState,
} from "./login-throttle";

test("bloquea al alcanzar el máximo de intentos", () => {
  expect(isLockedOut(LOGIN_MAX_ATTEMPTS - 1)).toBe(false);
  expect(isLockedOut(LOGIN_MAX_ATTEMPTS)).toBe(true);
  expect(isLockedOut(LOGIN_MAX_ATTEMPTS + 3)).toBe(true);
});

test("calcula el bloqueo temporal y su expiración", () => {
  const now = new Date("2026-06-09T00:00:00.000Z");
  const state = nextFailedLoginState({
    failedLoginAttempts: LOGIN_MAX_ATTEMPTS - 1,
    lastFailedLoginAt: new Date(now.getTime() - 60_000),
    now,
  });

  expect(state.failedLoginAttempts).toBe(LOGIN_MAX_ATTEMPTS);
  expect(state.blockedUntil?.getTime()).toBe(now.getTime() + LOGIN_WINDOW_MS);
  expect(isAccountBlocked(state.blockedUntil, now)).toBe(true);
  expect(isAccountBlocked(state.blockedUntil, new Date(now.getTime() + LOGIN_WINDOW_MS + 1))).toBe(false);
});

test("reinicia la ventana de intentos cuando el fallo anterior expiró", () => {
  const now = new Date("2026-06-09T00:00:00.000Z");
  const state = nextFailedLoginState({
    failedLoginAttempts: LOGIN_MAX_ATTEMPTS - 1,
    lastFailedLoginAt: new Date(now.getTime() - LOGIN_WINDOW_MS - 1),
    now,
  });

  expect(state.failedLoginAttempts).toBe(1);
  expect(state.blockedUntil).toBeNull();
});
