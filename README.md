# LRU con bits — paso a paso

Simulación visual e interactiva para **Sistemas Operativos** (algoritmos de reemplazo de páginas).
Toma **LRU**, le agrega **bits de referencia** a cada página y muestra, paso a paso, qué página sale y por qué.

## Cómo abrirlo

- **Sin instalar nada:** doble clic en `index.html`. Funciona directamente desde el disco (no usa módulos ES ni servidor).
- **Pruebas en el navegador:** abrir `tests.html`.
- **Pruebas en la terminal:** `node tests.js`.

### Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | La pantalla de la simulación |
| `styles.css` | Estilos tipo apuntes: blanco y negro, letra grande para proyectar; color solo con significado (rojo = fallo, verde = acierto, amarillo = paso actual) |
| `engine.js` | Motor de simulación, sin DOM. Se expone como `window.Motor` (y `module.exports` en Node) |
| `app.js` | Interfaz: pila, registro de bits, decisión, matriz, modo adivina, resultados |
| `tests.js` / `tests.html` | Pruebas hechas a mano (✔/✘), sin librerías |

## La idea

LRU exacto saca la página usada hace más tiempo, pero en hardware es caro: hay que mantener el orden completo de uso y reordenarlo en cada acceso. La propuesta es apoyarlo con **pocos bits por página**:

- **H: registro de historia de k bits.** En cada referencia se desplaza una posición a la derecha el H de **todas** las páginas en memoria. Luego, si la página referenciada ya estaba, se pone en 1 su bit más significativo. Una página que entra arranca con el bit más significativo en 1 (`10` con k=2).
- **C: contador de usos de c bits, saturado.** Sube en cada acierto (sin pasar de 2^c − 1). La página que entra arranca en 0.
- **Elección de la víctima:** se aplican reglas en orden. Cada regla deja solo las candidatas con el **menor** valor, y la última siempre es **LRU exacto** (la de uso más antiguo) para desempatar.
  - "Historia → Contador → LRU" (por defecto)
  - "Contador → Historia → LRU"
- **Costo:** k + c bits por página.
- Con k = 0 y c = 0 el resultado es exactamente LRU (está comprobado en las pruebas, víctima por víctima).

Orden exacto dentro de un paso: primero se desplaza H, después se elige la víctima con esos valores ya desplazados y por último entra la página nueva.

## Configuración elegida

**k = 2, c = 2, orden "Historia → Contador → LRU"**, o sea 4 bits por página.

### Resultados con la secuencia del profesor

Secuencia `7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0`, 3 marcos:

| Algoritmo | Fallos | % fallos | Aciertos | Bits/página |
|---|---|---|---|---|
| **Mi configuración (k=2, c=2)** | **9** | 56 % | 7 | 4 |
| LRU puro | 11 | 69 % | 5 | orden exacto |
| FIFO | 12 | 75 % | 4 | 0 |
| MRU | 14 | 88 % | 2 | orden exacto |
| Óptimo (Belady) | 8 | 50 % | 8 | no realizable |

Con la secuencia extendida de 20 referencias (`… 1 7 0 1`) da **10 fallos** frente a 12 de LRU puro.

Dónde ganan los bits (pasos 10 y 14): LRU puro sacaría la 0, pero la 0 tiene el contador más alto (se ha usado varias veces), mientras que la candidata que empata con ella en historia tiene menos usos. Sale la página menos usada y la 0, que vuelve enseguida, se queda.

### Con secuencias aleatorias

Con secuencias aleatorias no siempre gana. Medido con 1000 secuencias del mismo generador (16 referencias, 3 marcos):

| | Gana a LRU | Empata | Pierde | Fallos promedio (bits / LRU) |
|---|---|---|---|---|
| k=2, c=2, H→C→LRU | 23 % | 45 % | 32 % | 9,38 / 9,17 |

Hay dos motivos:
1. Con pocos marcos, un H de 2 bits que se desplaza en **cada** referencia reproduce casi el mismo orden que LRU. Por eso, casi siempre, quien decide es C.
2. C nunca baja. Cuando cambia el grupo de páginas activas, las páginas viejas con muchos usos quedan "protegidas" y se sacan las nuevas. Es el problema clásico de los contadores de frecuencia.

El botón **"Probar 100 secuencias aleatorias"** de la aplicación muestra esto mismo para la semilla actual.

## La pantalla

- **Encabezado:** marcos (1–6) y configuración (LRU puro, mi configuración o personalizada con k, c y orden).
- **Secuencia:** siempre aleatoria, 16 referencias de un dígito (páginas 0–9). Se genera al cargar y con **Nueva secuencia** (tecla `N`). La semilla se muestra y se guarda en la URL (`?semilla=12345`) para repetir exactamente la misma secuencia al sustentar. El enlace "Usar la secuencia del profesor" carga el caso de clase (`?secuencia=profesor`).
- **Controles:** anterior, siguiente, reproducir/pausar, reiniciar y velocidad (lenta, normal, rápida). Al reproducir, cada paso se queda en pantalla al menos 3,8 s / 2,4 s / 1,1 s según la velocidad. En los reemplazos se suma el tiempo que tardan en aparecer las reglas, para que la explicación se alcance a leer completa.
- **Atajos:** `←` `→` `espacio` `N`. Si el foco está en un botón o en una casilla de verificación, espacio activa ese control, como en cualquier página. En una casilla de la secuencia, Enter o espacio saltan a ese paso.
- **Pila LRU:** la página más reciente arriba. En un fallo se ve la víctima salir y, si es distinta, la etiqueta "LRU puro sacaría esta".
- **Registro de bits:** H y C en casillas, con la animación del desplazamiento.
- **Decisión:** las reglas numeradas, con las candidatas tachadas y la frase final.
- **Matriz paso a paso:** como en el tablero. Clic en una columna para saltar a ese paso. Se exporta a CSV.
- **Modo adivina:** antes de cada reemplazo pregunta "¿Qué página sale?" y lleva la cuenta. Se puede responder con un clic o con la tecla del número. El puntaje se reinicia con cada secuencia nueva.
- **Resultados:** tabla comparativa, barras de fallos, línea de fallos según marcos (1–6) y la prueba de 100 secuencias.

### Generador de secuencias

- Usa mulberry32 con semilla.
- Tiene 2 o 3 fases (el grupo activo cambia 1 o 2 veces). Cada fase usa un grupo de 3–4 páginas "activas" y conserva una página del grupo anterior.
- Cada referencia sale del grupo activo con probabilidad 0,75; si no, sale de cualquier página entre 0 y 9.
- Garantiza al menos **marcos + 2** páginas distintas. Si faltan, cambia algunas referencias por páginas que no aparecen.

## Decisiones tomadas donde el enunciado era ambiguo

- **Cambiar el número de marcos** vuelve a generar la secuencia con la misma semilla. Casi siempre sale idéntica: solo cambia si hace falta reparar para tener marcos + 2 páginas distintas. La URL guarda `semilla` y `marcos`.
- **Cambiar la configuración** mantiene el paso actual, para comparar la decisión en el mismo punto. Cambiar la secuencia vuelve al paso 0.
- **Desempate del Óptimo:** si varias páginas no se vuelven a usar, sale la que entró primero. No cambia el número de fallos.
- **Con "LRU puro" seleccionado**, la tabla, las barras y la prueba de 100 secuencias no repiten la fila de LRU, porque saldría idéntica.
- **"Bits por página"** de LRU y MRU exactos aparece como "orden exacto", porque necesitan la pila completa o una marca de tiempo.
- **CSV:** separado por `;` y con BOM UTF-8, para que Excel en español lo abra bien.
- **Prueba de 100 secuencias:** usa semillas derivadas de la semilla actual, así que también se puede repetir.
- **`prefers-reduced-motion`:** se desactivan las animaciones.

## Publicar en GitHub Pages

1. Sube la carpeta al repositorio (por ejemplo `Exposicion/`).
2. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. La página queda en `https://<usuario>.github.io/<repositorio>/Exposicion/`.
   Si prefieres que quede en la raíz, crea un repositorio solo con estos archivos.

No hay paso de compilación: los archivos se publican tal cual.
