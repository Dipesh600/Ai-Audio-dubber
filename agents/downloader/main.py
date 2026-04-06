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

from core.paths import get_agent_output_dir
from core.logger import get_logger
import yt_dlp

logger = get_logger("DownloaderAgent")

# ── Invidious instances (public, no auth needed, no 403s) ──────────────────
# Sorted by reliability — first available instance is used
INVIDIOUS_INSTANCES = [
    "https://invidious.privacyredirect.com",
    "https://yewtu.be",
    "https://invidious.snopyta.org",
    "https://invidious.kavin.rocks",
]

AUDIO_FMT = (
    'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best'
)

def fetch_json(url: str, retries: int = 3) -> dict:
    """Fetch JSON from Invidious API with retry on failure."""
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            logger.warning(f"Invidious fetch attempt {attempt+1} failed: {e}")
    return None


def get_invidious_instance() -> str:
    """Find a working Invidious instance."""
    for instance in INVIDIOUS_INSTANCES:
        try:
            req = urllib.request.Request(instance, headers={'User-Agent': 'Mozilla/5.0'})
            urllib.request.urlopen(req, timeout=10)
            logger.info(f"Using Invidious instance: {instance}")
            return instance
        except Exception:
            continue
    raise Exception("No working Invidious instance found")


def download_with_ffmpeg(url: str, output_path: str) -> bool:
    """Download stream URL using ffmpeg (direct, no re-encoding = fast + lossless)."""
    cmd = [
        'ffmpeg', '-y', '-i', url,
        '-c', 'copy', '-bsf:a', 'aac_adtstoasc',
        '-max_muxing_queue_size', '9999',
        output_path
    ]
    logger.info(f"Running ffmpeg...")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
    if result.returncode != 0:
        logger.error(f"ffmpeg failed: {result.stderr[-500:]}")
        return False
    return True


def download_with_ytdlp_fallback(url: str, output_path: str, is_audio: bool = False) -> bool:
    """Fallback yt-dlp download when Invidious streams are encrypted/DRM'd.

    yt-dlp handles signature decryption and can always extract the file.
    Uses cookies from Chrome so it works even on restricted videos.
    """
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
        logger.info(f"yt-dlp fallback download (Chrome cookies)...")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return os.path.exists(output_path)
    except Exception as e:
        logger.error(f"yt-dlp fallback also failed: {e}")
        return False


class DownloaderAgent:
    def __init__(self, job_id: str = None):
        self.job_id = job_id or "unknown"
        self.video_output_dir = get_agent_output_dir("downloader", "videos")
        self.audio_output_dir = get_agent_output_dir("downloader", "audio")
        self.manifest_output_dir = get_agent_output_dir("downloader", "manifests")
        logger.info(f"Initialized Downloader Agent.")
        logger.info(f"Video Output Directory: {self.video_output_dir}")
        logger.info(f"Audio Output Directory: {self.audio_output_dir}")

    def _extract_video_id(self, url: str) -> str:
        """Extract YouTube video ID from any YouTube URL format."""
        # Handle various YouTube URL formats
        import re
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

    def download(self, url: str):
        logger.info(f"Starting download for URL: {url}")

        video_id = self._extract_video_id(url)
        if not video_id:
            logger.error(f"Could not extract video ID from: {url}")
            return None

        # ── Step 1: Try Invidious (no 403s, no auth needed) ───────────────
        instance = None
        data = None
        try:
            instance = get_invidious_instance()
            api_url = f"{instance}/api/v1/videos/{video_id}"
            data = fetch_json(api_url)
        except Exception as e:
            logger.warning(f"Invidious failed: {e}")

        title = "Unknown"
        base_name = f"video [{video_id}]"
        video_path = str(self.video_output_dir / f"{base_name}.mp4")
        audio_path = str(self.audio_output_dir / f"{base_name}.mp3")

        if data:
            title = data.get('title', 'Unknown')
            safe_title = "".join(c if c.isalnum() or c in ' -_.' else '_' for c in title)
            base_name = f"{safe_title} [{video_id}]"
            video_path = str(self.video_output_dir / f"{base_name}.mp4")
            audio_path = str(self.audio_output_dir / f"{base_name}.mp3")

            adaptive = data.get('adaptiveFormats', []) or []

            # Highest quality MP4 video stream
            vid_streams = [s for s in adaptive if s.get('type', '').startswith('video/') and s.get('container') == 'mp4']
            vid_streams.sort(key=lambda s: s.get('height', 0) or 0, reverse=True)

            # Highest quality audio stream
            audio_streams = [s for s in adaptive if s.get('type', '').startswith('audio/')]
            audio_streams.sort(key=lambda s: s.get('bitrate', 0) or 0, reverse=True)

            vid_url = vid_streams[0].get('url') if vid_streams else None
            audio_url = audio_streams[0].get('url') if audio_streams else None

            # If Invidious has direct URLs — use ffmpeg (fast, no re-encode)
            if audio_url:
                logger.info(f"Invidious stream available. Downloading audio...")
                download_ok = download_with_ffmpeg(audio_url, audio_path)
                if download_ok:
                    logger.info(f"Audio downloaded: {audio_path}")

            if vid_url:
                logger.info(f"Invidious video stream available ({vid_streams[0].get('height', '?')}p). Downloading...")
                download_ok = download_with_ffmpeg(vid_url, video_path)
                if download_ok:
                    logger.info(f"Video downloaded: {video_path}")
                elif not os.path.exists(video_path):
                    # Invidious gave encrypted/DRM video — use yt-dlp fallback with Chrome cookies
                    logger.warning("Invidious video stream encrypted. Using yt-dlp Chrome-cookie fallback...")
                    ok = download_with_ytdlp_fallback(url, str(self.video_output_dir / f"{base_name}.%(ext)s"))
                    if ok:
                        # yt-dlp naming: find what it actually saved
                        files = list(self.video_output_dir.glob(f"{base_name}.*"))
                        if files:
                            downloaded = str(files[0])
                            if not downloaded.endswith('.mp4'):
                                new_path = downloaded.rsplit('.', 1)[0] + '.mp4'
                                os.rename(downloaded, new_path)
                                video_path = new_path
                            else:
                                video_path = downloaded
            elif audio_url:
                # No video stream, audio only
                logger.info("No direct video stream — audio only mode")
        else:
            # No Invidious available — go straight to yt-dlp with Chrome cookies
            logger.warning("No Invidious instance available. Using yt-dlp with Chrome cookies...")
            ok = download_with_ytdlp_fallback(url, str(self.video_output_dir / f"{base_name}.%(ext)s"))
            if ok:
                files = list(self.video_output_dir.glob(f"{base_name}.*"))
                if files:
                    video_path = str(files[0])

        # ── Verify audio always exists (needed for transcription) ──────
        if not os.path.exists(audio_path):
            logger.info("Audio not found — extracting from video with ffmpeg...")
            if os.path.exists(video_path):
                subprocess.run([
                    'ffmpeg', '-y', '-i', video_path,
                    '-vn', '-acodec', 'libmp3lame', '-ab', '320k', audio_path
                ], capture_output=True, timeout=300)

        if not os.path.exists(video_path) and not os.path.exists(audio_path):
            logger.error("Neither video nor audio was downloaded")
            return None

        # ── Write manifest ────────────────────────────────────────────────
        os.makedirs(self.manifest_output_dir, exist_ok=True)
        manifest = {
            "job_id": self.job_id,
            "video_path": video_path if os.path.exists(video_path) else "",
            "audio_path": audio_path if os.path.exists(audio_path) else "",
            "base_name": base_name,
            "title": title,
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
    parser = argparse.ArgumentParser(description="Downloader Agent for fetching Video and Audio via Invidious")
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
