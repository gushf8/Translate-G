use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use tower_http::cors::{Any, CorsLayer};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HistoryItem {
    pub id: u64,
    pub original: String,
    pub translation: String,
    pub timestamp: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    pub voice_preference: String,
    pub base_lang: String,
    pub smart_lang: String,
    pub disable_ctrl_c_on_extension_detect: bool,
    pub voice_rate: f32,
    pub voice_pitch: f32,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_line_spacing")]
    pub line_spacing: String,
    #[serde(default = "default_font_size")]
    pub font_size: u32,
}

fn default_font_family() -> String {
    "'Inter', sans-serif".to_string()
}

fn default_line_spacing() -> String {
    "1.5".to_string()
}

fn default_font_size() -> u32 {
    18
}

pub struct AppState {
    pub history_path: PathBuf,
    pub settings_path: PathBuf,
    pub history: Mutex<Vec<HistoryItem>>,
    pub settings: Mutex<Settings>,
    pub last_extension_ping: Mutex<Option<std::time::Instant>>,
}

pub fn get_app_dir() -> PathBuf {
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let dir = PathBuf::from(app_data).join("TranslateG");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn load_history(path: &PathBuf) -> Vec<HistoryItem> {
    if !path.exists() {
        return Vec::new();
    }
    let data = fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str(&data).unwrap_or_else(|_| Vec::new())
}

fn save_history(path: &PathBuf, history: &[HistoryItem]) {
    if let Ok(json) = serde_json::to_string_pretty(history) {
        if let Ok(mut file) = File::create(path) {
            let _ = file.write_all(json.as_bytes());
        }
    }
}

fn load_settings(path: &PathBuf) -> Settings {
    if !path.exists() {
        return Settings {
            voice_preference: "female".to_string(),
            base_lang: "es".to_string(),
            smart_lang: "en".to_string(),
            disable_ctrl_c_on_extension_detect: false,
            voice_rate: 1.0,
            voice_pitch: 0.0,
            font_family: default_font_family(),
            line_spacing: default_line_spacing(),
            font_size: default_font_size(),
        };
    }
    let data = fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str(&data).unwrap_or_else(|_| Settings {
        voice_preference: "female".to_string(),
        base_lang: "es".to_string(),
        smart_lang: "en".to_string(),
        disable_ctrl_c_on_extension_detect: false,
        voice_rate: 1.0,
        voice_pitch: 0.0,
        font_family: default_font_family(),
        line_spacing: default_line_spacing(),
        font_size: default_font_size(),
    })
}

fn save_settings(path: &PathBuf, settings: &Settings) {
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        if let Ok(mut file) = File::create(path) {
            let _ = file.write_all(json.as_bytes());
        }
    }
}

pub fn start_server() -> Arc<AppState> {
    let app_dir = get_app_dir();
    let history_path = app_dir.join("history.json");
    let settings_path = app_dir.join("settings.json");

    let history = load_history(&history_path);
    let settings = if !settings_path.exists() {
        let defaults = Settings {
            voice_preference: "female".to_string(),
            base_lang: "es".to_string(),
            smart_lang: "en".to_string(),
            disable_ctrl_c_on_extension_detect: false,
            voice_rate: 1.0,
            voice_pitch: 0.0,
            font_family: default_font_family(),
            line_spacing: default_line_spacing(),
            font_size: default_font_size(),
        };
        save_settings(&settings_path, &defaults);
        defaults
    } else {
        load_settings(&settings_path)
    };

    let state = Arc::new(AppState {
        history_path,
        settings_path,
        history: Mutex::new(history),
        settings: Mutex::new(settings),
        last_extension_ping: Mutex::new(None),
    });

    let app_state = state.clone();

    tauri::async_runtime::spawn(async move {
        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_headers(Any)
            .allow_methods(Any);

        let app = Router::new()
            .route("/api/history", get(get_history_handler).post(add_history_handler))
            .route("/api/history/:id", delete(delete_history_handler))
            .route("/api/settings", get(get_settings_handler).post(post_settings_handler))
            .route("/api/ping-extension", post(ping_extension_handler))
            .layer(cors)
            .with_state(app_state);

        match tokio::net::TcpListener::bind("127.0.0.1:3001").await {
            Ok(listener) => {
                println!("Server running on http://127.0.0.1:3001");
                let _ = axum::serve(listener, app).await;
            }
            Err(e) => {
                eprintln!("Failed to bind Axum server on port 3001: {}", e);
            }
        }
    });

    state
}

async fn get_history_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let history = state.history.lock().unwrap().clone();
    Json(history)
}

async fn add_history_handler(
    State(state): State<Arc<AppState>>,
    Json(new_item): Json<HistoryItem>,
) -> impl IntoResponse {
    let mut history = state.history.lock().unwrap();
    
    // Check if the item already exists by ID (for updates/edits)
    if let Some(index) = history.iter().position(|item| item.id == new_item.id) {
        // Only update if it has actually changed
        if history[index].original != new_item.original || history[index].translation != new_item.translation {
            history.remove(index);
            history.insert(0, new_item.clone());
        }
    } else {
        // Prevent exact consecutive duplicates
        if history.is_empty() || history[0].original != new_item.original {
            history.insert(0, new_item.clone());
        }
    }

    // Truncate to maximum 50 items
    if history.len() > 50 {
        history.truncate(50);
    }

    save_history(&state.history_path, &history);
    Json(history.clone())
}

async fn delete_history_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    let mut history = state.history.lock().unwrap();
    history.retain(|item| item.id != id);
    save_history(&state.history_path, &history);
    Json(history.clone())
}

async fn get_settings_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let settings = state.settings.lock().unwrap().clone();
    Json(settings)
}

async fn post_settings_handler(
    State(state): State<Arc<AppState>>,
    Json(new_settings): Json<Settings>,
) -> impl IntoResponse {
    let mut settings = state.settings.lock().unwrap();
    *settings = new_settings.clone();
    save_settings(&state.settings_path, &settings);
    Json(settings.clone())
}

async fn ping_extension_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let mut last_ping = state.last_extension_ping.lock().unwrap();
    *last_ping = Some(std::time::Instant::now());
    StatusCode::OK
}
