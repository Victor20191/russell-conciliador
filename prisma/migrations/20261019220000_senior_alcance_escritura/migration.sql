-- El Senior hace todo lo del Staff (19/Oct/2026): además de revisar, carga y edita en los clientes
-- donde es el senior asignado. Para eso su asignación necesita alcance de ESCRITURA, que hasta hoy
-- tenía solo el staff. Solo datos: el gerente sigue con lectura y la columna conserva su valor por
-- defecto. Por sí sola no concede nada: los permisos operativos los da la matriz (`db:sync:rbac`).

UPDATE "asignaciones_cliente"
SET "alcance_escritura" = true
WHERE "funcion" = 'senior'
  AND "alcance_escritura" = false;
