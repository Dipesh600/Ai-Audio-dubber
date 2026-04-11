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

# ── JSON response cleaner ──
def _clean_json_response(raw: str) -> str:
    """Strip markdown fences, reasoning tags, and whitespace from LLM output to get clean JSON."""
    if not raw:
        raise ValueError("LLM returned empty response")
    text = raw.strip()
    
    # Strip <think>...</think> reasoning blocks (MiniMax M1, DeepSeek, etc.)
    import re
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
    
    # Remove ```json ... ``` or ``` ... ``` fencing
    if text.startswith('```'):
        first_newline = text.find('\n')
        if first_newline != -1:
            text = text[first_newline + 1:]
        if text.rstrip().endswith('```'):
            text = text.rstrip()[:-3].rstrip()
    
    # If still not starting with { or [, try to find the first JSON object/array
    if text and text[0] not in ('{', '['):
        # Find first { or [
        brace = text.find('{')
        bracket = text.find('[')
        starts = [i for i in [brace, bracket] if i >= 0]
        if starts:
            text = text[min(starts):]
    
    if not text:
        raise ValueError("LLM response contained no JSON after cleaning")
    
    # Validate it's parseable JSON
    json.loads(text)
    return text


# ── Shared LLM caller with MiniMax primary + Gemini fallback ──
def _call_llm(prompt: str, json_mode: bool = True) -> str:
    """
    Call an LLM with automatic provider fallback.
    Strategy: MiniMax (paid, reliable) → Gemini 2.5 Flash (free tier).
    Retries up to 5 times total with 10s between attempts.
    Returns the raw response text (should be JSON if json_mode=True).
    """
    import time

    minimax_key = os.environ.get('MINIMAX_API_KEY', '')
    gemini_key  = os.environ.get('GEMINI_API_KEY', '')

    # Build ordered list of providers to try
    providers = []
    if minimax_key:
        providers.append(('minimax', minimax_key))
    if gemini_key:
        providers.append(('gemini', gemini_key))
    if not providers:
        raise RuntimeError("No LLM API key found. Set MINIMAX_API_KEY or GEMINI_API_KEY in .env")

    max_retries = 5
    last_error = None

    for attempt in range(max_retries):
        # Cycle through providers: primary first, then fallback
        provider_name, api_key = providers[attempt % len(providers)] if len(providers) > 1 and attempt >= 2 else providers[0]
        # After 2 failures on primary, start alternating to fallback
        if attempt >= 2 and len(providers) > 1:
            provider_name, api_key = providers[attempt % len(providers)]

        try:
            if provider_name == 'minimax':
                result = _call_minimax(prompt, api_key, json_mode)
            else:
                result = _call_gemini(prompt, api_key, json_mode)
            # Clean and validate JSON before returning
            if json_mode:
                result = _clean_json_response(result)
            logger.info(f"LLM call succeeded via {provider_name} (attempt {attempt + 1})")
            return result
        except Exception as e:
            last_error = e
            if attempt < max_retries - 1:
                logger.warning(f"LLM failure ({provider_name}, attempt {attempt + 1}/{max_retries}): {e}. Retrying in 10s...")
                time.sleep(10)
            else:
                logger.error(f"LLM failure after {max_retries} attempts: {e}")
                raise


def _call_minimax(prompt: str, api_key: str, json_mode: bool) -> str:
    """Call MiniMax via OpenAI-compatible endpoint."""
    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url="https://api.minimax.io/v1")
    messages = [
        {"role": "system", "content": "You are an expert multilingual dubbing script editor. You MUST respond with valid JSON only. No markdown fencing, no explanation, no extra text — just the raw JSON object."},
        {"role": "user", "content": prompt}
    ]
    kwargs = {
        "model": "MiniMax-M2.7",
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 8192,
    }
    # Use native JSON mode if supported
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    
    response = client.chat.completions.create(**kwargs)
    
    # Debug: log what we actually got back
    content = response.choices[0].message.content if response.choices else None
    logger.info(f"[MiniMax] model=MiniMax-M2.7, finish_reason={response.choices[0].finish_reason if response.choices else 'N/A'}, content_length={len(content) if content else 0}")
    
    if not content or not content.strip():
        raise ValueError(f"MiniMax returned empty content. finish_reason={response.choices[0].finish_reason if response.choices else 'unknown'}")
    
    return content


def _call_gemini(prompt: str, api_key: str, json_mode: bool) -> str:
    """Call Gemini via google-genai SDK."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    config = types.GenerateContentConfig(
        response_mime_type="application/json"
    ) if json_mode else None
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=config
    )
    return response.text

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
    lang_title = target_lang.title()
    
    # Build script for the target language
    if lang_title in ('Hindi', 'Nepali'):
        script_name = 'देवनागरी (Devanagari)'
    else:
        script_name = lang_title
    
    prompt = f"""
You are a professional SCREENWRITER and DIALOGUE WRITER for dubbed video content.
You are writing a voiceover narration script for a video being dubbed from English to {lang_title}.

ROLE: You are NOT a translator. You are a scriptwriter who understands visual storytelling.
Think about what the viewer is SEEING on screen and write narration that complements the visuals.

INPUT: I will provide JSON segments with timestamps and English transcription from the original video.

YOUR TASK for each segment:
1. Determine the emotion (Happy, Serious, Angry, Neutral, Excited, Sad, Curious, Dramatic)
2. Write `translated_text`: A timing-matched {lang_title} voiceover script in {script_name} script
3. Write `natural_translated_text`: A more dynamic, engaging version (can be slightly longer/shorter)

═══════════════════════════════════════════════════════
ABSOLUTE RULES — VIOLATION OF ANY RULE IS UNACCEPTABLE
═══════════════════════════════════════════════════════

RULE 1 — SCRIPT & LANGUAGE:
  • ALL output text MUST be in {script_name} script. ZERO Romanized text.
  • Hindi example: "अगर आपको कांटा चुभ जाए" ✓   "Agar aapko kaanta chubh jaye" ✗
  • Nepali example: "यदि तपाईंलाई काँडा लाग्यो भने" ✓   "Yadi tapailai kaanda lagyo bhane" ✗

RULE 2 — VOCABULARY & TRANSLATION:
  • Translate ALL English words into proper {lang_title}. Do NOT keep English words as-is.
  • "splinter" → Hindi: "किरचा" or "काँटा", Nepali: "काँडा" or "किरचा"
  • "deep" → "गहराई में" / "गहिरो"
  • "infection" → "संक्रमण" / "सङ्क्रमण"  
  • "surface" → "सतह" / "सतह"
  • "pressure" → "दबाव" / "दबाब"
  • "pus" → "मवाद" / "पिप"
  • ONLY keep English words that have genuinely NO equivalent (brand names, technical jargon with no native word)

RULE 3 — TONE & REGISTER:
  • Write like a professional VIDEO NARRATOR, not a friend chatting.
  • NO casual fillers: "yaar", "bro", "guys", "na", "toh basically"
  • Think Discovery Channel Hindi / Nepali narrator tone — clear, engaging, authoritative
  • The narration should make the viewer feel they're watching premium dubbed content

RULE 4 — VISUAL CONTEXT AWARENESS:
  • Remember: this is a VIDEO. The viewer is watching something on screen.
  • Write narration that complements what the viewer sees, don't just translate words.
  • Make the viewer curious about what's happening visually.

OUTPUT FORMAT — Return a single JSON object:
{{
  "segments": [
    {{
      "id": <int>,
      "start": <float>,
      "end": <float>,
      "original_text": "<original English>",
      "emotion": "<emotion tag>",
      "translated_text": "<timing-matched {script_name} script>",
      "natural_translated_text": "<engaging {script_name} adaptation>"
    }}
  ],
  "full_natural_script": "<all natural_translated_text joined as paragraph>"
}}

Here is the input:
"""
    
    segments = json_data.get("segments", [])
    if not segments:
        logger.warning("No segments found in the transcript.")
        return {"segments": [], "full_natural_script": ""}
    
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
    
    full_prompt = prompt + json.dumps(condensed_segments, indent=2)
    raw = _call_llm(full_prompt, json_mode=True)
    result = json.loads(raw)
    
    # Normalize: if LLM returned a list instead of dict, wrap it
    if isinstance(result, list):
        result = {"segments": result, "full_natural_script": ""}
    if "segments" not in result:
        result = {"segments": result.get("data", []), "full_natural_script": result.get("full_natural_script", "")}
    
    return result

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

    logger.info(f"[Timing Inspector Pass {pass_num}] Sending {len(issues)} {lang_title} segments for timing correction...")

    script_name = 'देवनागरी (Devanagari)' if lang_title in ('Hindi', 'Nepali') else lang_title

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
  2. Write in {script_name} script ONLY — zero Romanized text
  3. Use professional narrator tone — NO casual fillers (yaar, bro, na, toh)
  4. Translate ALL English words to proper {lang_title} vocabulary
  5. Final character count MUST be within ±10% of target_char_count
  6. Do NOT include the emotion label in the translated text itself
  7. Return ONLY a valid JSON array — no markdown, no explanation, no extra keys

Output format:
[
  {{"id": <int>, "translated_text": "<rewritten Nepali text>"}}
]

Segments to fix:
"""
    full_prompt = INSPECTOR_PROMPT + json.dumps(issues, ensure_ascii=False, indent=2)
    raw = _call_llm(full_prompt, json_mode=True)
    corrections = json.loads(raw)
                
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



class TranscriberAgent:
    def __init__(self):
        # Allow user to specify env variables cleanly via .env template
        load_dotenv(project_root / ".env", override=True)
        
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
                    logger.error(f"Failed to generate {lang_title} script — aborting job to trigger frontend error.")
                    sys.exit(1)

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
