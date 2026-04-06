FROM node:20-slim

# Install Python, ffmpeg (needed by downloader/transcriber agents)
RUN apt-get update && apt-get install -y \
    python3 python3-pip ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install --no-cache-dir yt-dlp

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Create required directories
RUN mkdir -p src logs output/input/audio

EXPOSE 5001

CMD ["npx", "tsx", "src/server.ts"]
