# Estructura de importación — Russell

La plataforma carga los datos de la firma desde **un solo archivo**:
`docs/clientes/Estructura_Importacion_Russell.xlsx`. Se sube **tal cual en dos
lugares** (cada importador lee solo sus hojas; las demás las ignora):

1. **`/config/usuarios` → «Importar»** — lee `Socios`, `Gerentes`, `Seniors`, `Staff`
   y crea los usuarios + un nivel de jerarquía.
2. **`/config/clientes` → «Importar desde Excel»** — lee `Clientes` y crea los
   clientes con responsables, módulos y formatos DIAN.

El archivo lo genera `scripts/gen_plantillas_desde_consolidada.py` desde el maestro
original `Estructura jerárquica con clientes.xlsx` (hoja `CONSOLIDADA`).

## Hojas de personas — `Socios` · `Gerentes` · `Seniors` · `Staff`
- Fila 1 = banner (texto libre). **Fila 2 = encabezados. Datos desde la fila 3.**
- Columnas: `Nombre`, `Cédula`, `Cargo`, `Correo`, `Estado` y —salvo `Socios`—
  `Cédula del <Superior>` (Gerentes→Socio, Seniors→Gerente, Staff→Senior).
- `Correo` y `Cargo` son **provisionales** (correo `nombre.apellido@russellbedford.com.co`,
  cargo = rol). El importador genera la contraseña temporal; cada quien la cambia al ingresar.
- La cédula identifica a cada persona (única) y resuelve la jerarquía.

## Hoja de clientes — `Clientes`
- **Fila 1 = encabezados. Datos desde la fila 2.** Una fila por NIT; varios staff
  en la misma celda separados por `;`.
- Columnas: `Razón social *`, `NIT *`, `Tipo de cliente *` (A/B/C), `ERP`,
  `Sector`, `Socio (firma) *`, `Gerente (valida) *`, `Senior (revisa) *`,
  `Staff (ejecuta) *` (uno o varios, separados por `;`).
- **ERP y Sector opcionales** al cargar: el ERP se EXIGE al iniciar una operación
  (conciliación o carga de balance), no al importar. Sin columnas de Módulos/DIAN
  ⇒ el importador activa **todos** por defecto (módulos en estado «pendiente»).
- Los responsables se resuelven **por nombre** contra los usuarios creados en el paso 1
  (deben coincidir exactamente — vienen del mismo origen).

## Mapeo desde el archivo original (CONSOLIDADA)
| Columnas del original | Destino |
|---|---|
| `NIT`, `CLIENTE` | Clientes: `NIT`, `Razón social` |
| `TIPO CLIENTE`, `SECTOR`, `ERP` | Clientes: `Tipo`, `Sector`, `ERP` |
| `SOCIO` / `GERENTE` / `SENIOR` / `ASISTENTE` (nombres) | Clientes: responsables |
| `CC SOCIO` / `CC GERENTE` / `CC SENIOR` / `CC STAFF` (cédulas) | Hojas de personas: `Cédula` y `Cédula del <Superior>` |

## Prerrequisitos en la base de datos
```bash
npm run db:migrate     # crea los catálogos ERP/Sector (migración 20260622000000)
npm run db:seed:rbac   # roles Socio/Gerente/Senior/Staff (los exige el importador de usuarios)
npm run db:seed        # módulos y formatos DIAN (para activarlos por defecto en clientes)
```

## Proceso de carga (orden)
1. Subir `Estructura_Importacion_Russell.xlsx` en `/config/usuarios`.
2. `npm run db:completar:jerarquia` — completa la malla m2m (109 aristas; el
   importador de usuarios solo crea 1 superior por persona).
3. Subir el **mismo archivo** en `/config/clientes`.

## Datos a corregir antes de importar clientes
- **NIT `901491963`** (BLOQUEANTE) — lo comparten `DCN DIVING COLOMBIA SAS` y
  `ABC CORPORATION S.A.S.` (error de origen): corrige el NIT de una. Mientras haya
  NIT duplicado, el lote completo falla.
- (No bloqueante) **`CAJA DE COMPENSACION FAMILIAR COMFENALCO ANTIOQUIA` (NIT 890900842)**
  entra **sin ERP**: el ERP es opcional al cargar, pero deberá asignarse en
  Configuración › Clientes antes de iniciar una conciliación o cargar su balance.
- (No bloqueante) **49 clientes sin sector** entran como «Sin sector»; complétalos luego.

## Regla de ERP obligatorio para operar
El ERP es **opcional al crear/importar** un cliente, pero **bloqueante para iniciar
una operación**: la plataforma impide ejecutar una conciliación (`/conciliacion/nueva`)
o cargar un balance (`/balance`) de un cliente sin ERP, y muestra la alerta para
asignarlo. En `/config/clientes` los clientes sin ERP se marcan con la etiqueta
«Sin ERP» y se pueden filtrar.

## Staff: uno o varios por cliente
Un cliente admite **varios staff** (el senior y el gerente son uno cada uno). En la
hoja `Clientes` se separan con `;`; en el formulario se agregan/quitan en el panel
«Staff (ejecuta) — uno o varios». En este maestro, 5 clientes traen más de un staff.
