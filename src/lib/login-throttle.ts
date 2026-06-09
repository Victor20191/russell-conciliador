export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutos
export const LOGIN_LOCKOUT_MS = LOGIN_WINDOW_MS;

export function isLockedOut(recentFailures: number): boolean {
  return recentFailures >= LOGIN_MAX_ATTEMPTS;
}

export function isAccountBlocked(
  blockedUntil: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!blockedUntil && blockedUntil.getTime() > now.getTime();
}

export function nextFailedLoginState({
  failedLoginAttempts,
  lastFailedLoginAt,
  now = new Date(),
}: {
  failedLoginAttempts: number;
  lastFailedLoginAt: Date | null;
  now?: Date;
}): {
  failedLoginAttempts: number;
  lastFailedLoginAt: Date;
  blockedUntil: Date | null;
} {
  const lastAttemptStillCounts =
    !!lastFailedLoginAt && now.getTime() - lastFailedLoginAt.getTime() < LOGIN_WINDOW_MS;
  const nextFailures = (lastAttemptStillCounts ? failedLoginAttempts : 0) + 1;

  return {
    failedLoginAttempts: nextFailures,
    lastFailedLoginAt: now,
    blockedUntil: isLockedOut(nextFailures)
      ? new Date(now.getTime() + LOGIN_LOCKOUT_MS)
      : null,
  };
}
