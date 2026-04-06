import os
import sys
import json
import argparse
from pathlib import Path
from pydub import AudioSegment
import math

# Add project root to sys.path so we can import from core
current_dir = Path(__file__).resolve().parent
project_root = current_dir.parent.parent
sys.path.insert(0, str(project_root))

from core.paths import get_agent_output_dir
from core.logger import get_logger

logger = get_logger("AlignerAgent")

def calculate_time_mapping(orig_segments, gen_words, target_total_duration):
    """
    Analyzes the word-level phonetics of the generated audio and identifies silences.
    Compresses or expands these silences to fit the target_total_duration.
    """
    if not gen_words:
        return []
        
    actual_total_duration = gen_words[-1].get("end", 0.0)
    difference = target_total_duration - actual_total_duration
    
    # Extract gaps between words
    gaps = []
    for i in range(len(gen_words) - 1):
        gap_start = gen_words[i].get("end", 0.0)
        gap_end = gen_words[i+1].get("start", 0.0)
        gap_duration = gap_end - gap_start
        if gap_duration > 0.05: # Only consider perceivable gaps > 50ms
            gaps.append({"index": i, "duration": gap_duration, "start": gap_start, "end": gap_end})
            
    total_gap_duration = sum([g["duration"] for g in gaps])
    
    mapping = []
    
    # If Generated is LONGER than Original, we need to SQUEEZE it
    if difference < 0:
        squeeze_needed = abs(difference)
        logger.info(f"Generated Audio is longer by {squeeze_needed:.2f}s. Squeezing silences...")
        
        # If we have enough silence to absorb the squeeze safely
        if squeeze_needed <= (total_gap_duration * 0.8): 
            # We will proportionally reduce each gap
            reduction_ratio = squeeze_needed / total_gap_duration
            for g in gaps:
                g["new_duration"] = g["duration"] * (1 - reduction_ratio)
        else:
            logger.warning("Not enough silence to completely fix timing via gaps alone. Will require extreme truncation or speedup.")
            # Truncate gaps to minimum 50ms
            for g in gaps:
                g["new_duration"] = 0.05
    
    # If Generated is SHORTER than Original, we need to PAD it
    elif difference > 0:
        pad_needed = difference
        logger.info(f"Generated Audio is shorter by {pad_needed:.2f}s. Distributing padding across natural silences...")
        
        # Add padding proportionally to the existing gaps, to preserve rhythm
        if total_gap_duration > 0:
            extension_ratio = pad_needed / total_gap_duration
            for g in gaps:
                g["new_duration"] = g["duration"] * (1 + extension_ratio)
        else:
            # If there are literally no gaps, we'll just have to append silence at the end
            pass

    return gaps

def speedup_audio(segment: AudioSegment, speed_ratio: float) -> AudioSegment:
    """
    Changes playback speed without severe pitch impact using frame rate modification.
    For extremely sophisticated pitch-preserved stretching, ffmpeg 'atempo' is preferred, 
    but pydub frame_rate hacks work for tiny (<5%) changes.
    """
    if speed_ratio == 1.0:
        return segment
        
    logger.info(f"Applying speedup ratio: {speed_ratio:.3f}x")
    
    # We alter the frame rate to shift speed.
    sound_with_altered_frame_rate = segment._spawn(segment.raw_data, overrides={
         "frame_rate": int(segment.frame_rate * speed_ratio)
      })
    # And then set back to original frame rate so it plays at the new speed
    return sound_with_altered_frame_rate.set_frame_rate(segment.frame_rate)


class AlignerAgent:
    def __init__(self):
        # Define the exact output directories
        self.aligned_dir = get_agent_output_dir("aligner", "aligned_audio")
        self.dubbed_dir = get_agent_output_dir("aligner", "dubbed_video")
        
        self.orig_transcript_dir = project_root / "output" / "transcriber" / "original_voiceover_transcription"
        self.gen_script_dir = project_root / "output" / "transcriber" / "generated_voiceover_script"
        self.gen_transcript_dir = project_root / "output" / "transcriber" / "generated_voiceover_transcription"
        self.video_dir = project_root / "output" / "downloader" / "videos"
        
        logger.info("Initialized Alignment Agent Brain.")

    def process(self, audio_path: str, orig_base_name: str = None, bgm_path: str = None):
        # lang_stem  = stem of the TTS file, e.g. "VideoTitle_nepali"
        # base_name  = original video/transcript base, e.g. "VideoTitle"
        lang_stem = Path(audio_path).stem
        base_name = orig_base_name if orig_base_name else lang_stem
        
        logger.info(f"Aligning lang_stem='{lang_stem}' against base='{base_name}'")
        
        # 1. Validation & File Loading
        orig_trans_file = self.orig_transcript_dir / f"{base_name}.json"
        gen_trans_file  = self.gen_transcript_dir  / f"{lang_stem}.json"
        gen_script_file = self.gen_script_dir / f"{base_name}_nepali_script.json"  # legacy ref only
        video_file      = self.video_dir / f"{base_name}.mp4"
        
        if not orig_trans_file.exists():
            logger.error(f"Original transcription missing: {orig_trans_file}")
            return
        if not gen_trans_file.exists():
            logger.error(f"Generated transcription missing: {gen_trans_file}")
            return
            
        logger.info(f"Found matched metadata for: {base_name}. Proceeding to cross-validate.")
        
        with open(orig_trans_file, 'r', encoding='utf-8') as f:
            orig_data = json.load(f)
        with open(gen_trans_file, 'r', encoding='utf-8') as f:
            gen_data = json.load(f)
            
        # Target timing limits from Original
        orig_segments = orig_data.get("segments", [])
        if not orig_segments:
            logger.error("Original audio has no segments to map.")
            return
            
        target_total_duration = orig_segments[-1].get("end", 0.0)
        orig_start_delay = orig_segments[0].get("start", 0.0)
        
        # Generated timing boundaries
        gen_words = gen_data.get("words", [])
        if not gen_words:
            logger.error("Generated TTS transcription lacks word-level granularity. Cannot perform sub-phonetic padding.")
            return

        # 2. Compute the Gap Differentials
        logger.info("Analyzing structural deviations and mapping silence vectors...")
        gaps = calculate_time_mapping(orig_segments, gen_words, target_total_duration)
        
        # 3. Audio Construction
        logger.info(f"Loading raw TTS audio: {audio_path}")
        audio = AudioSegment.from_file(audio_path)
        
        # We slice the audio along the words, applying the new gaps.
        final_audio = AudioSegment.silent(duration=int(orig_start_delay * 1000)) # Start with original buffer delay
        
        last_cut = 0.0
        
        for g in gaps:
            gap_start = g["start"]
            gap_end = g["end"]
            new_gap_duration = g.get("new_duration", g["duration"])
            
            # 1. Append the audio leading up to this gap (the spoken word(s))
            speech_chunk = audio[int(last_cut * 1000) : int(gap_start * 1000)]
            final_audio += speech_chunk
            
            # 2. Append the modified silence
            if new_gap_duration > 0:
                final_audio += AudioSegment.silent(duration=int(new_gap_duration * 1000))
                
            last_cut = gap_end
            
        # Append remaining audio after the final gap
        final_speech_chunk = audio[int(last_cut * 1000):]
        final_audio += final_speech_chunk
        
        # 4. Global Boundary Checking
        actual_len_sec = len(final_audio) / 1000.0
        if actual_len_sec > target_total_duration:
            # Still too long (probably dense speech with no gaps to compress)
            overshoot = actual_len_sec - target_total_duration
            logger.warning(f"Audio still overshoots target by {overshoot:.2f}s. Applying global temporal stretch.")
            speed_ratio = actual_len_sec / target_total_duration
            final_audio = speedup_audio(final_audio, speed_ratio)
        elif actual_len_sec < target_total_duration:
            # Still too short. Pad tail.
            undershoot = target_total_duration - actual_len_sec
            final_audio += AudioSegment.silent(duration=int(undershoot * 1000))

        # 5. Background Music Mixing (Optional)
        if bgm_path and Path(bgm_path).exists():
            logger.info(f"Background music detected at {bgm_path}. Applying audio ducking and mixing...")
            try:
                bgm_audio = AudioSegment.from_file(bgm_path)
                
                # Match duration precisely
                if len(bgm_audio) > len(final_audio):
                    bgm_audio = bgm_audio[:len(final_audio)]
                elif len(bgm_audio) < len(final_audio):
                    undershoot = len(final_audio) - len(bgm_audio)
                    bgm_audio += AudioSegment.silent(duration=undershoot)
                
                # Apply ducking (-8dB)
                bgm_audio = bgm_audio - 8
                
                # Overlay
                final_audio = bgm_audio.overlay(final_audio)
                logger.info("Successfully mixed BGM with synthesized audio track.")
            except Exception as e:
                logger.error(f"Failed to process BGM mix: {e}")

        # 6. Export Re-Aligned Audio Track
        output_audio_path = self.aligned_dir / f"{lang_stem}.wav"
        final_audio.export(str(output_audio_path), format="wav")
        logger.info(f"Successfully minted synchronized master audio: {output_audio_path}")
        
        # 7. Video Integration (FFMPEG Mux)
        if video_file.exists():
            import ffmpeg
            output_video_path = self.dubbed_dir / f"{lang_stem}_Dubbed.mp4"
            logger.info("Muxing aligned audio onto original visual sequence...")
            
            try:
                # Video without audio
                video_input = ffmpeg.input(str(video_file))
                # New audio
                audio_input = ffmpeg.input(str(output_audio_path))
                
                out = ffmpeg.output(
                    video_input.video, 
                    audio_input.audio, 
                    str(output_video_path), 
                    vcodec="copy",  # Copy video without re-encoding! Extremely fast!
                    acodec="aac", 
                    audio_bitrate="192k",
                    map_metadata="-1"
                )
                ffmpeg.run(out, overwrite_output=True, quiet=True)
                logger.info(f"Production Mux Complete! Final Video: {output_video_path}")
            except Exception as e:
                logger.error(f"FFMPEG overlay failed: {e}")
        else:
            logger.warning(f"Original video not found at {video_file}. Muxing aborted.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Alignment Agent Engine")
    parser.add_argument("audio_path", help="Path to the generated TTS audio file in input/audio/")
    parser.add_argument(
        "--base-name", default=None, dest="base_name",
        help="Original video base name (no language suffix). Defaults to audio_path stem."
    )
    parser.add_argument(
        "--bgm-path", default=None, dest="bgm_path",
        help="Optional path to isolated background music file."
    )
    args = parser.parse_args()

    agent = AlignerAgent()
    agent.process(args.audio_path, orig_base_name=args.base_name, bgm_path=args.bgm_path)
