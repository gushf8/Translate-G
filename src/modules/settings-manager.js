/**
 * Settings and Preferences Manager Module
 */

const { invoke } = window.__TAURI__.core;

export function applyTypographySettings(fontFamily, lineSpacing, fontSize) {
    document.documentElement.style.setProperty('--tf-user-font', fontFamily);
    document.documentElement.style.setProperty('--tf-user-line-height', lineSpacing);
    document.documentElement.style.setProperty('--tf-user-font-size', `${fontSize}px`);
}

export async function loadSettings() {
    try {
        const settings = await invoke('get_settings');
        return {
            voice_preference: settings.voice_preference || 'female',
            base_lang: settings.base_lang || 'es',
            smart_lang: settings.smart_lang || 'en',
            disable_ctrl_c_on_extension_detect: settings.disable_ctrl_c_on_extension_detect || false,
            voice_rate: settings.voice_rate !== undefined ? settings.voice_rate : 1.0,
            voice_pitch: settings.voice_pitch !== undefined ? settings.voice_pitch : 0.0,
            font_family: settings.font_family || "'Segoe UI', system-ui, -apple-system, sans-serif",
            line_spacing: settings.line_spacing || "1.15",
            font_size: (settings.font_size !== undefined && settings.font_size >= 10 && settings.font_size <= 36) ? settings.font_size : 19
        };
    } catch (e) {
        console.error("Failed to load settings:", e);
        return {
            voice_preference: 'female',
            base_lang: 'es',
            smart_lang: 'en',
            disable_ctrl_c_on_extension_detect: false,
            voice_rate: 1.0,
            voice_pitch: 0.0,
            font_family: "'Segoe UI', system-ui, -apple-system, sans-serif",
            line_spacing: "1.15",
            font_size: 19
        };
    }
}

export async function saveSettings(settings) {
    try {
        await invoke('save_settings', {
            newSettings: {
                voice_preference: settings.voice_preference || 'female',
                base_lang: settings.base_lang || 'es',
                smart_lang: settings.smart_lang || 'en',
                disable_ctrl_c_on_extension_detect: settings.disable_ctrl_c_on_extension_detect || false,
                voice_rate: settings.voice_rate !== undefined ? settings.voice_rate : 1.0,
                voice_pitch: settings.voice_pitch !== undefined ? settings.voice_pitch : 0.0,
                font_family: settings.font_family || "'Segoe UI', system-ui, -apple-system, sans-serif",
                line_spacing: settings.line_spacing || "1.15",
                font_size: settings.font_size || 19
            }
        });
    } catch (e) {
        console.error("Failed to save settings:", e);
    }
}
