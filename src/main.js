import { 
    cleanLatexAndAiArtifacts, 
    convertLatexToUnicode, 
    fixBrokenAccents 
} from './modules/latex-cleaner.js';

import { 
    cleanOcrAndScanText, 
    sanitizeClipboardHtml, 
    convertSlackShortcodes, 
    renderMarkdownFormatting, 
    wrapSentences, 
    extractFormattedText 
} from './modules/text-sanitizer.js';

import { 
    guessLangFromText, 
    languages 
} from './modules/language-detector.js';

import { 
    setupSentenceSync 
} from './modules/sync-scroll.js';

import { 
    stopSpeaking, 
    prefetchAhead, 
    playNextInQueue, 
    startQueuePlayback, 
    speakText, 
    SPEAKER_SVG, 
    PAUSE_SVG 
} from './modules/tts-player.js';

import { 
    applyTypographySettings, 
    loadSettings, 
    saveSettings as persistSettings 
} from './modules/settings-manager.js';

import { 
    loadAndRenderHistory, 
    renderHistoryList 
} from './modules/history-manager.js';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { WebviewWindow } = window.__TAURI__.webviewWindow;

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

// Start application

async function init() {
    // Generate Select Options
    srcSelect.innerHTML = generateLangOptions(currentSource);
    targetSelect.innerHTML = generateLangOptions(currentTarget, true);

    // Load settings from backend
    try {
        const settings = await loadSettings();
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

    // Load and render history using history module
    await loadAndRenderHistory(historyList, onSelectHistoryItem, onHistoryDeleted);

    // Setup sentence sync (hover and click-to-scroll)
    setupSentenceSync();

    // Event listeners setup
    setupEvents();
    setupTauriListeners();
}

function onSelectHistoryItem(found) {
    stopSpeaking();
    originalBox.innerHTML = wrapSentences(found.original);
    translationBox.innerHTML = wrapSentences(found.translation);
    lastSavedId = found.id;
    isManualInput = true;
    originalBox.focus();
}

function onHistoryDeleted(deletedId) {
    if (lastSavedId === deletedId) {
        lastSavedId = null;
    }
}

function generateLangOptions(selected, skipAuto = false) {
    const langDict = Array.isArray(languages) ? languages : Object.entries(languages).map(([c, n]) => ({ code: c, name: n }));
    return langDict
        .filter(l => !skipAuto || l.code !== 'auto')
        .map(l => `<option value="${l.code}" ${l.code === selected ? 'selected' : ''}>${l.name}</option>`)
        .join('');
}

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
            startQueuePlayback(ttsQueue, 'original', inputAudioBtn, originalBox, translationBox);
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
            startQueuePlayback(ttsQueue, 'original', inputAudioBtn, originalBox, translationBox);
        }
    };

    // Stop buttons click event setup (removed from HTML; play button now cancels)
    // originalStopBtn.onclick = () => stopSpeaking();
    // translationStopBtn.onclick = () => stopSpeaking();

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
                startQueuePlayback(ttsQueue, isOriginal ? 'original' : 'translation', activeSpeakingButton, originalBox, translationBox);
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
    await persistSettings({
        voice_preference: voicePreference || 'female',
        base_lang: baseDefaultTarget,
        smart_lang: smartTargetLang,
        disable_ctrl_c_on_extension_detect: disableCtrlCOnExtensionDetect,
        voice_rate: voiceRate,
        voice_pitch: voicePitch,
        font_family: currentFontFamily,
        line_spacing: currentLineSpacing,
        font_size: currentFontSize
    });
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

        renderHistoryList(savedHistory, historyList, onSelectHistoryItem, onHistoryDeleted);
        isManualInput = true;

    } catch (e) {
        if (!session.cancelled) {
            translationBox.innerHTML = `<span class="tf-loader" style="color: #ea4335;">Error de traducción: ${e}</span>`;
        }
    }
}

// Run application
init();
