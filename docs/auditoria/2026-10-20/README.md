# Auditoría de seguridad y calidad de Russell Conciliador

Fecha: 20 de octubre de 2026. Base revisada: `36d5d449754e66108e5714fb2f105810c7c1d6e6`, rama `master`, versión técnica `3.3.0`.

Resultado: revisión integral del código de entrada, correcciones locales de fallos demostrables y limpieza conservadora. Las correcciones no están desplegadas. No se consultó ni modificó la base de producción, no se probaron credenciales reales y no se hicieron commit, push o cambios en el VPS.

## Alcance y evidencia

- **80 entradas App Router:** 56 páginas, 21 archivos de handlers y 3 layouts. El [inventario de rutas](rutas.json) registra guarda real, alcance, datos, línea y hash; el [análisis de rutas](rutas.md) explica cada resultado.
- **197 Server Actions en 38 archivos:** permisos directos y transitivos, propietario/cliente, validación, escrituras y llamadas externas. Véanse [inventario](acciones.json) y [análisis](acciones.md).
- Autenticación, sesión, RBAC, publicación de módulos, notificaciones, adjuntos, conectores, SQL, cuotas, concurrencia, dependencias y exposición de datos en respuestas.
- Grafo TypeScript de imports, exports y dependencias con **88 entradas del framework**: las 80 anteriores, cuatro loading, dos error, un global-error y proxy. Los scripts operativos y las pruebas se analizan como raíces separadas. [Grafo final](grafo-modulos.json) y [limpieza](limpieza.md).
- Revisión independiente mediante el agente permanente `russell-conciliador-evolucion`. Se contrastaron sus hallazgos con código y regresiones; no se adoptaron automáticamente sospechas ni cifras aproximadas.

La cobertura exhaustiva corresponde a inventario y revisión estática de entradas. Las pruebas dinámicas comprueban los fallos indicados; no equivalen a probar todas las combinaciones de usuario, datos y concurrencia de producción. No es una certificación de ausencia de vulnerabilidades.

## Correcciones

La severidad expresa impacto potencial en esta aplicación; no es un cálculo CVSS.

| Área | Riesgo observado | Corrección y prueba |
| --- | --- | --- |
| Notificaciones — alta | Campana y marcado de leídas globales; podía mostrarse información de otra cartera. | Destinatario y referencia de entidad explícitos; permiso y cartera actuales antes de mostrar; marcado solo del actor. Actividad del dashboard filtrada en consulta. Pruebas de destinatario distinto, revocación y traslado de entidad. |
| Adjuntos — alta | Un SVG servido desde el origen de Russell ejecutaba JavaScript al abrirse directamente. | CSP sandbox sin scripts/origen heredado, sin caché, nosniff y no-referrer en cinco rutas privadas. Chromium: antes ejecutó script y una solicitud; después cero, manteniendo la figura visible. [Evidencia](evidencia/svg-navegador.json). |
| Reportes ejecutivos — alta | La acción de historial no tenía guarda propia; proteger su página no protege la acción. | `authorizeReporteEjecutivo` antes de consultar. El handler también autoriza antes de procesar el cuerpo y no captura la redirección como error 500. |
| Credenciales externas — alta | Redirecciones HTTP 307/308 de OAuth y webhook podían reenviar secretos a otro destino. | `redirect: manual`; se rechaza el salto. Dos servidores locales verifican que el destino no recibe solicitudes. Microsoft 365 usa la misma protección en su token. |
| RBAC — alta | Una matriz vacía o un error podían activar permisos del catálogo de respaldo. | Matriz vacía deniega; error se propaga. Nueva clave de caché `rbac-matriz-v14`. La publicación de módulos tampoco vuelve al catálogo ante errores. Pruebas de matriz vacía, fallo y módulo oculto. |
| Administración de permisos — alta | Un administrador podía modificar la matriz del Superadministrador o arrastrar permisos reservados al configurar niveles. | Restricción por actor, rol y permiso reservado, incluida interfaz; los permisos de sistema requieren Superadministrador. Las concesiones antiguas requieren revisión explícita, no borrado automático. Véase el [informe complementario](permisos-mapeo.md). |
| Mapeo por cliente — alta | El dueño de una cuenta se resolvía por nombre pese a existir ID canónico; reutilizar un nombre podía cambiar el alcance. | Priorizar `clienteId`; solo registros antiguos sin FK usan una coincidencia única. Pruebas de renombrado, nombres ambiguos y cliente inexistente. |
| Login y contraseña — alta/media | Fallos simultáneos podían pisar el contador; un login en vuelo podía borrar un bloqueo concurrente o emitir una cookie obsoleta tras un restablecimiento (el DAL ya rechazaba esa cookie). | Bloqueo de fila y revalidación tras bcrypt; cuota compartida antes de consultar/bcrypt; cambio de contraseña condicional con incremento atómico de versión. No recortar espacios y limitar nuevas contraseñas a 72 bytes UTF-8. DAL bloquea perfil/foto durante cambio obligatorio. |
| Archivo temporal — media condicionada | Tras cancelación del dueño o purga, recrear un UUID conocido podía mezclar una parte en vuelo del dueño anterior con el nuevo. No permite cancelar un lote ajeno estable. | Candado por lote, bloqueo de fila y relectura del dueño dentro de la transacción para iniciar, guardar, completar, consumir y descartar. Bytes consultados después de autorizar. Regresiones reproducen el intercalado anterior. |
| Soporte público — media | Creación automática ilimitada de tickets y auditoría. | Cuotas globales y por IP compartidas en PostgreSQL, identidad HMAC, limpieza acotada y denegación ante fallos. [Límites y operación](../../seguridad/cuotas-publicas.md). |
| Exportación CSV — media | Texto controlado podía interpretarse como fórmula al abrirse en una hoja de cálculo. | Neutralización de prefijos de fórmula y controles; escape de delimitadores/comillas; números reales conservan su tipo. |
| Consultas previas al permiso — media | Nueve detalles/exports leían filas o staging antes de validar la cartera. | Permiso global, referencia mínima, permiso por cliente y finalmente detalle. La consulta final conserva el cliente autorizado. Trece regresiones verifican denegación antes de detalle/staging/descriptor; pruebas existentes verifican denegación antes del almacén. |
| Dependencias | El estado inicial tenía 26 alertas npm, incluida una crítica. | Next y eslint-config-next 16.4.2, Prisma alineado 7.10.1, Vitest 4.1.12 y actualizaciones compatibles. Eliminado `@playwright/mcp` sin consumidor. Resultado: cero alertas en dependencias de producción; cinco altas en herramientas de desarrollo, explicadas abajo. |

Pruebas de entrada y SQL usan dobles controlados, excepto las verificaciones HTTP/Chromium indicadas. Los candados y migraciones no se ejecutaron contra PostgreSQL real; no se atribuye a mocks la prueba de exclusión del servidor de BD.

## Limpieza y eficiencia

Eliminados `src/components/stepper.tsx`, `src/lib/entorno.ts`, el export `ModulePlaceholder`, cinco SVG de plantilla sin referencias y `@playwright/mcp`. Se conserva `playwright` porque genera PDF, y Prisma porque lo usan el cliente y los scripts.

Se corrigieron dos efectos redundantes del selector compartido, advertencias de accesibilidad y variables/directivas sin uso. La interacción se comprobó en Chromium: selección, foco, teclado, opciones cambiantes y actualización desde el padre. El lint deja de analizar resultados generados en `_tmp_*`, `output/` y `outputs/`; sigue revisando código, configuración y scripts.

No se borraron migraciones, buckets, semillas, contratos de compatibilidad ni utilidades operativas por carecer de import desde una página. Los candidatos sin caller se clasifican individualmente en [limpieza.md](limpieza.md). OpenRouter disponible sin flujo consumidor y el análisis DIAN heurístico no deben presentarse como capacidades de IA integradas.

Esta limpieza reduce mantenimiento y superficie instalada. No se midió una mejora porcentual de rendimiento: los archivos ya desconectados no se ejecutaban. Las consultas autorizadas antes del detalle sí evitan trabajo y memoria en solicitudes denegadas.

## Riesgos y trabajo posterior

| Prioridad | Evidencia / límite | Siguiente acción concreta |
| --- | --- | --- |
| Alta antes de despliegue | Las dos migraciones nuevas aún no están aplicadas. Sin la tabla de cuotas login y soporte público fallan cerrados. | Ensayar migraciones, concurrencia, backup y recuperación en PostgreSQL aislado; aplicar al destino confirmado antes de arrancar el nuevo build. |
| Alta operativa | Existe contraseña temporal compartida en el flujo administrativo; el cambio obligatorio limita acceso posterior, pero no impide que quien la conozca se adelante al titular. | Sustituir por invitación/token de un uso o clave individual con vencimiento en un cambio de flujo aprobado. No se reproduce el valor en este informe. |
| Alta operativa | Privilegios reservados ya concedidos en BD no se conocen; corregir el editor no revoca concesiones anteriores. | Revisar la matriz con Superadministrador, simular diferencias y retirar solo las concesiones aprobadas. No ejecutar sincronización destructiva automática. |
| Media/alta según exposición | API REST, OAuth, webhooks y S3 compatibles admiten destinos configurados, incluidos HTTP y redes internas. No hay allowlist de egreso. | Definir destinos del cliente y control de salida en infraestructura. No bloquear toda red privada: puede alojar integraciones legítimas. La edición exige permiso administrativo. |
| Media | El límite de 64 MB en Server Actions no acota bytes expandidos, filas ni CPU de todos los XLSX/XLSB. Dos entradas de módulos leen arrayBuffer sin cota propia previa. PUT temporal sigue leyendo el cuerpo antes del chequeo de dueño del helper; proxyClientMaxBodySize limita el buffer, no rechaza por sí solo cuerpos grandes. | Calibrar límites con archivos máximos reales, lectura acotada, cuotas por usuario y aislamiento de procesos; probar carga antes de endurecer límites de negocio. |
| Media | `/auditoria` aún consulta y filtra en memoria; otras acciones consultan referencias o insumos antes del permiso de entidad, aunque deniegan antes de escribir/devolver datos sensibles. | Paginación/búsqueda en BD y guardas globales tempranas en esos flujos; detalles en acciones/rutas. |
| Media | Filas de mapeo legado sin FK todavía dependen de un nombre único; eso no prueba que el nombre no se haya reutilizado históricamente. | Conciliar identidad antes de completar la FK; no asignar automáticamente por nombre. |
| Media | DIAN es un prototipo global sin propiedad por cliente. Su “IA” es una heurística. `saveDianMapping` borra y crea en operaciones separadas. | Definir alcance multiempresa y significado funcional antes de habilitarlo ampliamente; hacer atómica la sustitución del mapeo. No retirarlo como código muerto: tiene consumidores. |
| Media | Fixtures golden y documentación de jerarquía contienen nombres e identificadores cuya naturaleza real o sintética no se verificó por completo; no se comprobó la visibilidad remota del repositorio porque `gh` carece de sesión. | Revisar permisos del repositorio y anonimizar fixtures preservando invariantes contables. Evaluar exposición histórica antes de reescribir historial. El escaneo de secretos no es un escaneo de datos personales. |
| Media | TLS, `COOKIE_SECURE`, HSTS, tamaño/tiempo HTTP, X-Forwarded-For y acceso directo al proceso no se verificaron en VPS. Cuotas IP se comparten detrás de NAT. | Verificar HTTPS, cabeceras confiables, firewall y límites de proxy; medir volumen legítimo para calibrar cuotas. Configuración local no demuestra infraestructura desplegada. |
| Baja/media | CSP global permite scripts inline; reportes HTML descargados fuera de la app pierden sandbox. Visor en app sí usa sandbox y PDF desactiva JS/red. | Evaluar CSP con nonce y saneamiento mediante parser si se ofrece HTML activo fuera de Russell. No se confirmó ejecución en el visor protegido. |
| Desarrollo | Cinco avisos altos derivan de `braces` en la cadena de ESLint/fast-glob/micromatch. No afectan el árbol de producción en `npm audit --omit=dev`. | Seguir actualización compatible. `npm audit fix --force` propone bajar eslint-config-next a otra versión mayor; no se aplicó. [Resultado completo](evidencia/dependencias-completas.json). |

También existe un hook local que depende de una ruta personal en `.codex/hooks.json`: documentar o parametrizar su instalación. No se ejecutó para esta auditoría ni se atribuye vulnerabilidad solo por usar una ruta local.

## Validación final

Resultado integrado: **4.297 pruebas aprobadas**, cuatro omitidas (captura de staging e IA real), lint sin errores/avisos, build y Prisma validate correctos. El recorrido local hizo 77 solicitudes sin errores 500; diez pruebas adicionales de cookies inválidas/cabeceras manipuladas fueron denegadas.

Los resultados de la última ejecución integrada se registran en [evidencia/validacion.json](evidencia/validacion.json), con comandos, conteos y límites. Incluyen suite completa, lint, build, Prisma validate, diff, inventarios y recorrido HTTP anónimo de las páginas/handlers desde un servidor local sin `.env` real. Los tests de permisos negativos complementan ese recorrido: un smoke anónimo no demuestra todos los roles autenticados.

Para reproducir sin conectar a la base de negocio, ejecutar desde la raíz:

```sh
DATABASE_URL='postgresql://audit:audit@127.0.0.1:9/audit?connect_timeout=1' npm run test
DATABASE_URL='postgresql://audit:audit@127.0.0.1:9/audit?connect_timeout=1' npm run lint
DATABASE_URL='postgresql://audit:audit@127.0.0.1:9/audit?connect_timeout=1' npm run build
DATABASE_URL='postgresql://audit:audit@127.0.0.1:9/audit?connect_timeout=1' npx prisma validate
npm audit --omit=dev
node docs/auditoria/2026-10-20/inventario-modulos.mjs
git diff --check
```

La URL deliberadamente inaccesible evita utilizar la conexión de negocio para estos comandos. El build puede leer otras variables locales; no se hizo una prueba de envío SMTP, IA o credenciales. El servidor del smoke se arrancó desde un directorio aislado, sin archivos de entorno y con entorno explícito.

## Entrega y despliegue

1. Revisar el diff y los riesgos operativos anteriores. Cambios únicamente locales, sin publicación Git ni despliegue.
2. Respaldar y confirmar el destino real; aplicar ambas migraciones aditivas en español. No inventan destinatarios históricos, no eliminan notificaciones ni modifican tablas contables existentes.
3. Construir y arrancar con la misma configuración de despliegue. Verificar login correcto/incorrecto/bloqueado, cambio obligatorio, revocación, cuotas tras proxy, campana por usuario y cartera, SVG, cargas fragmentadas y exports por rol.
4. Preparar una release **patch** por las correcciones de seguridad compatibles; propuesta `3.3.1` si sigue libre al momento de publicar. Se conserva `3.3.0` en esta entrega de auditoría y no se creó borrador en BD. La publicación en `/novedades` corresponde al administrador después del despliegue.

La auditoría termina con código y pruebas locales revisados, inventarios y pendientes priorizados. Migración/despliegue y decisiones de flujo de producto se entregan como trabajo posterior explícito; no se presentan como realizados.
