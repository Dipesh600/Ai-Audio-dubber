# Deployment Guide: Vercel (Frontend) + Oracle VPS (Backend)

---

## Prerequisites
- **Oracle Cloud account** (free forever) — https://cloud.oracle.com
- **Vercel account** (free) — https://vercel.com
- **GitHub repo** with your code pushed (needed for Vercel)

---

## Part 1: Oracle VPS Backend Setup

### Step 1.1 — Create an Always-Free ARM instance
1. Log into Oracle Cloud → **Compute** → **Instances** → **Create instance**
2. Name it `audio-dubber-backend`
3. **Image**: Oracle Linux 8 (or Ubuntu 22.04)
4. **Shape**: Ampere Altra (ARM) — this is the **free forever** option
5. **Networking**: Default, note the **public IP**
6. **Add SSH keys**: Download the private key — you'll need it to SSH in
7. Click **Create** and wait 2-3 minutes for it to boot

### Step 1.2 — SSH into your VPS
```bash
ssh -i /path/to/your/private_key.pem opc@<YOUR_PUBLIC_IP>
```

### Step 1.3 — Install Docker
```bash
sudo dnf install -y docker   # Oracle Linux / AlmaLinux / RHEL
# OR: sudo apt install -y docker.io  # Ubuntu
sudo systemctl enable --now docker
sudo usermod -aG docker opc
# Log out and back in for group change to take effect
exit
ssh -i /path/to/your/private_key.pem opc@<YOUR_PUBLIC_IP>
docker --version   # confirm it works
```

### Step 1.4 — Clone your repo and configure
```bash
git clone https://github.com/YOUR_USERNAME/my-audio-dubber.git /app
cd /app
cp .env.example .env
nano .env   # fill in your GROQ_API_KEY, GEMINI_API_KEY, ALLOWED_ORIGIN
```

### Step 1.5 — Start the backend with Docker
```bash
docker compose up -d
docker compose logs -f   # watch it start up
```

### Step 1.6 — Verify backend is running
```bash
curl http://localhost:5001/api/health
# Should return: {"ok":true}
```

### Step 1.7 — (Optional) Set up a domain or use the IP
Your backend is now live at `http://<YOUR_PUBLIC_IP>:5001`

---

## Part 2: Vercel Frontend Setup

### Step 2.1 — Push code to GitHub
```bash
cd /Users/dipeshchaudhary/Downloads/my\ audio\ dubber
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/my-audio-dubber.git
git push -u origin main
```

### Step 2.2 — Deploy to Vercel
1. Go to https://vercel.com → **New Project**
2. Import your GitHub repo
3. **Framework Preset**: Next.js (detected automatically)
4. **Root Directory**: `orchestrator/frontend`
5. **Build Command**: `npm run build` (auto-detected)
6. **Environment Variables**:
   - `NEXT_PUBLIC_API_URL` = `https://<YOUR_PUBLIC_IP>:5001`
     - ⚠️ Note: Use `http://` not `https://` for the VPS IP
     - OR if you have a domain: `https://api.yourdomain.com`
7. Click **Deploy**

### Step 2.3 — Access your app
Vercel will give you a URL like `https://my-audio-dubber.vercel.app`

---

## Important Notes

### CORS
The backend uses `ALLOWED_ORIGIN` env var. Set it to your Vercel frontend URL:
```
ALLOWED_ORIGIN=https://my-audio-dubber.vercel.app
```

### YouTube Downloads
The VPS will have a **fresh IP** that YouTube hasn't blocked. Downloads will work immediately at full quality.

### File Storage
Downloads are stored inside the Docker container's volumes. They persist across restarts but are local to this VPS. Consider:
- Adding a volume mount to a separate data disk on Oracle
- Or periodically backing up `/app/output`

### Updating the app
```bash
# SSH into VPS
cd /app
git pull
docker compose down
docker compose up -d --build
```

---

## Quick Reference

| Where | Command |
|---|---|
| View logs | `docker compose logs -f` |
| Restart | `docker compose restart` |
| Stop | `docker compose down` |
| Rebuild after code change | `docker compose up -d --build` |
| SSH into VPS | `ssh -i key.pem opc@IP` |
| Health check | `curl http://localhost:5001/api/health` |
