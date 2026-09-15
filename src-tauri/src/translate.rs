use reqwest::Client;
use std::sync::OnceLock;
use serde_json::Value;

static CLIENT: OnceLock<Client> = OnceLock::new();

fn get_client() -> &'static Client {
    CLIENT.get_or_init(|| {
        Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
            .timeout(std::time::Duration::from_secs(12))
            .build()
            .unwrap_or_default()
    })
}

pub async fn translate(text: &str, sl: &str, tl: &str) -> Result<(String, Option<String>), String> {
    if text.trim().is_empty() {
        return Ok((String::new(), None));
    }

    // Split text into chunks if it is too long (Google Translate limits around 5000 chars)
    let chunks = split_text(text, 4000);
    let mut results = Vec::new();
    let mut detected_source = None;
    let client = get_client();

    for chunk in chunks {
        // 1. Try primary API: dict-chrome-ex (used by Google Chrome extension, returns clean JSON)
        let res = match request_translate_api(client, &chunk, sl, tl, "dict-chrome-ex").await {
            Ok(val) => Ok(val),
            Err(err1) => {
                // 2. Secondary fallback: client=gtx
                match request_translate_api(client, &chunk, sl, tl, "gtx").await {
                    Ok(val) => Ok(val),
                    Err(_) => {
                        // 3. Last-resort fallback: mobile web endpoint /m
                        match request_mobile_web(client, &chunk, sl, tl).await {
                            Ok(val) => Ok(val),
                            Err(err3) => Err(format!("{}. Fallback error: {}", err1, err3)),
                        }
                    }
                }
            }
        };

        let (translated_chunk, detected) = res?;
        results.push(translated_chunk);
        if detected.is_some() && detected_source.is_none() {
            detected_source = detected;
        }
    }

    Ok((results.join("\n\n"), detected_source))
}

async fn request_translate_api(
    client: &Client,
    text: &str,
    sl: &str,
    tl: &str,
    client_param: &str,
) -> Result<(String, Option<String>), String> {
    let url = format!(
        "https://translate.googleapis.com/translate_a/single?client={}&sl={}&tl={}&dt=t",
        client_param, sl, tl
    );

    let response = client
        .post(&url)
        .form(&[("q", text)])
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Google Translate API returned status: {}", response.status()));
    }

    let body_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    parse_api_json(&body_text)
}

fn parse_api_json(raw: &str) -> Result<(String, Option<String>), String> {
    let val: Value = serde_json::from_str(raw)
        .map_err(|e| format!("Failed to parse Google API response: {}", e))?;

    // val[0] is an array of segments: [ [ "translated text", "original text", ... ], ... ]
    let mut translated_text = String::new();
    if let Some(segments) = val.get(0).and_then(|v| v.as_array()) {
        for seg in segments {
            if let Some(part) = seg.get(0).and_then(|v| v.as_str()) {
                translated_text.push_str(part);
            }
        }
    } else {
        return Err("Unexpected Google API JSON structure".to_string());
    }

    // val[2] is detected source language code, e.g. "es"
    let detected_lang = val.get(2)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty() && *s != "auto")
        .map(|s| s.to_string());

    Ok((translated_text, detected_lang))
}

async fn request_mobile_web(
    client: &Client,
    text: &str,
    sl: &str,
    tl: &str,
) -> Result<(String, Option<String>), String> {
    let url = format!(
        "https://translate.google.com/m?sl={}&tl={}&q={}",
        sl,
        tl,
        url_encode(text)
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Google Translate returned status: {}", response.status()));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    parse_google_html(&html)
}

fn parse_google_html(html: &str) -> Result<(String, Option<String>), String> {
    // Extract class="result-container"
    let result_re = regex_find(html, r#"class="result-container"[^>]*>([\s\S]*?)</div>"#);
    let translated = match result_re {
        Some(content) => {
            // Clean HTML entities and replace <br> tags
            content
                .replace("<br>", "\n")
                .replace("<br/>", "\n")
                .replace("<br />", "\n")
                .replace("&quot;", "\"")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&#39;", "'")
                .trim()
                .to_string()
        }
        None => return Err("Failed to find translation result container".to_string()),
    };

    // Extract detected source language input name="sl"
    let sl_re = regex_find(html, r#"name="sl"[^>]*value="([^"]+)"#);
    let detected = match sl_re {
        Some(val) => {
            if val != "auto" {
                Some(val)
            } else {
                None
            }
        }
        None => None,
    };

    Ok((translated, detected))
}

fn regex_find(text: &str, pattern: &str) -> Option<String> {
    // Simple custom regex finder to avoid importing full regex crate and keep compile times low
    // We search for patterns manually or using standard string functions
    if pattern.contains("result-container") {
        if let Some(start_idx) = text.find("class=\"result-container\"") {
            if let Some(tag_close) = text[start_idx..].find('>') {
                let content_start = start_idx + tag_close + 1;
                if let Some(end_idx) = text[content_start..].find("</div>") {
                    return Some(text[content_start..content_start + end_idx].to_string());
                }
            }
        }
    } else if pattern.contains("name=\"sl\"") {
        if let Some(start_idx) = text.find("name=\"sl\"") {
            // Find value="..." inside that tag
            let tag_start = text[..start_idx].rfind('<').unwrap_or(0);
            let tag_end = text[start_idx..].find('>').unwrap_or(text.len() - start_idx) + start_idx;
            let tag_str = &text[tag_start..tag_end];
            if let Some(val_idx) = tag_str.find("value=\"") {
                let start_quote = val_idx + 7;
                if let Some(end_quote) = tag_str[start_quote..].find('"') {
                    return Some(tag_str[start_quote..start_quote + end_quote].to_string());
                }
            }
        }
    }
    None
}

fn split_text(text: &str, max_len: usize) -> Vec<String> {
    if text.len() <= max_len {
        return vec![text.to_string()];
    }
    let mut chunks = Vec::new();
    let mut remaining = text;
    while !remaining.is_empty() {
        if remaining.len() <= max_len {
            chunks.push(remaining.to_string());
            break;
        }
        let chunk = &remaining[..max_len];
        let mut split_idx = chunk.rfind("\n\n").unwrap_or(0);
        if split_idx < (max_len as f64 * 0.4) as usize {
            split_idx = chunk.rfind('\n').unwrap_or(0);
        }
        if split_idx < (max_len as f64 * 0.4) as usize {
            // Find sentence endings
            let mut last_end = 0;
            for (idx, c) in chunk.char_indices() {
                if idx > (max_len as f64 * 0.4) as usize && (c == '.' || c == '!' || c == '?') {
                    last_end = idx + 1;
                }
            }
            if last_end > 0 {
                split_idx = last_end;
            }
        }
        if split_idx < (max_len as f64 * 0.4) as usize {
            split_idx = chunk.rfind(' ').unwrap_or(0);
        }
        if split_idx == 0 {
            split_idx = max_len;
        }
        chunks.push(remaining[..split_idx].to_string());
        remaining = remaining[split_idx..].trim_start();
    }
    chunks
}

fn url_encode(text: &str) -> String {
    let mut encoded = String::new();
    for b in text.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(b as char);
            }
            b' ' => encoded.push('+'),
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    encoded
}

