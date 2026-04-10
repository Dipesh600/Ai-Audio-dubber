FROM node:20-slim

# ── System dependencies ──
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv ffmpeg curl build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python dependencies ──
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# ── Node.js dependencies (backend only) ──
COPY orchestrator/backend/package*.json ./orchestrator/backend/
RUN cd orchestrator/backend && npm ci
RUN cd orchestrator/backend && npm rebuild sqlite3 --build-from-source

# ── Copy source code ──
# Agents + shared core (Python)
COPY agents/ ./agents/
COPY core/ ./core/
COPY .env.example ./.env.example

# Backend (Node.js)
COPY orchestrator/backend/src/ ./orchestrator/backend/src/
COPY orchestrator/backend/tsconfig.json ./orchestrator/backend/

# ── Build TS & Prune Dev Dependencies ──
RUN cd orchestrator/backend && npm run build
RUN cd orchestrator/backend && npm prune --omit=dev

# ── Create required directories ──
RUN mkdir -p output/downloader/videos output/downloader/audio output/downloader/manifests \
    output/transcriber/original_voiceover_transcription output/transcriber/generated_voiceover_script \
    output/aligner/aligned_audio output/aligner/dubbed_video \
    output/finals output/input/audio uploads_tmp

# ── Environment ──
ENV NODE_ENV=production
ENV PROJECT_ROOT=/app

EXPOSE 5001

# ── Start backend (tsx for TypeScript execution) ──
WORKDIR /app/orchestrator/backend
CMD ["npm", "start"]
