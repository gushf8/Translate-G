mod server;
mod translate;
mod ocr;
mod keyboard;

use std::sync::Arc;
use tauri::{Manager, State, Emitter};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::menu::{Menu, MenuItem};
use image::ImageEncoder;

use crate::server::{AppState, HistoryItem, Settings};
use crate::translate::translate;

#[tauri::command]
async fn translate_text(
    text: String,
    sl: String,
    tl: String,
) -> Result<serde_json::Value, String> {
    match translate(&text, &sl, &tl).await {
        Ok((translation, detected)) => Ok(serde_json::json!({
            "translation": translation,
            "detectedSource": detected
        })),
        Err(e) => Err(e),
    }
}

#[tauri::command]
fn get_capture_screen() -> Result<serde_json::Value, String> {
    if let Some((png_bytes, width, height)) = ocr::capture_screen() {
        let b64 = ocr::base64_encode(&png_bytes);
        Ok(serde_json::json!({
            "image": format!("data:image/png;base64,{}", b64),
            "width": width,
            "height": height
        }))
    } else {
        Err("Failed to capture screen".to_string())
    }
}

#[tauri::command]
async fn run_ocr(
    app_handle: tauri::AppHandle,
    crop_x: u32,
    crop_y: u32,
    crop_width: u32,
    crop_height: u32,
    base64_screenshot: String,
) -> Result<String, String> {
    let header = "data:image/png;base64,";
    let b64_data = if base64_screenshot.starts_with(header) {
        &base64_screenshot[header.len()..]
    } else {
        &base64_screenshot
    };

    let png_bytes = ocr::base64_decode(b64_data)?;
    
    let img = image::load_from_memory(&png_bytes)
        .map_err(|e| format!("Failed to load screenshot in memory: {}", e))?;
    
    let img_w = img.width();
    let img_h = img.height();

    let safe_x = crop_x.min(img_w.saturating_sub(1));
    let safe_y = crop_y.min(img_h.saturating_sub(1));
    let safe_w = crop_width.min(img_w.saturating_sub(safe_x));
    let safe_h = crop_height.min(img_h.saturating_sub(safe_y));

    if safe_w < 4 || safe_h < 4 {
        return Ok(String::new());
    }

    let cropped = img.crop_imm(safe_x, safe_y, safe_w, safe_h);
    
    let mut cropped_bytes = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut cropped_bytes);
    encoder.write_image(
        cropped.as_bytes(),
        cropped.width(),
        cropped.height(),
        cropped.color().into()
    ).map_err(|e| format!("Failed to encode cropped image: {}", e))?;
    
    let text = ocr::run_ocr_on_bytes(&cropped_bytes).await?;
    println!("[OCR RECOGNIZED] {} chars: {:?}", text.len(), text);

    // Hide OCR overlay window
    if let Some(ocr_win) = app_handle.get_webview_window("ocr") {
        let _ = ocr_win.hide();
    }

    // Always bring main window to front and deliver text
    if let Some(main_win) = app_handle.get_webview_window("main") {
        let _ = main_win.unminimize();
        let _ = main_win.show();
        let _ = main_win.set_focus();

        if let Ok(hwnd) = main_win.hwnd() {
            unsafe {
                use windows::Win32::UI::WindowsAndMessaging::{
                    SetForegroundWindow, SetWindowPos, ShowWindow, HWND_TOPMOST, HWND_NOTOPMOST,
                    SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_RESTORE,
                };
                let win_hwnd = windows::Win32::Foundation::HWND(hwnd.0 as _);
                let _ = ShowWindow(win_hwnd, SW_RESTORE);
                let _ = SetWindowPos(win_hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                let _ = SetForegroundWindow(win_hwnd);
                // Return to normal z-order so it doesn't permanently pin on top
                let _ = SetWindowPos(win_hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
            }
        }

        if !text.trim().is_empty() {
            let _ = main_win.emit("ocr-text-result", &text);
            let _ = app_handle.emit("ocr-text-result", &text);
        }
    }

    Ok(text)
}

#[tauri::command]
fn get_history(state: State<'_, Arc<AppState>>) -> Vec<HistoryItem> {
    let history = state.history.lock().unwrap();
    history.clone()
}

#[tauri::command]
fn add_history(state: State<'_, Arc<AppState>>, new_item: HistoryItem) -> Vec<HistoryItem> {
    let mut history = state.history.lock().unwrap();
    if let Some(index) = history.iter().position(|item| item.id == new_item.id) {
        if history[index].original != new_item.original || history[index].translation != new_item.translation {
            history.remove(index);
            history.insert(0, new_item.clone());
        }
    } else {
        if history.is_empty() || history[0].original != new_item.original {
            history.insert(0, new_item.clone());
        }
    }

    if history.len() > 50 {
        history.truncate(50);
    }

    let path = &state.history_path;
    if let Ok(json) = serde_json::to_string_pretty(&*history) {
        if let Ok(mut file) = std::fs::File::create(path) {
            use std::io::Write;
            let _ = file.write_all(json.as_bytes());
        }
    }

    history.clone()
}

#[tauri::command]
fn delete_history(state: State<'_, Arc<AppState>>, id: u64) -> Vec<HistoryItem> {
    let mut history = state.history.lock().unwrap();
    history.retain(|item| item.id != id);
    
    let path = &state.history_path;
    if let Ok(json) = serde_json::to_string_pretty(&*history) {
        if let Ok(mut file) = std::fs::File::create(path) {
            use std::io::Write;
            let _ = file.write_all(json.as_bytes());
        }
    }

    history.clone()
}

#[tauri::command]
fn clear_history(state: State<'_, Arc<AppState>>) -> Vec<HistoryItem> {
    let mut history = state.history.lock().unwrap();
    history.clear();
    
    let path = &state.history_path;
    if let Ok(json) = serde_json::to_string_pretty(&*history) {
        if let Ok(mut file) = std::fs::File::create(path) {
            use std::io::Write;
            let _ = file.write_all(json.as_bytes());
        }
    }

    history.clone()
}

#[tauri::command]
fn get_settings(state: State<'_, Arc<AppState>>) -> Settings {
    let settings = state.settings.lock().unwrap();
    settings.clone()
}

#[tauri::command]
fn save_settings(state: State<'_, Arc<AppState>>, new_settings: Settings) -> Settings {
    let mut settings = state.settings.lock().unwrap();
    *settings = new_settings.clone();
    
    let path = &state.settings_path;
    if let Ok(json) = serde_json::to_string_pretty(&*settings) {
        if let Ok(mut file) = std::fs::File::create(path) {
            use std::io::Write;
            let _ = file.write_all(json.as_bytes());
        }
    }

    settings.clone()
}

// Windows Auto-Start Shortcut Utilities
fn get_startup_shortcut_path() -> Result<std::path::PathBuf, String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    Ok(std::path::PathBuf::from(app_data)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join("Startup")
        .join("TranslateG.lnk"))
}

fn set_autostart(enable: bool) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Err("El inicio automático solo está disponible en la versión compilada (de producción).".to_string());
    }

    let shortcut_path = get_startup_shortcut_path()?;

    if enable {
        let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_path_str = current_exe.to_string_lossy().to_string();
        let exe_dir = current_exe.parent().ok_or("Failed to get parent directory of executable")?;
        let exe_dir_str = exe_dir.to_string_lossy().to_string();

        #[cfg(target_os = "windows")]
        unsafe {
            use windows::{
                core::{ComInterface, HSTRING},
                Win32::System::Com::{
                    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
                    COINIT_APARTMENTTHREADED, IPersistFile,
                },
                Win32::UI::Shell::{IShellLinkW, ShellLink},
            };

            // Initialize COM library (can fail if already initialized, which is fine)
            let _com_init = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

            // Create instance of ShellLink
            let shell_link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| format!("Failed to create ShellLink instance: {}", e))?;

            // Set target path
            shell_link.SetPath(&HSTRING::from(&exe_path_str))
                .map_err(|e| format!("Failed to set shortcut path: {}", e))?;

            // Set arguments
            shell_link.SetArguments(&HSTRING::from("--startup"))
                .map_err(|e| format!("Failed to set shortcut arguments: {}", e))?;

            // Set working directory
            shell_link.SetWorkingDirectory(&HSTRING::from(&exe_dir_str))
                .map_err(|e| format!("Failed to set shortcut working directory: {}", e))?;

            // Query IPersistFile interface to save the shortcut
            let persist_file: IPersistFile = shell_link.cast()
                .map_err(|e| format!("Failed to cast to IPersistFile: {}", e))?;

            // Convert shortcut path to wide string
            let shortcut_path_hstring = HSTRING::from(shortcut_path.to_string_lossy().to_string());

            // Save the shortcut
            persist_file.Save(&shortcut_path_hstring, true)
                .map_err(|e| format!("Failed to save shortcut: {}", e))?;

            // Uninitialize COM
            CoUninitialize();
        }

        #[cfg(not(target_os = "windows"))]
        return Err("Autostart is only supported on Windows".to_string());
    } else {
        if shortcut_path.exists() {
            std::fs::remove_file(shortcut_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn check_autostart_enabled() -> bool {
    if cfg!(debug_assertions) {
        return false;
    }

    if let Ok(shortcut_path) = get_startup_shortcut_path() {
        shortcut_path.exists()
    } else {
        false
    }
}

#[tauri::command]
fn toggle_autostart(enable: bool) -> Result<(), String> {
    set_autostart(enable)
}

#[tauri::command]
fn is_autostart_enabled() -> bool {
    check_autostart_enabled()
}

use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;

fn get_voice_name(lang: &str, gender: &str) -> &'static str {
    let clean_lang = lang.split('-').next().unwrap_or(lang).to_lowercase();
    match (clean_lang.as_str(), gender.to_lowercase().as_str()) {
        ("es", "male") => "es-ES-AlvaroNeural",
        ("es", "female") => "es-ES-ElviraNeural",
        ("en", "male") => "en-US-GuyNeural",
        ("en", "female") => "en-US-JennyNeural",
        ("fr", "male") => "fr-FR-HenriNeural",
        ("fr", "female") => "fr-FR-DeniseNeural",
        ("de", "male") => "de-DE-ConradNeural",
        ("de", "female") => "de-DE-KatjaNeural",
        ("it", "male") => "it-IT-DiegoNeural",
        ("it", "female") => "it-IT-ElsaNeural",
        ("pt", "male") => "pt-BR-AntonioNeural",
        ("pt", "female") => "pt-BR-FranciscaNeural",
        ("ja", "male") => "ja-JP-KeitaNeural",
        ("ja", "female") => "ja-JP-NanamiNeural",
        ("zh", "male") => "zh-CN-YunxiNeural",
        ("zh", "female") => "zh-CN-XiaoxiaoNeural",
        _ => "en-US-JennyNeural",
    }
}

fn get_cache_path(text: &str, voice: &str, rate: f32, pitch: f32) -> std::path::PathBuf {
    let mut hasher = DefaultHasher::new();
    text.hash(&mut hasher);
    voice.hash(&mut hasher);
    rate.to_bits().hash(&mut hasher);
    pitch.to_bits().hash(&mut hasher);
    let hash = hasher.finish();
    
    let cache_dir = crate::server::get_app_dir().join("audio_cache");
    let _ = std::fs::create_dir_all(&cache_dir);
    cache_dir.join(format!("{}.mp3", hash))
}

#[tauri::command]
async fn play_tts(
    state: State<'_, Arc<AppState>>,
    text: String,
    lang: String,
) -> Result<String, String> {
    println!("[Rust TTS] play_tts called with text: {:?} (len: {}), lang: {:?}", text, text.len(), lang);
    let (gender, voice_rate, voice_pitch) = {
        let settings = state.settings.lock().unwrap();
        (settings.voice_preference.clone(), settings.voice_rate, settings.voice_pitch)
    };

    let voice = get_voice_name(&lang, &gender);
    let cache_file = get_cache_path(&text, voice, voice_rate, voice_pitch);
    println!("[Rust TTS] Voice: {}, rate: {}, pitch: {}", voice, voice_rate, voice_pitch);
    println!("[Rust TTS] Cache file path: {:?}", cache_file);

    // 1. Check if cached
    if cache_file.exists() {
        println!("[Rust TTS] Cache hit! Reading file...");
        if let Ok(bytes) = std::fs::read(&cache_file) {
            println!("[Rust TTS] Cache loaded successfully. Size: {} bytes", bytes.len());
            return Ok(ocr::base64_encode(&bytes));
        }
    }

    // 2. Not cached, download it using edge-tts-rust
    println!("[Rust TTS] Cache miss. Synthesizing via edge-tts-rust...");
    let client = edge_tts_rust::EdgeTtsClient::new().map_err(|e| {
        let err = format!("Failed to create EdgeTtsClient: {:?}", e);
        println!("[Rust TTS ERROR] {}", err);
        err
    })?;
    
    let rate_str = format!("{:+}%", ((voice_rate - 1.0) * 100.0) as i32);
    let pitch_str = format!("{:+}Hz", voice_pitch as i32);

    let options = edge_tts_rust::SpeakOptions {
        voice: voice.to_string(),
        rate: rate_str,
        pitch: pitch_str,
        boundary: edge_tts_rust::Boundary::Sentence,
        ..Default::default()
    };

    let result = client.synthesize(&text, options).await.map_err(|e| {
        let err = format!("Edge TTS synthesis error: {:?}", e);
        println!("[Rust TTS ERROR] {}", err);
        err
    })?;

    println!("[Rust TTS] Synthesized successfully. Audio size: {} bytes", result.audio.len());

    // Save to cache
    if let Err(e) = std::fs::write(&cache_file, &result.audio) {
        println!("[Rust TTS WARNING] Failed to write cache file: {:?}", e);
    } else {
        println!("[Rust TTS] Saved to cache.");
    }

    // Return base64
    Ok(ocr::base64_encode(&result.audio))
}

#[tauri::command]
fn stop_tts() -> Result<(), String> {
    println!("[Rust TTS] stop_tts called");
    Ok(())
}

#[tauri::command]
fn start_ocr() {
    keyboard::trigger_ocr();
}

#[tauri::command]
async fn cancel_ocr(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(ocr_win) = app_handle.get_webview_window("ocr") {
        let _ = ocr_win.hide();
    }
    if let Some(main_win) = app_handle.get_webview_window("main") {
        let _ = main_win.unminimize();
        let _ = main_win.show();
        let _ = main_win.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn log_from_js(msg: String) {
    println!("[JS LOG] {}", msg);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            translate_text,
            get_capture_screen,
            run_ocr,
            start_ocr,
            cancel_ocr,
            get_history,
            add_history,
            delete_history,
            clear_history,
            get_settings,
            save_settings,
            toggle_autostart,
            is_autostart_enabled,
            play_tts,
            stop_tts,
            log_from_js
        ])
        .setup(|app| {
            let state = server::start_server();
            app.manage(state.clone());

            // Ensure autostart is always enabled on startup
            let _ = set_autostart(true);

            // Initialize keyboard hook
            keyboard::start_keyboard_hook(app.handle().clone(), state);

            let args: Vec<String> = std::env::args().collect();
            let is_startup = args.iter().any(|arg| arg == "--startup");

            // Intercept close events on main window to hide it instead of exit
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });

                if !is_startup {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            // Create Tray Icon
            let quit_i = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>).unwrap();
            let show_i = MenuItem::with_id(app, "show", "Mostrar Translate G", true, None::<&str>).unwrap();
            let menu = Menu::with_items(app, &[&show_i, &quit_i]).unwrap();

            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    match event {
                        TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            ..
                        } | TrayIconEvent::DoubleClick {
                            button: tauri::tray::MouseButton::Left,
                            ..
                        } => {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)
                .expect("Failed to build tray icon");

            // Prevent tray icon from dropping at the end of setup closure
            std::mem::forget(tray);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
