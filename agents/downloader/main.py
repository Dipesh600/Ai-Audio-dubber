import sys
import os
import argparse
import json
import re
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

# Add project root to sys.path so we can import from core
current_dir = Path(__file__).resolve().parent
project_root = current_dir.parent.parent
sys.path.insert(0, str(project_root))

# Load .env from project root
try:
    from dotenv import load_dotenv
    load_dotenv(project_root / ".env")
except ImportError:
    pass  # dotenv not installed — rely on system env vars

from core.paths import get_agent_output_dir
from core.logger import get_logger

logger = get_logger("DownloaderAgent")

# ── APIhut config ──────────────────────────────────────────────────────────
APIHUT_ENDPOINT = "https://apihut.in/api/download/videos"

# ── Platform detection ─────────────────────────────────────────────────────
PLATFORM_PATTERNS = {
    'youtube': [
        r'(?:youtube\.com|youtu\.be|music\.youtube\.com)',
    ],
    'instagram': [
        r'(?:instagram\.com|instagr\.am)',
    ],
    'facebook': [
        r'(?:facebook\.com|fb\.watch|fb\.com)',
    ],
    'twitter': [
        r'(?:twitter\.com|x\.com)',
    ],
    'linkedin': [
        r'(?:linkedin\.com)',
    ],
    'tiktok': [
        r'(?:tiktok\.com|vm\.tiktok\.com)',
    ],
}


def detect_platform(url: str) -> str:
    """Detect which social media platform a URL belongs to."""
    for platform, patterns in PLATFORM_PATTERNS.items():
        for pat in patterns:
            if re.search(pat, url, re.IGNORECASE):
                return platform
    return 'youtube'  # fallback


def extract_video_id(url: str) -> str:
    """Extract YouTube video ID from any YouTube URL format."""
    patterns = [
        r'(?:v=|/v/)([a-zA-Z0-9_-]{11})',
        r'youtu\.be/([a-zA-Z0-9_-]{11})',
        r'youtube\.com/shorts/([a-zA-Z0-9_-]{11})',
        r'youtube\.com/embed/([a-zA-Z0-9_-]{11})',
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None


def sanitize_filename(title: str) -> str:
    """Make a string safe for use as a filename."""
    return "".join(c if c.isalnum() or c in ' -_.' else '_' for c in title).strip()


# ── APIhut download method (primary) ──────────────────────────────────────

def download_with_apihut(url: str, platform: str, video_path: str, audio_path: str) -> dict:
    """
    Download video via APIhut API.
    
    Returns dict with 'video_path' and 'audio_path' if successful, None on failure.
    
    APIhut behavior per their docs:
      - YouTube/LinkedIn: returns video buffer in response
      - Instagram/Facebook: returns download URL as JSON
    """
    api_key = os.environ.get("APIHUT_API_KEY", "")
    if not api_key:
        logger.warning("APIHUT_API_KEY not set — skipping APIhut download.")
        return None

    logger.info(f"[APIhut] API key loaded: {api_key[:8]}...{api_key[-4:]}")

    try:
        # Build platform-specific payload
        payload_dict = {
            "video_url": url,
            "type": platform,
        }

        # YouTube requires with_metadata flag per APIhut docs
        # Without it, YouTube downloads fail (returns error/empty response)
        if platform == 'youtube':
            payload_dict["with_metadata"] = True

        payload = json.dumps(payload_dict).encode('utf-8')

        logger.info(f"[APIhut] POST {APIHUT_ENDPOINT}")
        logger.info(f"[APIhut] Payload: {json.dumps(payload_dict)}")

        req = urllib.request.Request(
            APIHUT_ENDPOINT,
            data=payload,
            headers={
                'Content-Type': 'application/json',
                'X-Avatar-Key': api_key,
                'User-Agent': 'SetuDubber/1.0',
            },
            method='POST',
        )

        os.makedirs(os.path.dirname(video_path), exist_ok=True)
        os.makedirs(os.path.dirname(audio_path), exist_ok=True)

        # YouTube returns binary buffer which can be large — use longer timeout
        timeout = 300 if platform == 'youtube' else 180
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content_type = resp.headers.get('Content-Type', '')
            status = resp.status
            content_length = resp.headers.get('Content-Length', 'unknown')

            logger.info(f"[APIhut] Response: HTTP {status}, Content-Type: {content_type}, Content-Length: {content_length}")

            if status != 200:
                logger.warning(f"[APIhut] Non-200 response: {status}")
                return None

            # Read the full response body
            raw_data = resp.read()
            logger.info(f"[APIhut] Received {len(raw_data)} bytes")

            if len(raw_data) == 0:
                logger.warning("[APIhut] Empty response body")
                return None

            # Determine if it's JSON or binary
            is_json = 'application/json' in content_type or 'text/' in content_type

            # If content-type is ambiguous, try to detect from first bytes
            if not is_json:
                try:
                    # Check if it starts like JSON
                    first_bytes = raw_data[:20].decode('utf-8', errors='ignore').strip()
                    if first_bytes.startswith('{') or first_bytes.startswith('['):
                        is_json = True
                        logger.info("[APIhut] Detected JSON from content inspection")
                except:
                    pass

            if is_json:
                # ── JSON response (could contain URL or buffer reference) ──
                try:
                    data = json.loads(raw_data.decode('utf-8'))
                except:
                    # Maybe it's actually binary disguised with wrong content-type
                    logger.info("[APIhut] JSON parse failed — treating as binary video")
                    is_json = False

            if is_json:
                logger.info(f"[APIhut] JSON response: {json.dumps(data)[:500]}")

                # Check for error in response
                if isinstance(data, dict) and data.get('error'):
                    logger.warning(f"[APIhut] API error: {data.get('error')}")
                    return None

                # Extract download URL from various possible response formats
                download_url = None
                if isinstance(data, dict):
                    # Try direct fields
                    for key in ['download_url', 'url', 'video_url', 'link', 'videoUrl', 'downloadUrl']:
                        if data.get(key) and isinstance(data[key], str) and data[key].startswith('http'):
                            download_url = data[key]
                            break
                    
                    # Try nested data object
                    if not download_url and isinstance(data.get('data'), dict):
                        for key in ['download_url', 'url', 'video_url', 'link']:
                            if data['data'].get(key) and isinstance(data['data'][key], str):
                                download_url = data['data'][key]
                                break
                    
                    # Try nested data array (multiple qualities)
                    if not download_url and isinstance(data.get('data'), list) and len(data['data']) > 0:
                        for item in data['data']:
                            if isinstance(item, dict):
                                for key in ['url', 'download_url', 'video_url', 'link']:
                                    if item.get(key) and isinstance(item[key], str):
                                        download_url = item[key]
                                        break
                            if download_url:
                                break

                    # Check if there's a 'buffer' field with base64 data
                    if not download_url and data.get('buffer'):
                        import base64
                        logger.info("[APIhut] Found base64 buffer in response. Decoding...")
                        try:
                            video_data = base64.b64decode(data['buffer'])
                            with open(video_path, 'wb') as f:
                                f.write(video_data)
                            if os.path.exists(video_path) and os.path.getsize(video_path) > 1000:
                                logger.info(f"[APIhut] Video saved from buffer: {video_path} ({os.path.getsize(video_path) / 1024 / 1024:.1f} MB)")
                                _extract_audio(video_path, audio_path)
                                return {"video_path": video_path, "audio_path": audio_path}
                        except Exception as e:
                            logger.warning(f"[APIhut] Base64 decode failed: {e}")

                if download_url:
                    logger.info(f"[APIhut] Downloading video from URL: {download_url[:100]}...")
                    dl_req = urllib.request.Request(download_url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(dl_req, timeout=300) as dl_resp:
                        with open(video_path, 'wb') as f:
                            while True:
                                chunk = dl_resp.read(8192)
                                if not chunk:
                                    break
                                f.write(chunk)

                    if os.path.exists(video_path) and os.path.getsize(video_path) > 1000:
                        logger.info(f"[APIhut] Video saved: {video_path} ({os.path.getsize(video_path) / 1024 / 1024:.1f} MB)")
                        _extract_audio(video_path, audio_path)
                        return {"video_path": video_path, "audio_path": audio_path}
                    else:
                        logger.warning("[APIhut] Downloaded file too small")
                        return None
                
                logger.warning(f"[APIhut] No download URL found in response")
                return None

            else:
                # ── Binary video buffer response ──
                logger.info(f"[APIhut] Binary response: {len(raw_data)} bytes ({len(raw_data) / 1024 / 1024:.1f} MB)")
                with open(video_path, 'wb') as f:
                    f.write(raw_data)
                
                if os.path.exists(video_path) and os.path.getsize(video_path) > 1000:
                    logger.info(f"[APIhut] Video saved: {video_path}")
                    _extract_audio(video_path, audio_path)
                    return {"video_path": video_path, "audio_path": audio_path}
                else:
                    logger.warning("[APIhut] Binary data too small to be a video")
                    if os.path.exists(video_path):
                        os.remove(video_path)
                    return None

    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='ignore')[:500]
        logger.warning(f"[APIhut] HTTP Error {e.code}: {body}")
        return None
    except Exception as e:
        logger.warning(f"[APIhut] Error: {e}")
        return None


def _extract_audio(video_path: str, audio_path: str):
    """Extract audio from video using ffmpeg."""
    if os.path.exists(audio_path):
        return
    logger.info(f"Extracting audio: {video_path} → {audio_path}")
    os.makedirs(os.path.dirname(audio_path), exist_ok=True)
    subprocess.run([
        'ffmpeg', '-y', '-i', video_path,
        '-vn', '-acodec', 'libmp3lame', '-ab', '320k', audio_path
    ], capture_output=True, timeout=300)


# ── yt-dlp fallback (local, uses Chrome cookies) ─────────────────────────

def download_with_ytdlp_fallback(url: str, output_path: str, is_audio: bool = False) -> bool:
    """Fallback yt-dlp download with Chrome cookies for when APIhut is unavailable."""
    try:
        import yt_dlp
    except ImportError:
        logger.error("yt_dlp not installed — cannot use fallback")
        return False
    
    video_fmt = (
        'bestvideo[ext=mp4][height>=2160]+bestaudio[ext=m4a]/'
        'bestvideo[ext=mp4][height>=1440]+bestaudio[ext=m4a]/'
        'bestvideo[ext=mp4][height>=1080]+bestaudio[ext=m4a]/'
        'bestvideo[ext=mp4][height>=720]+bestaudio[ext=m4a]/'
        'bestvideo+bestaudio/best'
    )
    ydl_opts = {
        'format': video_fmt if not is_audio else 'bestaudio/best',
        'outtmpl': output_path,
        'merge_output_format': 'mp4',
        'quiet': False,
        'no_warnings': True,
        'cookiefrombrowser': ('chrome', None, None, None),
        'extractor_args': {'youtube': {'player_client': ['web', 'ios']}},
        'socket_timeout': 7200,
    }
    try:
        logger.info(f"[yt-dlp] Fallback download (Chrome cookies)...")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return os.path.exists(output_path.replace('%(ext)s', 'mp4'))
    except Exception as e:
        logger.error(f"[yt-dlp] Fallback also failed: {e}")
        return False


# ── Main Agent ────────────────────────────────────────────────────────────

class DownloaderAgent:
    def __init__(self, job_id: str = None):
        self.job_id = job_id or "unknown"
        self.video_output_dir = get_agent_output_dir("downloader", "videos")
        self.audio_output_dir = get_agent_output_dir("downloader", "audio")
        self.manifest_output_dir = get_agent_output_dir("downloader", "manifests")
        logger.info(f"Initialized Downloader Agent.")
        logger.info(f"Video Output Directory: {self.video_output_dir}")
        logger.info(f"Audio Output Directory: {self.audio_output_dir}")

    def download(self, url: str):
        logger.info(f"Starting download for URL: {url}")

        platform = detect_platform(url)
        logger.info(f"Detected platform: {platform}")

        video_id = extract_video_id(url) if platform == 'youtube' else None
        title = "Unknown"
        base_name = f"video_{self.job_id[:8]}"

        if video_id:
            base_name = f"video [{video_id}]"

        video_path = str(self.video_output_dir / f"{base_name}.mp4")
        audio_path = str(self.audio_output_dir / f"{base_name}.mp3")

        # ── YouTube: yt-dlp primary (APIhut YouTube is currently broken — 500 errors) ──
        if platform == 'youtube':
            logger.info("=" * 60)
            logger.info("Strategy 1: yt-dlp (primary for YouTube)")
            logger.info("=" * 60)
            ok = download_with_ytdlp_fallback(url, str(self.video_output_dir / f"{base_name}.%(ext)s"))
            if ok:
                files = list(self.video_output_dir.glob(f"{base_name}.*"))
                if files:
                    video_path = str(files[0])
                    if not video_path.endswith('.mp4'):
                        new_path = video_path.rsplit('.', 1)[0] + '.mp4'
                        os.rename(video_path, new_path)
                        video_path = new_path
                    logger.info("[yt-dlp] ✓ Download successful!")
            else:
                # Try APIhut as fallback for YouTube
                logger.info("=" * 60)
                logger.info("Strategy 2: APIhut fallback (for YouTube)")
                logger.info("=" * 60)
                result = download_with_apihut(url, platform, video_path, audio_path)
                if result and (os.path.exists(result.get('video_path', '')) or os.path.exists(result.get('audio_path', ''))):
                    video_path = result.get('video_path', video_path)
                    audio_path = result.get('audio_path', audio_path)
                    logger.info("[APIhut] ✓ Download successful!")

        # ── Other platforms: APIhut primary (Instagram, TikTok, Twitter, etc.) ──
        else:
            logger.info("=" * 60)
            logger.info(f"Strategy 1: APIhut API (primary for {platform})")
            logger.info("=" * 60)
            result = download_with_apihut(url, platform, video_path, audio_path)
            if result and (os.path.exists(result.get('video_path', '')) or os.path.exists(result.get('audio_path', ''))):
                video_path = result.get('video_path', video_path)
                audio_path = result.get('audio_path', audio_path)
                logger.info("[APIhut] ✓ Download successful!")
            else:
                logger.warning(f"[APIhut] Failed for {platform}. No additional fallback available.")

        # ── Ensure audio always exists (needed for transcription) ─────────
        if not os.path.exists(audio_path) and os.path.exists(video_path):
            _extract_audio(video_path, audio_path)

        if not os.path.exists(video_path) and not os.path.exists(audio_path):
            logger.error("Neither video nor audio was downloaded")
            return None

        # Try to get a better title from the video ID
        if video_id and title == "Unknown":
            base_name = f"video [{video_id}]"

        # ── Write manifest ────────────────────────────────────────────────
        os.makedirs(self.manifest_output_dir, exist_ok=True)
        manifest = {
            "job_id": self.job_id,
            "video_path": video_path if os.path.exists(video_path) else "",
            "audio_path": audio_path if os.path.exists(audio_path) else "",
            "base_name": base_name,
            "title": title,
            "platform": platform,
        }
        manifest_path = os.path.join(self.manifest_output_dir, f"{self.job_id}_manifest.json")
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f)
        logger.info(f"Manifest written: {manifest_path}")

        return {
            "video_path": video_path if os.path.exists(video_path) else "",
            "audio_path": audio_path if os.path.exists(audio_path) else "",
            "manifest_path": manifest_path
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Downloader Agent — APIhut primary + yt-dlp fallback")
    parser.add_argument("url", help="The URL of the video to download")
    parser.add_argument("--job-id", help="Job ID for manifest naming", default="unknown")
    args = parser.parse_args()

    agent = DownloaderAgent(job_id=args.job_id)
    result = agent.download(args.url)

    if result:
        logger.info(f"Process complete.")
        logger.info(f"Video stored at: {result['video_path']}")
        logger.info(f"Audio stored at: {result['audio_path']}")
    else:
        logger.error("Download process failed.")
