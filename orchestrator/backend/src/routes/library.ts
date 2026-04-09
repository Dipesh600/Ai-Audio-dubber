import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT } from '../agentRunner';
import { fileMB } from '../fileManager';

const router = Router();

router.get('/library', (_req, res) => {
  try {
    const finalsDir = path.join(PROJECT_ROOT, 'output', 'finals');
    if (!fs.existsSync(finalsDir)) return res.json([]);
    const files = fs.readdirSync(finalsDir)
      .filter(f => f.endsWith('.mp4'))
      .sort((a, b) =>
        fs.statSync(path.join(finalsDir, b)).mtime.getTime() -
        fs.statSync(path.join(finalsDir, a)).mtime.getTime()
      );
    const items = files.map(f => ({
      id: f.replace('.mp4', ''),
      title: f.replace('.mp4', '').replace(/_/g, ' '),
      base_name: f.replace('.mp4', ''),
      created_at: fs.statSync(path.join(finalsDir, f)).mtime.toISOString(),
      video_url: `/api/library/${encodeURIComponent(f)}`,
      video_urls: { [f.replace('.mp4', '')]: `/api/library/${encodeURIComponent(f)}` },
      size_mb: fileMB(path.join(finalsDir, f)),
    }));
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/library/:filename', (req, res) => {
  const fp = path.join(PROJECT_ROOT, 'output', 'finals', decodeURIComponent(req.params.filename));
  if (!fs.existsSync(fp)) return res.status(404).end();
  res.sendFile(fp);
});

export default router;
