# Documentación: Motor de Detección Multilingüe (Smart Swap) y Sanitizador Universal de LaTeX / IA

Este documento detalla la arquitectura técnica y las soluciones implementadas en **Translate G** para resolver tres desafíos críticos: la identificación proactiva de idiomas con intercambio inteligente (*Smart Swap*), la limpieza de artefactos complejos provenientes de IA / LaTeX / Overleaf (KaTeX, MathML y tildes rotas), y la calibración del espaciado vertical en el editor.

---

## 1. Detección Proactiva de Idiomas y Lógica de Intercambio (*Smart Swap*)

### Problema Anterior
1. **Detección Pasiva Rota:** El backend enviaba siempre la consulta a Google Translate asumiendo el Idioma Base (`sl=auto&tl=base_lang`). La decisión de conmutar al idioma secundario dependía de una comparación de cadenas idénticas (`cleanOriginal === cleanTranslated`). Si el texto de entrada contenía acentos corregidos, signos de puntuación o etiquetas LaTeX, la comparación fallaba y el texto permanecía en el idioma original sin traducir.
2. **Hardcoding en el Backend de Rust:** En `keyboard.rs`, la función de atajos globales utilizaba una heurística fija limitada a 8 palabras en español (`guess_if_spanish`), ignorando las preferencias del usuario (`settings.base_lang` y `settings.smart_lang`).
3. **Botón de Inversión Estático:** El botón de intercambio rápido forzaba `'en'` fijo en vez de considerar el idioma detectado.

### Arquitectura Implementada

```mermaid
graph TD
    A[Texto Ingresado / Pegado / OCR] --> B[Motor de Detección por Tokens: guessLangFromText]
    B --> C{¿Idioma detectado == Idioma Base?}
    C -- Sí (Ej: Español) --> D[Establecer Destino = Idioma Smart (Ej: Inglés)]
    C -- No (Ej: Inglés/Francés/Alemán) --> E[Establecer Destino = Idioma Base (Ej: Español)]
    D --> F[Petición a Google Translate: sl=auto, tl=smart_lang]
    E --> G[Petición a Google Translate: sl=auto, tl=base_lang]
    F --> H[Actualizar Badge: Idioma Detectado]
    G --> H
    H --> I[Fallback Bidireccional si resultado == entrada]
```

### Componentes Clave

1. **Reconocedor por Tokens y Scripts (`guessLangFromText` en JS / `guess_language` en Rust):**
   - **Reconocimiento por Alfabeto:** Detecta caracteres Japoneses (Hiragana `\u3040-\u309f`, Katakana `\u30a0-\u30ff`) y Chinos (Hanzi `\u4e00-\u9fff`).
   - **Diacríticos Distintivos:** Reconoce `¡`, `¿`, `ñ` (Español), `ß` (Alemán), `ã`, `õ` (Portugués), `œ`, `æ` (Francés).
   - **Diccionario Ponderado:** Evalúa listas de alta frecuencia para `es`, `en`, `fr`, `de`, `pt`, e `it`.
2. **Conmutación Inteligente Automática:**
   - Si el texto de entrada coincide con el **Idioma Base (Destino)** configurado (por defecto *Español*), la app conmuta automáticamente la traducción al **Idioma de Intercambio (Smart)** (por defecto *Inglés*).
   - Si el texto está en cualquier otro idioma, la traducción se dirige al **Idioma Base**.
3. **Sincronización Total con Atajos Globales y UI:**
   - Implementado en paralelo en [`src/main.js`](file:///c:/Users/gushf/Downloads/Aplicaciones%20con%20IA/Traductor-windows/src/main.js) (interfaz gráfica) y [`src-tauri/src/keyboard.rs`](file:///c:/Users/gushf/Downloads/Aplicaciones%20con%20IA/Traductor-windows/src-tauri/src/keyboard.rs) (traducción in-place con atajos de teclado).

---

## 2. Sanitizador Universal de LaTeX, KaTeX, MathJax e IA (ChatGPT / Overleaf)

Al copiar textos desde interfaces web modernas como ChatGPT o editores LaTeX como Overleaf, se generaban artefactos visuales y de traducción graves:

### Problemas Resueltos

| Artefacto Copiado | Causa Técnica | Solución en Translate G |
| :--- | :--- | :--- |
| `causalidad\text{causalidad}` | KaTeX genera una capa visible (`katex-html`) y una oculta (`katex-mathml`). Al extraer texto plano, ambas capas se concatenaban. | Supresión estricta de `<span class="katex-mathml">`, `<annotation>` y `<math>` antes de procesar el HTML. Deduplicación por regex: `([^\s\\]+)\s*\\text\{\1\}`. |
| `dina´mica`, `sinte´ticos` | KaTeX y OCR separan las vocales de los acentos agudos espaciados (`a` + `´`). | Función `fixBrokenAccents` que fusiona tildes sueltas y normaliza a Unicode NFC (`dinámica`, `sintéticos`). |
| `\text{...}`, `\textbf{...}` | Comandos de texto en bloque o fuera del modo matemático de LaTeX. | Conversión directa a texto limpio y etiquetas enriquecidas (`<b>`, `<i>`, `<u>`). |
| `$$...$$`, `\[...\]`, `\(...\)` | Delimitadores matemáticos de bloque e inline. | Procesamiento y conversión completa a caracteres Unicode matemáticos (~500 símbolos: letras griegas, operadores, matrices, flechas). |

---

## 3. Calibración del Espaciado Vertical en el Panel Original

### Diagnóstico del Espaciado Exagerado
Al pegar bloques de ecuaciones o listas provenientes de ChatGPT, la presencia de múltiples contenedores `<div>` y `<p>` anidados causaba que cada etiqueta inyectara aperturas y cierres `<br>`, resultando en hasta 6 saltos de línea consecutivos y creando múltiples elementos vacíos `<div class="tf-line tf-line-empty">`.

### Optimización en `sanitizeClipboardHtml` y `wrapSentences`
1. **Reemplazo No Redundante de Bloques:**
   - `<p>` y `<div>` de apertura ya no insertan saltos redundantes.
   - Las etiquetas de cierre `</p>` generan un salto de párrafo estándar (`<br><br>`), mientras que `</div>` genera un salto de línea simple (`<br>`).
2. **Fusión Inteligente de Espacios en Blanco:**
   - Se unifican secuencias de `<br>\n` para evitar que un salto de línea físico en el portapapeles se duplique al renderizarse.
   - Los elementos de lista y fórmulas consecutivas se mantienen en líneas adyacentes y compactas, igualando la estética del panel traducido.

---

## 4. Blindaje del Proceso de Compilación ([`compile.bat`](file:///c:/Users/gushf/Downloads/Aplicaciones%20con%20IA/Traductor-windows/compile.bat))

Para evitar fallos de compilación con el error `error: failed to remove file ... Acceso denegado (os error 5)` cuando la aplicación se encuentra activa en segundo plano o en la bandeja del sistema:
- Se añadió la terminación forzada preventiva al inicio del script:
  ```bat
  taskkill /f /im translate-g.exe >nul 2>&1
  ```
- Esto garantiza que ningún proceso bloquee los binarios de `src-tauri\target\release\` durante `tauri build`.

---

## 5. Configuración de Tipografía, Tamaño de Letra, Interlineado y Voz Femenina Predeterminada

1. **Tipografía Personalizable:**
   - Selección dinámica de fuentes: `Segoe UI (Sistema)`, `Inter`, `Roboto`, `Outfit`, `Open Sans` y `Monospace (Código)`.
   - Aplicación instantánea y reactiva en todo el DOM mediante la variable CSS `--tf-user-font`.
2. **Tamaño de Letra Dinámico:**
   - Rango ajustable mediante barra deslizante: **Mínimo 10 pt**, **Máximo 36 pt** (Predeterminado: 19 pt).
   - Controla en tiempo real la variable CSS `--tf-user-font-size` sobre `.tf-text-box`.
3. **Espaciado entre Líneas (Interlineado):**
   - Opciones: `1.0 (Compacto)`, `1.15 (Estándar/Predeterminado)` y `1.5 (Amplio)`.
   - Controla dinámicamente `--tf-user-line-height` afectando a los editores `.tf-text-box` y contenedores `.tf-line`.
4. **Preferencia Femenina Predeterminada:**
   - Tanto en el backend (`Settings` struct en Rust) como en el frontend (`main.js`), la voz por defecto se inicializa siempre como `female` (Microsoft Edge Neural TTS).

---

## 6. Cancelación Robusta de Captura de Pantalla OCR ([`src/ocr.html`](file:///c:/Users/gushf/Downloads/Aplicaciones%20con%20IA/Traductor-windows/src/ocr.html))

### Problema
En capturas de pantalla, presionar `Esc` o hacer `Clic Derecho` a veces no cancelaba la operación debido a que el DOM de WebView2 perdía el foco o porque los eventos de clic derecho eran interceptados por el menú contextual del navegador.

### Solución
1. **Comando Backend `cancel_ocr`:** Se implementó un comando nativo en Rust (`cancel_ocr`) que oculta la ventana de captura y desenfoca/muestra/enfoca la ventana principal directamente a nivel de sistema operativo.
2. **Listeners en Fase de Captura:**
   - `window.addEventListener('keydown', handleEscape, true)`
   - `window.addEventListener('keyup', handleEscape, true)`
   - `window.addEventListener('contextmenu', cancelOCR, true)`
   - `window.addEventListener('pointerdown', (e) => { if (e.button === 2) cancelOCR(); }, true)`
   - `window.addEventListener('mousedown', (e) => { if (e.button === 2) cancelOCR(); }, true)`
3. **Enfoque Automático:** Al recibir la señal `start-ocr-capture`, la ventana fuerza inmediatamente `window.focus()` y `document.body.focus()`.

---

## 7. Adaptación Geométrica del Sombreado al Interlineado Dinámico

### Problema
Al cambiar el interlineado a valores más compactos (como `1.0` o `1.15`), el sombreado al pasar el mouse por una oración (`syncHighlight`) usaba un relleno vertical fijo que sobresalía de la línea, montándose sobre el texto de las líneas superior e inferior y recortando la legibilidad.

### Solución
- Se eliminó el relleno vertical fijo en `.tf-sentence`.
- Se implementó `-webkit-box-decoration-break: clone` y `box-decoration-break: clone`, permitiendo que el sombreado se ajuste exactamente a la caja del glifo y a la altura de línea activa (`--tf-user-line-height`).
- Se creó la clase dedicada `.tf-sentence-highlighted` sincronizada con JavaScript mediante `classList`, garantizando que tanto en `1.0`, `1.15` como en `1.5`, el fondo sombreado respete la separación exacta del texto sin tapar las líneas vecinas.


