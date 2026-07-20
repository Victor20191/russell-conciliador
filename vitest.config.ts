import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Mismo alias que tsconfig (@/* → src/*) para que las pruebas puedan
  // importar módulos que usan rutas absolutas del proyecto.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next resuelve esta marca solo en el grafo del servidor. Vitest también
      // corre en Node, así que usa explícitamente la variante vacía compilada.
      "server-only": fileURLToPath(
        new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      SESSION_SECRET: "test-session-secret-test-session-secret",
    },
  },
});
