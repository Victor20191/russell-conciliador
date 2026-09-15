# Ayuda: estados visibles por usuario

En `/reportes`, **Estados visibles** permite elegir qué estados se ocultan habitualmente en Tabla y Kanban. Sin una preferencia previa se ocultan **Resuelto** y **Cerrado**.

1. Abrir **Estados** junto a los filtros. El control muestra cuántos estados están visibles (p. ej., **3/5**). Sus cinco opciones aparecen en un desplegable: **Abierto**, **En evaluación**, **En proceso**, **Resuelto** y **Cerrado**.
2. Marcar un estado lo muestra; desmarcarlo lo oculta. Cada cambio se guarda automáticamente para el usuario autenticado, también en otros dispositivos.
3. Usar **Mostrar todos temporalmente** para consultar todos sin modificar la preferencia guardada.
4. Pulsar **Volver a mi vista** para recuperar la selección guardada. Si se cambia una casilla durante la consulta temporal, esa selección pasa a ser la nueva preferencia habitual.

El desplegable permanece cerrado al entrar y se cierra al pulsar fuera, usar Escape o salir con Tab. Las opciones usan los mismos colores del Kanban.

Mientras se guarda, las casillas quedan deshabilitadas para evitar escrituras simultáneas. Si falla, se restaura la vista anterior y se muestra un aviso. La preferencia se carga desde la base de datos al abrir o recargar Ayuda. También se permite ocultar todos los estados o no ocultar ninguno.

Los tickets conservan su estado, permisos e historial. El selector **Mover a** mantiene todos los destinos. Para arrastrar hacia una columna oculta, usar primero **Mostrar todos**. Si falla la conexión al mover una tarjeta, vuelve a su estado anterior.

## Implementación y alcance

- `preferencias_soporte_usuario`: una fila por `usuario_id`; `estados_ocultos` contiene estados válidos. La ausencia de fila y un arreglo vacío tienen significados distintos.
- La acción `guardarEstadosOcultosTickets` exige `soporte:ver`, obtiene el usuario de la sesión y no acepta un identificador de usuario del cliente.
- El filtro por estado convive con búsqueda y origen del reportante, que siguen siendo temporales. El aviso de estados ocultos y la salida **Mostrar todos** permanecen visibles.
- Kanban recibe los tickets coincidentes antes del filtro de estado y oculta solo las columnas elegidas: cambiar la consulta temporal no reinicia una operación optimista pendiente.
- Se conserva el alcance actual del listado: hasta 200 tickets internos recientes. Esta configuración no amplía ese histórico ni cambia los permisos de la bandeja de Xentria.
- Migración aditiva: `20260915210000_preferencias_soporte_usuario`; debe aplicarse antes de desplegar el código que consulta la preferencia.
