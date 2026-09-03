# Documentación: Inicio Automático y Limpieza Inteligente de Textos (OCR y Escaneos)

Este documento detalla la implementación técnica de dos características críticas agregadas para mejorar la confiabilidad y la usabilidad de la aplicación **Translate G**: el sistema de inicio automático con Windows y el formateador inteligente de saltos de línea para textos escaneados o digitalizados.

---

## 1. Inicio Automático con Windows (Autostart)

Anteriormente, el inicio automático manipulaba directamente el Registro de Windows en `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`. Este enfoque causaba fallos porque:
- **Bloqueos de Antivirus:** Windows Defender y otros antivirus modernos bloquean las modificaciones directas a la clave `Run` realizadas por binarios no firmados digitalmente.
- **Diferencia de Permisos (Admin vs. Usuario):** Al ejecutar el instalador NSIS como Administrador, el primer inicio de la app heredaba estos privilegios altos, escribiendo la entrada de autostart en el registro del Administrador y no en el del usuario estándar.

### Implementación Actual
Se reemplazó el acceso al Registro por la creación de un **Acceso Directo (`.lnk`)** en la carpeta de Inicio de Windows (`Startup folder`):

- **Ruta del archivo:** `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\TranslateG.lnk`
- **Comportamiento en Rust ([lib.rs](file:///c:/Users/gushf/Downloads/Aplicaciones%20con%20IA/Traductor-windows/src-tauri/src/lib.rs)):**
  - **`set_autostart(true)`:** Invoca de manera silenciosa (ocultando la ventana de consola con `0x08000000` en Windows) un comando PowerShell que usa el objeto COM `WScript.Shell` para crear el archivo `.lnk`. El acceso directo apunta al ejecutable actual (`std::env::current_exe()`) e incluye el parámetro de inicio minimizado `--startup`.
  - **`set_autostart(false)`:** Elimina el archivo `.lnk` de la carpeta de inicio si existe.
  - **`check_autostart_enabled()`:** Comprueba simplemente la existencia del archivo `.lnk` en la ruta mencionada.

---

## 2. Limpieza Inteligente de Saltos de Línea (OCR, PDFs y Escaneos)

Cuando se realiza OCR sobre una captura de pantalla, se copia texto de columnas de páginas web, o se copia de documentos PDF con formato de columnas, es muy común que el texto venga plagado de saltos de línea artificiales (rupturas físicas en medio de una oración). 

Esto no solo hace que el texto original luzca mal en la interfaz, sino que también degrada la calidad de la traducción porque los traductores automáticos interpretan los saltos como el final de una idea o los traducen línea por línea.

### Algoritmo de Limpieza ([main.js](file:///c:/Users/gushf/Downloads/Aplicaciones%20con%20IA/Traductor-windows/src/main.js))

Se ha implementado la función `cleanOcrAndScanText(text)` que procesa y une el texto de la siguiente forma:

1. **Normalización:** Convierte todos los saltos de línea a formato de Unix (`\n`).
2. **Evaluación Línea por Línea:** Recorre las líneas y decide si debe unirlas con la anterior:
   - **Saltos Artificiales (Unión):** Si la línea actual es continuación de la anterior, las une reemplazando el salto de línea por un espacio en blanco (` `).
   - **Palabras Cortadas por Guion:** Si la línea anterior termina en guion (ej. `auto-\nmatico`), remueve el guion y une las palabras directamente (`automatico`).
   - **Saltos de Línea Legítimos (Preservación):** Mantiene la línea separada si se cumple alguna de las siguientes reglas:
     - Es un salto de párrafo real (línea en blanco).
     - La línea actual empieza con un indicador de lista/viñeta (`-`, `*`, `•`, `o`, `+`).
     - La línea actual empieza con una numeración o letra de lista (`1.`, `2.`, `a.`, `b.`, etc.).

### Flujo en la Aplicación
El formateador se ejecuta automáticamente en tres puntos clave:
1. **Captura de OCR Global:** Al recibir el texto reconocido visualmente.
2. **Doble Ctrl+C:** Al abrir el traductor flotante con texto del portapapeles.
3. **Pegado Manual (`onpaste`):** Cuando el usuario pega texto usando `Ctrl + V` en el cuadro de texto original.
