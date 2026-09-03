<div align="center">

# Translate-G

**Traductor de escritorio ultraligero, rápido y sin fricción para Windows.**

[![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?style=flat-square&logo=windows&logoColor=white)](https://github.com/gushf8/Translate-G)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8D8?style=flat-square&logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-Backend-orange?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald?style=flat-square)](LICENSE)
[![ORCID](https://img.shields.io/badge/ORCID-0009--0006--6570--2582-A6CE39?style=flat-square&logo=orcid&logoColor=white)](https://orcid.org/0009-0006-6570-2582)

<p align="center">
  Diseñado para usuarios, investigadores y desarrolladores que requieren traducción instantánea de documentos técnicos, fragmentos de código y texto en pantalla sin el consumo de memoria de clientes pesados ni depender de API Keys de pago.
</p>

</div>

---

## ⚡ Aspectos Destacados

* **Sin API Keys**: Conexión directa y eficiente con el motor de Google Translate mediante peticiones ligeras y segmentación inteligente de textos extensos.
* **Smart Language Swap**: Reconocimiento automático bidireccional de idioma de entrada y destino para alternar sin interrupciones.
* **Atajos Globales**: Invocación y traducción inmediata desde cualquier ventana o aplicación en Windows mediante atajos de teclado configurables.
* **Limpieza Técnica de Texto**: Normalización de saltos de línea irregulares en PDFs, eliminación de espacios superfluos y preservación de sintaxis en fórmulas o fragmentos técnicos.
* **Consumo Mínimo de Recursos**: Construido sobre Rust y Microsoft WebView2 nativo, garantizando una huella de memoria RAM significativamente inferior frente a alternativas basadas en Electron.
* **Audio y Pronunciación**: Soporte Text-to-Speech (TTS) integrado para validación fonética inmediata.

---

## 🏗️ Arquitectura del Sistema

```
Translate-G/
├── src-tauri/             # Núcleo nativo de alta eficiencia en Rust
│   ├── src/translate.rs   # Motor de scraping HTTP optimizado y segmentación de texto
│   ├── src/keyboard.rs    # Registro y captura de atajos globales de Windows
│   └── src/ocr.rs         # Módulo de procesamiento y captura
├── src/                   # Interfaz de usuario desacoplada (HTML5 / Vanilla CSS / JS)
│   ├── modules/           # Módulos de persistencia, sincronización e intercambio inteligente
│   └── styles.css         # Sistema de diseño moderno con soporte de alto contraste
└── docs/                  # Documentación técnica y análisis de viabilidad
```

---

## 🚀 Inicio Rápido

### Prerrequisitos

* [Node.js](https://nodejs.org/) (versión 18 o superior)
* [Rust](https://www.rust-lang.org/) con la cadena de herramientas MSVC (`x86_64-pc-windows-msvc`)

### Instalación y Ejecución

```bash
# 1. Clonar el repositorio
git clone https://github.com/gushf8/Translate-G.git
cd Translate-G

# 2. Instalar dependencias del frontend
npm install

# 3. Iniciar en entorno de desarrollo
npm run tauri dev
```

### Generación del Instalador (.exe / .msi)

```bash
npm run tauri build
```

El instalador optimizado se generará en `src-tauri/target/release/bundle/`.

---

## 📄 Licencia

Distribuido bajo los términos de la **Licencia MIT**. Consulte el archivo [LICENSE](LICENSE) para conocer los términos completos de uso y distribución.

**Autor:** [Gustavo Fernando Huaman Fernandez](https://github.com/gushf8)  
**ORCID:** [0009-0006-6570-2582](https://orcid.org/0009-0006-6570-2582)  
**Filiación:** Universidad Nacional de Huancavelica (UNH)
