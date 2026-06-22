import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Mismo alias que tsconfig (@/* → src/*) para que las pruebas puedan
  // importar módulos que usan rutas absolutas del proyecto.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      SESSION_SECRET: "test-session-secret-test-session-secret",
    },
  },
});
