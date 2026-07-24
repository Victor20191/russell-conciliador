// Helpers PUROS del versionamiento de la plataforma (sin React, sin Prisma).
// Deterministas y testeables. La lectura de BD vive en version-app-servidor.ts.

/** Etiqueta visible: "1.4.0" → "v1.4.0". Respeta prefijo v/V si ya viene. */
export function etiquetaVersion(number: string | null | undefined): string {
  const n = (number ?? "").trim();
  if (!n) return "";
  return /^v/i.test(n) ? n : `v${n}`;
}

/** Extrae major.minor.patch de un string tipo "1.4.0", "v1.4.0" o "1.4.0-beta". */
export function parseSemVer(
  version: string,
): { major: number; minor: number; patch: number } | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/i.exec(version.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
  };
}

/** Compara dos SemVer (solo major.minor.patch). >0 si a>b, <0 si a<b, 0 si iguales. */
export function compararSemVer(a: string, b: string): number {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  return (
    pa.major - pb.major || pa.minor - pb.minor || pa.patch - pb.patch
  );
}

export type BumpSemVer = "major" | "minor" | "patch";

/** Sube major, minor o patch a partir de una versión base (p. ej. 1.4.0 → 1.5.0). */
export function bumpSemVer(version: string, kind: BumpSemVer): string {
  const p = parseSemVer(version);
  if (!p) {
    throw new Error(
      `No se puede incrementar la versión «${version}»: se espera SemVer (p. ej. 1.4.0).`,
    );
  }
  if (kind === "major") return `${p.major + 1}.0.0`;
  if (kind === "minor") return `${p.major}.${p.minor + 1}.0`;
  return `${p.major}.${p.minor}.${p.patch + 1}`;
}
