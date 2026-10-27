# Cuotas de inicio de sesión y soporte público

Las entradas públicas usan `src/lib/seguridad/limite-solicitudes.ts` y la tabla
PostgreSQL `limites_solicitud`. Los contadores se comparten entre procesos e
instancias. La migración `20261020220000_limites_solicitud_publica` debe estar
aplicada antes de desplegar este código. Si faltan la tabla, la conexión a BD o
una `SESSION_SECRET` de al menos 32 bytes, ambas entradas fallan cerradas.

| Entrada | Límite por IP | Límite global | Ventana |
| --- | ---: | ---: | --- |
| Inicio de sesión | 30 | 1000 | 15 minutos |
| Creación pública de tickets | 5 | 50 | 15 minutos |

La ventana comienza con la primera solicitud aceptada. En login se cuentan
todos los formularios válidos, incluidos correos inexistentes y accesos correctos,
antes de consultar la cuenta o comprobar bcrypt. El bloqueo adicional de cinco
fallos por cuenta continúa vigente. La cuota de tickets no se aplica a soporte
interno. Los límites se definen en `CUOTA_LOGIN` y `CUOTA_SOPORTE_PUBLICO`.

La IP identifica una conexión de red, no necesariamente una persona: una oficina
con salida compartida consume la misma cuota de 30 inicios cada 15 minutos.
Evaluar ese volumen para la instalación concreta antes del despliegue; el cambio
de límites es una decisión operativa explícita, no una desactivación automática
al encontrar tráfico elevado.

La identidad individual se guarda como HMAC de la IP con `SESSION_SECRET`, nunca
como IP en claro en esta tabla. Se reserva primero el cupo global y después el
individual dentro de la misma transacción. Un rechazo individual revierte también
la reserva global. Solo se almacenan identidades aceptadas y cada operación
limpia como máximo cien entradas vencidas. El reloj y los incrementos atómicos
pertenecen a PostgreSQL.

## Configuración del proxy

`getClientIp()` lee `X-Forwarded-For`. El ingreso confiable debe sobrescribir esa
cabecera con la dirección que conoce y el proceso Node no debe ser accesible
directamente desde Internet. Si el cliente puede elegir la cabecera, puede
repartir solicitudes entre identidades falsas; el máximo global sigue vigente
porque no depende de esa dirección.

Las cuotas de aplicación limitan bcrypt, escrituras y crecimiento de contadores.
El proxy o proveedor de infraestructura debe limitar además conexiones y volumen
HTTP: la cuota transaccional necesita atender la solicitud y contactar la BD.
No sustituye esa protección de infraestructura.

## Validación local

Las pruebas cubren agotamiento antes de consultar cuentas/bcrypt, errores con
denegación, correos desconocidos, accesos correctos y concurrencia/rollback del
contador mediante un doble transaccional compartido. También comprueban que un
login pendiente no borra un bloqueo ni crea sesión después de cambiar contraseña,
revocar sesiones o desactivar la cuenta. No verifican la configuración del proxy
ni ejecutan la migración o candados contra el PostgreSQL desplegado.
