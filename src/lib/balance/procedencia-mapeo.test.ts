import { expect, it } from "vitest";
import { leerProcedenciaMapeo, procedenciaBalance, procedenciaConfiguracion } from "./procedencia-mapeo";

it("conserva una referencia de balance y distingue una edición posterior en configuración", () => {
  expect(leerProcedenciaMapeo(procedenciaBalance({ id: 23, periodo: "Enero 2026" }))).toEqual({ fuente: "balance", balance_id: 23, periodo: "Enero 2026" });
  expect(leerProcedenciaMapeo(procedenciaConfiguracion())).toEqual({ fuente: "configuracion" });
});
it("un dato antiguo o inválido no inventa un origen ni un enlace", () => {
  expect(leerProcedenciaMapeo(null)).toBeNull();
  expect(leerProcedenciaMapeo({ fuente: "desconocida", balance_id: 12 })).toBeNull();
  expect(leerProcedenciaMapeo({ fuente: "balance", balance_id: -1, periodo: {} })).toEqual({ fuente: "balance" });
});
