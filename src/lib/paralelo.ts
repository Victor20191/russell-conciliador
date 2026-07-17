// Ejecución con CONCURRENCIA ACOTADA (pool de workers). Puro y genérico: lo usa
// el mapeo IA por lotes para lanzar varios lotes a la vez sin saturar la API.
// Los resultados conservan el ORDEN de entrada. Si `fn` lanza, el error se
// propaga (quien quiera best-effort debe capturar dentro de `fn`).

export async function conConcurrencia<T, R>(
  items: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const resultados = new Array<R>(items.length);
  let siguiente = 0;
  const trabajadores = Array.from({ length: Math.max(1, Math.min(limite, items.length)) }, async () => {
    while (true) {
      const i = siguiente;
      siguiente += 1;
      if (i >= items.length) return;
      resultados[i] = await fn(items[i], i);
    }
  });
  await Promise.all(trabajadores);
  return resultados;
}
