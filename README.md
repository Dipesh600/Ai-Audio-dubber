# My Audio Dubber - Multi-Agent System

This is a production-level multi-agent architecture designed to process, transcribe, translate, and dub audio and video.

## Directory Structure

- `agents/` - Contains individual agents, each with its own dependencies and main script.
- `core/` - Shared resources such as directory managers (`paths.py`) and standard logging (`logger.py`).
- `output/` - The unified sink for all agent outputs. Automatically generated.

## Downloader Agent
The Downloader agent uses a platform-aware dual strategy:
- **YouTube**: `yt-dlp` (primary) with Chrome cookies → APIhut API (fallback)
- **Instagram, TikTok, Twitter, LinkedIn, Facebook**: APIhut API (primary)

Audio is automatically extracted via `ffmpeg`.

### Usage
```bash
python3 agents/downloader/main.py <URL>
```

#### Example
```bash
python3 agents/downloader/main.py "https://www.youtube.com/watch?v=jNQXAC9IVRw"
```

Files are automatically saved to:
- Output Video: `output/downloader/videos/`
- Output Audio: `output/downloader/audio/`
