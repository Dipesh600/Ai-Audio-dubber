import os
from pathlib import Path

# PROJECT_ROOT: prefer env var (Docker/Railway), fallback to file-based resolution
_env_root = os.environ.get("PROJECT_ROOT")
PROJECT_ROOT = Path(_env_root) if _env_root else Path(__file__).resolve().parent.parent

# The global output directory
OUTPUT_DIR = PROJECT_ROOT / "output"

def get_agent_output_dir(agent_name: str, subfolder: str = "") -> Path:
    """
    Returns the Path to an agent's specific output directory.
    Creates it if it doesn't already exist.
    """
    agent_dir = OUTPUT_DIR / agent_name
    if subfolder:
        agent_dir = agent_dir / subfolder
    
    # Ensure it exists
    agent_dir.mkdir(parents=True, exist_ok=True)
    return agent_dir
