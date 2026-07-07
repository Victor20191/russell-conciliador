export function claveNit(nit: string): string {
  return nit.replace(/\D/g, "");
}

export function tieneDigitosNit(nit: string): boolean {
  return claveNit(nit).length > 0;
}
