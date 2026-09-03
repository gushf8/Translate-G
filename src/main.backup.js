const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { WebviewWindow } = window.__TAURI__.webviewWindow;

// Language definition dictionary
const languages = {
    'auto': 'Detectar Idioma',
    'es': 'Español',
    'en': 'Inglés',
    'fr': 'Francés',
    'de': 'Alemán',
    'it': 'Italiano',
    'pt': 'Portugués',
    'ja': 'Japonés',
    'zh': 'Chino'
};

let currentSource = 'auto';
let currentTarget = 'es';
let baseDefaultTarget = 'es';
let smartTargetLang = 'en';
let voicePreference = 'female';

let lastSavedId = null;
let isManualInput = false;
let lastDetectedSource = null;
let inputTimer = null;
let currentSession = null;
let activeSpeakerButton = null;

// Initialize elements
const srcSelect = document.getElementById('tf-src-lang');
const targetSelect = document.getElementById('tf-target-lang');
const originalBox = document.querySelector('.tf-original');
const translationBox = document.querySelector('.tf-translation');
const historyList = document.querySelector('.tf-history-list');
const detectedLabel = document.getElementById('tf-detected-label');
const pronouncePopup = document.getElementById('tf-pronounce-popup');
const settingsBtn = document.querySelector('.tf-settings-btn');
const settingsModal = document.getElementById('tf-settings-modal');
const closeSettingsBtn = document.getElementById('tf-close-settings-btn');
const baseLangSelect = document.getElementById('tf-base-lang-select');
const smartLangSelect = document.getElementById('tf-smart-lang-select');
const fontFamilySelect = document.getElementById('tf-font-family-select');
const lineSpacingSelect = document.getElementById('tf-line-spacing-select');
const fontSizeSlider = document.getElementById('tf-font-size');
const fontSizeVal = document.getElementById('tf-font-size-val');
const genderBtns = document.querySelectorAll('.tf-gender-btn');
const ocrHeaderBtn = document.querySelector('.tf-ocr-header-btn');
const autostartToggle = document.getElementById('tf-autostart-toggle');
const disableCtrlCToggle = document.getElementById('tf-disable-ctrlc-toggle');
const voiceRateSlider = document.getElementById('tf-voice-rate');
const voiceRateVal = document.getElementById('tf-voice-rate-val');
const voicePitchSlider = document.getElementById('tf-voice-pitch');
const voicePitchVal = document.getElementById('tf-voice-pitch-val');


let disableCtrlCOnExtensionDetect = false;
let currentAudio = null;
let voiceRate = 1.0;
let voicePitch = 0.0;
let currentFontFamily = "'Segoe UI', system-ui, -apple-system, sans-serif";
let currentLineSpacing = "1.15";
let currentFontSize = 19;

function applyTypographySettings(fontFamily, lineSpacing, fontSize) {
    document.documentElement.style.setProperty('--tf-user-font', fontFamily);
    document.documentElement.style.setProperty('--tf-user-line-height', lineSpacing);
    document.documentElement.style.setProperty('--tf-user-font-size', `${fontSize}px`);
}

// TTS Queue & Accent state
let lastTranslationSourceLang = 'es';
let lastTranslationTargetLang = 'en';

let ttsQueue = [];
let ttsQueueIndex = -1;
let isTtsPaused = false;
let activeSpeakerSide = null; // 'original' or 'translation'
let activeSpeakingButton = null; // The play/pause button currently active

// Prefetch cache: Map<queueIndex, Promise<string>> — synthesizes next sentence in background
let ttsPrefetchCache = new Map();

// Start application
async function init() {
    // Generate Select Options
    srcSelect.innerHTML = generateLangOptions(currentSource);
    targetSelect.innerHTML = generateLangOptions(currentTarget, true);

    // Load settings from backend (rust state is loaded from settings.json)
    try {
        const settings = await invoke('get_settings');
        voicePreference = settings.voice_preference || 'female';
        baseDefaultTarget = settings.base_lang || 'es';
        currentTarget = settings.base_lang || 'es';
        smartTargetLang = settings.smart_lang || 'en';
        disableCtrlCOnExtensionDetect = settings.disable_ctrl_c_on_extension_detect || false;
        voiceRate = settings.voice_rate !== undefined ? settings.voice_rate : 1.0;
        voicePitch = settings.voice_pitch !== undefined ? settings.voice_pitch : 0.0;
        currentFontFamily = settings.font_family || "'Segoe UI', system-ui, -apple-system, sans-serif";
        currentLineSpacing = settings.line_spacing || "1.15";
        currentFontSize = (settings.font_size !== undefined && settings.font_size >= 10 && settings.font_size <= 36) ? settings.font_size : 19;

        // Apply settings in UI
        baseLangSelect.value = baseDefaultTarget;
        smartLangSelect.value = smartTargetLang;
        targetSelect.value = currentTarget;
        if (fontFamilySelect) fontFamilySelect.value = currentFontFamily;
        if (lineSpacingSelect) lineSpacingSelect.value = currentLineSpacing;
        if (fontSizeSlider) {
            fontSizeSlider.value = currentFontSize;
            if (fontSizeVal) fontSizeVal.innerText = `${currentFontSize} pt`;
        }
        applyTypographySettings(currentFontFamily, currentLineSpacing, currentFontSize);

        disableCtrlCToggle.checked = disableCtrlCOnExtensionDetect;
        voiceRateSlider.value = voiceRate;
        voiceRateVal.innerText = voiceRate.toFixed(1) + 'x';
        voicePitchSlider.value = voicePitch;
        voicePitchVal.innerText = (voicePitch > 0 ? '+' : '') + voicePitch;
        genderBtns.forEach(btn => {
            if (btn.dataset.gender === voicePreference) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    } catch (e) {
        console.error("Failed to load settings:", e);
    }

    // Load autostart setting
    try {
        const autostartEnabled = await invoke('is_autostart_enabled');
        document.getElementById('tf-autostart-toggle').checked = autostartEnabled;
    } catch (e) {
        console.error("Failed to load autostart setting:", e);
    }

    // Load and render history
    await loadAndRenderHistory();

    // Event listeners setup
    setupEvents();
    setupTauriListeners();
}

function generateLangOptions(selected, skipAuto = false) {
    return Object.entries(languages)
        .filter(([code]) => !skipAuto || code !== 'auto')
        .map(([code, name]) => `<option value="${code}" ${code === selected ? 'selected' : ''}>${name}</option>`)
        .join('');
}

/**
 * Determines which tf-sentence elements are covered by the current selection.
 * Returns an array of {text, index} objects ONLY when the selection clearly spans
 * multiple complete sentence spans. For partial selections within one sentence,
 * returns [] so the caller uses the raw selectedText directly.
 */
function extractSelectedSentences(selection, range, box) {
    const allSpans = Array.from(box.querySelectorAll('.tf-sentence'));
    if (allSpans.length === 0) return [];

    // Find which spans intersect the selection range
    const intersecting = allSpans.filter(span => {
        try {
            return range.intersectsNode(span);
        } catch (e) {
            return false;
        }
    });

    if (intersecting.length <= 1) {
        // Single span (or none): just speak the raw selected text
        return [];
    }

    // Multiple spans: check if the selection start is at the beginning of the first span
    // and end is at the end of the last span — indicating full sentence selection.
    // For partial multi-span selections, still speak exactly what was selected (return []).
    const firstSpan = intersecting[0];
    const lastSpan = intersecting[intersecting.length - 1];

    const startNode = range.startContainer;
    const endNode = range.endContainer;

    // Is the selection start at or before the first span's first character?
    const startInFirst = firstSpan.contains(startNode) || firstSpan === startNode;
    // Is the selection end at or after the last span's last character?
    const endInLast = lastSpan.contains(endNode) || lastSpan === endNode;

    if (!startInFirst || !endInLast) {
        // Selection crosses span boundaries but is partial — keep it as raw text
        return [];
    }

    // True multi-sentence selection: return each span's full text with its index
    return intersecting.map(span => ({
        text: span.innerText.trim(),
        index: span.dataset.index
    }));
}

function setupEvents() {

    // Select dropdowns
    srcSelect.onchange = (e) => {
        currentSource = e.target.value;
        updateTranslation();
    };
    targetSelect.onchange = (e) => {
        currentTarget = e.target.value;
        updateTranslation();
    };

    // Swap Button
    document.querySelector('.tf-swap-btn').onclick = () => {
        const oldSrc = srcSelect.value;
        const oldTarget = targetSelect.value;
        if (oldSrc === 'auto') {
            currentSource = oldTarget;
            currentTarget = lastDetectedSource || (oldTarget === baseDefaultTarget ? smartTargetLang : baseDefaultTarget);
        } else {
            currentSource = oldTarget;
            currentTarget = oldSrc;
        }
        srcSelect.value = currentSource;
        targetSelect.value = currentTarget;
        updateTranslation();
    };

    // Iniciar con Windows Toggle
    const autostartToggle = document.getElementById('tf-autostart-toggle');
    autostartToggle.onchange = async () => {
        try {
            await invoke('toggle_autostart', { enable: autostartToggle.checked });
        } catch (e) {
            console.error("Failed to toggle autostart:", e);
            autostartToggle.checked = !autostartToggle.checked;
        }
    };

    // Settings Modal Open/Close
    settingsBtn.onclick = () => {
        settingsModal.classList.remove('tf-hidden');
    };

    closeSettingsBtn.onclick = () => {
        settingsModal.classList.add('tf-hidden');
    };

    settingsModal.onclick = (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('tf-hidden');
        }
    };

    // Modal Tab Navigation
    const tabBtns = document.querySelectorAll('.tf-tab-btn');
    const tabPanes = document.querySelectorAll('.tf-tab-pane');

    tabBtns.forEach(btn => {
        btn.onclick = () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const targetTab = btn.dataset.tab;
            tabPanes.forEach(pane => {
                if (pane.id === `tf-tab-${targetTab}`) {
                    pane.classList.remove('tf-hidden');
                } else {
                    pane.classList.add('tf-hidden');
                }
            });
        };
    });

    // Disable Ctrl+C Toggle
    disableCtrlCToggle.onchange = async () => {
        disableCtrlCOnExtensionDetect = disableCtrlCToggle.checked;
        await saveSettings();
    };

    voiceRateSlider.oninput = async () => {
        voiceRate = parseFloat(voiceRateSlider.value);
        voiceRateVal.innerText = voiceRate.toFixed(1) + 'x';
        await saveSettings();
    };

    voicePitchSlider.oninput = async () => {
        voicePitch = parseInt(voicePitchSlider.value);
        voicePitchVal.innerText = (voicePitch > 0 ? '+' : '') + voicePitch;
        await saveSettings();
    };

    // Disable WebView2 default context menu (Inspeccionar, Emoji, etc. black dropdown)
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    baseLangSelect.onchange = async (e) => {
        baseDefaultTarget = e.target.value;
        currentTarget = e.target.value;
        targetSelect.value = e.target.value;
        await saveSettings();
        updateTranslation();
    };

    smartLangSelect.onchange = async (e) => {
        smartTargetLang = e.target.value;
        await saveSettings();
        updateTranslation();
    };

    if (fontFamilySelect) {
        fontFamilySelect.onchange = async (e) => {
            currentFontFamily = e.target.value;
            applyTypographySettings(currentFontFamily, currentLineSpacing, currentFontSize);
            await saveSettings();
        };
    }

    if (lineSpacingSelect) {
        lineSpacingSelect.onchange = async (e) => {
            currentLineSpacing = e.target.value;
            applyTypographySettings(currentFontFamily, currentLineSpacing, currentFontSize);
            await saveSettings();
        };
    }

    if (fontSizeSlider) {
        fontSizeSlider.oninput = async (e) => {
            currentFontSize = Math.min(36, Math.max(10, parseInt(e.target.value) || 19));
            if (fontSizeVal) fontSizeVal.innerText = `${currentFontSize} pt`;
            applyTypographySettings(currentFontFamily, currentLineSpacing, currentFontSize);
            await saveSettings();
        };
    }

    genderBtns.forEach(btn => {
        btn.onclick = async () => {
            genderBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            voicePreference = btn.dataset.gender;
            await saveSettings();
        };
    });

    // Clear Button
    document.querySelector('.tf-clear-btn').onclick = () => {
        stopSpeaking();
        cancelCurrentSession();
        originalBox.innerText = '';
        translationBox.innerHTML = '';
        originalBox.focus();
        lastSavedId = null;
        isManualInput = false;
        detectedLabel.classList.add('tf-hidden');
    };

    // Copy Button
    document.querySelector('.tf-copy-btn').onclick = (e) => {
        const text = translationBox.innerText;
        navigator.clipboard.writeText(text);
        const btn = e.currentTarget;
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1500);
    };

    // Original Input Text editing
    originalBox.oninput = () => {
        stopSpeaking();
        const text = originalBox.innerText.trim();
        if (text === '') {
            lastSavedId = null;
            isManualInput = false;
            detectedLabel.classList.add('tf-hidden');
        } else {
            isManualInput = true;
        }
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
            updateTranslation();
        }, 800);
    };

    // Paste with rich text preservation (bold, italic, line breaks, emoji)
    originalBox.onpaste = (e) => {
        e.preventDefault();
        stopSpeaking();
        if (originalBox.innerText.trim() === '') {
            lastSavedId = null;
            isManualInput = false;
        }

        // Try to get HTML first for rich formatting, fallback to plain text
        let html = (e.clipboardData || window.clipboardData).getData('text/html');
        let plainText = (e.clipboardData || window.clipboardData).getData('text');

        let insertContent = '';
        if (html && html.trim()) {
            insertContent = sanitizeClipboardHtml(html);
            insertContent = convertSlackShortcodes(insertContent);
            insertContent = cleanLatexAndAiArtifacts(insertContent);
            insertContent = renderMarkdownFormatting(insertContent);
        } else {
            insertContent = cleanOcrAndScanText(plainText);
            insertContent = convertSlackShortcodes(insertContent);
            insertContent = cleanLatexAndAiArtifacts(insertContent);
            insertContent = renderMarkdownFormatting(insertContent);
            insertContent = insertContent.replace(/\n/g, '<br>');
        }

        if (originalBox.innerText.trim() === '') {
            originalBox.innerHTML = wrapSentences(insertContent);
        } else {
            document.execCommand('insertHTML', false, insertContent);
        }

        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
            updateTranslation();
        }, 250);
    };

    // TTS voice reproduction original
    const inputAudioBtn = document.querySelector('.tf-audio-input-btn');
    inputAudioBtn.onclick = (e) => {
        if (activeSpeakerSide === 'original') {
            // Already playing original: cancel everything
            stopSpeaking();
        } else {
            stopSpeaking();
            
            // Gather sentences from original box
            const sentences = Array.from(originalBox.querySelectorAll('.tf-sentence'));
            if (sentences.length === 0) {
                const text = originalBox.innerText.trim();
                if (!text) return;
                ttsQueue = [{ text, lang: lastTranslationSourceLang }];
            } else {
                ttsQueue = sentences.map(span => ({
                    text: span.innerText.trim(),
                    index: span.dataset.index,
                    lang: lastTranslationSourceLang
                })).filter(item => item.text.length > 0);
            }
            
            if (ttsQueue.length === 0) return;
            
            activeSpeakerSide = 'original';
            activeSpeakingButton = inputAudioBtn;
            ttsQueueIndex = -1;
            inputAudioBtn.innerHTML = PAUSE_SVG;
            
            // Pre-fetch sentences 1+ while sentence 0 is being synthesized/played
            prefetchAhead(1, ttsQueue);
            playNextInQueue();
        }
    };

    // TTS voice reproduction translation
    const outputAudioBtn = document.querySelector('.tf-audio-btn');
    outputAudioBtn.onclick = (e) => {
        if (activeSpeakerSide === 'translation') {
            // Already playing translation: cancel everything
            stopSpeaking();
        } else {
            stopSpeaking();
            
            // Gather sentences from translation box
            const sentences = Array.from(translationBox.querySelectorAll('.tf-sentence'));
            if (sentences.length === 0) {
                const text = translationBox.innerText.trim();
                if (!text) return;
                ttsQueue = [{ text, lang: lastTranslationTargetLang }];
            } else {
                ttsQueue = sentences.map(span => ({
                    text: span.innerText.trim(),
                    index: span.dataset.index,
                    lang: lastTranslationTargetLang
                })).filter(item => item.text.length > 0);
            }
            
            if (ttsQueue.length === 0) return;
            
            activeSpeakerSide = 'translation';
            activeSpeakingButton = outputAudioBtn;
            ttsQueueIndex = -1;
            outputAudioBtn.innerHTML = PAUSE_SVG;
            
            // Pre-fetch sentences 1+ while sentence 0 is being synthesized/played
            prefetchAhead(1, ttsQueue);
            playNextInQueue();
        }
    };

    // Stop buttons click event setup (removed from HTML; play button now cancels)
    // originalStopBtn.onclick = () => stopSpeaking();
    // translationStopBtn.onclick = () => stopSpeaking();

    // Sentence-by-sentence highlight synchronization
    const syncHighlight = (e, isEnter) => {
        const sentence = e.target.closest('.tf-sentence');
        if (!sentence) return;
        const index = sentence.dataset.index;
        const targetSide = sentence.closest('.tf-input-side') ? '.tf-output-side' : '.tf-input-side';
        const mirror = document.querySelector(`${targetSide} .tf-sentence[data-index="${index}"]`);
        
        if (isEnter) {
            sentence.classList.add('tf-sentence-highlighted');
            if (mirror) mirror.classList.add('tf-sentence-highlighted');
        } else {
            sentence.classList.remove('tf-sentence-highlighted');
            if (mirror) mirror.classList.remove('tf-sentence-highlighted');
        }
    };
    document.addEventListener('mouseover', (e) => syncHighlight(e, true));
    document.addEventListener('mouseout', (e) => syncHighlight(e, false));

    // Pronunciation selection popup
    document.addEventListener('mouseup', (e) => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        if (selectedText && (e.target.closest('.tf-original') || e.target.closest('.tf-translation'))) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            pronouncePopup.style.left = `${rect.left + (rect.width / 2) - 40}px`;
            pronouncePopup.style.top = `${rect.top - 50}px`;
            pronouncePopup.classList.remove('tf-hidden');
            pronouncePopup.onclick = (pe) => {
                pe.stopPropagation();
                
                stopSpeaking();
                
                const side = e.target.closest('.tf-side');
                const isOriginal = side && side.classList.contains('tf-input-side');
                const lang = isOriginal ? lastTranslationSourceLang : lastTranslationTargetLang;
                
                // Always speak ONLY the exact selected text — never the full paragraph
                // Split by sentence boundaries only if the selection clearly spans multiple sentences
                const selectedSentenceTexts = extractSelectedSentences(selection, range, isOriginal ? originalBox : translationBox);
                
                if (selectedSentenceTexts.length > 1) {
                    // Multi-sentence selection: enqueue each sentence separately for highlighting sync
                    ttsQueue = selectedSentenceTexts.map((item, i) => ({
                        text: item.text,
                        index: item.index,
                        lang: lang
                    })).filter(item => item.text.length > 0);
                } else {
                    // Single selection (partial or full): speak exactly what was selected
                    ttsQueue = [{ text: selectedText, lang: lang }];
                }
                
                if (ttsQueue.length === 0) return;
                
                ttsQueueIndex = -1;
                activeSpeakerSide = isOriginal ? 'original' : 'translation';
                activeSpeakingButton = isOriginal ? document.querySelector('.tf-audio-input-btn') : document.querySelector('.tf-audio-btn');
                activeSpeakingButton.innerHTML = PAUSE_SVG;
                
                pronouncePopup.classList.add('tf-hidden');
                // Pre-fetch sentences 1+ immediately
                prefetchAhead(1, ttsQueue);
                playNextInQueue();
            };
        } else {
            pronouncePopup.classList.add('tf-hidden');
        }
    });


    // Quick Language select buttons
    document.querySelectorAll('.tf-quick-btn').forEach(btn => {
        btn.onclick = () => {
            const lang = btn.dataset.lang;
            const side = btn.dataset.side;
            if (side === 'src') {
                srcSelect.value = lang;
                currentSource = lang;
            } else {
                targetSelect.value = lang;
                currentTarget = lang;
            }
            updateTranslation();
        };
    });

    // OCR Button Click
    ocrHeaderBtn.onclick = () => triggerOCR();
}

async function saveSettings() {
    try {
        await invoke('save_settings', {
            newSettings: {
                voice_preference: voicePreference || 'female',
                base_lang: baseDefaultTarget,
                smart_lang: smartTargetLang,
                disable_ctrl_c_on_extension_detect: disableCtrlCOnExtensionDetect,
                voice_rate: voiceRate,
                voice_pitch: voicePitch,
                font_family: currentFontFamily,
                line_spacing: currentLineSpacing,
                font_size: currentFontSize
            }
        });
    } catch (e) {
        console.error("Failed to save settings:", e);
    }
}

async function triggerOCR() {
    try {
        await invoke('start_ocr');
    } catch (e) {
        console.error("Failed to start OCR:", e);
    }
}

function setupTauriListeners() {
    // Listen for text loaded via double Ctrl+C
    listen('open-translator-with-text', (event) => {
        const text = event.payload;
        loadTextAndTranslate(text);
    });

    // Listen for OCR result text
    listen('ocr-text-result', (event) => {
        const text = event.payload;
        loadTextAndTranslate(text);
    });

    // Listen for global OCR trigger event (Ctrl+Shift+X)
    listen('trigger-ocr', () => {
        triggerOCR();
    });
}

function loadTextAndTranslate(content) {
    if (!content || content.trim() === '') return;
    stopSpeaking();
    lastSavedId = null;
    isManualInput = false;

    let processedText = '';
    const hasHtmlTags = /<[a-z][\s\S]*>/i.test(content);
    
    if (hasHtmlTags) {
        processedText = sanitizeClipboardHtml(content);
        processedText = convertSlackShortcodes(processedText);
        processedText = cleanLatexAndAiArtifacts(processedText);
        processedText = renderMarkdownFormatting(processedText);
    } else {
        processedText = cleanOcrAndScanText(content);
        processedText = convertSlackShortcodes(processedText);
        processedText = cleanLatexAndAiArtifacts(processedText);
        processedText = renderMarkdownFormatting(processedText);
    }

    originalBox.innerHTML = wrapSentences(processedText);
    updateTranslation();
}

function cancelCurrentSession() {
    if (currentSession) {
        currentSession.cancelled = true;
        currentSession = null;
    }
}

function extractFormattedText(container) {
    if (!container) return '';
    const clone = container.cloneNode(true);

    // Normalize strong -> b, em -> i
    clone.querySelectorAll('strong').forEach(el => {
        const b = document.createElement('b');
        b.innerHTML = el.innerHTML;
        el.replaceWith(b);
    });
    clone.querySelectorAll('em').forEach(el => {
        const i = document.createElement('i');
        i.innerHTML = el.innerHTML;
        el.replaceWith(i);
    });

    // Convert line break elements into \n
    clone.querySelectorAll('.tf-line-empty').forEach(el => el.replaceWith('\n'));
    clone.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
    clone.querySelectorAll('.tf-line, p, div').forEach(el => {
        el.append('\n');
    });

    let text = clone.innerHTML || clone.innerText || '';

    // Remove span wrapper tags (.tf-sentence etc.) but preserve inner content
    text = text.replace(/<span[^>]*>/gi, '').replace(/<\/span>/gi, '');
    // Remove div/p wrapper tags
    text = text.replace(/<\/?(div|p)[^>]*>/gi, '');
    // Normalize newlines
    text = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    return text;
}

function renderMarkdownFormatting(text) {
    if (!text) return '';
    // Markdown headers: # Heading -> <b>Heading</b>
    text = text.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');
    // Bold + Italic: ***text***
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<b><i>$1</i></b>');
    // Bold: **text** or __text__
    text = text.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    text = text.replace(/__([^_]+)__/g, '<b>$1</b>');
    // Italic: *text* (not surrounded by other *)
    text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>');
    // Italic: _text_ (word-boundary safe)
    text = text.replace(/(?<![a-zA-Z0-9_])_([^_]+)_(?![a-zA-Z0-9_])/g, '<i>$1</i>');
    return text;
}

async function updateTranslation() {
    const rawText = extractFormattedText(originalBox);
    const plainText = originalBox.innerText.trim();
    if (!plainText) {
        cancelCurrentSession();
        translationBox.innerHTML = '';
        detectedLabel.classList.add('tf-hidden');
        return;
    }

    cancelCurrentSession();

    const sessionId = Date.now();
    const session = { id: sessionId, cancelled: false };
    currentSession = session;

    // Detect language of source text if source is auto
    let detectedLang = null;
    if (currentSource === 'auto') {
        detectedLang = guessLangFromText(plainText);
        // Smart Target Language Selection:
        // If detected language is the Base Language (e.g. Spanish), translate to Smart Language (e.g. English).
        // Otherwise, translate to Base Language (e.g. Spanish).
        if (detectedLang === baseDefaultTarget) {
            currentTarget = smartTargetLang;
        } else {
            currentTarget = baseDefaultTarget;
        }
        targetSelect.value = currentTarget;
    }

    translationBox.innerHTML = '<span class="tf-loader">Traduciendo...</span>';

    try {
        // Query translate command in rust with formatting tags preserved
        let result = await invoke('translate_text', {
            text: rawText,
            sl: currentSource,
            tl: currentTarget
        });

        if (session.cancelled) return;

        let finalTranslation = result.translation.trim();
        let detectedSource = result.detectedSource || detectedLang;

        // SMART TARGET SWAP FALLBACK:
        // If Google Translate returned untranslated text (identical to original) and source was auto,
        // it means the text was in currentTarget language. Swap to the alternative language.
        const cleanOriginal = plainText.toLowerCase().replace(/\s+/g, ' ');
        const cleanTranslated = finalTranslation.replace(/<[^>]+>/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (cleanOriginal === cleanTranslated && plainText.length > 1 && currentSource === 'auto') {
            if (currentTarget === baseDefaultTarget) {
                currentTarget = smartTargetLang;
                targetSelect.value = smartTargetLang;
                result = await invoke('translate_text', {
                    text: rawText,
                    sl: currentSource,
                    tl: currentTarget
                });
                if (session.cancelled) return;
                finalTranslation = result.translation.trim();
                detectedSource = baseDefaultTarget;
            } else if (currentTarget === smartTargetLang) {
                currentTarget = baseDefaultTarget;
                targetSelect.value = baseDefaultTarget;
                result = await invoke('translate_text', {
                    text: rawText,
                    sl: currentSource,
                    tl: currentTarget
                });
                if (session.cancelled) return;
                finalTranslation = result.translation.trim();
                detectedSource = smartTargetLang;
            }
        }

        // Speaker lines capitalisation and newlines mapping
        const origLines = rawText.split('\n').map(l => l.trim()).filter(l => l !== '');
        if (origLines.length > 1) {
            origLines.forEach((oLine, idx) => {
                const match = oLine.match(/^([^:]+):/);
                if (match) {
                    const speaker = match[1];
                    const speakerPrefix = speaker.toLowerCase().substring(0, 3);
                    const regex = new RegExp(`(?<!\\n)\\s?([a-zA-ZáéíóúÁÉÍÓÚ]{3,10}:)`, 'g');
                    finalTranslation = finalTranslation.replace(regex, (m, p1, offset) => {
                        if (offset === 0) return p1.trim();
                        const foundSpeakerPrefix = p1.toLowerCase().substring(0, 3);
                        if (foundSpeakerPrefix === speakerPrefix) {
                            return '\n' + p1.trim();
                        }
                        return m;
                    });
                }
            });
        }

        finalTranslation = finalTranslation.trim();

        // Capitalize matching speaker names
        const finalLines = finalTranslation.split('\n');
        finalTranslation = finalLines.map((tLine, i) => {
            const tl = tLine.trim();
            if (!tl) return tLine;

            let resultLine = tLine;
            const correspondingOrig = origLines.find(ol => {
                const oMatch = ol.match(/^[^:]+:/);
                const tMatch = tl.match(/^[^:]+:/);
                return oMatch && tMatch && oMatch[0].toLowerCase().startsWith(tMatch[0].toLowerCase().substring(0, 3));
            }) || (origLines.length === finalLines.length ? origLines[i] : null);

            if (correspondingOrig && correspondingOrig[0] === correspondingOrig[0].toUpperCase() && tl[0] === tl[0].toLowerCase()) {
                resultLine = tl[0].toUpperCase() + tl.substring(1);
            }

            const tSpeakerMatch = resultLine.match(/^([^:]+):/);
            if (tSpeakerMatch) {
                const tSpeaker = tSpeakerMatch[1];
                const oSpeakerLine = origLines.find(ol => ol.toLowerCase().startsWith(tSpeaker.toLowerCase().substring(0, 3)));
                if (oSpeakerLine) {
                    const oSpeakerMatch = oSpeakerLine.match(/^([^:]+):/);
                    if (oSpeakerMatch) {
                        const oSpeaker = oSpeakerMatch[1];
                        resultLine = resultLine.replace(tSpeaker + ':', oSpeaker + ':');
                    }
                }
            }
            return resultLine;
        }).join('\n');

        // Convert Markdown formatting (e.g. **bold**) if any to HTML tags
        finalTranslation = renderMarkdownFormatting(finalTranslation);

        // Convert shortcodes and LaTeX in translation as well
        finalTranslation = convertSlackShortcodes(finalTranslation);
        finalTranslation = cleanLatexAndAiArtifacts(finalTranslation);

        // Render translation
        translationBox.innerHTML = wrapSentences(finalTranslation);

        // Update translated languages for audio player
        const fallback = baseDefaultTarget || 'es';
        lastTranslationSourceLang = currentSource === 'auto' ? (detectedSource || detectedLang || (currentTarget === smartTargetLang ? baseDefaultTarget : 'en')) : currentSource;
        lastTranslationTargetLang = currentTarget;

        // Update detected source language label
        lastDetectedSource = detectedSource || detectedLang;
        if (currentSource === 'auto' && lastDetectedSource && lastDetectedSource !== 'auto') {
            const langName = languages[lastDetectedSource] || lastDetectedSource;
            detectedLabel.innerText = `${langName} (detectado)`;
            detectedLabel.classList.remove('tf-hidden');
        } else {
            detectedLabel.classList.add('tf-hidden');
        }

        // Save history via Rust backend
        const savedHistory = await invoke('add_history', {
            newItem: {
                id: lastSavedId || Date.now(),
                original: rawText,
                translation: finalTranslation,
                timestamp: new Date().toISOString()
            }
        });

        // Set lastSavedId so subsequent continuous edits update the same item
        if (savedHistory && savedHistory.length > 0) {
            lastSavedId = savedHistory[0].id;
        }

        renderHistoryList(savedHistory);
        isManualInput = true;

    } catch (e) {
        if (!session.cancelled) {
            translationBox.innerHTML = `<span class="tf-loader" style="color: #ea4335;">Error de traducción: ${e}</span>`;
        }
    }
}

async function loadAndRenderHistory() {
    try {
        const history = await invoke('get_history');
        renderHistoryList(history);
    } catch (e) {
        console.error("Failed to load history:", e);
    }
}

function renderHistoryList(history) {
    if (!historyList) return;
    if (!history || history.length === 0) {
        historyList.innerHTML = '<div class="tf-history-empty">No hay historial aún</div>';
        return;
    }

    let html = '';
    let currentLabel = '';

    history.forEach(item => {
        const label = getDateLabel(item.timestamp);
        if (label !== currentLabel) {
            currentLabel = label;
            html += `<div class="tf-history-date-separator"><span>${label}</span></div>`;
        }

        html += `
            <div class="tf-history-item" data-id="${item.id}">
                <div class="tf-history-content">
                    <div class="tf-history-orig">${truncate(item.original)}</div>
                    <div class="tf-history-trans">${truncate(item.translation)}</div>
                </div>
                <button class="tf-delete-btn" title="Eliminar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="tf-trash-svg">
                        <path class="tf-trash-lid" d="M3 6h18M9 6v-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                        <path class="tf-trash-body" d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                    </svg>
                </button>
            </div>
        `;
    });

    historyList.innerHTML = html;

    // Item click events
    historyList.querySelectorAll('.tf-history-item').forEach(item => {
        const id = parseInt(item.dataset.id);

        item.onclick = (e) => {
            if (e.target.closest('.tf-delete-btn')) return;
            const found = history.find(h => h.id === id);
            if (found) {
                stopSpeaking(); // Stop any ongoing audio when switching history item
                originalBox.innerHTML = wrapSentences(found.original);
                translationBox.innerHTML = wrapSentences(found.translation);
                lastSavedId = id;
                isManualInput = true;
                originalBox.focus();
            }
        };

        item.querySelector('.tf-delete-btn').onclick = async (e) => {
            e.stopPropagation();
            try {
                const updatedHistory = await invoke('delete_history', { id });
                renderHistoryList(updatedHistory);
                if (lastSavedId === id) {
                    lastSavedId = null;
                }
            } catch (err) {
                console.error("Failed to delete history item:", err);
            }
        };
    });
}

function getDateLabel(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const dDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = dNow - dDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return 'Esta semana';
    if (diffDays < 31) return 'Hace unos días';

    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function truncate(text, length = 40) {
    return text.length > length ? text.substring(0, length) + '...' : text;
}

function cleanOcrAndScanText(text) {
    if (!text) return '';
    
    // Normalize newlines to \n
    let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Fix collapsed line breaks (e.g. "L2O)En" -> "L2O)\nEn")
    normalized = normalized.replace(/\)([A-ZÁÉÍÓÚÑ])/g, ')\n$1');
    // Fix collapsed colon headings e.g. "Óptimos:En lugar" -> "Óptimos:\nEn lugar"
    normalized = normalized.replace(/([:;])([A-ZÁÉÍÓÚÑ])/g, '$1\n$2');
    
    // Split by double newlines first to keep paragraph structure
    const paragraphs = normalized.split(/\n\n+/);
    
    const cleanedParagraphs = paragraphs.map(para => {
        let lines = para.split('\n');
        let cleanedLines = [];
        
        for (let i = 0; i < lines.length; i++) {
            let currentLine = lines[i].trim();
            if (currentLine === '') continue;
            
            if (cleanedLines.length === 0) {
                cleanedLines.push(currentLine);
                continue;
            }
            
            let prevLine = cleanedLines[cleanedLines.length - 1];
            
            // Detect if current line starts with a list marker or heading:
            // Bullet points (-, *, •, o, +, etc.), numbered list (1., 2., a., b., (1), etc.) or heading (#)
            let isCurrentList = /^[-*•o+>#]\s+/.test(currentLine) || /^\(?\d+[\.\)]\s+/.test(currentLine) || /^[a-zA-Z][\.\)]\s+/.test(currentLine);
            
            // Detect if previous line was a numbered item or heading (e.g. "1. Enfoque...")
            let prevWasListOrHeading = /^[-*•o+>#]\s+/.test(prevLine) || /^\(?\d+[\.\)]\s+/.test(prevLine) || /^[a-zA-Z][\.\)]\s+/.test(prevLine);
            
            // Detect if current line starts with a speaker label (name: text)
            let isSpeakerLine = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{0,20}:/.test(currentLine);
            
            // Detect if previous line ends with sentence/clause ending punctuation, parenthesis, or quotes
            let prevEndsWithPunctuation = /[.!?:;\)\]\}\"\'\u201C\u201D\u2018\u2019»«—–]$/.test(prevLine);
            
            // Detect if previous line is short (like a title, header, or standalone phrase)
            let prevIsShort = prevLine.replace(/<[^>]+>/g, '').length < 65;
            
            if (isCurrentList || isSpeakerLine || prevWasListOrHeading || prevEndsWithPunctuation || prevIsShort) {
                // Keep as separate line!
                cleanedLines.push(currentLine);
            } else {
                // Only join if previous line ended with a hyphen (word wrapping) or continuous wrapped sentence
                if (prevLine.endsWith('-')) {
                    cleanedLines[cleanedLines.length - 1] = prevLine.slice(0, -1) + currentLine;
                } else {
                    cleanedLines[cleanedLines.length - 1] = prevLine + ' ' + currentLine;
                }
            }
        }
        
        return cleanedLines.join('\n');
    });
    
    // Rejoin paragraphs with double newlines
    return cleanedParagraphs.filter(p => p.trim() !== '').join('\n\n');
}

/**
 * Sanitize HTML from clipboard: keep only safe formatting tags.
 * Strips scripts, styles, images, and other dangerous elements.
 * Preserves: b, strong, i, em, u, br, p, div, span, sub, sup
 */
function sanitizeClipboardHtml(html) {
    if (!html) return '';

    // Normalize Windows line breaks
    let s = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove comments, head, script, style, meta, link
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/<(script|style|meta|link|head|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
    s = s.replace(/<(img|iframe|object|embed|form|input|textarea|select|button)[^>]*>/gi, '');

    // Strip KaTeX / MathML duplicate annotation layers:
    // When copying from ChatGPT / KaTeX / MathJax, <span class="katex-mathml"> and <annotation> contain hidden TeX annotations
    // which duplicate the visible text in <span class="katex-html">.
    s = s.replace(/<span\b[^>]*class=["'][^"']*katex-mathml[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '');
    s = s.replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/gi, '');
    s = s.replace(/<math\b[^>]*>[\s\S]*?<\/math>/gi, '');

    // Replace headings: ensure clean line breaks and bold
    s = s.replace(/<h[1-6][^>]*>/gi, '<br><br><b>');
    s = s.replace(/<\/h[1-6]>/gi, '</b><br>');

    // Replace list items: if already starts with number, just <br>, otherwise bullet
    s = s.replace(/<li[^>]*>\s*(?=\(?\d+[\.\)])/gi, '<br>');
    s = s.replace(/<li[^>]*>/gi, '<br>• ');
    s = s.replace(/<\/li>/gi, '');

    // Block elements: div and p
    s = s.replace(/<\/p>/gi, '<br><br>');
    s = s.replace(/<p[^>]*>/gi, '');
    s = s.replace(/<\/div>/gi, '<br>');
    s = s.replace(/<div[^>]*>/gi, '');
    s = s.replace(/<\/tr>/gi, '<br>');
    s = s.replace(/<tr[^>]*>/gi, '');
    s = s.replace(/<td[^>]*>/gi, ' ');
    s = s.replace(/<\/td>/gi, ' ');
    s = s.replace(/<blockquote[^>]*>/gi, '<br>');
    s = s.replace(/<\/blockquote>/gi, '<br>');

    // Convert strong -> b, em -> i
    s = s.replace(/<strong\b[^>]*>/gi, '<b>');
    s = s.replace(/<\/strong>/gi, '</b>');
    s = s.replace(/<em\b[^>]*>/gi, '<i>');
    s = s.replace(/<\/em>/gi, '</i>');

    // Remove empty spans or unneeded spans
    s = s.replace(/<span[^>]*>\s*<\/span>/gi, '');
    s = s.replace(/<\/?span[^>]*>/gi, '');

    // Strip any other unwanted tags, preserving only safe inline tags
    s = s.replace(new RegExp('<(?!/?(b|i|u|sub|sup|br)\\b)[^>]+>', 'gi'), '');

    // Clean attributes on remaining tags
    s = s.replace(/<(b|i|u|sub|sup|br)\b[^>]*>/gi, (match, tag) => {
        if (tag.toLowerCase() === 'br') return '<br>';
        return `<${tag.toLowerCase()}>`;
    });

    // Fix collapsed lines: e.g. "L2O)En" -> "L2O)<br>En"
    s = s.replace(/\)([A-ZÁÉÍÓÚÑ])/g, ')<br>$1');

    // Normalize whitespace around <br> to avoid spurious double blank lines
    s = s.replace(/(\s*<br\s*\/?>[\s\n]*)+/gi, (match) => {
        const count = (match.match(/<br/gi) || []).length;
        const newlines = (match.match(/\n/g) || []).length;
        return (count >= 2 || newlines >= 2) ? '<br><br>' : '<br>';
    });
    s = s.replace(/^(<br\s*\/?>\s*)+/gi, '').replace(/(<br\s*\/?>\s*)+$/gi, '');

    return s.trim();
}

function convertSlackShortcodes(text) {
    if (!text) return text;
    
    // Country flag shortcodes :flag-xx: → 🇽🇽
    text = text.replace(/:flag-([a-z]{2}):/gi, (match, code) => {
        const upper = code.toUpperCase();
        // Convert country code to regional indicator symbols
        const char1 = String.fromCodePoint(0x1F1E6 + upper.charCodeAt(0) - 65);
        const char2 = String.fromCodePoint(0x1F1E6 + upper.charCodeAt(1) - 65);
        return char1 + char2;
    });
    
    // Common Slack emoji shortcodes
    const emojiMap = {
        // Faces & People
        ':smile:': '😄', ':grinning:': '😀', ':laughing:': '😆', ':blush:': '😊',
        ':smiley:': '😃', ':relaxed:': '☺️', ':smirk:': '😏', ':heart_eyes:': '😍',
        ':kissing_heart:': '😘', ':kissing:': '😗', ':wink:': '😉', ':stuck_out_tongue_winking_eye:': '😜',
        ':stuck_out_tongue:': '😛', ':flushed:': '😳', ':grin:': '😁', ':pensive:': '😔',
        ':relieved:': '😌', ':unamused:': '😒', ':disappointed:': '😞', ':persevere:': '😣',
        ':cry:': '😢', ':joy:': '😂', ':sob:': '😭', ':scream:': '😱',
        ':confused:': '😕', ':open_mouth:': '😮', ':hushed:': '😯', ':sweat_smile:': '😅',
        ':sweat:': '😓', ':weary:': '😩', ':tired_face:': '😫', ':angry:': '😠',
        ':rage:': '😡', ':triumph:': '😤', ':mask:': '😷', ':sunglasses:': '😎',
        ':sleeping:': '😴', ':dizzy_face:': '😵', ':astonished:': '😲', ':worried:': '😟',
        ':fearful:': '😨', ':cold_sweat:': '😰', ':innocent:': '😇', ':thinking_face:': '🤔',
        ':thinking:': '🤔', ':face_with_rolling_eyes:': '🙄', ':zipper_mouth_face:': '🤐',
        ':nerd_face:': '🤓', ':rofl:': '🤣', ':hugging_face:': '🤗',
        ':clown_face:': '🤡', ':cowboy:': '🤠', ':nauseated_face:': '🤢', ':sneezing_face:': '🤧',
        ':star_struck:': '🤩', ':zany_face:': '🤪', ':shushing_face:': '🤫', ':exploding_head:': '🤯',
        ':pleading_face:': '🥺', ':yawning_face:': '🥱', ':partying_face:': '🥳',
        ':skull:': '💀', ':ghost:': '👻', ':alien:': '👽', ':robot_face:': '🤖',
        ':poop:': '💩', ':hankey:': '💩',
        
        // Gestures & Body
        ':wave:': '👋', ':raised_hands:': '🙌', ':clap:': '👏', ':pray:': '🙏',
        ':thumbsup:': '👍', ':+1:': '👍', ':thumbsdown:': '👎', ':-1:': '👎',
        ':punch:': '👊', ':fist:': '✊', ':v:': '✌️', ':ok_hand:': '👌',
        ':raised_hand:': '✋', ':open_hands:': '👐', ':muscle:': '💪',
        ':point_up:': '☝️', ':point_down:': '👇', ':point_left:': '👈', ':point_right:': '👉',
        ':middle_finger:': '🖕', ':hand:': '✋', ':metal:': '🤘',
        ':call_me_hand:': '🤙', ':handshake:': '🤝', ':crossed_fingers:': '🤞',
        ':love_you_gesture:': '🤟', ':palms_up_together:': '🤲',
        ':eyes:': '👀', ':eye:': '👁️', ':tongue:': '👅', ':lips:': '👄',
        ':brain:': '🧠',
        
        // Hearts & Symbols
        ':heart:': '❤️', ':yellow_heart:': '💛', ':green_heart:': '💚',
        ':blue_heart:': '💙', ':purple_heart:': '💜', ':broken_heart:': '💔',
        ':heartpulse:': '💗', ':heartbeat:': '💓', ':sparkling_heart:': '💖',
        ':cupid:': '💘', ':gift_heart:': '💝', ':revolving_hearts:': '💞',
        ':two_hearts:': '💕', ':heart_decoration:': '💟', ':black_heart:': '🖤',
        ':orange_heart:': '🧡', ':white_heart:': '🤍', ':brown_heart:': '🤎',
        ':fire:': '🔥', ':100:': '💯', ':star:': '⭐', ':star2:': '🌟',
        ':sparkles:': '✨', ':dizzy:': '💫', ':boom:': '💥', ':collision:': '💥',
        ':zap:': '⚡', ':snowflake:': '❄️',
        ':sunny:': '☀️', ':cloud:': '☁️', ':umbrella:': '☂️', ':rainbow:': '🌈',
        ':droplet:': '💧', ':ocean:': '🌊',
        
        // Objects & Activities
        ':tada:': '🎉', ':confetti_ball:': '🎊', ':balloon:': '🎈', ':party_popper:': '🎉',
        ':gift:': '🎁', ':trophy:': '🏆', ':medal:': '🏅', ':crown:': '👑',
        ':gem:': '💎', ':ring:': '💍', ':moneybag:': '💰', ':dollar:': '💵',
        ':bulb:': '💡', ':flashlight:': '🔦', ':wrench:': '🔧', ':hammer:': '🔨',
        ':nut_and_bolt:': '🔩', ':gear:': '⚙️', ':link:': '🔗', ':chains:': '⛓️',
        ':key:': '🔑', ':lock:': '🔒', ':unlock:': '🔓',
        ':bell:': '🔔', ':no_bell:': '🔕', ':loudspeaker:': '📢', ':mega:': '📣',
        ':phone:': '☎️', ':iphone:': '📱', ':computer:': '💻', ':desktop_computer:': '🖥️',
        ':keyboard:': '⌨️', ':email:': '📧', ':envelope:': '✉️', ':inbox_tray:': '📥',
        ':outbox_tray:': '📤', ':package:': '📦', ':mailbox:': '📫',
        ':memo:': '📝', ':pencil:': '✏️', ':pencil2:': '✏️', ':pen:': '🖊️',
        ':paperclip:': '📎', ':scissors:': '✂️', ':round_pushpin:': '📍',
        ':book:': '📖', ':books:': '📚', ':bookmark:': '🔖',
        ':newspaper:': '📰', ':calendar:': '📅', ':date:': '📅',
        ':chart_with_upwards_trend:': '📈', ':chart_with_downwards_trend:': '📉',
        ':bar_chart:': '📊', ':clipboard:': '📋', ':pushpin:': '📌',
        ':rocket:': '🚀', ':airplane:': '✈️', ':car:': '🚗', ':taxi:': '🚕',
        ':bus:': '🚌', ':train:': '🚆', ':ship:': '🚢', ':bike:': '🚲',
        ':camera:': '📷', ':movie_camera:': '🎬', ':tv:': '📺', ':radio:': '📻',
        ':musical_note:': '🎵', ':notes:': '🎶', ':microphone:': '🎤', ':headphones:': '🎧',
        ':guitar:': '🎸', ':trumpet:': '🎺', ':violin:': '🎻', ':drum:': '🥁',
        ':art:': '🎨', ':paintbrush:': '🖌️',
        ':soccer:': '⚽', ':basketball:': '🏀', ':football:': '🏈', ':baseball:': '⚾',
        ':tennis:': '🎾', ':volleyball:': '🏐', ':golf:': '⛳', ':ping_pong:': '🏓',
        ':dart:': '🎯', ':8ball:': '🎱',
        
        // Food & Drink
        ':pizza:': '🍕', ':hamburger:': '🍔', ':fries:': '🍟', ':hotdog:': '🌭',
        ':taco:': '🌮', ':burrito:': '🌯', ':sushi:': '🍣', ':ramen:': '🍜',
        ':coffee:': '☕', ':tea:': '🍵', ':beer:': '🍺', ':beers:': '🍻',
        ':wine_glass:': '🍷', ':cocktail:': '🍸', ':tropical_drink:': '🍹',
        ':apple:': '🍎', ':green_apple:': '🍏', ':banana:': '🍌', ':grapes:': '🍇',
        ':strawberry:': '🍓', ':watermelon:': '🍉', ':lemon:': '🍋', ':peach:': '🍑',
        ':avocado:': '🥑', ':eggplant:': '🍆', ':tomato:': '🍅', ':corn:': '🌽',
        ':cake:': '🍰', ':birthday:': '🎂', ':cookie:': '🍪', ':chocolate_bar:': '🍫',
        ':candy:': '🍬', ':ice_cream:': '🍦', ':doughnut:': '🍩',
        
        // Animals & Nature
        ':dog:': '🐶', ':cat:': '🐱', ':mouse:': '🐭', ':hamster:': '🐹',
        ':rabbit:': '🐰', ':bear:': '🐻', ':panda_face:': '🐼', ':koala:': '🐨',
        ':tiger:': '🐯', ':lion_face:': '🦁', ':lion:': '🦁', ':cow:': '🐮',
        ':pig:': '🐷', ':frog:': '🐸', ':monkey_face:': '🐵', ':see_no_evil:': '🙈',
        ':hear_no_evil:': '🙉', ':speak_no_evil:': '🙊', ':chicken:': '🐔',
        ':penguin:': '🐧', ':bird:': '🐦', ':eagle:': '🦅', ':duck:': '🦆',
        ':owl:': '🦉', ':bat:': '🦇', ':wolf:': '🐺', ':fox_face:': '🦊',
        ':butterfly:': '🦋', ':bug:': '🐛', ':ant:': '🐜', ':bee:': '🐝',
        ':ladybug:': '🐞', ':spider:': '🕷️', ':turtle:': '🐢', ':snake:': '🐍',
        ':dragon:': '🐉', ':dinosaur:': '🦕', ':unicorn:': '🦄',
        ':whale:': '🐳', ':dolphin:': '🐬', ':fish:': '🐟', ':tropical_fish:': '🐠',
        ':octopus:': '🐙', ':crab:': '🦀', ':shrimp:': '🦐', ':squid:': '🦑',
        ':rose:': '🌹', ':sunflower:': '🌻', ':hibiscus:': '🌺', ':tulip:': '🌷',
        ':cherry_blossom:': '🌸', ':bouquet:': '💐', ':seedling:': '🌱',
        ':evergreen_tree:': '🌲', ':deciduous_tree:': '🌳', ':palm_tree:': '🌴',
        ':cactus:': '🌵', ':four_leaf_clover:': '🍀', ':mushroom:': '🍄',
        ':fallen_leaf:': '🍂', ':leaves:': '🍃', ':maple_leaf:': '🍁',
        
        // Miscellaneous
        ':checkered_flag:': '🏁', ':triangular_flag_on_post:': '🚩',
        ':crossed_flags:': '🎌', ':white_flag:': '🏳️', ':rainbow_flag:': '🏳️‍🌈',
        ':pirate_flag:': '🏴‍☠️',
        ':warning:': '⚠️', ':no_entry:': '⛔', ':x:': '❌', ':o:': '⭕',
        ':white_check_mark:': '✅', ':heavy_check_mark:': '✔️',
        ':heavy_plus_sign:': '➕', ':heavy_minus_sign:': '➖',
        ':heavy_multiplication_x:': '✖️', ':heavy_division_sign:': '➗',
        ':exclamation:': '❗', ':question:': '❓', ':grey_exclamation:': '❕',
        ':grey_question:': '❔',
        ':arrow_right:': '➡️', ':arrow_left:': '⬅️', ':arrow_up:': '⬆️', ':arrow_down:': '⬇️',
        ':recycle:': '♻️', ':copyright:': '©️', ':registered:': '®️', ':tm:': '™️',
        ':information_source:': 'ℹ️', ':abc:': '🔤', ':abcd:': '🔡',
        ':1234:': '🔢', ':symbols:': '🔣', ':a:': '🅰️', ':b:': '🅱️',
        ':ab:': '🆎', ':cl:': '🆑', ':sos:': '🆘', ':id:': '🆔',
        ':new:': '🆕', ':ng:': '🆖', ':ok:': '🆗', ':cool:': '🆒',
        ':free:': '🆓', ':up:': '🆙', ':vs:': '🆚',
        ':clock1:': '🕐', ':clock2:': '🕑', ':clock3:': '🕒', ':clock4:': '🕓',
        ':hourglass:': '⌛', ':watch:': '⌚', ':alarm_clock:': '⏰',
        ':earth_americas:': '🌎', ':earth_africa:': '🌍', ':earth_asia:': '🌏',
        ':globe_with_meridians:': '🌐', ':world_map:': '🗺️',
        ':mag:': '🔍', ':mag_right:': '🔎',
        ':speech_balloon:': '💬', ':thought_balloon:': '💭',
    };
    
    // Replace all known shortcodes
    text = text.replace(/:([a-zA-Z0-9_+-]+):/g, (match) => {
        return emojiMap[match] || match;
    });
    
    return text;
}

/**
 * Convert LaTeX math notation to Unicode equivalents.
 * Handles: $\tau_d$ → τ_d, $\alpha$ → α, subscripts, superscripts, fractions.
 */
function convertLatexToUnicode(text) {
    if (!text) return text;
    
    // ═══════════════════════════════════════════════════════════════════
    // COMPLETE LaTeX → Unicode dictionary (~500+ symbols)
    // Covers: Greek, operators, relations, arrows, sets, logic, geometry,
    // blackboard bold, script, fraktur, delimiters, accents, and more.
    // ═══════════════════════════════════════════════════════════════════
    const latexToUnicode = {
        // ── Greek lowercase ──
        'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ε',
        'zeta': 'ζ', 'eta': 'η', 'theta': 'θ', 'iota': 'ι', 'kappa': 'κ',
        'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'omicron': 'ο',
        'pi': 'π', 'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ',
        'phi': 'φ', 'chi': 'χ', 'psi': 'ψ', 'omega': 'ω',
        // ── Greek lowercase variants ──
        'varepsilon': 'ε', 'varphi': 'φ', 'varsigma': 'ς', 'vartheta': 'ϑ',
        'varpi': 'ϖ', 'varrho': 'ϱ', 'varkappa': 'ϰ', 'digamma': 'ϝ',
        // ── Greek uppercase ──
        'Alpha': 'Α', 'Beta': 'Β', 'Gamma': 'Γ', 'Delta': 'Δ', 'Epsilon': 'Ε',
        'Zeta': 'Ζ', 'Eta': 'Η', 'Theta': 'Θ', 'Iota': 'Ι', 'Kappa': 'Κ',
        'Lambda': 'Λ', 'Mu': 'Μ', 'Nu': 'Ν', 'Xi': 'Ξ', 'Omicron': 'Ο',
        'Pi': 'Π', 'Rho': 'Ρ', 'Sigma': 'Σ', 'Tau': 'Τ', 'Upsilon': 'Υ',
        'Phi': 'Φ', 'Chi': 'Χ', 'Psi': 'Ψ', 'Omega': 'Ω',
        // ── Hebrew ──
        'aleph': 'ℵ', 'beth': 'ℶ', 'gimel': 'ℷ', 'daleth': 'ℸ',

        // ══════════════ ARITHMETIC & BASIC OPERATORS ══════════════
        'plus': '+', 'minus': '−', 'times': '×', 'div': '÷',
        'cdot': '·', 'ast': '∗', 'star': '⋆', 'circ': '∘',
        'bullet': '•', 'pm': '±', 'mp': '∓',
        'oplus': '⊕', 'ominus': '⊖', 'otimes': '⊗', 'oslash': '⊘', 'odot': '⊙',
        'bigcirc': '◯', 'dagger': '†', 'ddagger': '‡',
        'amalg': '⨿', 'wr': '≀', 'setminus': '∖', 'smallsetminus': '∖',

        // ══════════════ RELATIONS ══════════════
        'leq': '≤', 'le': '≤', 'geq': '≥', 'ge': '≥',
        'neq': '≠', 'ne': '≠', 'approx': '≈', 'equiv': '≡',
        'sim': '∼', 'simeq': '≃', 'cong': '≅', 'doteq': '≐',
        'propto': '∝', 'asymp': '≍',
        'll': '≪', 'gg': '≫', 'lll': '⋘', 'ggg': '⋙',
        'prec': '≺', 'succ': '≻', 'preceq': '⪯', 'succeq': '⪰',
        'preccurlyeq': '≼', 'succcurlyeq': '≽',
        'lesssim': '≲', 'gtrsim': '≳', 'lessapprox': '⪅', 'gtrapprox': '⪆',
        'lessgtr': '≶', 'gtrless': '≷', 'lesseqgtr': '⋚', 'gtreqless': '⋛',
        'leqslant': '⩽', 'geqslant': '⩾',
        'eqslantless': '⪕', 'eqslantgtr': '⪖',
        'triangleleft': '◁', 'triangleright': '▷',
        'trianglelefteq': '⊴', 'trianglerighteq': '⊵',
        'vdash': '⊢', 'dashv': '⊣', 'models': '⊨',
        'Vdash': '⊩', 'Vvdash': '⊪', 'vDash': '⊨',
        'mid': '∣', 'nmid': '∤', 'parallel': '∥', 'nparallel': '∦',
        'perp': '⊥', 'top': '⊤', 'bot': '⊥',
        'smile': '⌣', 'frown': '⌢', 'bowtie': '⋈',
        'Join': '⋈', 'ltimes': '⋉', 'rtimes': '⋊',
        'leftthreetimes': '⋋', 'rightthreetimes': '⋌',
        'backsim': '∽', 'backsimeq': '⋍',
        'Bumpeq': '≎', 'bumpeq': '≏', 'circeq': '≗', 'eqcirc': '≖',
        'fallingdotseq': '≒', 'risingdotseq': '≓',
        'pitchfork': '⋔', 'therefore': '∴', 'because': '∵',
        'between': '≬', 'curlyeqprec': '⋞', 'curlyeqsucc': '⋟',
        'sqsubset': '⊏', 'sqsupset': '⊐', 'sqsubseteq': '⊑', 'sqsupseteq': '⊒',
        'Subset': '⋐', 'Supset': '⋑',

        // ── Negated relations ──
        'nleq': '≰', 'ngeq': '≱', 'nless': '≮', 'ngtr': '≯',
        'nleqslant': '≰', 'ngeqslant': '≱',
        'nprec': '⊀', 'nsucc': '⊁', 'npreceq': '⋠', 'nsucceq': '⋡',
        'nsim': '≁', 'ncong': '≇',
        'nvdash': '⊬', 'nvDash': '⊭', 'nVdash': '⊮', 'nVDash': '⊯',
        'ntriangleleft': '⋪', 'ntriangleright': '⋫',
        'ntrianglelefteq': '⋬', 'ntrianglerighteq': '⋭',
        'lneq': '⪇', 'gneq': '⪈', 'lneqq': '≨', 'gneqq': '≩',
        'lnsim': '⋦', 'gnsim': '⋧', 'lnapprox': '⪉', 'gnapprox': '⪊',
        'precnsim': '⋨', 'succnsim': '⋩', 'precnapprox': '⪹', 'succnapprox': '⪺',
        'subsetneq': '⊊', 'supsetneq': '⊋', 'subsetneqq': '⫋', 'supsetneqq': '⫌',
        'nsubseteq': '⊈', 'nsupseteq': '⊉',

        // ══════════════ SET THEORY & LOGIC ══════════════
        'in': '∈', 'notin': '∉', 'ni': '∋', 'notni': '∌',
        'subset': '⊂', 'supset': '⊃', 'subseteq': '⊆', 'supseteq': '⊇',
        'cap': '∩', 'cup': '∪', 'Cap': '⋒', 'Cup': '⋓',
        'sqcap': '⊓', 'sqcup': '⊔',
        'bigcap': '⋂', 'bigcup': '⋃', 'bigsqcup': '⨆',
        'uplus': '⊎', 'biguplus': '⨄',
        'emptyset': '∅', 'varnothing': '∅', 'O': '∅',
        'land': '∧', 'lor': '∨', 'lnot': '¬', 'neg': '¬',
        'wedge': '∧', 'vee': '∨', 'bigwedge': '⋀', 'bigvee': '⋁',
        'forall': '∀', 'exists': '∃', 'nexists': '∄',
        'complement': '∁',

        // ══════════════ ARROWS ══════════════
        // ── Basic arrows ──
        'leftarrow': '←', 'rightarrow': '→', 'uparrow': '↑', 'downarrow': '↓',
        'leftrightarrow': '↔', 'updownarrow': '↕',
        'Leftarrow': '⇐', 'Rightarrow': '⇒', 'Uparrow': '⇑', 'Downarrow': '⇓',
        'Leftrightarrow': '⇔', 'Updownarrow': '⇕',
        'to': '→', 'gets': '←', 'iff': '⟺',
        'implies': '⟹', 'impliedby': '⟸',
        // ── Long arrows ──
        'longleftarrow': '⟵', 'longrightarrow': '⟶', 'longleftrightarrow': '⟷',
        'Longleftarrow': '⟸', 'Longrightarrow': '⟹', 'Longleftrightarrow': '⟺',
        'longmapsto': '⟼',
        // ── Mapsto ──
        'mapsto': '↦', 'hookleftarrow': '↩', 'hookrightarrow': '↪',
        // ── Harpoons ──
        'leftharpoonup': '↼', 'leftharpoondown': '↽',
        'rightharpoonup': '⇀', 'rightharpoondown': '⇁',
        'upharpoonleft': '↿', 'upharpoonright': '↾',
        'downharpoonleft': '⇃', 'downharpoonright': '⇂',
        'rightleftharpoons': '⇌', 'leftrightharpoons': '⇋',
        // ── Diagonal / corner arrows ──
        'nearrow': '↗', 'searrow': '↘', 'swarrow': '↙', 'nwarrow': '↖',
        // ── Double-headed ──
        'twoheadleftarrow': '↞', 'twoheadrightarrow': '↠',
        // ── Tail arrows ──
        'leftarrowtail': '↢', 'rightarrowtail': '↣',
        // ── Squig arrows ──
        'rightsquigarrow': '⇝', 'leftrightsquigarrow': '↭', 'leadsto': '⇝',
        // ── Looped ──
        'looparrowleft': '↫', 'looparrowright': '↬',
        // ── Circular ──
        'circlearrowleft': '↺', 'circlearrowright': '↻',
        'curvearrowleft': '↶', 'curvearrowright': '↷',
        // ── Dashed / multimap ──
        'dashleftarrow': '⇠', 'dashrightarrow': '⇢',
        'multimap': '⊸', 'Lsh': '↰', 'Rsh': '↱',

        // ══════════════ LARGE OPERATORS ══════════════
        'sum': '∑', 'prod': '∏', 'coprod': '∐',
        'int': '∫', 'iint': '∬', 'iiint': '∭', 'iiiint': '⨌',
        'oint': '∮', 'oiint': '∯', 'oiiint': '∰',
        'intclockwise': '∱', 'varointclockwise': '∲', 'ointctrclockwise': '∳',
        'bigotimes': '⨂', 'bigoplus': '⨁', 'bigodot': '⨀',
        'bigstar': '★',

        // ══════════════ CALCULUS & ANALYSIS ══════════════
        'infty': '∞', 'partial': '∂', 'nabla': '∇',
        'sqrt': '√', 'cbrt': '∛', 'fourthroot': '∜',
        'degree': '°',
        'prime': '′', 'dprime': '″', 'tprime': '‴', 'backprime': '‵',

        // ══════════════ GEOMETRY ══════════════
        'angle': '∠', 'measuredangle': '∡', 'sphericalangle': '∢',
        'triangle': '△', 'triangledown': '▽',
        'blacktriangle': '▲', 'blacktriangledown': '▼',
        'blacktriangleleft': '◀', 'blacktriangleright': '▶',
        'square': '□', 'blacksquare': '■', 'boxdot': '⊡',
        'boxplus': '⊞', 'boxminus': '⊟', 'boxtimes': '⊠',
        'diamond': '◇', 'Diamond': '◇', 'lozenge': '◊', 'blacklozenge': '⧫',
        'pentagon': '⬠', 'hexagon': '⬡',
        'circle': '○',

        // ══════════════ DOTS ══════════════
        'dots': '…', 'ldots': '…', 'cdots': '⋯', 'vdots': '⋮', 'ddots': '⋱',
        'iddots': '⋰', 'dotsb': '⋯', 'dotsc': '…', 'dotsi': '⋯', 'dotsm': '⋯',

        // ══════════════ DELIMITERS ══════════════
        'langle': '⟨', 'rangle': '⟩',
        'lfloor': '⌊', 'rfloor': '⌋', 'lceil': '⌈', 'rceil': '⌉',
        'lbrace': '{', 'rbrace': '}', 'lbrack': '[', 'rbrack': ']',
        'vert': '|', 'Vert': '‖', 'lvert': '|', 'rvert': '|',
        'lVert': '‖', 'rVert': '‖',
        'ulcorner': '⌜', 'urcorner': '⌝', 'llcorner': '⌞', 'lrcorner': '⌟',
        'lgroup': '⟮', 'rgroup': '⟯',

        // ══════════════ LETTERLIKE SYMBOLS ══════════════
        'hbar': 'ℏ', 'ell': 'ℓ', 'Re': 'ℜ', 'Im': 'ℑ',
        'wp': '℘', 'mho': '℧', 'Finv': 'Ⅎ', 'Game': 'ℷ',
        'Bbbk': '𝕜', 'N': 'ℕ', 'Z': 'ℤ', 'Q': 'ℚ', 'R': 'ℝ', 'C': 'ℂ',
        'imath': 'ı', 'jmath': 'ȷ',
        'eth': 'ð', 'thorn': 'þ',

        // ══════════════ BLACKBOARD BOLD (mathbb) ══════════════
        'mathbb{A}': '𝔸', 'mathbb{B}': '𝔹', 'mathbb{C}': 'ℂ', 'mathbb{D}': '𝔻',
        'mathbb{E}': '𝔼', 'mathbb{F}': '𝔽', 'mathbb{G}': '𝔾', 'mathbb{H}': 'ℍ',
        'mathbb{I}': '𝕀', 'mathbb{J}': '𝕁', 'mathbb{K}': '𝕂', 'mathbb{L}': '𝕃',
        'mathbb{M}': '𝕄', 'mathbb{N}': 'ℕ', 'mathbb{O}': '𝕆', 'mathbb{P}': 'ℙ',
        'mathbb{Q}': 'ℚ', 'mathbb{R}': 'ℝ', 'mathbb{S}': '𝕊', 'mathbb{T}': '𝕋',
        'mathbb{U}': '𝕌', 'mathbb{V}': '𝕍', 'mathbb{W}': '𝕎', 'mathbb{X}': '𝕏',
        'mathbb{Y}': '𝕐', 'mathbb{Z}': 'ℤ',
        'mathbb{0}': '𝟘', 'mathbb{1}': '𝟙', 'mathbb{2}': '𝟚', 'mathbb{3}': '𝟛',
        'mathbb{4}': '𝟜', 'mathbb{5}': '𝟝', 'mathbb{6}': '𝟞', 'mathbb{7}': '𝟟',
        'mathbb{8}': '𝟠', 'mathbb{9}': '𝟡',

        // ══════════════ SCRIPT / CALLIGRAPHIC (mathcal) ══════════════
        'mathcal{A}': '𝒜', 'mathcal{B}': 'ℬ', 'mathcal{C}': '𝒞', 'mathcal{D}': '𝒟',
        'mathcal{E}': 'ℰ', 'mathcal{F}': 'ℱ', 'mathcal{G}': '𝒢', 'mathcal{H}': 'ℋ',
        'mathcal{I}': 'ℐ', 'mathcal{J}': '𝒥', 'mathcal{K}': '𝒦', 'mathcal{L}': 'ℒ',
        'mathcal{M}': 'ℳ', 'mathcal{N}': '𝒩', 'mathcal{O}': '𝒪', 'mathcal{P}': '𝒫',
        'mathcal{Q}': '𝒬', 'mathcal{R}': 'ℛ', 'mathcal{S}': '𝒮', 'mathcal{T}': '𝒯',
        'mathcal{U}': '𝒰', 'mathcal{V}': '𝒱', 'mathcal{W}': '𝒲', 'mathcal{X}': '𝒳',
        'mathcal{Y}': '𝒴', 'mathcal{Z}': '𝒵',

        // ══════════════ FRAKTUR (mathfrak) ══════════════
        'mathfrak{A}': '𝔄', 'mathfrak{B}': '𝔅', 'mathfrak{C}': 'ℭ', 'mathfrak{D}': '𝔇',
        'mathfrak{E}': '𝔈', 'mathfrak{F}': '𝔉', 'mathfrak{G}': '𝔊', 'mathfrak{H}': 'ℌ',
        'mathfrak{I}': 'ℑ', 'mathfrak{J}': '𝔍', 'mathfrak{K}': '𝔎', 'mathfrak{L}': '𝔏',
        'mathfrak{M}': '𝔐', 'mathfrak{N}': '𝔑', 'mathfrak{O}': '𝔒', 'mathfrak{P}': '𝔓',
        'mathfrak{Q}': '𝔔', 'mathfrak{R}': 'ℜ', 'mathfrak{S}': '𝔖', 'mathfrak{T}': '𝔗',
        'mathfrak{U}': '𝔘', 'mathfrak{V}': '𝔙', 'mathfrak{W}': '𝔚', 'mathfrak{X}': '𝔛',
        'mathfrak{Y}': '𝔜', 'mathfrak{Z}': 'ℨ',
        'mathfrak{a}': '𝔞', 'mathfrak{b}': '𝔟', 'mathfrak{c}': '𝔠', 'mathfrak{d}': '𝔡',
        'mathfrak{e}': '𝔢', 'mathfrak{f}': '𝔣', 'mathfrak{g}': '𝔤', 'mathfrak{h}': '𝔥',
        'mathfrak{i}': '𝔦', 'mathfrak{j}': '𝔧', 'mathfrak{k}': '𝔨', 'mathfrak{l}': '𝔩',
        'mathfrak{m}': '𝔪', 'mathfrak{n}': '𝔫', 'mathfrak{o}': '𝔬', 'mathfrak{p}': '𝔭',
        'mathfrak{q}': '𝔮', 'mathfrak{r}': '𝔯', 'mathfrak{s}': '𝔰', 'mathfrak{t}': '𝔱',
        'mathfrak{u}': '𝔲', 'mathfrak{v}': '𝔳', 'mathfrak{w}': '𝔴', 'mathfrak{x}': '𝔵',
        'mathfrak{y}': '𝔶', 'mathfrak{z}': '𝔷',

        // ══════════════ MISCELLANEOUS MATH SYMBOLS ══════════════
        'surd': '√', 'checkmark': '✓',
        'maltese': '✠', 'clubsuit': '♣', 'diamondsuit': '♢',
        'heartsuit': '♡', 'spadesuit': '♠',
        'flat': '♭', 'natural': '♮', 'sharp': '♯',
        'S': '§', 'P': '¶', 'dag': '†', 'ddag': '‡',
        'copyright': '©', 'pounds': '£', 'yen': '¥', 'euro': '€',
        'cent': '¢', 'registered': '®', 'trademark': '™',

        // ══════════════ SPACING & TYPOGRAPHY ══════════════
        'quad': ' ', 'qquad': '  ', 'thinspace': ' ', 'enspace': ' ', 'emspace': ' ',
        'textendash': '\u2013', 'textemdash': '\u2014',
        'textquoteleft': '\u2018', 'textquoteright': '\u2019',
        'textquotedblleft': '\u201C', 'textquotedblright': '\u201D',
        'textellipsis': '\u2026', 'textbullet': '\u2022',
        'laquo': '\u00AB', 'raquo': '\u00BB',

        // ══════════════ BINARY OPERATIONS (extended) ══════════════
        'barwedge': '⊼', 'veebar': '⊻', 'doublebarwedge': '⩞',
        'curlywedge': '⋏', 'curlyvee': '⋎',
        'divideontimes': '⋇', 'dotplus': '∔',
        'centerdot': '·', 'intercal': '⊺',
        'circledast': '⊛', 'circledcirc': '⊚', 'circleddash': '⊝',

        // ══════════════ MISCELLANEOUS RELATIONS ══════════════
        'coloneq': '≔', 'eqcolon': '≕',
        'Coloneq': '⩴', 'defs': '≝', 'questeq': '≟',
        'approxeq': '≊', 'thicksim': '∼', 'thickapprox': '≈',

        // ══════════════ STACKS & ACCENTS (rendered as chars) ══════════════
        'hat': '̂', 'tilde': '̃', 'bar': '̄', 'vec': '⃗',
        'dot': '̇', 'ddot': '̈', 'dddot': '⃛',
        'breve': '̆', 'check': '̌', 'acute': '́', 'grave': '̀',
        'ring': '̊',

        // ══════════════ OTHER USEFUL SYMBOLS ══════════════
        'Box': '□', 'nBox': '■', 'Diamondblack': '◆',
        'sun': '☉', 'fullmoon': '🌕', 'leftmoon': '☽', 'rightmoon': '☾',
        'female': '♀', 'male': '♂',
        'phone': '☎', 'recorder': '⌕', 'checked': '✓',
        'smiley': '☺', 'frownie': '☹',
        'lightning': '↯', 'danger': '☡', 'radioactive': '☢', 'biohazard': '☣',
        'peace': '☮', 'yinyang': '☯',
        'skull': '☠', 'anchor': '⚓', 'swords': '⚔', 'warning': '⚠',
        'atom': '⚛', 'gear': '⚙', 'scissors': '✂', 'envelope': '✉',
        'pencil': '✎', 'snowflake': '❄', 'sparkle': '❇',
    };
    
    // Use HTML <sub> and <sup> tags for subscripts/superscripts
    function toSubscript(str) {
        return '<sub>' + str + '</sub>';
    }
    
    function toSuperscript(str) {
        return '<sup>' + str + '</sup>';
    }
    
    // Process math environments: $$...$$, \[...\], \(...\), $...$
    const processMathBlock = (mathContent) => {
        let result = mathContent.trim();
        
        // Handle \frac{a}{b} → (a/b)
        result = result.replace(/\\frac{([^}]+)}{([^}]+)}/g, '($1/$2)');
        
        // Handle \text{...} → just the text
        result = result.replace(/\\text(?:normal|rm)?{([^}]+)}/g, '$1');
        result = result.replace(/\\textbf{([^}]+)}/g, '$1');
        result = result.replace(/\\textit{([^}]+)}/g, '$1');
        result = result.replace(/\\mathrm{([^}]+)}/g, '$1');
        result = result.replace(/\\mathbf{([^}]+)}/g, '$1');
        result = result.replace(/\\mathit{([^}]+)}/g, '$1');
        result = result.replace(/\\mathbb{([^}]+)}/g, '$1');
        result = result.replace(/\\mathcal{([^}]+)}/g, '$1');
        result = result.replace(/\\operatorname{([^}]+)}/g, '$1');
        
        // Replace LaTeX commands: \alpha, \beta, \rightarrow, etc.
        result = result.replace(/\\([a-zA-Z]+(?:{[^}]*})?)/g, (m, cmd) => {
            return latexToUnicode[cmd] || m;
        });
        
        // Handle subscripts: _{...} or _x (single char)
        result = result.replace(/_{([^}]+)}/g, (m, sub) => toSubscript(sub));
        result = result.replace(/_([a-zA-Z0-9])/g, (m, sub) => toSubscript(sub));
        
        // Handle superscripts: ^{...} or ^x (single char)
        result = result.replace(/\^{([^}]+)}/g, (m, sup) => toSuperscript(sup));
        result = result.replace(/\^([a-zA-Z0-9])/g, (m, sup) => toSuperscript(sup));
        
        // Clean up remaining braces
        result = result.replace(/[{}]/g, '');
        
        // Clean up remaining backslashes before known symbols
        result = result.replace(/\\,/g, ' ').replace(/\\;/g, ' ').replace(/\\!/g, '').replace(/\\ /g, ' ');
        
        return result;
    };

    // 1. Display math $$...$$
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, mathContent) => {
        return processMathBlock(mathContent);
    });

    // 2. Display math \[...\]
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, mathContent) => {
        return processMathBlock(mathContent);
    });

    // 3. Inline math \(...\)
    text = text.replace(/\\\(([\s\S]*?)\\\)/g, (match, mathContent) => {
        return processMathBlock(mathContent);
    });

    // 4. Inline math $...$
    text = text.replace(/(?<!\$)\$(?!\$)([^$]+?)\$/g, (match, mathContent) => {
        return processMathBlock(mathContent);
    });
    
    // Also handle standalone LaTeX commands outside of $ delimiters
    // e.g., \text{...}, \tau, \rightarrow, \infty without $ signs (common in copy-paste)
    text = text.replace(/\\text(?:normal|rm)?\{([^}]+)\}/g, '$1');
    text = text.replace(/\\textbf\{([^}]+)\}/g, '<b>$1</b>');
    text = text.replace(/\\textit\{([^}]+)\}/g, '<i>$1</i>');
    text = text.replace(/\\mathrm\{([^}]+)\}/g, '$1');
    text = text.replace(/\\mathbf\{([^}]+)\}/g, '$1');
    text = text.replace(/\\mathit\{([^}]+)\}/g, '$1');
    text = text.replace(/\\operatorname\{([^}]+)\}/g, '$1');
    text = text.replace(/\\([a-zA-Z]+(?:{[^}]*})?)/g, (m, cmd) => {
        return latexToUnicode[cmd] || latexToUnicode[cmd.charAt(0).toLowerCase() + cmd.slice(1)] || m;
    });
    
    return text;
}

/**
 * Fix broken accents and combining diacritics from OCR, ChatGPT, LaTeX, Overleaf
 * e.g. "dina´mica" → "dinámica", "sinte´ticos" → "sintéticos", "a´" → "á", "\'e" → "é"
 */
function fixBrokenAccents(text) {
    if (!text) return '';
    
    let s = text;
    
    const acuteVowels = { 'a': 'á', 'e': 'é', 'i': 'í', 'o': 'ó', 'u': 'ú', 'A': 'Á', 'E': 'É', 'I': 'Í', 'O': 'Ó', 'U': 'Ú' };
    const graveVowels = { 'a': 'à', 'e': 'è', 'i': 'ì', 'o': 'ò', 'u': 'ù', 'A': 'À', 'E': 'È', 'I': 'Ì', 'O': 'Ò', 'U': 'Ù' };
    const tildeLetters = { 'n': 'ñ', 'N': 'Ñ', 'a': 'ã', 'o': 'õ', 'A': 'Ã', 'O': 'Õ' };
    const circVowels = { 'a': 'â', 'e': 'ê', 'i': 'î', 'o': 'ô', 'u': 'û', 'A': 'Â', 'E': 'Ê', 'I': 'Î', 'O': 'Ô', 'U': 'Û' };
    const umlautVowels = { 'a': 'ä', 'e': 'ë', 'i': 'ï', 'o': 'ö', 'u': 'ü', 'A': 'Ä', 'E': 'Ë', 'I': 'Ï', 'O': 'Ö', 'U': 'Ü' };

    // Broken spacing accents: "dina´mica" -> "dinámica", "sinte´ticos" -> "sintéticos"
    s = s.replace(/([aeiouAEIOU])[\s\u00A0]*[´'\u0301\u00B4]/g, (m, l) => acuteVowels[l] || m);
    s = s.replace(/[´'\u0301\u00B4][\s\u00A0]*([aeiouAEIOU])/g, (m, l) => acuteVowels[l] || m);

    s = s.replace(/([aeiouAEIOU])[\s\u00A0]*[`\u0300]/g, (m, l) => graveVowels[l] || m);
    s = s.replace(/([nNaAoO])[\s\u00A0]*[~\u0303]/g, (m, l) => tildeLetters[l] || m);
    s = s.replace(/([aeiouAEIOU])[\s\u00A0]*[\^\u0302]/g, (m, l) => circVowels[l] || m);
    s = s.replace(/([aeiouAEIOU])[\s\u00A0]*[¨"\u0308]/g, (m, l) => umlautVowels[l] || m);
    s = s.replace(/([cC])[\s\u00A0]*[,çÇ\u0327]/g, (m, l) => l === 'c' ? 'ç' : 'Ç');

    // LaTeX escaped accents: \'a, \`a, \~n, \^a, \"u, \c{c}, \acute{a}
    s = s.replace(/\\acute\{([aeiouAEIOU])\}/gi, (m, l) => acuteVowels[l] || m);
    s = s.replace(/\\grave\{([aeiouAEIOU])\}/gi, (m, l) => graveVowels[l] || m);
    s = s.replace(/\\tilde\{([nNaAoO])\}/gi, (m, l) => tildeLetters[l] || m);
    s = s.replace(/\\hat\{([aeiouAEIOU])\}/gi, (m, l) => circVowels[l] || m);
    s = s.replace(/\\ddot\{([aeiouAEIOU])\}/gi, (m, l) => umlautVowels[l] || m);
    s = s.replace(/\\c\{([cC])\}/gi, (m, l) => l.toLowerCase() === 'c' ? (l === 'C' ? 'Ç' : 'ç') : m);

    s = s.replace(/\\'([aeiouAEIOU])/gi, (m, l) => acuteVowels[l] || m);
    s = s.replace(/\\`([aeiouAEIOU])/gi, (m, l) => graveVowels[l] || m);
    s = s.replace(/\\~([nNaAoO])/gi, (m, l) => tildeLetters[l] || m);
    s = s.replace(/\\\^([aeiouAEIOU])/gi, (m, l) => circVowels[l] || m);
    s = s.replace(/\\"([aeiouAEIOU])/gi, (m, l) => umlautVowels[l] || m);

    // NFC Unicode normalization (merges base char + combining diacritics into single codepoints)
    return s.normalize('NFC');
}

/**
 * Clean LaTeX, MathJax, KaTeX, Overleaf and ChatGPT artifacts:
 * - Solves duplicate text artifacts: "causalidad\text{causalidad}" → "causalidad"
 * - Converts display math & symbols
 * - Normalizes accents and formatting
 */
function cleanLatexAndAiArtifacts(text) {
    if (!text) return '';

    // 1. Fix broken accents first
    let s = fixBrokenAccents(text);

    // 2. KaTeX / MathJax duplicated math and text artifact:
    // e.g. "causalidad\text{causalidad}" or "paneles sintéticos/pseudo-paneles\text{paneles sintéticos/pseudo-paneles}"
    s = s.replace(/([^\s\\]+)\s*\\text(?:normal|rm)?\{(?:\1|([^}]+))\}/gi, (m, word, inner) => {
        return inner ? inner.trim() : word.trim();
    });

    // 3. Convert all LaTeX math & symbols to Unicode equivalents
    s = convertLatexToUnicode(s);

    // 4. Standalone text commands: \text{...}, \textbf{...}, \textit{...}, etc.
    s = s.replace(/\\text(?:normal|rm)?\{([^}]+)\}/g, '$1');
    s = s.replace(/\\textbf\{([^}]+)\}/g, '<b>$1</b>');
    s = s.replace(/\\textit\{([^}]+)\}/g, '<i>$1</i>');
    s = s.replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>');
    s = s.replace(/\\(?:mathrm|mathbf|mathit|mathsf|mathtt|mathbb|mathcal|mathfrak)\{([^}]+)\}/g, '$1');

    // 5. LaTeX environment tags like \begin{equation}, \end{equation}, etc.
    s = s.replace(/\\(?:begin|end)\{[a-zA-Z0-9*]+\}/g, '');

    // 6. LaTeX line breaks: \\
    s = s.replace(/\\\\(?:\s*\[[\d\w\.]+\])?/g, '\n');

    // 7. Lingering \text{...} or broken accents
    s = s.replace(/\\text\{([^}]+)\}/g, '$1');
    s = fixBrokenAccents(s);

    return s;
}

function wrapSentences(text) {
    if (!text) return '';
    // Normalize newlines: convert <br> to \n while stripping adjoining whitespace
    let cleanText = text.replace(/[\t ]*<br\s*\/?>[\t ]*/gi, '\n');
    cleanText = cleanText.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n');
    const lines = cleanText.split('\n');
    let globalIndex = 0;

    return lines.map(line => {
        const trimmed = line.trim();
        if (trimmed === '') {
            return '<div class="tf-line tf-line-empty"></div>';
        }

        const plainLength = line.replace(/<[^>]+>/g, '').length;
        // List numbers (e.g. "1. "), headers, or short lines (< 90 chars) should be kept as 1 sentence unit
        if (plainLength < 90 || /^<[^>]+>\s*\d+[\.\)]/i.test(line) || /^\d+[\.\)]/.test(trimmed)) {
            return `<div class="tf-line"><span class="tf-sentence" data-index="${globalIndex++}">${line}</span></div>`;
        }

        // For paragraphs, split by sentence endings (. ! ?) only when followed by space and capital letter,
        // while ignoring numbered lists (e.g. "1. ")
        const sentenceRegex = /(?<=[.!?])(?<!\b\d[.!?])(?<!\b[A-Za-z][.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡<])/;
        const parts = line.split(sentenceRegex);

        // Verify HTML tag balance: if any part has unclosed tags, don't split to avoid breaking DOM
        let canSplit = true;
        for (const part of parts) {
            const openB = (part.match(/<b\b[^>]*>/gi) || []).length;
            const closeB = (part.match(/<\/b>/gi) || []).length;
            const openI = (part.match(/<i\b[^>]*>/gi) || []).length;
            const closeI = (part.match(/<\/i>/gi) || []).length;
            if (openB !== closeB || openI !== closeI) {
                canSplit = false;
                break;
            }
        }

        if (canSplit && parts.length > 1) {
            const content = parts.map(s => `<span class="tf-sentence" data-index="${globalIndex++}">${s}</span>`).join(' ');
            return `<div class="tf-line">${content}</div>`;
        } else {
            return `<div class="tf-line"><span class="tf-sentence" data-index="${globalIndex++}">${line}</span></div>`;
        }
    }).join('');
}

async function jsLog(msg) {
    console.log(msg);
    try {
        await invoke('log_from_js', { msg: String(msg) });
    } catch (e) {}
}

// SVG definitions for TTS states
const SPEAKER_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tf-svg-speaker"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
const PAUSE_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="4" x2="18" y2="20"></line><line x1="6" y1="4" x2="6" y2="20"></line></svg>`;
const PLAY_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;

function stopSpeaking() {
    jsLog("[JS TTS] stopSpeaking called. Cleaning up state...");
    if (currentAudio) {
        try {
            currentAudio.pause();
            currentAudio.src = ''; // Release audio resource immediately
        } catch (e) {}
        currentAudio = null;
    }
    
    // Clear all highlighted speaking sentences
    document.querySelectorAll('.tf-sentence-speaking').forEach(el => {
        el.classList.remove('tf-sentence-speaking');
    });

    // Reset button icons
    document.querySelector('.tf-audio-input-btn').innerHTML = SPEAKER_SVG;
    document.querySelector('.tf-audio-btn').innerHTML = SPEAKER_SVG;

    // Discard prefetch cache so no stale audio plays after stop
    ttsPrefetchCache = new Map();

    // Reset states (replace array reference so in-flight synthesis detects cancellation)
    ttsQueue = [];
    ttsQueueIndex = -1;
    isTtsPaused = false;
    activeSpeakerSide = null;
    activeSpeakingButton = null;
}

// pauseSpeaking and resumeSpeaking kept for compatibility but play button now acts as cancel
function pauseSpeaking() {
    // Now acts as stop/cancel - not a true pause
    stopSpeaking();
}

function resumeSpeaking() {
    // No longer used since pause = cancel
}

// Prefetch the next N sentences starting from `fromIndex` in the background.
// Stores Promises in ttsPrefetchCache so they resolve before the sentence is needed.
function prefetchAhead(fromIndex, capturedQueue) {
    const LOOKAHEAD = 2; // How many sentences ahead to prefetch
    for (let i = fromIndex; i < Math.min(fromIndex + LOOKAHEAD, capturedQueue.length); i++) {
        if (ttsPrefetchCache.has(i)) continue; // Already fetching or fetched
        const item = capturedQueue[i];
        jsLog(`[JS TTS PREFETCH] Starting prefetch for index ${i}: "${item.text.substring(0, 40)}..."`);
        // Store the Promise itself — callers await it directly
        const p = invoke('play_tts', { text: item.text, lang: item.lang }).catch(err => {
            jsLog(`[JS TTS PREFETCH ERROR] index ${i}: ${err}`);
            return null; // null signals failure; caller will skip or retry
        });
        ttsPrefetchCache.set(i, p);
    }
}

async function playNextInQueue() {
    // Snapshot the queue reference to detect mid-synthesis cancellation
    const snapshotQueue = ttsQueue;
    const snapshotIndex = ttsQueueIndex + 1;

    // Clean previous highlights
    document.querySelectorAll('.tf-sentence-speaking').forEach(el => {
        el.classList.remove('tf-sentence-speaking');
    });

    ttsQueueIndex = snapshotIndex;
    if (ttsQueueIndex >= ttsQueue.length) {
        jsLog("[JS TTS] Queue playback finished.");
        stopSpeaking();
        return;
    }

    const item = ttsQueue[ttsQueueIndex];
    jsLog(`[JS TTS] Playing item ${ttsQueueIndex + 1}/${ttsQueue.length}: "${item.text.substring(0, 40)}..."`);

    // Visually highlight sentence on both sides (mirror visual sync!)
    if (item.index !== undefined && item.index !== null) {
        const mirrors = document.querySelectorAll(`.tf-sentence[data-index="${item.index}"]`);
        mirrors.forEach(mirror => mirror.classList.add('tf-sentence-speaking'));
        
        const activeBox = activeSpeakerSide === 'original' ? originalBox : translationBox;
        const activeMirror = activeBox.querySelector(`.tf-sentence[data-index="${item.index}"]`);
        if (activeMirror) {
            activeMirror.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    try {
        // Use prefetch cache if available (instant), else fetch now
        let base64Audio;
        if (ttsPrefetchCache.has(ttsQueueIndex)) {
            jsLog(`[JS TTS] Cache hit for index ${ttsQueueIndex} — playing instantly!`);
            base64Audio = await ttsPrefetchCache.get(ttsQueueIndex);
            ttsPrefetchCache.delete(ttsQueueIndex); // Free memory
        } else {
            jsLog(`[JS TTS] No prefetch for index ${ttsQueueIndex}, synthesizing now...`);
            base64Audio = await invoke('play_tts', { text: item.text, lang: item.lang });
        }

        // Guard: check if queue was replaced while we awaited synthesis
        if (ttsQueue !== snapshotQueue || ttsQueue.length === 0) {
            jsLog("[JS TTS] Queue changed during synthesis. Aborting.");
            return;
        }

        if (!base64Audio) {
            // Synthesis failed (prefetch returned null), skip to next
            jsLog("[JS TTS] Synthesis returned null, skipping segment.");
            if (ttsQueue === snapshotQueue) playNextInQueue();
            return;
        }

        // ── Kick off prefetch for the NEXT sentences while this one plays ──
        prefetchAhead(ttsQueueIndex + 1, snapshotQueue);

        const audio = new Audio("data:audio/mpeg;base64," + base64Audio);
        currentAudio = audio;

        audio.onended = () => {
            if (currentAudio === audio) {
                jsLog("[JS TTS] Segment ended, playing next.");
                playNextInQueue();
            }
        };

        audio.onerror = () => {
            const code = audio.error ? audio.error.code : '?';
            jsLog(`[JS TTS ERROR] Audio error (code ${code}), skipping.`);
            if (currentAudio === audio) playNextInQueue();
        };

        audio.play().catch(error => {
            jsLog("[JS TTS ERROR] play() rejected: " + error.message);
            if (currentAudio === audio) playNextInQueue();
        });

    } catch (e) {
        jsLog("[JS TTS ERROR] Failed to synthesize: " + e);
        if (ttsQueue === snapshotQueue && ttsQueue.length > 0) {
            playNextInQueue();
        }
    }
}

// Backward-compatible speakText wrapper
async function speakText(text, lang, button) {
    stopSpeaking();
    if (!text || !text.trim()) return;
    
    ttsQueue = [{ text: text.trim(), lang: lang }];
    ttsQueueIndex = -1;
    activeSpeakerSide = 'selection';
    activeSpeakingButton = button;
    if (button) button.innerHTML = PAUSE_SVG;
    
    playNextInQueue();
}

function guessLangFromText(text) {
    if (!text || text.trim().length === 0) return null;
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    // 1. Japanese (Hiragana / Katakana)
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';

    // 2. Chinese (Hanzi without Japanese Kana)
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return 'zh';

    // 3. Unique character cues
    if (/[¡¿ñ]/.test(lower)) return 'es';
    if (/[ß]/.test(lower)) return 'de';
    if (/[ãõ]/.test(lower)) return 'pt';
    if (/[œæ]/.test(lower)) return 'fr';

    // 4. Token-based word scoring
    const words = lower.match(/[\p{L}\p{N}]+/gu) || [];
    if (words.length === 0) return null;

    const dicts = {
        'es': new Set([
            'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en', 'que', 'es', 
            'por', 'para', 'con', 'no', 'si', 'su', 'al', 'lo', 'como', 'más', 'mas', 'pero', 
            'sus', 'le', 'ya', 'o', 'fue', 'este', 'esta', 'estos', 'estas', 'esto', 'todo', 
            'toda', 'todos', 'todas', 'bien', 'bueno', 'buena', 'buenos', 'buenas', 'hola', 
            'gracias', 'favor', 'adios', 'adiós', 'usted', 'ustedes', 'nosotros', 'ellos', 'ellas', 
            'hacer', 'tener', 'estar', 'estoy', 'está', 'estan', 'están', 'muy', 'también', 
            'tambien', 'donde', 'dónde', 'cuando', 'cuándo', 'quien', 'quién', 'porque', 'porqué',
            'dia', 'día', 'dias', 'días', 'tarde', 'noche', 'tiempo', 'año', 'años', 'mundo', 'vida'
        ]),
        'en': new Set([
            'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 
            'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 
            'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 
            'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 
            'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 
            'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 
            'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 
            'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 
            'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 
            'us', 'hello', 'hi', 'please', 'thanks', 'thank', 'welcome', 'today', 'world'
        ]),
        'fr': new Set([
            'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'est', 'en', 'que', 'qui', 
            'dans', 'pour', 'pas', 'sur', 'ce', 'il', 'ils', 'elle', 'elles', 'avec', 'tout', 
            'faire', 'son', 'sa', 'ses', 'au', 'aux', 'par', 'mais', 'nous', 'vous', 'bonjour', 
            'merci', 'oui', 'non', 'comme', 'plus', 'bien', 'cette', 'ces', 'sont', 'mon', 'ton',
            'votre', 'notre', 'leur', 'leurs', 'temps', 'vie', 'monde'
        ]),
        'de': new Set([
            'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem', 
            'einen', 'und', 'in', 'zu', 'mit', 'nicht', 'ist', 'von', 'sie', 'es', 'sich', 
            'auch', 'auf', 'für', 'an', 'er', 'hat', 'wir', 'ihr', 'hallo', 'danke', 'bitte', 
            'ja', 'nein', 'guten', 'tag', 'wie', 'wer', 'was', 'wo', 'warum', 'aber', 'wenn'
        ]),
        'pt': new Set([
            'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das', 
            'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'não', 'nao', 'que', 'se', 
            'como', 'mais', 'mas', 'ele', 'ela', 'eles', 'elas', 'você', 'voce', 'olá', 'ola', 
            'obrigado', 'obrigada', 'sim', 'tudo', 'bem', 'bom', 'boa', 'dias', 'tarde', 'noite',
            'este', 'esta', 'isto', 'muito', 'também', 'tambem', 'onde', 'quando', 'quem'
        ]),
        'it': new Set([
            'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'in', 'con', 'su', 'per', 
            'tra', 'fra', 'di', 'a', 'da', 'che', 'non', 'si', 'sono', 'questo', 'questa', 
            'questi', 'queste', 'ciao', 'grazie', 'buongiorno', 'anche', 'come', 'cosa', 
            'dove', 'quando', 'perché', 'perche', 'tutto', 'molto', 'bene', 'giorno', 'sera'
        ])
    };

    const scores = { es: 0, en: 0, fr: 0, de: 0, pt: 0, it: 0 };
    for (const w of words) {
        for (const [lang, set] of Object.entries(dicts)) {
            if (set.has(w)) {
                scores[lang]++;
            }
        }
    }

    let maxScore = 0;
    let bestLang = null;
    for (const [lang, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            bestLang = lang;
        }
    }

    if (maxScore > 0) return bestLang;

    // 5. Fallback suffix / accented patterns
    if (/[áéíóú]/.test(lower)) {
        if (/[àèìòù]/.test(lower)) return 'it';
        if (/ção|ções|ndo|lhe/.test(lower)) return 'pt';
        return 'es';
    }
    if (/[äöü]/.test(lower)) return 'de';
    if (/[èêëàâùûç]/.test(lower)) return 'fr';
    if (lower.endsWith('tion') || lower.endsWith('ing') || lower.endsWith('ed')) return 'en';
    if (lower.endsWith('ción') || lower.endsWith('ando') || lower.endsWith('iendo')) return 'es';
    if (lower.endsWith('ung') || lower.endsWith('keit') || lower.endsWith('heit')) return 'de';
    if (lower.endsWith('ção') || lower.endsWith('agem')) return 'pt';

    return null;
}

// Stop speaking when window is minimized or hidden
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        jsLog("[JS TTS] Window minimized or hidden. Stopping playback.");
        stopSpeaking();
    }
});

// Run application
init();
