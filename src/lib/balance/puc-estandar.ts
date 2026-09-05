/** Árbol del catálogo Russell compartido por pantalla y descarga. */
export type CuentaEstandarPuc = { code: string; name: string; nature: string };
export type CuentaCuatroPuc = { codigo: string; nombre: string; grupo: string; nombreGrupo: string; naturaleza: string };
export type FilaPucRussell = {
  codigo: string;
  nombre: string;
  nivel: 1 | 2 | 4 | 6;
  padre: string | null;
  naturaleza: string | null;
  catalogada: boolean;
};

const CLASES: Record<string, string> = {
  "1": "Activo", "2": "Pasivo", "3": "Patrimonio", "4": "Ingresos", "5": "Gastos",
  "6": "Costos de ventas", "7": "Costos de producción o de operación",
  "8": "Cuentas de orden deudoras", "9": "Cuentas de orden acreedoras",
};
export const profundidadPuc = (nivel: number): number => [1, 2, 4, 6].indexOf(nivel);

export function construirPucRussell(estandar: readonly CuentaEstandarPuc[], cuentas4: readonly CuentaCuatroPuc[]): FilaPucRussell[] {
  const filas = new Map<string, FilaPucRussell>();
  const agregarPadres = (codigo: string) => {
    const clase = codigo.slice(0, 1);
    const grupo = codigo.slice(0, 2);
    if (!filas.has(clase)) filas.set(clase, { codigo: clase, nombre: CLASES[clase] ?? `Clase ${clase}`, nivel: 1, padre: null, naturaleza: null, catalogada: false });
    if (!filas.has(grupo)) filas.set(grupo, { codigo: grupo, nombre: `Grupo ${grupo}`, nivel: 2, padre: clase, naturaleza: null, catalogada: false });
  };
  for (const c of cuentas4) {
    if (!/^\d{4}$/.test(c.codigo)) continue;
    agregarPadres(c.codigo);
    const grupo = c.codigo.slice(0, 2);
    if (c.grupo === grupo && c.nombreGrupo.trim()) filas.get(grupo)!.nombre = c.nombreGrupo;
    filas.set(c.codigo, { codigo: c.codigo, nombre: c.nombre, nivel: 4, padre: grupo, naturaleza: c.naturaleza, catalogada: true });
  }
  for (const c of estandar) {
    if (!/^\d{6}$/.test(c.code)) continue;
    agregarPadres(c.code);
    const padre = c.code.slice(0, 4);
    if (!filas.has(padre)) filas.set(padre, { codigo: padre, nombre: `Cuenta ${padre}`, nivel: 4, padre: c.code.slice(0, 2), naturaleza: null, catalogada: false });
    filas.set(c.code, { codigo: c.code, nombre: c.name, nivel: 6, padre, naturaleza: c.nature, catalogada: true });
  }
  return [...filas.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/** Una búsqueda conserva padres y los descendientes del grupo encontrado. */
export function filtrarPucRussell(filas: readonly FilaPucRussell[], busqueda: string): FilaPucRussell[] {
  const q = busqueda.trim().toLocaleLowerCase("es");
  if (!q) return [...filas];
  const encontradas = filas.filter((f) => /^\d+$/.test(q) ? f.codigo.startsWith(q) : `${f.codigo} ${f.nombre}`.toLocaleLowerCase("es").includes(q));
  return filas.filter((f) => encontradas.some((e) => e.codigo.startsWith(f.codigo) || f.codigo.startsWith(e.codigo)));
}
