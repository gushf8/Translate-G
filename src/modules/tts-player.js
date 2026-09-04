/**
 * TTS Audio Player Module
 * Handles Edge TTS synthesis queue, prefetching, playback and sentence highlight sync.
 */

const { invoke } = window.__TAURI__.core;

export const SPEAKER_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tf-svg-speaker"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
export const PAUSE_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="4" x2="18" y2="20"></line><line x1="6" y1="4" x2="6" y2="20"></line></svg>`;
export const PLAY_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;

let currentAudio = null;
let ttsQueue = [];
let ttsQueueIndex = -1;
let ttsPrefetchCache = new Map();
let activeSpeakerSide = null;
let activeSpeakingButton = null;

async function jsLog(msg) {
    console.log(msg);
    try {
        await invoke('log_from_js', { msg: String(msg) });
    } catch (e) {}
}

export function stopSpeaking() {
    jsLog("[JS TTS] stopSpeaking called. Cleaning up state...");
    if (currentAudio) {
        try {
            currentAudio.pause();
            currentAudio.src = '';
        } catch (e) {}
        currentAudio = null;
    }
    
    // Clear all highlighted speaking sentences
    document.querySelectorAll('.tf-sentence-speaking').forEach(el => {
        el.classList.remove('tf-sentence-speaking');
    });

    // Reset button icons
    const inBtn = document.querySelector('.tf-audio-input-btn');
    const outBtn = document.querySelector('.tf-audio-btn');
    if (inBtn) inBtn.innerHTML = SPEAKER_SVG;
    if (outBtn) outBtn.innerHTML = SPEAKER_SVG;

    // Discard prefetch cache
    ttsPrefetchCache = new Map();

    // Reset states
    ttsQueue = [];
    ttsQueueIndex = -1;
    activeSpeakerSide = null;
    activeSpeakingButton = null;
}

export function prefetchAhead(fromIndex, capturedQueue) {
    const LOOKAHEAD = 2;
    for (let i = fromIndex; i < Math.min(fromIndex + LOOKAHEAD, capturedQueue.length); i++) {
        if (ttsPrefetchCache.has(i)) continue;
        const item = capturedQueue[i];
        jsLog(`[JS TTS PREFETCH] Starting prefetch for index ${i}: "${item.text.substring(0, 40)}..."`);
        const p = invoke('play_tts', { text: item.text, lang: item.lang }).catch(err => {
            jsLog(`[JS TTS PREFETCH ERROR] index ${i}: ${err}`);
            return null;
        });
        ttsPrefetchCache.set(i, p);
    }
}

export async function playNextInQueue(originalBox, translationBox) {
    const snapshotQueue = ttsQueue;
    const snapshotIndex = ttsQueueIndex + 1;

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

    if (item.index !== undefined && item.index !== null) {
        const mirrors = document.querySelectorAll(`.tf-sentence[data-index="${item.index}"]`);
        mirrors.forEach(mirror => mirror.classList.add('tf-sentence-speaking'));
        
        const activeBox = activeSpeakerSide === 'original' ? originalBox : translationBox;
        if (activeBox) {
            const activeMirror = activeBox.querySelector(`.tf-sentence[data-index="${item.index}"]`);
            if (activeMirror) {
                activeMirror.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    try {
        let base64Audio;
        if (ttsPrefetchCache.has(ttsQueueIndex)) {
            jsLog(`[JS TTS] Cache hit for index ${ttsQueueIndex} — playing instantly!`);
            base64Audio = await ttsPrefetchCache.get(ttsQueueIndex);
            ttsPrefetchCache.delete(ttsQueueIndex);
        } else {
            jsLog(`[JS TTS] No prefetch for index ${ttsQueueIndex}, synthesizing now...`);
            base64Audio = await invoke('play_tts', { text: item.text, lang: item.lang });
        }

        if (ttsQueue !== snapshotQueue || ttsQueue.length === 0) {
            jsLog("[JS TTS] Queue changed during synthesis. Aborting.");
            return;
        }

        if (!base64Audio) {
            jsLog("[JS TTS] Synthesis returned null, skipping segment.");
            if (ttsQueue === snapshotQueue) playNextInQueue(originalBox, translationBox);
            return;
        }

        prefetchAhead(ttsQueueIndex + 1, snapshotQueue);

        const audio = new Audio("data:audio/mpeg;base64," + base64Audio);
        currentAudio = audio;

        audio.onended = () => {
            if (currentAudio === audio) {
                jsLog("[JS TTS] Segment ended, playing next.");
                playNextInQueue(originalBox, translationBox);
            }
        };

        audio.onerror = () => {
            const code = audio.error ? audio.error.code : '?';
            jsLog(`[JS TTS ERROR] Audio error (code ${code}), skipping.`);
            if (currentAudio === audio) playNextInQueue(originalBox, translationBox);
        };

        audio.play().catch(error => {
            jsLog("[JS TTS ERROR] play() rejected: " + error.message);
            if (currentAudio === audio) playNextInQueue(originalBox, translationBox);
        });

    } catch (e) {
        jsLog("[JS TTS ERROR] Failed to synthesize: " + e);
        if (ttsQueue === snapshotQueue && ttsQueue.length > 0) {
            playNextInQueue(originalBox, translationBox);
        }
    }
}

export function startQueuePlayback(queue, side, button, originalBox, translationBox) {
    stopSpeaking();
    if (!queue || queue.length === 0) return;

    ttsQueue = queue;
    ttsQueueIndex = -1;
    activeSpeakerSide = side;
    activeSpeakingButton = button;
    if (button) button.innerHTML = PAUSE_SVG;

    prefetchAhead(1, ttsQueue);
    playNextInQueue(originalBox, translationBox);
}

export async function speakText(text, lang, button, originalBox, translationBox) {
    stopSpeaking();
    if (!text || !text.trim()) return;
    
    ttsQueue = [{ text: text.trim(), lang: lang }];
    ttsQueueIndex = -1;
    activeSpeakerSide = 'selection';
    activeSpeakingButton = button;
    if (button) button.innerHTML = PAUSE_SVG;
    
    playNextInQueue(originalBox, translationBox);
}

export function isCurrentlySpeaking() {
    return !!currentAudio || (ttsQueue && ttsQueue.length > 0);
}

export function getActiveSpeakerSide() {
    return activeSpeakerSide;
}

// Automatically stop TTS when window hidden
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            jsLog("[JS TTS] Window minimized or hidden. Stopping playback.");
            stopSpeaking();
        }
    });
}
