use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
    GetDC, GetDIBits, GetDeviceCaps, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
    DESKTOPHORZRES, DESKTOPVERTRES, DIB_RGB_COLORS, RGBQUAD, SRCCOPY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetDesktopWindow, GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
};
use windows::Storage::Streams::{InMemoryRandomAccessStream, DataWriter};
use windows::Graphics::Imaging::BitmapDecoder;
use windows::Media::Ocr::OcrEngine;
use image::{ImageEncoder, ExtendedColorType};

pub fn capture_screen() -> Option<(Vec<u8>, i32, i32)> {
    unsafe {
        let hwnd = GetDesktopWindow();
        let hdc_screen = GetDC(hwnd);
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        
        // Use physical desktop resolution to capture full crisp DPI
        let mut width = GetDeviceCaps(hdc_screen, DESKTOPHORZRES);
        let mut height = GetDeviceCaps(hdc_screen, DESKTOPVERTRES);
        
        if width <= 0 || height <= 0 {
            width = GetSystemMetrics(SM_CXSCREEN);
            height = GetSystemMetrics(SM_CYSCREEN);
        }
        
        if width <= 0 || height <= 0 {
            ReleaseDC(hwnd, hdc_screen);
            let _ = DeleteDC(hdc_mem);
            return None;
        }

        let h_bitmap = CreateCompatibleBitmap(hdc_screen, width, height);
        let old_obj = SelectObject(hdc_mem, h_bitmap);
        
        let _ = BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, 0, 0, SRCCOPY);
        
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // Top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD::default(); 1],
        };
        
        let buf_size = (width * height * 4) as usize;
        let mut buffer = vec![0u8; buf_size];
        
        GetDIBits(
            hdc_screen,
            h_bitmap,
            0,
            height as u32,
            Some(buffer.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );
        
        SelectObject(hdc_mem, old_obj);
        let _ = DeleteObject(h_bitmap);
        let _ = DeleteDC(hdc_mem);
        ReleaseDC(hwnd, hdc_screen);
        
        // Convert BGRA to RGBA
        for chunk in buffer.chunks_exact_mut(4) {
            let b = chunk[0];
            let r = chunk[2];
            chunk[0] = r;
            chunk[2] = b;
        }
        
        // Encode to PNG using image crate
        let mut png_bytes = Vec::new();
        let encoder = image::codecs::png::PngEncoder::new(&mut png_bytes);
        if encoder.write_image(&buffer, width as u32, height as u32, ExtendedColorType::Rgba8).is_ok() {
            Some((png_bytes, width, height))
        } else {
            None
        }
    }
}

pub async fn run_ocr_on_bytes(image_bytes: &[u8]) -> Result<String, String> {
    let stream = InMemoryRandomAccessStream::new().map_err(|e| e.to_string())?;
    let writer = DataWriter::CreateDataWriter(&stream).map_err(|e| e.to_string())?;
    writer.WriteBytes(image_bytes).map_err(|e| e.to_string())?;
    writer.StoreAsync().map_err(|e| e.to_string())?.await.map_err(|e| e.to_string())?;
    writer.FlushAsync().map_err(|e| e.to_string())?.await.map_err(|e| e.to_string())?;
    
    stream.Seek(0).map_err(|e| e.to_string())?;
    
    let decoder = BitmapDecoder::CreateAsync(&stream).map_err(|e| e.to_string())?.await.map_err(|e| e.to_string())?;
    let software_bitmap = decoder.GetSoftwareBitmapAsync().map_err(|e| e.to_string())?.await.map_err(|e| e.to_string())?;
    
    // 1. Try to create OCR engine from user's preferred profile languages
    // 2. Fallback to any available installed OCR language on Windows
    let engine = match OcrEngine::TryCreateFromUserProfileLanguages() {
        Ok(eng) => eng,
        Err(_) => {
            let available = OcrEngine::AvailableRecognizerLanguages().map_err(|e| format!("No hay idiomas de OCR disponibles en Windows: {}", e))?;
            let first_lang = available.First().map_err(|e| format!("Lista de idiomas OCR vacía: {}", e))?;
            if first_lang.HasCurrent().unwrap_or(false) {
                let lang = first_lang.Current().map_err(|e| format!("Error obteniendo idioma OCR: {}", e))?;
                OcrEngine::TryCreateFromLanguage(&lang).map_err(|e| format!("Error creando motor OCR con idioma secundario: {}", e))?
            } else {
                return Err("No hay paquetes de idioma OCR instalados en Windows".to_string());
            }
        }
    };

    let ocr_result = engine.RecognizeAsync(&software_bitmap).map_err(|e| format!("Error al reconocer texto con OCR de Windows: {}", e))?.await.map_err(|e| e.to_string())?;
    
    let mut line_texts = Vec::new();
    if let Ok(lines) = ocr_result.Lines() {
        for line in lines {
            if let Ok(line_text) = line.Text() {
                let s = line_text.to_string();
                let trimmed = s.trim();
                // Filter out standalone OCR button/badge artifacts like "MD", "MD + 1", "Copy"
                if !trimmed.is_empty() && trimmed != "MD" && trimmed != "MD + 1" && trimmed != "MD+1" {
                    line_texts.push(s);
                }
            }
        }
    }
    
    let text = if !line_texts.is_empty() {
        line_texts.join("\n")
    } else {
        ocr_result.Text().map_err(|e| e.to_string())?.to_string()
    };
    Ok(text)
}

pub fn base64_encode(data: &[u8]) -> String {
    let mut out = String::new();
    let mut val = 0;
    let mut valb = -6;
    for &c in data {
        val = (val << 8) + c as i32;
        valb += 8;
        while valb >= 0 {
            let idx = ((val >> valb) & 0x3F) as usize;
            out.push("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
                .chars()
                .nth(idx)
                .unwrap());
            valb -= 6;
        }
    }
    if valb > -6 {
        let idx = (((val << 8) >> (valb + 8)) & 0x3F) as usize;
        out.push("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
            .chars()
            .nth(idx)
            .unwrap());
    }
    while out.len() % 4 != 0 {
        out.push('=');
    }
    out
}

pub fn base64_decode(b64: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;
    for c in b64.chars() {
        if c == '=' { break; }
        let val = match c {
            'A'..='Z' => c as u32 - 'A' as u32,
            'a'..='z' => c as u32 - 'a' as u32 + 26,
            '0'..='9' => c as u32 - '0' as u32 + 52,
            '+' => 62,
            '/' => 63,
            _ => continue,
        };
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Ok(out)
}

