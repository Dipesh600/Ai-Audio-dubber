import { Router } from 'express';
import fs from 'fs';
import { dbGet } from '../db';
import { resolveMediaPath } from '../fileManager';

const router = Router();

// ── Serve media files ──
router.get('/media', async (req, res) => {
  try {
    const { type, id, lang } = req.query as { type: string; id: string; lang?: string };
    if (!type || !id) return res.status(400).json({ error: 'type and id required.' });
    const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [id]);
    if (!row) return res.status(404).json({ error: 'Job not found.' });
    const filePath = resolveMediaPath(type, row, lang);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found.' });
    res.sendFile(filePath);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Serve final output ──
router.get('/final', async (req, res) => {
  try {
    const { id } = req.query as { id: string };
    if (!id) return res.status(400).json({ error: 'id required.' });
    const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [id]);
    if (!row || !row.output_path || !fs.existsSync(row.output_path)) return res.status(404).end();
    res.sendFile(row.output_path);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
