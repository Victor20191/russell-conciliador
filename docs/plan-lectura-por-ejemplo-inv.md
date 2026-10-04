# Plan · Lectura por ejemplo en Inventarios (`/modulos/inv/patrones/nueva`)

Rama: `inv-lectura-por-ejemplo` · Fecha: 3/Oct/2026 · **Estado: implementado (fases 0–5), versión 2.5.0**

> Diferencias con lo planeado: (1) la UI responde al ancho de su contenedor (container queries) y los modales del
> cargue pasan a `max-w-4xl` mientras el constructor está abierto; (2) la selección del pedazo de texto se captura
> en `select`, `mouseup` y `keyup` (no todos los navegadores avisan con el mismo evento); (3) el borrador de versión
> en BD (`--db`) NO se creó: escribe en producción y la rama aún no está desplegada.

## 1. Objetivo

Cuando la asistencia no entiende una muestra, el usuario hoy solo puede **explicar con texto** cómo se lee
(`asistencia-muestra-panel.tsx`, «Explica cómo se lee el archivo»). En los formatos irregulares
(`lecturaEstructurada`) no hay forma de corregir a mano: la propia pantalla remite a la asistencia
(`editor-patron-client.tsx:350`).

La nueva función permite **armar a mano el resultado de uno o dos productos**, señalando sobre la grilla
del archivo original qué celda o qué pedazo de texto corresponde a cada campo. El sistema **deduce la regla**
que reproduce esos ejemplos, **reprocesa el archivo completo** y muestra qué productos no logró leer para
que el usuario agregue otro ejemplo. La regla resultante se guarda como patrón y los siguientes archivos del
aplicativo se leen solos, sin IA.

## 2. Decisiones tomadas

| Decisión | Motivo |
|---|---|
| Se **señala** dónde está cada dato; el archivo **no se reorganiza** | El patrón debe leer el archivo tal como lo exporta el ERP la próxima vez, y se conserva la trazabilidad celda a celda. |
| Columnas de destino **fijas**: las del módulo (Tipo, Referencia, Descripción, Cantidad, Valor unitario, Valor total) | El patrón debe producir lo que el inventario concilia (`ROLES_LECTURA_INVENTARIO`). |
| **Solo datos del archivo**; no se teclean valores | Una cifra escrita a mano no se puede repetir en el siguiente archivo ni rastrear hasta su celda. |
| Deducción **en código**; IA solo de respaldo | Determinista, gratis y verificable. La IA solo entra cuando los ejemplos no deciden, y debe respetarlos. |
| Los ejemplos del usuario son **casos de prueba** | Una regla (deducida o de la IA) que no los reproduzca exactamente se rechaza. |
| Todo gesto de arrastre tiene **equivalente con clic** | Arrastrar en tablas grandes es torpe y el arrastre HTML5 no funciona con teclado ni en pantallas táctiles. |
| Sin dependencias nuevas | Arrastre HTML5 nativo + selección en `<textarea readonly>`. |
| Sin migración de BD | El resultado sigue siendo el `SpecModulo` / `lecturaEstructurada` que ya se valida, se prueba y se guarda. |
| El cuadro de texto se conserva | Complementa los ejemplos con lo que no se puede señalar (el «por qué», excepciones). |

## 3. Punto de partida (lo que ya existe y se reutiliza)

- **Gramática** `LecturaEstructuradaSchema` (`src/lib/modulos/extraccion/lectura-estructurada.ts`):
  registro con `ancla` (condición literal en una columna) + `maxFilas`; campos con `fuente` = columna +
  `desplazamientoFila` (filas FÍSICAS) + selector (`completa` | `separador` | `etiqueta` | `posicion`);
  `seccion`, `totales`, `ignorarFilas`, `ignorarColumnas`.
- **Motor** `ejecutarLecturaEstructurada`: lee todo el archivo, exige cobertura total del contenido y deja
  trazas por registro (fila, columna, tramo).
- **Validación** `validarLecturaInventario` (`asistencia/validar.ts`): resumen, controles, ejemplos y la
  pregunta `confirmar_lectura_estructurada`.
- **Asistencia** `resolverLecturaInventario` (`asistencia/resolver.ts`) + `proponerSpecInventarioIA`
  (`asistencia/ia.ts`, con callback `evaluar(spec)`).
- **Acción** `asistirMuestraPatronInventario` (`src/app/actions/patrones-modulo.ts:272`) con continuación
  firmada (`patrones/asistencia-muestra.ts`).
- **Guardado** `crearVersionPatron` + `asistenciaCoincideConSpec`: sin cambios.

Coordenadas, punto delicado: `fuente.columna`, `ancla.columna` y `primeraFilaDatos` son relativas a la
**grilla compacta** (`GridHoja`, desplazada por `columnaInicial` y sin filas vacías); `desplazamientoFila`
y las trazas usan **filas físicas**. La UI trabaja en coordenadas de Excel (fila física, letra real) y
solo el deductor convierte.

## 4. Contrato: el modelo del usuario

Archivo nuevo `src/lib/modulos/asistencia/modelo-usuario.ts` (puro, sin `server-only`; lo usan la UI y el servidor).

```ts
type Tramo = { inicio: number; fin: number };            // ausente = celda completa
type Senal = { fila: number; columna: number } & Partial<Tramo>; // fila física, columna física 1-based (Excel)

type ModeloUsuarioInventario = {
  version: 1;
  hoja: string;
  productos: { asignaciones: ({ rol: RolLecturaInventario } & Senal)[] }[]; // 1..5 productos, ≤ 6 asignaciones
  columnas?: { rol: RolLecturaInventario; columna: number; filaTitulos: number }[]; // arrastre de columna entera
  secciones?: Senal[];                                      // título que da el Tipo a los productos de abajo
  totales?: (Senal & { tipo: "general" | "subtotal" })[];
  ignorarFilas?: { fila: number; motivo: string }[];        // motivo 8..200
  ignorarColumnas?: { columna: number; motivo: string }[];
};
```

- `ModeloUsuarioSchema` (Zod estricto, con topes): ≤ 5 productos, ≤ 12 marcas por tipo y textos acotados.
- Helpers puros para la UI: agregar/quitar asignación, detectar conflictos (mismo tramo en dos campos,
  tramos que se solapan, un campo repetido en un producto) y avisos al soltar (ver §5).
- `modeloDesdeLectura(spec, ejemplosLectura)`: **precarga** el modelo con lo que entendió el sistema
  (las trazas ya traen fila, columna y tramo), para que el usuario corrija en vez de empezar de cero.

## 5. Gestos → reglas

| Gesto | Regla resultante | Aviso inmediato al soltar si… |
|---|---|---|
| Arrastrar la letra de una columna a un campo | `spec.columnas[rol]` (lectura tabular clásica) y `filaEncabezado` según la fila de títulos (propuesta con `sugerirSpec`) | la columna está vacía en las filas de datos |
| Arrastrar una celda completa a un campo del producto | Fuente con selector `completa` | el campo ya tiene dato en ese producto |
| Seleccionar un pedazo del texto y arrastrarlo | Selector `etiqueta`, `separador` o `posicion` (ver §6.4) | un campo numérico incluye letras o varios números (`tokenNumerico`), o deja fuera el signo o los paréntesis |
| Celdas de filas distintas en un mismo producto | `registro.ancla` + `desplazamientoFila` de cada campo | el producto supera 32 filas (`maxFilas`) |
| Marcar un título como «Sección → Tipo» | `seccion` | — |
| Marcar una celda como total general o subtotal | `totales` | la celda no tiene un importe |
| Marcar una fila o columna «Ignorar» (con motivo) | `ignorarFilas` / `ignorarColumnas` | la fila o columna se usa en un ejemplo |

## 6. Deductor (`src/lib/modulos/asistencia/deducir-lectura.ts`, puro)

`deducirLectura(hoja: GridHoja, modelo): { spec: SpecModulo | null; ambiguedades: Ambiguedad[]; errores: string[] }`

1. **Validar señales**: la fila física existe (`filasFisicas`), la columna existe (restando `columnaInicial`),
   el tramo cabe en el texto y no queda vacío. El texto siempre se lee de la grilla, nunca del navegador.
2. **Camino tabular**: si todas las asignaciones son de columna entera, o celdas completas de una misma fila
   por producto con columnas constantes entre productos, se arma un spec clásico: `sugerirSpec` como base y
   luego `columnas`, `filaEncabezado` y `primeraFilaDatos` del modelo. Termina aquí.
3. **Registro**: ancla = la fila física mínima de cada producto; `desplazamientoFila` = fila − ancla, y debe
   coincidir entre productos. La columna de cada campo también debe coincidir. Si no, el error lo dice con
   las cifras («en el producto 2 la cantidad está 3 filas debajo del inicio; en el 1, 2»).
   `maxFilas` = desplazamiento máximo + 1.
4. **Selector por campo**: se generan candidatos con cada ejemplo, en orden de preferencia:
   `completa` → `etiqueta` (el rótulo que precede al tramo, p. ej. «Ref:», y el cierre si no llega al final)
   → `separador` (prueba `|`, `;`, `·`, ` - `, `/`, `,` y tabulador; el tramo debe coincidir con el segmento *k*)
   → `posicion`. Gana el primer candidato que reproduzca el tramo en **todos** los ejemplos, aplicado con la
   misma función que usa el motor (`aplicarSelector`, §8 Fase 0). Si con un solo ejemplo solo sirve
   `posicion`, queda la ambigüedad «agrega otro producto de ejemplo para confirmar cómo se separa».
5. **Condición del ancla**: se buscan candidatos en la fila ancla: prefijo literal común a todos los ejemplos
   en una misma columna (`empieza`), igualdad (`igual`) o `no_vacia`. Se elige el más específico que, sobre
   la hoja entera, coincida en la fila ancla de cada ejemplo y **en ninguna otra fila de sus bloques**.
   Si ninguno cumple → ambigüedad `ancla` (pasa a IA, §7.3).
6. **Sección, totales e ignorados**: la condición sale del rótulo de esa fila (prefijo literal de la celda o
   de la celda vecina con texto). Debe no coincidir con ninguna fila de producto de los ejemplos. Si el título
   no tiene un literal que lo distinga de los productos (p. ej. «MATERIA PRIMA» en la misma columna que los
   productos y sin prefijo común), queda la ambigüedad `seccion`.
7. **Inicio de datos**: `primeraFilaDatos` = índice de grilla de la primera fila (desde arriba) que cumple el
   ancla o la sección; `filaEncabezado` = `primeraFilaDatos − 1`. Así el preámbulo queda fuera y no hay
   contenido entre el encabezado y los datos.
8. **Tipo**: sin campo Tipo ni sección, se conserva la pregunta existente `modo_tipo` (inventario global).

## 7. Verificación, incidencias e IA

### 7.1 Los ejemplos como prueba
`verificarEjemplos(trazas, modelo)` (`asistencia/verificar-ejemplos.ts`, puro): cada producto del usuario debe
aparecer como una traza `registro` con los mismos campos, en las mismas celdas y con el mismo valor
(recortado). Cualquier diferencia → error preciso («la regla toma “001 Tornillo” como referencia del producto
de la fila 14; tú marcaste “001”») y `listoParaBorrador = false`.

### 7.2 Incidencias estructuradas
Hoy el motor solo devuelve textos de error. Se agrega `incidencias: { fila; columna?; tipo; mensaje }[]` a
`ResultadoLecturaEstructurada` (sin quitar `errores`): contenido sin interpretar, registro incompleto, signo
sin leer, campo ilegible. La UI las pinta en la grilla y ofrece **«Usar como ejemplo»**, que abre un producto
nuevo en la tabla de destino y lleva la grilla a esa fila.

### 7.3 IA de respaldo
Solo si el deductor deja ambigüedades que no puede resolver (ancla, sección) **y** el modelo cambió desde la
última consulta (huella del modelo en la continuación firmada):
- `EntradaAsistenciaInventario.ejemplosUsuario`: los productos ya verificados por el servidor (coordenadas de
  grilla + texto real) y el spec parcial deducido como `specAnterior`.
- Una línea nueva del prompt: los productos armados por el usuario son obligatorios y la regla debe
  reproducirlos.
- `evaluar(spec)` exige `estructuraValida && verificarEjemplos(...).ok`. Una propuesta que no los reproduce
  nunca se muestra como válida.
- El consumo se registra como hoy (`registrarConsumoIA`, módulo INV).

### 7.4 Origen y confirmación
Una regla deducida de los ejemplos tiene origen `manual`; si la propuso la IA, `ia`. Se mantiene la pregunta
`confirmar_lectura_estructurada`: los ejemplos que muestra (primero, medio y último) son otros productos y
confirman que la regla **generaliza**.

## 8. Fases

### Fase 0 · Refactor sin cambio de comportamiento
- Extraer de `extraer()` la función pura `aplicarSelector(texto, selector)` y exportarla. El motor y el
  deductor usarán la misma.
- Exportar `tokenNumerico`.
- Agregar `incidencias` estructuradas (§7.2) sin alterar `errores`.
- Gate: `lectura-estructurada.test.ts`, `validar.test.ts`, `resolver.test.ts` y `ia.test.ts` en verde, y `npx tsc --noEmit`.

### Fase 1 · Contrato y deductor (puro)
- `modelo-usuario.ts` (esquema, helpers, `modeloDesdeLectura`).
- `deducir-lectura.ts` y `verificar-ejemplos.ts`, cada uno con su `.test.ts`.
- Fixtures en memoria: tabular por columnas; una celda con separadores; una con rótulos; un producto en
  3 filas con secciones; `columnaInicial = 2` con filas vacías intercaladas; desplazamientos incoherentes;
  un solo ejemplo ambiguo; totales y filas ignoradas.
- **Aceptación offline (sin IA)** con las muestras versionadas
  `outputs/pruebas-inventario-siesa/04_…` y `05_…`: con **un** producto armado (más el título de sección
  en la 05) se deduce la regla y `validarLecturaInventario` da 18 registros, 19.140.500, total declarado
  19.140.500 y diferencia 0 (las mismas cifras que exige `ia-flexible-live.test.ts`).

### Fase 2 · Servidor
- Acción nueva `ventanaMuestraPatron(formData)`: archivo, hoja, `desde`, `cantidad` (≤ 200 filas, ≤ 60
  columnas) y `specJson` opcional. Devuelve celdas con fila física y letra real (texto hasta 2.000
  caracteres, con marca de truncado), las trazas e incidencias **de esa ventana** y la lista total de
  incidencias (tope de 200). Usa el permiso `perfiles_carga:administrar`, igual que el resto de patrones.
- `asistirMuestraPatronInventario`: campo `modeloJson`. Flujo: parsear → `deducirLectura` → si hay spec,
  `validarLecturaInventario` + `verificarEjemplos` y responder **sin IA**; si hay ambigüedades, llamar al
  resolver con `forzarIA` y `ejemplosUsuario` solo si cambió la huella. Un modelo nuevo invalida las
  respuestas estructurales previas, como ya hace `specManualJson`.
- `EstadoMuestra` + `huellaModelo`.
- Pruebas en `patrones-modulo-asistencia.test.ts`: deducible ⇒ 0 llamadas IA; ambiguo ⇒ la IA recibe los
  ejemplos; una propuesta de IA que no reproduce los ejemplos se rechaza; coordenadas manipuladas se
  rechazan; reenviar el mismo modelo no repite IA.

### Fase 3 · UI en `patrones/nueva`
Carpeta `src/app/(app)/modulos/[codigo]/constructor-lectura/`:
- `grilla-muestra.tsx`: ventana de filas con encabezados fijos (letras y números reales). Las letras de
  columna se arrastran (columna entera); las celdas se arrastran o se seleccionan con clic; el número de
  fila abre el menú Total / Subtotal / Sección / Ignorar. Superposición por colores: celdas usadas por cada
  campo, filas leídas e incidencias en rojo. Navegación: anterior/siguiente e «Ir a fila».
- `inspector-celda.tsx`: el texto completo de la celda elegida en un `<textarea readonly>`. Con una
  selección aparecen la ficha arrastrable y los botones «Asignar a: …» (la alternativa con clic).
- `tabla-destino.tsx`: columnas fijas del módulo y una fila por producto de ejemplo (agregar/quitar, hasta 5).
  Cada celda es zona de soltar y muestra el valor y su origen («A14 · “Ref: 001” [5–8]») con su X.
  Debajo, las marcas: secciones, totales, filas y columnas ignoradas, con su motivo.
- `constructor-lectura.tsx`: estado del modelo (con los helpers puros), avisos al soltar y
  «Reprocesar todo el archivo».
- Integración en `asistencia-muestra-panel.tsx` / `editor-patron-client.tsx`: el constructor se abre solo
  cuando la lectura tiene errores, preguntas `ia_*` o no tiene spec; si no, queda plegado tras «Corregir
  armando un ejemplo». Siempre llega **precargado** (`modeloDesdeLectura`). Lado a lado en escritorio y
  apilado en pantallas angostas. El cuadro de texto sigue y viaja junto con el modelo.
- Verificación visual con datos ficticios (página temporal pública + Playwright, según la memoria del
  proyecto; limpiar `.next/dev/types` al terminar).

### Fase 4 · Asistencia del cargue
Reutilizar los componentes en `asistencia-inventario-panel.tsx` con el original conservado como fuente:
ventana con verificación de alcance por cliente y el `modelo` en `prepararBorradorInventario`. Rigen las
reglas de revisión vigentes (propuesta → aplicar sustituye el staging; «Conservar lectura actual»).

### Fase 5 · Cierre
- Documentar en `CLAUDE.md` (sección «Asistencia de lectura de Inventarios»).
- `npx tsc --noEmit`, `npm run lint` y `npm run test`.
- Clasificación de versión: **minor** (capacidad nueva para usuarios).
  `npm run version:release -- --bump minor --title "…" --db` solo crea el borrador; publicar le corresponde
  a un administrador.
- Sin commit, tag ni push salvo pedido expreso.

## 9. Seguridad

- Zod estricto con topes en el modelo; texto y cifras siempre leídos del archivo en el servidor.
- Coordenadas validadas contra la grilla; un tramo fuera del texto se rechaza.
- La gramática sigue sin ejecutar código, expresiones ni regex; el deductor solo produce literales.
- La continuación firmada sigue ligada a usuario, aplicativo y SHA-256 del archivo; se le suma la huella del modelo.
- Fase 4: la ventana sobre un original de cliente verifica alcance igual que hoy.

## 10. Criterios de aceptación

1. Muestra 04: un producto armado arrastrando pedazos del texto → regla deducida sin IA → 18 registros, 19.140.500 y diferencia 0.
2. Muestra 05: un producto de varias filas + título de sección → mismo resultado.
3. Muestra tabular 01: arrastrar columnas produce un spec clásico que lee igual que el actual.
4. Nunca se ofrece guardar una regla que no reproduzca los ejemplos del usuario.
5. Reenviar el mismo modelo no consume IA.
6. Guardado el patrón, un archivo del mismo formato se lee con él y sin IA (comportamiento existente).
7. Todo gesto tiene equivalente con clic; ningún modal se cierra con Escape ni con clic fuera.

## 11. Riesgos y límites

- **Expresividad de la gramática**: las condiciones solo miran un literal en una columna. Si el inicio de
  producto o la sección no se distinguen así, el deductor lo dice y pasa a IA; si la IA tampoco puede, queda
  pendiente. Ampliar la gramática (negrita, «fila con una sola celda») queda fuera de este plan.
- **Un solo ejemplo** puede ser ambiguo al elegir cómo se separa el texto: se pide un segundo producto en
  vez de adivinar.
- **Rendimiento**: cada ventana vuelve a leer el archivo, igual que las acciones actuales. Si molesta, una
  caché corta por SHA-256 queda como mejora opcional.
- **Arrastre HTML5** no funciona en táctil ni con teclado: lo cubre el equivalente con clic.

## 12. Fuera de alcance

- Otros módulos (no usan `lecturaEstructurada`; ya tienen `EditorMapeoModulo`).
- Edición de versiones existentes y «Nueva a partir de esta».
- Guardar los ejemplos del usuario junto con la versión (posible mejora: evidencia para auditoría).
