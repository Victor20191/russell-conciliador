# Auditoría de Server Actions de Russell — 20/oct/2026

## Alcance y método

Inventario completo de `src/app/actions`: 38 archivos de producción, 197 funciones async exportadas. Las 197 se trazaron por guardas de permisos, alcance, helpers y operaciones de persistencia/red. Auth recibió además segunda revisión independiente de cambios raíz y correcciones de carrera/cuota implementadas por este agente. El JSON `russell-audit-acciones-inventory.json` contiene cada archivo, función, línea, guardas directas/transitivas, validaciones y veredicto. No se ha ejecutado un pentest contra el VPS ni se afirma ausencia absoluta de vulnerabilidades. La cobertura estática de entradas es exhaustiva; las pruebas dinámicas son regresiones de hallazgos concretos.

Instrucciones leídas: AGENTS.md y definición `.claude/agents/russell-conciliador-evolucion.md` (invocación de Claude coordinada por raíz); documentación local Next `01-app/02-guides/data-security.md`; CLAUDE.md de RBAC/alcance/módulos. No se leyeron valores .env ni se contactó BD externa, correo, VPS o proveedores. No commit/push/release/deploy.

## Hallazgos corregidos localmente

### ACT-01 — Alta: historial de reportes ejecutivo sin autorización propia

`src/app/actions/auditoria-reporte.ts:730`: `listarEnviosReporteEjecutivo` estaba exportada en archivo `use server` y consultaba envíos, autor, períodos y métricas sin gate. El acceso protegido al loader/página no protege invocaciones POST directas de una Server Action.

Corrección: `authorizeReporteEjecutivo()` antes de cualquier consulta. Ese helper exige permiso más rol Superadministrador; denegación devuelve lista vacía. Pruebas verifican no lectura cuando denegado y autorización previa a consulta permitida.

### ACT-02 — Alta: redirección reenviaba credenciales de OAuth/webhook

`src/lib/conexiones/pruebas.ts`: OAuth envía `client_secret` en formulario y webhook `X-Webhook-Secret`, con fetch en modo follow implícito. Respuestas 307/308 podían reenviarlos a otro origen. El caso HTTP/IA ya tenía `redirect: manual`.

Corrección: `redirect: manual` también en OAuth, webhook y solicitud de token Microsoft 365; HTTP 3xx se rechaza claramente sin volcar secretos. Regresión real con dos servidores HTTP de loopback para 307 y 308: antes continuaba y devolvía ok; después el servidor destino recibe cero solicitudes. No se usaron secretos reales ni red externa.

### ACT-03 — Media: altas públicas ilimitadas de tickets

`crearTicketSoporte` era público deliberadamente, protegido solamente por forma de campos/honeypot, y cada llamada válida insertaba ticket y auditoría sin cuota. Permitía crecimiento automatizado de datos.

Corrección: `src/lib/seguridad/limite-solicitudes.ts`, tabla `limites_solicitud` y migración local `20261020220000_limites_solicitud_publica`. Cinco solicitudes por IP/15 min y cincuenta globales/15 min. IP almacenada como HMAC con SESSION_SECRET. Dos UPSERT atómicos con reloj de PostgreSQL en la misma transacción, siempre global primero; rechazo individual revierte reserva global. IPs aceptadas solamente; eliminación de hasta 100 vencidas por solicitud, SKIP LOCKED. Falla de BD/migración/clave deniega; soporte interno no usa cuota. Cabeceras falsificadas no evitan máximo global.

Limitaciones: la migración NO se aplicó. Las pruebas concurrencia emplean doble transaccional compartido y no prueban PostgreSQL desplegado. La IP individual requiere proxy confiable que sobrescriba X-Forwarded-For y acceso directo a Node cerrado. El límite global protege persistencia independientemente de las cabeceras, pero el volumen HTTP/conexiones requiere limitación en proxy/infraestructura. Hasta aplicar migración, alta pública falla cerrada.

### ACT-04 — Media: login exitoso pendiente borra bloqueo concurrente; correos desconocidos sin cuota

El login comparaba bcrypt fuera de transacción y luego borraba contador/bloqueo incondicionalmente usando la cuenta leída antes. El quinto fallo concurrente podía bloquear la cuenta y un login correcto pendiente borraba ese bloqueo. La misma lectura obsoleta permitía emitir cookie tras restablecer contraseña, revocar sesiones o desactivar la cuenta (DAL podía luego rechazar esa cookie). Los correos desconocidos ejecutaban bcrypt sin límite por cuenta.

Corrección: `finalizarLogin` en `src/lib/login-intentos.ts` relee la cuenta con SELECT FOR UPDATE; compara hash, sessionVersion, activo y bloqueo vigente antes de resetear intentos. Devuelve únicamente campos de sesión actuales, incluidos rol y mustChangePassword. La emisión de sesión usa esos campos. `registrarFalloLogin` comparte el bloqueo de fila. Cambio de contraseña previo del agente raíz usa updateMany CAS; PasswordSchema conserva espacios y exige máximo 72 bytes UTF-8 para nuevas contraseñas.

Cuota `CUOTA_LOGIN`: 30 por IP y 1000 globales/15 min, antes de lookup y bcrypt para todos los formularios válidos (incluye desconocidos y correctos). Errores de cuota fallan cerrados. Comparte tabla/helper ACT-03; requiere migración. Oficinas con NAT comparten límite de 30; documentado en `docs/seguridad/cuotas-publicas.md`, junto a proxy confiable y protección HTTP necesaria.

Prueba diferida con login + registrarFalloLogin reales, bcrypt pendiente y doble Prisma: el quinto fallo gana y se conserva el bloqueo; ninguna cookie ni limpieza de navegación. Tres carreras adicionales prueban restablecimiento, revocación y desactivación. Revisión RBAC raíz: matriz vacía deniega y errores de matriz/publicación se propagan; no fallback de fábrica ante fallo.

### ACT-05 — Media: carrera de pertenencia al recrear carga temporal de balance

`src/lib/balance/archivo-temporal-servidor.ts` validaba dueño/estado fuera de la escritura. Reproducción: A inicia una parte, se suspende tras leer metadata; A cancela; B recrea el mismo lote; la parte pendiente de A se inserta en el padre de B y B completa/consume los bytes de A. Requiere conocer el UUID y una cancelación/purga con recreación durante la ventana; no permite tomar un lote ajeno estable. También completar/consumir podían operar sobre una fila reemplazada. Consumir cargaba todas las partes antes de comprobar el dueño.

Corrección: todas las operaciones de iniciar, guardar, completar, consumir y descartar usan una transacción con candado por lote y SELECT FOR UPDATE. El candado coordina incluso fila inexistente/recreación; el bloqueo de fila coordina con la purga por vencimiento. Se releen dueño/estado dentro del candado; consumir consulta bytes solo tras validar dueño. No cambia schema ni requiere otra migración.

Regresión en código anterior: `/tmp/russell-temporal-race-before.log`, dos tests fallaron; B recibió literalmente el contenido ficticio `SECRETO!`. Tras corrección cinco tests pasan: parte en vuelo, completar y consumir ante recreación, lectura de bytes tras autorización y flujo normal. La concurrencia se modela con doble transaccional serializado; no se ejecutó PostgreSQL real.

## Hallazgos coordinados / seguimiento

- Notificaciones sin dueño y marcado global (notifications.ts, menciones): confirmado; agente rutas corrige schema, writers y readers. No sobrescribí esos archivos.
- Red de conectores: API REST, OAuth, webhook, MinIO/S3 compatible permiten destinos HTTP e internos por diseño y solo con permiso conexiones:administrar. No hay política de egreso/allowlist de red. No se bloqueó todo RFC1918/loopback porque rompería integraciones internas legítimas. Definir destinos autorizados y controlar egreso en despliegue. Los proveedores de IA tienen origen oficial fijo y cambio de destino exige reingresar credenciales.
- Orden guardas: algunas acciones (`cerrarConciliacionModulo`, `contextoMarcaCruce`, `comentarioPropio`, `guardarComentarioAlerta`, validar/revertir alerta balance) consultan entidad antes del gate. El gate precede mutación/retorno de datos sensibles, pero carga previa y respuestas de existencia pueden endurecerse con autorización de módulo inicial. Especialmente cierre carga insumos antes autorización. No se demostró una escritura sin permiso.
- Límites de importación: balance usa su validador de tamaño; imports maestros/clientes4MB, conceptos12MB, patrones30MB y fotos ZIP60MB/300MB expandido. `analizarArchivoModulo` y `leerDatosModulo` no tienen tamaño explícito previo a arrayBuffer. Ingesta XLSX/XLSB no centraliza cuota de bytes expandidos; riesgo de agotamiento de recursos por usuarios con permiso de carga. Ajustar a volúmenes reales, pruebas de archivos máximos y contenedores antes de imponer límites arbitrarios.
- Calidad/integridad: `saveDianMapping` borra y crea por separado, una falla de segunda escritura puede perder mapeo previo (sin bypass RBAC). `requestDianAiAnalysis` es heurística simulada, `executeReconciliation` solo orienta hacia módulo; no eliminarlos como basura sin ver consumidores/contrato. Helpers HTML de auditoria-reporte aparentan legacy sin uso; agente de limpieza revisa referencias.
- Reporte novedades HTML de IA: sanitización regex no es frontera robusta para archivos HTML activos. Agente rutas verificó visor sandbox vacío, PDF sin JS/red: no XSS en app demostrado; exportación activa requiere consideración separada.

## Evidencia de validación

- Regresiones antes fix: `/tmp/russell-audit-actions-regression-before.log`, 7 fallaron /30 pasaron.
- Después gate/redirect: `/tmp/russell-audit-actions-regression-after.log`,37 pasaron.
- Cuota + soporte + reportes + conectores: `/tmp/russell-audit-actions-targeted.log`,4 archivos/95 pruebas pasaron.
- ESLint8 archivos propios modificados: `/tmp/russell-audit-actions-eslint.log`, exit0.
- `git diff --check` archivos propios/schema: exit0.
- Escaneo completo acciones: no `$queryRawUnsafe`, `$executeRawUnsafe`, `Prisma.raw`, eval o ejecución de shell. SQL presente usa tagged templates/Prisma.sql con parámetros. Autorización no se delega solo a la UI.
- Validación final de esta área: `/tmp/russell-acciones-final-tests.log`, 8 archivos / 126 pruebas pasaron (login, cuota, temporal, soporte, reportes, conectores).
- ESLint final 15 archivos propios: `/tmp/russell-acciones-final-eslint.log`, exit0.
- TypeScript completo `npx tsc --noEmit --incremental false`: `/tmp/russell-login-temporal-types.log`, exit0.
- Build, suite global, revisión cruzada de migraciones/Prisma: coordinados por raíz; no atribuirles resultados hasta que finalicen.

## Notas por archivo
- src/app/actions/aplicativos-cliente.ts (2): Permiso crear y alcance cliente; ERP/proceso resueltos en servidor; campos persistidos explícitos.
- src/app/actions/asistencia-inventario.ts (4): originalAutorizado comprueba permiso, cliente original y estado; integridad SHA256; anexo misma cliente/módulo; revisiones CAS.
- src/app/actions/auditoria-reporte.ts (8): Todas las acciones ahora exigen authorizeReporteEjecutivo (permiso y Superadministrador). Historial antes desprotegido corregido.
- src/app/actions/auth.ts (3): Revisión independiente terminada; cuota antes de lookup/bcrypt; éxito revalida bajo bloqueo hash/versión/activo/bloqueo y usa rol vigente; cambio contraseña CAS; logout limpia sesión.
- src/app/actions/balance-corte.ts (1): Permisos crear/editar y cliente derivado de balance; operador actual desde sesión.
- src/app/actions/balance.ts (26): 26 acciones: permiso rol + cliente canónico o contextoAccesoBorradorActual/puedeVerBorrador; escrituras en lote sujetas al lote; cierres y homologación recalculados servidor; SQL parametrizado; IDs/promoción comparados.
- src/app/actions/cargar-fotos.ts (1): Usuarios editar; ZIP 60MB, 2000 entradas, 300MB descomprimido y máximo foto; validación bytes; keys generadas servidor.
- src/app/actions/clients.ts (4): Crear/configurar separados; editar operativo conserva ficha no autorizada; membresía cliente; responsables/roles/ERP validados; SQL NIT parametrizado.
- src/app/actions/comentarios-alertas-modulo.ts (1): AutorizarComentarioAlertaModulo cliente canónico y periodo abierto; alerta recalculada servidor; consulta encabezado precede guarda (orden mejorable).
- src/app/actions/comentarios.ts (6): Entidad enum+scope cliente; edición/borrado propio; menciones por rol; notificaciones globales corregidas por agente rutas. ComentarioPropio consulta antes de guarda.
- src/app/actions/conexiones.ts (7): Conexiones administrar en las 7 acciones; whitelist campos; cifrado; cambio destino no recicla secretos; SMTP solo correo de actor; redirects de helpers corregidos. Red interna/HTTP requieren política egress.
- src/app/actions/cuentas-conciliacion.ts (6): Catálogo global con parametros administrar; schemas, cuentas existentes, candados y preservación mínimo de cuentas.
- src/app/actions/dian.ts (3): DIAN global por modelo, no cliente: dian editar/mapeos_dian configurar. requestDianAiAnalysis simulada heurística (no IA). saveDianMapping delete/create sin transacción: oportunidad integridad, sin bypass RBAC.
- src/app/actions/homologacion-cliente.ts (2): Balance revisar + alcance cliente; esquemas, cuentas existentes, transaction y cierres; vista previa misma autorización.
- src/app/actions/import-clientes.ts (1): Clientes crear + configurar, XLSX máximo4MB; solo altas; asignaciones jerárquicas/identidades validadas.
- src/app/actions/import-conceptos-nomina.ts (3): Editar módulos y alcance por cada cliente antes escritura; máximo12MB; fuentes/modelos resueltos, SQL ORM, transacción.
- src/app/actions/import-maestros.ts (1): Usuarios crear, roles maestro acotados sin administrador; máximo4MB; contraseña aleatoria por lote solo retorno autorizado, cambio obligatorio.
- src/app/actions/maestros.ts (6): Maestros administrar; roles maestro acotados, no cambia superadmin; target comprobado; bloqueo de responsables y jerarquía.
- src/app/actions/mapeo-cliente.ts (6): Balance revisar y alcance de cliente desde registro; no confiar cliente del formulario; SQL ORM; cierres.
- src/app/actions/module-fields.ts (5): Modulos configurar global; Zod/ID/dirección; vecino del mismo módulo; datos definidos por whitelist.
- src/app/actions/module-publication.ts (1): Publicacion_modulos configurar global; claves catálogo y configurable; invalidación caché. Boolean coercion permisiva pero operación administrativa autorizada.
- src/app/actions/modulos-datos.ts (31): 31 acciones: permisos y alcance cliente, contextoMarcaCruce/autorizarCierreConciliacion indirectos; scope derivado lotes/encabezados; updates staging con lote; cierre recalculado. Algunas consultas antes de auth; falta cota explícita archivo en entrada principal.
- src/app/actions/notifications.ts (1): Hallazgo feed global y marcado global delegado a agente rutas; nuevo ownership debe validarse en informe de ese agente.
- src/app/actions/novedades.ts (7): Novedades ver/administrar global; CRUD Zod; reportes IA HTML saneado regex requiere visor sandbox (agente rutas revisa).
- src/app/actions/parametros.ts (2): Parametros administrar global; whitelist catálogo/schema y invalidación caché.
- src/app/actions/patrones-modulo.ts (13): Perfiles administrar global, exigirAlcanceVersion para referencia cliente; original cliente exige alcance; muestra30MB y SHA256; CAS en estado/revisión, aprobación no usa original privado.
- src/app/actions/perfil.ts (2): Autoservicio getCurrentUser; solo actor.id; validación tamaño/bytes foto y claves fijas. Semántica mustChangePassword depende DAL (root).
- src/app/actions/perfiles-carga-modulos.ts (5): Perfiles administrar y alcance cliente desde perfil; schema descriptor y enumeración módulos; borrado acotado.
- src/app/actions/perfiles-carga.ts (7): Perfiles administrar + scope cliente; lote/perfil consistentes; schemas y límites campos; reseteo solo cliente autorizado.
- src/app/actions/permisos.ts (1): Roles configurar; roles canónicos/módulos; plan transaccional y anti-bloqueo. Guard anti-bloqueo previo a transacción potencial race administrativo no explotado.
- src/app/actions/prevalidador.ts (6): Permiso catálogo global o balance:crear/revisar por cliente; wrappers registrarRevisionPrevalidador/autorizarBalance; candados y estado recalculado.
- src/app/actions/prompts.ts (2): Prompts administrar global; claves catálogo y schema/tamaño; restauración servidor.
- src/app/actions/reconciliation.ts (4): Conciliaciones editar/ejecutar más cliente canónico de fila/padre; executeReconciliation solo orienta, no persiste.
- src/app/actions/soporte-preferencias.ts (1): Soporte ver y actor.id === auth.userId; schema estados; solo preferencias propias.
- src/app/actions/soporte.ts (8): Público deliberado protegido ahora cuota HMAC por IP5/global50 en15min transaccional. Interno permiso; lectura público restringida admin; mensajes autor/admin; cambios solo administrar; tokens hashes.
- src/app/actions/standard-accounts.ts (3): Mapeo administrar global; schemas y comprobaciones contrato/duplicados; operaciones globales por diseño.
- src/app/actions/subgrupos.ts (3): Mapeo administrar global; regexcódigo y grupo derivado; catálogo sin alcance cliente por diseño.
- src/app/actions/users.ts (4): Usuarios crear/editar/eliminar; Superadministrador solo asigna/edita otro Superadministrador; no autodegradación; validación jerarquía; reset revoca sesiones y cambia obligatorio.
## Complemento de revisión final

La matriz y el propietario del mapeo tuvieron una segunda revisión con correcciones adicionales. [Permisos y mapeo](permisos-mapeo.md) documenta las restricciones del Superadministrador, los seis permisos reservados, la prioridad de clienteId, el rechazo de identidad nula y 43 regresiones. Las notas anteriores de esos dos archivos se complementan con este resultado; acciones.json contiene la revisión y hashes finales.
