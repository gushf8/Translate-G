import asyncio
import edge_tts
import pygame
import os
import argparse
import sys
import tempfile
import time

VOICES_MAP = {
    "es": {
        "female": "es-ES-ElviraNeural",
        "male": "es-ES-AlvaroNeural"
    },
    "en": {
        "female": "en-US-JennyNeural",
        "male": "en-US-GuyNeural"
    },
    "fr": {
        "female": "fr-FR-DeniseNeural",
        "male": "fr-FR-HenriNeural"
    },
    "de": {
        "female": "de-DE-KatjaNeural",
        "male": "de-DE-ConradNeural"
    },
    "it": {
        "female": "it-IT-ElsaNeural",
        "male": "it-IT-DiegoNeural"
    },
    "pt": {
        "female": "pt-BR-FranciscaNeural",
        "male": "pt-BR-AntonioNeural"
    },
    "ja": {
        "female": "ja-JP-NanamiNeural",
        "male": "ja-JP-KeitaNeural"
    },
    "zh": {
        "female": "zh-CN-XiaoxiaoNeural",
        "male": "zh-CN-YunxiNeural"
    }
}

async def main():
    parser = argparse.ArgumentParser(description="Edge TTS Neural Speaker via Pygame")
    parser.add_argument("--text", required=True, help="Text to speak")
    parser.add_argument("--voice", help="Edge TTS voice name")
    parser.add_argument("--lang", help="Language code (e.g. es, en)")
    parser.add_argument("--gender", default="female", help="Gender preference (female or male)")
    args = parser.parse_args()

    # Determine voice
    voice = args.voice
    if not voice:
        lang = (args.lang or "en").lower().split("-")[0]
        gender = (args.gender or "female").lower()
        
        # Look up in map
        if lang in VOICES_MAP:
            voice = VOICES_MAP[lang].get(gender, VOICES_MAP[lang]["female"])
        else:
            # Fallback to English Jenny
            voice = "en-US-JennyNeural"

    # Create temporary file path
    temp_dir = tempfile.gettempdir()
    temp_file = os.path.join(temp_dir, f"tf_tts_{int(time.time() * 1000)}.mp3")

    try:
        # Generate speech
        communicate = edge_tts.Communicate(args.text, voice)
        await communicate.save(temp_file)

        # Initialize pygame mixer
        pygame.mixer.init()
        pygame.mixer.music.load(temp_file)
        pygame.mixer.music.play()

        # Wait for audio to finish playing
        while pygame.mixer.music.get_busy():
            await asyncio.sleep(0.05)

        # Clean up pygame
        pygame.mixer.music.unload()
        pygame.mixer.quit()
        
    except Exception as e:
        print(f"Error in tts.py: {e}", file=sys.stderr)
        
    finally:
        # Delete temporary audio file
        try:
            if os.path.exists(temp_file):
                os.remove(temp_file)
        except Exception:
            pass

if __name__ == "__main__":
    asyncio.run(main())
