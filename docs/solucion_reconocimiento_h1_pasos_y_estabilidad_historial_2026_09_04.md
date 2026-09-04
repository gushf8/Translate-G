# Documentación Técnica: Reconocimiento Estructural de Hipótesis (H0/H1), Pasos Académicos y Estabilidad del Historial

**Fecha:** 4 de Septiembre de 2026  
**Módulos Afectados:** `src/modules/text-sanitizer.js`, `src/styles.css`  
**Aplicación:** Translate G (Tauri + Vanilla JS Desktop App)

---

## 1. Problema de Segmentación de Hipótesis (`H0:`, `H1:`) y Pasos de Word

### Descripción del Error
Al copiar textos académicos estructurados desde Microsoft Word, PDFs o páginas web con hipótesis formuladas paso a paso (ejemplo: pruebas de hipótesis correlacionales con pasos estadísticos y formulaciones $H_0$ y $H_1$), el traductor unificaba incorrectamente la segunda hipótesis (`H1:`) y los pasos (`Paso 1:`, `Paso 2:`) dentro del mismo párrafo de la línea anterior:

```text
// Texto Original en Word (Líneas separadas):
1.1.1. Hipótesis Específica 1
Paso 1: Planteamiento de hipótesis
H0: No existe una relación directa y significativa...
H1: Existe una relación directa y significativa...
Paso 2: Nivel de significancia

// Resultado Erróneo previo en Translate G:
1.1.1. Hipótesis Específica 1
Paso 1: Planteamiento de hipótesis
H0: No existe una relación directa... Chilca - 2026. H1: Existe una relación directa...
Paso 2: Nivel de significancia
```

### Causa Raíz Técnica
1. **Falta de dígitos en el reconocedor de encabezados por dos puntos (`isSpeaker`):**
   La expresión regular original encargada de detectar rótulos con dos puntos era:
   ```javascript
   const isSpeaker = /^[A-ZÁÉÍÓÚÑa-záéíóúñ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{0,25}:(?!\/)\s*/.test(current);
   ```
   Esta expresión **excluía estrictamente los dígitos `0-9`**. Como resultado:
   - `H0:` y `H1:` fallaban por contener el dígito `0` y `1`.
   - `Paso 1:` y `Paso 2:` fallaban por contener números.
   - Al no ser identificados como viñetas (`isBullet`), ni como listas numeradas estándar con punto (`isNumberedList`), ni como títulos sin punto, caían en la regla de **desenvolvimiento de oraciones suaves** (*soft line break unifier*), fusionándose a la línea previa.

2. **Confusión entre elementos estructurales y encabezados puros (`isPrevHeading`):**
   Cuando `prev` contenía un rótulo como `H0: No existe una relación...`, si la primera línea de la hipótesis era menor a 60 caracteres, el verificador previo la trataba como un título en lugar de un párrafo con contenido, impidiendo que las siguientes líneas de la misma hipótesis se unieran fluidamente.

---

## 2. Solución Implementada: Detector Estructural Dual

Se diseñaron e integraron dos funciones especializadas en [`src/modules/text-sanitizer.js`](../src/modules/text-sanitizer.js):

### A. Función `isStructuralLine(line)`
Identifica cualquier línea que represente un nuevo elemento autónomo que **debe comenzar en su propia línea**:

```javascript
export function isStructuralLine(line) {
    if (!line) return false;
    const trimmed = line.replace(/<[^>]+>/g, '').trim();
    if (!trimmed) return false;
    
    // 1. Viñetas (-, *, •, +, >, ▪, ▫, –, —)
    if (/^[-*•+>▪▫–—]\s+/.test(trimmed)) return true;
    
    // 2. Listas numeradas y jerárquicas (1., 1.1, 1.1.1, (1), 1), a., a), (a), i., I.)
    if (/^(\(?\d+[\.\)]|\(?[a-zA-Z][\.\)]|\d+(\.\d+)+[\.\)]?|[IVXLCDM]+[\.\)])\s+/i.test(trimmed)) return true;
    
    // 3. Rótulos con dos puntos incluyendo dígitos y símbolos (H0:, H1:, Ha:, Paso 1:, Step 1:, Nota:, Fuente:, Speaker 1:, Q:)
    if (/^[A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s_\-\.\(\)\/]{1,35}:(?!\/)/i.test(trimmed)) return true;
    
    // 4. Encabezados Markdown (# Title) o negritas HTML (<b>Title</b>)
    if (/^#{1,6}\s+/.test(trimmed) || /^<b>[^<]{2,60}<\/b>$/.test(line.trim())) return true;
    
    // 5. Títulos cortos autónomos (< 60 caracteres)
    if (trimmed.length < 60) {
        const isCapitalized = /^[A-ZÁÉÍÓÚÑ0-9]/.test(trimmed);
        const endsWithPunct = /[,;\-–—]$/.test(trimmed);
        const endsWithConjunction = /\b(y|e|o|u|que|de|en|con|para|por|el|la|los|las|un|una|and|or|to|with|for|of|in|the|a|an)\s*$/i.test(trimmed);
        
        if (isCapitalized && !endsWithPunct && !endsWithConjunction) {
            if (/^(cap[ií]tulo|secci[oó]n|resumen|abstract|introducci[oó]n|conclusi[oó]n|m[eé]todo|hip[oó]tesis|paso|step|etapa|fase|tabla|figura|anexo)/i.test(trimmed)) {
                return true;
            }
            if (/^(\d+[\.\)]|\d+(\.\d+)+)/.test(trimmed)) {
                return true;
            }
            if (/^[A-Z0-9\sÁÉÍÓÚÑ\-:]{3,50}$/.test(trimmed) && trimmed.length >= 3) {
                return true;
            }
        }
    }
    return false;
}
```

### B. Función `isHeadingLine(line)`
Distingue títulos y subtítulos independientes para evitar que el texto subsiguiente se pegue al título, sin bloquear la unión de oraciones dentro del cuerpo de una hipótesis o párrafo:

```javascript
export function isHeadingLine(line) {
    if (!line) return false;
    const trimmed = line.replace(/<[^>]+>/g, '').trim();
    if (!trimmed || trimmed.length > 70) return false;
    if (/^#{1,6}\s+/.test(trimmed) || /^<b>[^<]{2,60}<\/b>$/.test(line.trim())) return true;
    if (/^(\d+[\.\)]|\d+(\.\d+)+|[IVXLCDM]+[\.\)])\s+[A-ZÁÉÍÓÚÑ]/.test(trimmed) && !trimmed.endsWith('.')) return true;
    if (/^(cap[ií]tulo|secci[oó]n|resumen|abstract|introducci[oó]n|conclusi[oó]n|m[eé]todo|paso\s*\d+|step\s*\d+|etapa\s*\d+|fase\s*\d+)/i.test(trimmed) && !trimmed.endsWith('.')) return true;
    if (/^[A-Z0-9\sÁÉÍÓÚÑ\-:]{4,60}$/.test(trimmed) && !/[,;.]$/.test(trimmed)) return true;
    return false;
}
```

---

## 3. Corrección y Blindaje del Panel de Historial

### Diagnóstico del Desplazamiento
En pantallas de alta resolución o ventanas redimensionadas:
1. El panel `.tf-history-pane` utilizaba `flex: 0.8;` sin ancho fijo delimitado, lo que provocaba que se estirara o comprimiera de forma desproporcionada.
2. El contenedor `.tf-history-list` carecía de `overflow-x: hidden;`, `width: 100%;` y `flex-wrap: nowrap;`.
3. Al renderizarse los elementos con texto recortado (`truncate`), los ítems se desalineaban en dos columnas visuales desordenadas y el botón de papelera (`.tf-delete-btn`) se desplazaba debajo del texto en lugar de permanecer alineado a la derecha.

### Corrección en [`src/styles.css`](../src/styles.css)
- Se fijó el ancho del panel lateral de historial a `width: 320px; min-width: 280px; max-width: 360px; flex: 0 0 320px; box-sizing: border-box; overflow: hidden;`.
- Se configuró `.tf-history-list` con `flex-wrap: nowrap; overflow-x: hidden; width: 100%;`.
- Se reforzó `.tf-history-item` con `display: flex; flex-direction: row; justify-content: space-between; align-items: center; width: 100%; flex-shrink: 0; box-sizing: border-box;`.
- Se añadieron `overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; display: block;` a `.tf-history-orig` y `.tf-history-trans`.

---

## 4. Matriz de Validación y Resultados

| Caso de Prueba | Entrada | Comportamiento Obtenido | Estado |
| :--- | :--- | :--- | :--- |
| **Encabezado Jerárquico** | `1.1.1. Hipótesis Específica 1` | Se mantiene como línea / título independiente | ✅ Resuelto |
| **Paso Enumerado** | `Paso 1: Planteamiento de hipótesis` | Se mantiene como línea independiente | ✅ Resuelto |
| **Hipótesis Nula y Alterna** | `H0: No existe...` seguido de `H1: Existe...` | `H0:` y `H1:` inician en líneas separadas sin unirse | ✅ Resuelto |
| **Párrafo con saltos blandos** | Líneas partidas dentro de una hipótesis | Se unifican fluidamente con espacios y guiones limpios | ✅ Resuelto |
| **Panel de Historial** | Múltiples traducciones guardadas | Lista vertical limpia de 1 sola columna, tarjetas alineadas y botón papelera a la derecha | ✅ Resuelto |
