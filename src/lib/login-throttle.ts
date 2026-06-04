export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutos

export function isLockedOut(recentFailures: number): boolean {
  return recentFailures >= LOGIN_MAX_ATTEMPTS;
}
