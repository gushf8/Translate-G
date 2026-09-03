use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM, HWND};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
    KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL, VK_SHIFT, KEYBD_EVENT_FLAGS,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, SetWindowsHookExW, UnhookWindowsHookEx, HC_ACTION,
    HHOOK, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
    SetTimer, KillTimer, WM_TIMER,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::DataExchange::{
    OpenClipboard, CloseClipboard, EmptyClipboard, GetClipboardData, SetClipboardData, RegisterClipboardFormatW,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use tauri::Emitter;

use crate::server::AppState;
use crate::translate::translate;
use crate::ocr;

static APP_STATE: OnceLock<Arc<AppState>> = OnceLock::new();
static TAURI_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
static mut HOOK_HANDLE: Option<HHOOK> = None;

// Double Ctrl+C tracking
static mut LAST_C_PRESS: Option<Instant> = None;

// Prevent hook recursion
static mut IS_SIMULATING_INPUT: bool = false;

pub fn start_keyboard_hook(handle: tauri::AppHandle, state: Arc<AppState>) {
    let _ = APP_STATE.set(state);
    let _ = TAURI_HANDLE.set(handle);

    std::thread::spawn(|| {
        unsafe {
            let instance = GetModuleHandleW(None).unwrap();
            let mut hook = SetWindowsHookExW(
                WH_KEYBOARD_LL,
                Some(keyboard_hook_callback),
                instance,
                0,
            ).unwrap();
            HOOK_HANDLE = Some(hook);

            println!("Keyboard hook installed successfully!");

            // Register a thread-local timer that fires every 3 seconds
            let timer_id = SetTimer(HWND(0), 1, 3000, None);
            let mut last_tick = std::time::SystemTime::now();

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, HWND(0), 0, 0).as_bool() {
                if msg.message == WM_TIMER && msg.wParam.0 == 1 {
                    let now = std::time::SystemTime::now();
                    if let Ok(elapsed) = now.duration_since(last_tick) {
                        // If more than 8 seconds elapsed instead of the expected 3,
                        // it means the system went to sleep / suspended.
                        if elapsed > std::time::Duration::from_secs(8) {
                            println!("System sleep/resume detected! Re-registering keyboard hook. Elapsed time: {:?}", elapsed);
                            let _ = UnhookWindowsHookEx(hook);
                            if let Ok(new_hook) = SetWindowsHookExW(
                                WH_KEYBOARD_LL,
                                Some(keyboard_hook_callback),
                                instance,
                                0,
                            ) {
                                hook = new_hook;
                                HOOK_HANDLE = Some(hook);
                                println!("Keyboard hook re-registered successfully after sleep/resume.");
                            } else {
                                println!("Failed to re-register keyboard hook after sleep/resume.");
                            }
                        }
                    }
                    last_tick = now;
                }
            }

            let _ = KillTimer(HWND(0), timer_id);
            if let Some(h) = HOOK_HANDLE {
                let _ = UnhookWindowsHookEx(h);
            }
        }
    });
}

unsafe extern "system" fn keyboard_hook_callback(
    code: i32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if code == HC_ACTION as i32 && !IS_SIMULATING_INPUT {
        let kbd_struct = lparam.0 as *const KBDLLHOOKSTRUCT;
        let vk_code = (*kbd_struct).vkCode;
        let event_type = wparam.0 as u32;

        if event_type == WM_KEYDOWN || event_type == WM_SYSKEYDOWN {
            let ctrl_pressed = (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0
                || (GetAsyncKeyState(0xA2) as u16 & 0x8000) != 0
                || (GetAsyncKeyState(0xA3) as u16 & 0x8000) != 0;
            let shift_pressed = (GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0
                || (GetAsyncKeyState(0xA0) as u16 & 0x8000) != 0
                || (GetAsyncKeyState(0xA1) as u16 & 0x8000) != 0;

            // 1. Double Ctrl + C (vk_code 0x43 is 'C')
            if (vk_code == 0x43 || vk_code == 0x63) && ctrl_pressed && !shift_pressed {
                let now = Instant::now();
                
                let is_extension_active = if let Some(state) = APP_STATE.get() {
                    let settings = state.settings.lock().unwrap();
                    if settings.disable_ctrl_c_on_extension_detect {
                        let last_ping_guard = state.last_extension_ping.lock().unwrap();
                        if let Some(last_ping) = *last_ping_guard {
                            last_ping.elapsed() < Duration::from_secs(15)
                        } else {
                            false
                        }
                    } else {
                        false
                    }
                } else {
                    false
                };

                if !is_extension_active {
                    if let Some(last) = LAST_C_PRESS {
                        if now.duration_since(last) < Duration::from_millis(500) {
                            LAST_C_PRESS = None; // Reset
                            trigger_open_translator();
                        } else {
                            LAST_C_PRESS = Some(now);
                        }
                    } else {
                        LAST_C_PRESS = Some(now);
                    }
                }
            }

            // 2. Ctrl + Shift + Z (vk_code 0x5A is 'Z') -> Swap
            if (vk_code == 0x5A || vk_code == 0x7A) && ctrl_pressed && shift_pressed {
                trigger_in_place_swap();
                return LRESULT(1); // Swallow the keypress
            }

            // 3. Ctrl + Shift + X (vk_code 0x58 is 'X') -> OCR
            if (vk_code == 0x58 || vk_code == 0x78) && ctrl_pressed && shift_pressed {
                trigger_ocr();
                return LRESULT(1); // Swallow the keypress
            }
        }
    }

    CallNextHookEx(None, code, wparam, lparam)
}

fn trigger_open_translator() {
    std::thread::spawn(|| {
        // Wait 100ms for active copy to complete and update clipboard
        std::thread::sleep(Duration::from_millis(100));
        if let Some(text) = get_clipboard_html_or_text() {
            if let Some(handle) = TAURI_HANDLE.get() {
                let _ = handle.emit("open-translator-with-text", text);
                
                // Show and focus the main window
                use tauri::Manager;
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        }
    });
}

pub fn trigger_ocr() {
    if let Some(handle) = TAURI_HANDLE.get() {
        use tauri::Manager;
        
        // 1. Hide main window immediately so it's not captured in desktop screenshot
        if let Some(main_win) = handle.get_webview_window("main") {
            let _ = main_win.hide();
        }
        
        // 2. Hide OCR overlay if it was open to avoid capturing itself
        if let Some(ocr_win) = handle.get_webview_window("ocr") {
            let _ = ocr_win.hide();
        }
        
        let handle_clone = handle.clone();
        std::thread::spawn(move || {
            // Wait 120ms for Windows compositor to redraw underneath
            std::thread::sleep(Duration::from_millis(120));
            
            // 3. Take screenshot NOW while OCR window is completely hidden
            let capture_result = ocr::capture_screen();
            
            if let Some(ocr_win) = handle_clone.get_webview_window("ocr") {
                if let Some((png_bytes, width, height)) = capture_result {
                    let b64 = ocr::base64_encode(&png_bytes);
                    let payload = serde_json::json!({
                        "image": format!("data:image/png;base64,{}", b64),
                        "width": width,
                        "height": height
                    });
                    
                    // Show OCR window only AFTER screenshot is taken
                    let _ = ocr_win.unminimize();
                    let _ = ocr_win.show();
                    let _ = ocr_win.set_always_on_top(true);
                    let _ = ocr_win.set_focus();
                    
                    if let Ok(hwnd) = ocr_win.hwnd() {
                        unsafe {
                            use windows::Win32::UI::WindowsAndMessaging::{
                                SetForegroundWindow, SetWindowPos, ShowWindow, HWND_TOPMOST,
                                SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_SHOW,
                            };
                            let win_hwnd = windows::Win32::Foundation::HWND(hwnd.0 as _);
                            let _ = ShowWindow(win_hwnd, SW_SHOW);
                            let _ = SetWindowPos(win_hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                            let _ = SetForegroundWindow(win_hwnd);
                        }
                    }
                    
                    let _ = ocr_win.emit("start-ocr-capture", payload);
                }
            }
        });
    }
}

fn trigger_in_place_swap() {
    tauri::async_runtime::spawn(async move {
        unsafe {
            IS_SIMULATING_INPUT = true;
            
            // 1. Save original clipboard text
            let original_clipboard = get_clipboard_text();

            // 2. Simulate Ctrl + C to copy selection
            send_key_combination(&[VK_CONTROL, VIRTUAL_KEY(0x43)]);
            tokio::time::sleep(Duration::from_millis(100)).await;

            // 3. Read selection text
            if let Some(selection) = get_clipboard_text() {
                if !selection.trim().is_empty() {
                    // Get translation configuration from settings
                    let settings = {
                        let state = APP_STATE.get().unwrap();
                        let settings_guard = state.settings.lock().unwrap();
                        settings_guard.clone()
                    };

                    // Detect language
                    let detected_lang = guess_language(&selection);
                    let (source_lang, target_lang) = if detected_lang.as_deref() == Some(&settings.base_lang) {
                        (settings.base_lang.clone(), settings.smart_lang.clone())
                    } else {
                        ("auto".to_string(), settings.base_lang.clone())
                    };

                    // 4. Translate text
                    if let Ok((mut translation, _)) = translate(&selection, &source_lang, &target_lang).await {
                        // If translation returned identical text to selection and source was auto, swap target
                        if translation.trim().eq_ignore_ascii_case(selection.trim()) && selection.trim().len() > 1 {
                            let fallback_target = if target_lang == settings.base_lang {
                                &settings.smart_lang
                            } else {
                                &settings.base_lang
                            };
                            if let Ok((swapped_translation, _)) = translate(&selection, "auto", fallback_target).await {
                                translation = swapped_translation;
                            }
                        }

                        // 5. Write translation to clipboard
                        set_clipboard_text(&translation);

                        // 6. Simulate Ctrl + V to paste translation
                        send_key_combination(&[VK_CONTROL, VIRTUAL_KEY(0x56)]);
                        tokio::time::sleep(Duration::from_millis(150)).await;
                    }
                }
            }

            // 7. Restore original clipboard
            if let Some(orig) = original_clipboard {
                set_clipboard_text(&orig);
            }

            IS_SIMULATING_INPUT = false;
        }
    });
}

fn guess_language(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Japanese Hiragana/Katakana
    if trimmed.chars().any(|c| ('\u{3040}'..='\u{309f}').contains(&c) || ('\u{30a0}'..='\u{30ff}').contains(&c)) {
        return Some("ja".to_string());
    }

    // Chinese Hanzi
    if trimmed.chars().any(|c| ('\u{4e00}'..='\u{9fff}').contains(&c) || ('\u{3400}'..='\u{4dbf}').contains(&c)) {
        return Some("zh".to_string());
    }

    let lower = trimmed.to_lowercase();

    // Unique punctuation and accents
    if lower.contains('¡') || lower.contains('¿') || lower.contains('ñ') {
        return Some("es".to_string());
    }
    if lower.contains('ß') {
        return Some("de".to_string());
    }
    if lower.contains('ã') || lower.contains('õ') {
        return Some("pt".to_string());
    }
    if lower.contains('œ') || lower.contains('æ') {
        return Some("fr".to_string());
    }

    // Tokenized word matching
    let words: Vec<&str> = lower
        .split(|c: char| !c.is_alphanumeric() && c != '\'' && c != '’')
        .filter(|w| !w.is_empty())
        .collect();

    let es_dict = ["el", "la", "los", "las", "un", "una", "de", "del", "en", "que", "es", "por", "para", "con", "no", "si", "su", "al", "lo", "como", "mas", "más", "pero", "sus", "le", "ya", "este", "esta", "todo", "bien", "bueno", "hola", "gracias", "adios", "adiós", "muy", "tambien", "también", "donde", "cuando", "quien", "porque", "dia", "día"];
    let en_dict = ["the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with", "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say", "her", "she", "or", "an", "will", "my", "one", "all", "would", "there", "their", "what", "so", "up", "out", "if", "about", "who", "get", "which", "go", "me", "when", "can", "like", "hello", "thanks", "thank", "please"];
    let fr_dict = ["le", "la", "les", "un", "une", "des", "du", "de", "et", "est", "en", "que", "qui", "dans", "pour", "pas", "sur", "ce", "il", "ils", "elle", "avec", "tout", "son", "sa", "ses", "au", "aux", "par", "mais", "nous", "vous", "bonjour", "merci", "oui", "non"];
    let de_dict = ["der", "die", "das", "den", "dem", "des", "ein", "eine", "und", "in", "zu", "mit", "nicht", "ist", "von", "sie", "es", "sich", "auch", "auf", "für", "an", "er", "hat", "wir", "ihr", "hallo", "danke", "bitte", "ja", "nein", "guten"];
    let pt_dict = ["o", "a", "os", "as", "um", "uma", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "por", "para", "com", "não", "nao", "que", "se", "como", "mais", "mas", "ele", "ela", "você", "voce", "olá", "ola", "obrigado", "obrigada", "sim", "tudo", "bem"];
    let it_dict = ["il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "in", "con", "su", "per", "tra", "fra", "di", "a", "da", "che", "non", "si", "sono", "questo", "questa", "ciao", "grazie", "buongiorno", "anche", "come", "cosa", "dove", "quando", "tutto"];

    let mut es_score = 0;
    let mut en_score = 0;
    let mut fr_score = 0;
    let mut de_score = 0;
    let mut pt_score = 0;
    let mut it_score = 0;

    for &w in &words {
        if es_dict.contains(&w) { es_score += 1; }
        if en_dict.contains(&w) { en_score += 1; }
        if fr_dict.contains(&w) { fr_score += 1; }
        if de_dict.contains(&w) { de_score += 1; }
        if pt_dict.contains(&w) { pt_score += 1; }
        if it_dict.contains(&w) { it_score += 1; }
    }

    let scores = [
        (es_score, "es"),
        (en_score, "en"),
        (fr_score, "fr"),
        (de_score, "de"),
        (pt_score, "pt"),
        (it_score, "it"),
    ];

    if let Some(&(max, lang)) = scores.iter().max_by_key(|(s, _)| *s) {
        if max > 0 {
            return Some(lang.to_string());
        }
    }

    if lower.contains('á') || lower.contains('é') || lower.contains('í') || lower.contains('ó') || lower.contains('ú') {
        return Some("es".to_string());
    }
    if lower.contains('ä') || lower.contains('ö') || lower.contains('ü') {
        return Some("de".to_string());
    }
    if lower.contains('è') || lower.contains('ê') || lower.contains('ë') || lower.contains('à') || lower.contains('â') || lower.contains('ù') || lower.contains('ç') {
        return Some("fr".to_string());
    }

    None
}

// Windows Keyboard Simulation Helpers
unsafe fn send_key_combination(keys: &[VIRTUAL_KEY]) {
    let mut inputs = Vec::new();

    // Press keys
    for &key in keys {
        inputs.push(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: key,
                    wScan: 0,
                    dwFlags: KEYBD_EVENT_FLAGS(0),
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
    }

    // Release keys in reverse
    for &key in keys.iter().rev() {
        inputs.push(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: key,
                    wScan: 0,
                    dwFlags: KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
    }

    SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
}

// Windows Clipboard API Native Wrappers
pub fn get_clipboard_html_or_text() -> Option<String> {
    unsafe {
        if OpenClipboard(HWND(0)).is_err() {
            return None;
        }
        let cf_html = RegisterClipboardFormatW(windows::core::w!("HTML Format"));
        if cf_html != 0 {
            if let Ok(handle) = GetClipboardData(cf_html) {
                let h_mem = windows::Win32::Foundation::HGLOBAL(handle.0 as *mut std::ffi::c_void);
                let ptr = GlobalLock(h_mem);
                if !ptr.is_null() {
                    let u8_ptr = ptr as *const u8;
                    let mut len = 0;
                    while *u8_ptr.add(len) != 0 {
                        len += 1;
                    }
                    let slice = std::slice::from_raw_parts(u8_ptr, len);
                    let html_raw = String::from_utf8_lossy(slice).to_string();
                    let _ = GlobalUnlock(h_mem);
                    let _ = CloseClipboard();

                    // Parse HTML Fragment
                    if let Some(start_pos) = html_raw.find("<!--StartFragment-->") {
                        let content_start = start_pos + "<!--StartFragment-->".len();
                        if let Some(end_pos) = html_raw[content_start..].find("<!--EndFragment-->") {
                            let fragment = &html_raw[content_start..content_start + end_pos];
                            return Some(fragment.to_string());
                        }
                    }
                    return Some(html_raw);
                }
            }
        }
        
        let handle = GetClipboardData(13); // CF_UNICODETEXT
        if handle.is_err() {
            let _ = CloseClipboard();
            return None;
        }
        let h_mem = windows::Win32::Foundation::HGLOBAL(handle.unwrap().0 as *mut std::ffi::c_void);
        let ptr = GlobalLock(h_mem);
        if ptr.is_null() {
            let _ = CloseClipboard();
            return None;
        }
        let wide_ptr = ptr as *const u16;
        let mut len = 0;
        while *wide_ptr.add(len) != 0 {
            len += 1;
        }
        let slice = std::slice::from_raw_parts(wide_ptr, len);
        let text = String::from_utf16_lossy(slice);
        let _ = GlobalUnlock(h_mem);
        let _ = CloseClipboard();
        Some(text)
    }
}

pub fn get_clipboard_text() -> Option<String> {
    unsafe {
        if OpenClipboard(HWND(0)).is_err() {
            return None;
        }
        let handle = GetClipboardData(13); // 13 is CF_UNICODETEXT
        if handle.is_err() {
            let _ = CloseClipboard();
            return None;
        }
        let h_mem = windows::Win32::Foundation::HGLOBAL(handle.unwrap().0 as *mut std::ffi::c_void);
        let ptr = GlobalLock(h_mem);
        if ptr.is_null() {
            let _ = CloseClipboard();
            return None;
        }
        let wide_ptr = ptr as *const u16;
        let mut len = 0;
        while *wide_ptr.add(len) != 0 {
            len += 1;
        }
        let slice = std::slice::from_raw_parts(wide_ptr, len);
        let text = String::from_utf16_lossy(slice);
        let _ = GlobalUnlock(h_mem);
        let _ = CloseClipboard();
        Some(text)
    }
}

pub fn set_clipboard_text(text: &str) -> bool {
    unsafe {
        if OpenClipboard(HWND(0)).is_err() {
            return false;
        }
        let _ = EmptyClipboard();
        let utf16: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        let size = utf16.len() * 2;
        let h_mem_result = GlobalAlloc(GMEM_MOVEABLE, size);
        if h_mem_result.is_err() {
            let _ = CloseClipboard();
            return false;
        }
        let h_mem = h_mem_result.unwrap();
        let ptr = GlobalLock(h_mem);
        if ptr.is_null() {
            let _ = CloseClipboard();
            return false;
        }
        std::ptr::copy_nonoverlapping(utf16.as_ptr(), ptr as *mut u16, utf16.len());
        let _ = GlobalUnlock(h_mem);
        if SetClipboardData(13, windows::Win32::Foundation::HANDLE(h_mem.0 as isize)).is_err() {
            let _ = CloseClipboard();
            return false;
        }
        let _ = CloseClipboard();
        true
    }
}
