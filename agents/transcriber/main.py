import sys
import os
import json
import argparse
from pathlib import Path
from dotenv import load_dotenv

# Add project root to sys.path so we can import from core
current_dir = Path(__file__).resolve().parent
project_root = current_dir.parent.parent
sys.path.insert(0, str(project_root))

from core.paths import get_agent_output_dir
from core.logger import get_logger

logger = get_logger("TranscriberAgent")

def run_groq_whisper(audio_path: str, language: str = None) -> dict:
    from groq import Groq
    
    try:
        client = Groq() # Automagically picks up GROQ_API_KEY from env
    except Exception as e:
        logger.error(f"Could not initialize Groq Client: {e}")
        return None
        
    logger.info(f"Calling Groq Whisper API for lightning-fast transcription...")
    
    try:
        with open(audio_path, "rb") as file:
            kwargs = {
                "file": (Path(audio_path).name, file.read()),
                "model": "whisper-large-v3",
                "response_format": "verbose_json",
                "timestamp_granularities": ["segment", "word"]
            }
            if language:
                kwargs["language"] = language
                
            transcription = client.audio.transcriptions.create(**kwargs)
            
            # Extract segment-level timestamps
            segment_list = []
            if hasattr(transcription, "segments") and transcription.segments:
                for s in transcription.segments:
                    if isinstance(s, dict):
                        segment_list.append(s)
                    else:
                        segment_list.append({
                            "id": getattr(s, "id", 0),
                            "start": getattr(s, "start", 0.0),
                            "end": getattr(s, "end", 0.0),
                            "text": getattr(s, "text", "")
                        })
            
            # Extract word-level timestamps for precise silence/timing mapping
            word_list = []
            if hasattr(transcription, "words") and transcription.words:
                for w in transcription.words:
                    if isinstance(w, dict):
                        word_list.append(w)
                    else:
                        word_list.append({
                            "word": getattr(w, "word", ""),
                            "start": getattr(w, "start", 0.0),
                            "end": getattr(w, "end", 0.0)
                        })
                        
            return {
                "text": getattr(transcription, "text", ""), 
                "segments": segment_list,
                "words": word_list
            }
            
    except Exception as e:
        logger.error(f"Groq API failure: {e}")
        return None

# ── Timing Inspector constants ───────────────────────
# Per-language TTS speaking rate (chars/sec). Devanagari scripts are denser.
SPEAKING_RATES = {
    'nepali':  15.0,
    'hindi':   15.0,
    'english': 14.0,
}
TIMING_TOLERANCE  = 0.20   # ±20% before rewriting
MIN_SEG_DURATION  = 0.8    # Skip segments shorter than this (s)
MAX_INSPECT_PASSES = 2     # Max correction rounds
# ──────────────────────────────────────────────────────

def translate_and_emotion(json_data: dict, target_lang: str = 'Nepali') -> dict:
    from google import genai
    from google.genai import types

    # Initialize Gemini client using GEMINI_API_KEY from environment
    try:
        client = genai.Client()
    except Exception as e:
        logger.error(f"Could not initialize Gemini Client: {e}")
        return None
    
    lang_title = target_lang.title()
    prompt = f"""
    You are an expert Audio Dubbing Script Editor, YouTube Storyteller, and Emotional Analyst.
    
    I will provide a JSON containing precise timestamps and transcriptions of segments from Groq Whisper.
    Your task:
    1. For each segment, determine the emotion expressed in the text.
    2. Translate the text into a professional {lang_title} voiceover script that closely matches the timing length of the original text (`translated_text`).
    3. Generate a highly engaging, natural-sounding adaptation of that same text in {lang_title} tailored specifically for YouTube storytelling, without restricting yourself to the strict timing (`natural_translated_text`).
    
    IMPORTANT: The target language is {lang_title}. ALL translated_text and natural_translated_text fields MUST be written in {lang_title} only.
    
    Output a single valid JSON object containing two main keys:
    1. `segments`: A JSON array of objects, each containing:
       - `id`: the segment ID
       - `start`: start time (as provided)
       - `end`: end time (as provided)
       - `original_text`: the original transcribed string
       - `emotion`: the designated emotion tag (e.g., Happy, Serious, Angry, Neutral, Excited, Sad)
       - `translated_text`: the timing-matched translated text in {lang_title}
       - `natural_translated_text`: the engaging, natural-flowing {lang_title} adaptation for YouTube
    2. `full_natural_script`: A single string containing the entire `natural_translated_text` concatenated together in paragraph form.
    
    Here is the input:
    """
    
    segments = json_data.get("segments", [])
    if not segments:
        logger.warning("No segments found in the transcript.")
        return []
    
    # Send only necessary info to save tokens
    condensed_segments = [
        {
            "id": s.get("id"), 
            "start": s.get("start"), 
            "end": s.get("end"), 
            "original_text": s.get("text")
        }
        for s in segments
    ]
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt + json.dumps(condensed_segments, indent=2),
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Gemini API failure: {e}")
        return None

def estimate_tts_duration(text: str, target_lang: str = 'nepali') -> float:
    """Estimate how long TTS will speak the text, using per-language speaking rate."""
    rate = SPEAKING_RATES.get(target_lang.lower(), 15.0)
    return len(text.strip()) / rate if text else 0.0


def timing_inspector(script: dict, original_segments: list, target_lang: str = 'nepali', pass_num: int = 1) -> dict:
    """
    Timing Inspector Brain — acts as QA officer for the dubbing script.
    Checks every segment: if the estimated TTS duration differs from the
    original segment duration by more than TIMING_TOLERANCE, it sends those
    segments to Gemini for targeted rewriting (compress or expand).
    Runs up to MAX_INSPECT_PASSES correction rounds.
    Works for any target language by using SPEAKING_RATES.
    """
    chars_per_sec = SPEAKING_RATES.get(target_lang.lower(), 15.0)
    lang_title    = target_lang.title()
    from google import genai
    from google.genai import types

    segments = script.get('segments', [])
    if not segments:
        return script

    orig_by_id = {s.get('id'): s for s in original_segments}

    # ── Analysis ────────────────────────────────────
    issues = []
    for seg in segments:
        seg_id  = seg.get('id')
        orig    = orig_by_id.get(seg_id)
        if not orig:
            continue
        duration = orig.get('end', 0) - orig.get('start', 0)
        if duration < MIN_SEG_DURATION:
            continue
        text     = seg.get('translated_text', '')
        est_dur  = estimate_tts_duration(text, target_lang)
        ratio    = est_dur / duration if duration > 0 else 1.0
        deviation = abs(ratio - 1.0)

        status = 'OK'
        if ratio > 1.0 + TIMING_TOLERANCE:
            status = 'TOO_LONG'
        elif ratio < 1.0 - TIMING_TOLERANCE:
            status = 'TOO_SHORT'

        logger.info(
            f"  [Pass {pass_num}] Seg {seg_id}: orig={duration:.2f}s "
            f"est={est_dur:.2f}s ratio={ratio:.2f} ({'+' if ratio>1 else ''}{(ratio-1)*100:.0f}%) [{status}]"
        )

        if status != 'OK':
            issues.append({
                'id'                   : seg_id,
                'original_english'     : orig.get('text', ''),
                'current_nepali'       : text,
                'segment_duration_sec' : round(duration, 2),
                'target_char_count'    : int(duration * chars_per_sec),
                'current_char_count'   : len(text),
                'status'               : status,
                'emotion'              : seg.get('emotion', 'Neutral'),
            })

    if not issues:
        logger.info(f"[Timing Inspector Pass {pass_num}] ✓ All {lang_title} segments within ±{int(TIMING_TOLERANCE*100)}% tolerance.")
        return script

    logger.info(f"[Timing Inspector Pass {pass_num}] Sending {len(issues)} {lang_title} segments to Gemini for timing correction...")

    # ── Gemini rewrite ───────────────────────────────
    try:
        client = genai.Client()
    except Exception as e:
        logger.error(f"Timing Inspector: Cannot init Gemini — {e}")
        return script

    INSPECTOR_PROMPT = f"""
You are a professional {lang_title} dubbing script timing editor working on a YouTube video.
Your ONLY job is to rewrite segments so their spoken duration fits precisely inside the original video segment.

SPEAKING RATE CONTRACT: {lang_title} TTS speaks at exactly {chars_per_sec} characters per second.
TARGET FORMULA: target_char_count = segment_duration_seconds × {chars_per_sec}

For each segment below apply these rules:

► If status is "TOO_LONG" (translation is longer than the video slot):
  - Compress the Nepali text to approximately target_char_count characters
  - Techniques: shorter synonyms, cut filler, condense clauses, keep core meaning
  - The listener must still understand the full idea from the original English

► If status is "TOO_SHORT" (translation leaves dead air in the video slot):
  - Expand the {lang_title} text to approximately target_char_count characters
  - Techniques: elaborate the idea, add descriptive context from original_english,
    use fuller phrasing, mirror any emphasis or excitement from the emotion tag
  - Do NOT pad with meaningless filler — every word must serve the story

CRITICAL CONSTRAINTS:
  1. Preserve meaning of original_english exactly
  2. Write natural spoken {lang_title} (informal, storytelling tone)
  3. Final character count MUST be within ±10% of target_char_count
  4. Do NOT include the emotion label in the translated text itself
  5. Return ONLY a valid JSON array — no markdown, no explanation, no extra keys

Output format:
[
  {{"id": <int>, "translated_text": "<rewritten Nepali text>"}}
]

Segments to fix:
"""
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=INSPECTOR_PROMPT + json.dumps(issues, ensure_ascii=False, indent=2),
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        corrections = json.loads(response.text)
        if not isinstance(corrections, list):
            logger.warning("Timing Inspector: Gemini returned unexpected format, skipping corrections.")
            return script

        # Apply corrections and log diff
        corrections_map = {c.get('id'): c for c in corrections if isinstance(c, dict)}
        corrected = 0
        for seg in script['segments']:
            seg_id = seg.get('id')
            if seg_id not in corrections_map:
                continue
            old_text = seg.get('translated_text', '')
            new_text = corrections_map[seg_id].get('translated_text', old_text)
            orig     = orig_by_id.get(seg_id, {})
            dur      = orig.get('end', 0) - orig.get('start', 0)
            old_est  = estimate_tts_duration(old_text, target_lang)
            new_est  = estimate_tts_duration(new_text, target_lang)
            logger.info(
                f"  ✎ Seg {seg_id}: [{len(old_text)}c ~{old_est:.1f}s] → [{len(new_text)}c ~{new_est:.1f}s] (slot={dur:.1f}s)"
            )
            seg['translated_text'] = new_text
            corrected += 1

        logger.info(f"[Timing Inspector Pass {pass_num}] Applied {corrected} corrections.")

        # ── Recursive second pass if still issues remain ──
        if pass_num < MAX_INSPECT_PASSES:
            return timing_inspector(script, original_segments, target_lang, pass_num + 1)
        else:
            logger.info(f"[Timing Inspector] Finished {lang_title} after {pass_num} pass(es).")
            return script

    except Exception as e:
        logger.error(f"Timing Inspector Gemini error: {e}")
        return script


class TranscriberAgent:
    def __init__(self):
        # Allow user to specify env variables cleanly via .env template
        load_dotenv(project_root / ".env")
        
        # User requested specific rename for the original script directory
        self.original_dir = get_agent_output_dir("transcriber", "original_voiceover_transcription")
        self.vo_script_dir = get_agent_output_dir("transcriber", "generated_voiceover_script")
        self.vo_trans_dir = get_agent_output_dir("transcriber", "generated_voiceover_transcription")
        
        logger.info(f"Initialized Transcriber Agent.")

    def process(self, audio_path: str, languages: list = None):
        """Run transcription. For original audio, generates one script per language."""
        if languages is None:
            languages = ['nepali']
        path_str = str(Path(audio_path).resolve())
        is_generated = "input/audio" in path_str
        
        if not os.path.exists(audio_path):
            logger.error(f"Audio file not found: {audio_path}")
            return
            
        base_name = Path(audio_path).stem
        
        if is_generated:
            logger.info("Detected GENERATED Audio. Extracting segment timestamps via Groq...")
            dest_folder = self.vo_trans_dir
            output_json_path = str(dest_folder / f"{base_name}.json")
            
            raw_json = run_groq_whisper(audio_path, language="ne")
            if raw_json:
                with open(output_json_path, 'w', encoding='utf-8') as f:
                    json.dump(raw_json, f, ensure_ascii=False, indent=2)
                logger.info(f"Saved generated transcription to: {output_json_path}")
                
        else:
            logger.info(f"Detected ORIGINAL Audio: {base_name}. Sourcing transcript via Groq...")
            dest_folder = self.original_dir
            output_json_path = str(dest_folder / f"{base_name}.json")
            
            # 1. Cloud Transcribe
            raw_json = run_groq_whisper(audio_path)
            if not raw_json:
                return
                
            with open(output_json_path, 'w', encoding='utf-8') as f:
                json.dump(raw_json, f, ensure_ascii=False, indent=2)
            logger.info(f"Saved raw original transcription to: {output_json_path}")
            
            # 2. Generate script for each requested language (one at a time)
            for lang in languages:
                lang_key   = lang.strip().lower()
                lang_title = lang_key.title()
                logger.info(f"━━━ TRANSLATING → {lang_title} ━━━")
                script_json = translate_and_emotion(raw_json, target_lang=lang_title)

                if not script_json:
                    logger.error(f"Failed to generate {lang_title} script — skipping.")
                    continue

                # 3. TIMING INSPECTOR
                logger.info(f"━━━ TIMING INSPECTOR [{lang_title}]: Checking alignment... ━━━")
                script_json = timing_inspector(
                    script_json,
                    raw_json.get('segments', []),
                    target_lang=lang_key
                )
                logger.info(f"━━━ TIMING INSPECTOR [{lang_title}]: Complete ━━━")

                out_name = f"{base_name}_{lang_key}_script.json"
                vo_path  = str(self.vo_script_dir / out_name)
                with open(vo_path, 'w', encoding='utf-8') as f:
                    json.dump(script_json, f, ensure_ascii=False, indent=2)
                logger.info(f"Saved {lang_title} script → {vo_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Transcriber Agent")
    parser.add_argument("audio_path", help="Path to the audio file")
    parser.add_argument(
        "--langs", default="nepali",
        help="Comma-separated target languages, e.g. nepali,hindi,english (default: nepali)"
    )
    args = parser.parse_args()

    requested_langs = [l.strip() for l in args.langs.split(',') if l.strip()]
    agent = TranscriberAgent()
    agent.process(args.audio_path, languages=requested_langs)
