# Translate-G 🌐⚡

> Traductor de escritorio ultraligero y de alta velocidad para Windows, construido con **Tauri v2** y **Rust**. Integra el motor de Google Translate sin necesidad de API keys, cuenta con atajos globales, detección inteligente bidireccional de idiomas (Smart Swap) y formateo avanzado de texto.

---

## ✨ Características Principales

- 🚀 **Ultraligero y Veloz**: Desarrollado con Rust + WebView2 nativo de Windows (consumo mínimo de memoria RAM y arranque inmediato).
- 🔑 **Cero Configuración / Sin API Keys**: Traducciones directas mediante peticiones HTTP móviles optimizadas con segmentación automática de bloques de texto.
- 🔄 **Smart Swap (Detección Bidireccional)**: Detecta automáticamente el idioma de entrada y alterna dinámicamente entre Español ↔ Inglés (u otros idiomas configurados).
- ⌨️ **Atajos Globales de Teclado**: Traduce texto seleccionado o abre la ventana flotante instantáneamente desde cualquier aplicación en Windows.
- 🧹 **Limpiador Inteligente de Texto y LaTeX**: Corrige saltos de línea molestos de PDFs, espacios dobles y limpia código LaTeX/Markdown manteniendo la legibilidad.
- 🔊 **Text-to-Speech (TTS)**: Pronunciación de voz integrada para escuchar las traducciones.
- 🌙 **Diseño Moderno & Modo Oscuro**: Interfaz limpia, responsiva y adaptable a la productividad diaria.

---

## 🛠️ Tecnologías

- **Backend**: [Rust](https://www.rust-lang.org/) + [Tauri v2](https://v2.tauri.app/)
- **Frontend**: HTML5, CSS3 moderno (Vanilla) y JavaScript ES6+
- **Motor de Traducción**: Scraping optimizado directo de Google Translate

---

## 💻 Desarrollo y Compilación

### Prerrequisitos
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) y herramientas de compilación de C++ para Windows

### Ejecución en Desarrollo
```bash
npm install
npm run tauri dev
```

### Compilación para Producción (Instalador Windows)
```bash
npm run tauri build
```

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más información.
