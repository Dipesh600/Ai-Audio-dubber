import { Router } from 'express';
import fs from 'fs';
import { dbGet } from '../db';
import { resolveMediaPath } from '../fileManager';

const router = Router();

// ── Serve media files ──
// Priority: local file → Azure Blob URL redirect
router.get('/media', async (req, res) => {
  try {
    const { type, id, lang } = req.query as { type: string; id: string; lang?: string };
    if (!type || !id) return res.status(400).json({ error: 'type and id required.' });
    const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [id]);
    if (!row) return res.status(404).json({ error: 'Job not found.' });

    // Try Azure URLs first
    let azureUrls: Record<string, string> = {};
    try { azureUrls = typeof row.azure_urls === 'string' ? JSON.parse(row.azure_urls || '{}') : (row.azure_urls || {}); } catch {}

    let azureKey = '';
    if (type === 'dubbed' && lang) azureKey = lang;
    else if (type === 'dubbed') azureKey = Object.keys(azureUrls).find(k => !k.startsWith('final_')) || '';
    else if (type === 'final' && lang) azureKey = `final_${lang}`;
    else if (type === 'final') azureKey = Object.keys(azureUrls).find(k => k.startsWith('final_')) || '';

    if (azureKey && azureUrls[azureKey]) {
      return res.redirect(azureUrls[azureKey]);
    }

    // Fall back to local file
    const filePath = resolveMediaPath(type, row, lang);
    if (filePath && fs.existsSync(filePath)) return res.sendFile(filePath);

    return res.status(404).json({ error: 'File not found (local or Azure).' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Serve final output ──
router.get('/final', async (req, res) => {
  try {
    const { id, lang } = req.query as { id: string; lang?: string };
    if (!id) return res.status(400).json({ error: 'id required.' });
    const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [id]);
    if (!row) return res.status(404).end();

    // Try Azure URLs first
    let azureUrls: Record<string, string> = {};
    try { azureUrls = typeof row.azure_urls === 'string' ? JSON.parse(row.azure_urls || '{}') : (row.azure_urls || {}); } catch {}
    const azureKey = lang ? `final_${lang}` : Object.keys(azureUrls).find(k => k.startsWith('final_'));
    if (azureKey && azureUrls[azureKey]) return res.redirect(azureUrls[azureKey]);

    // Fall back to local final_paths
    let finalPaths: Record<string, string> = {};
    try { finalPaths = typeof row.final_paths === 'string' ? JSON.parse(row.final_paths || '{}') : (row.final_paths || {}); } catch {}
    if (lang && finalPaths[lang] && fs.existsSync(finalPaths[lang])) return res.sendFile(finalPaths[lang]);
    const anyFinal = Object.values(finalPaths).find(p => fs.existsSync(p as string));
    if (anyFinal) return res.sendFile(anyFinal as string);

    // Fall back to output_path backwards compatibility
    if (row.output_path && fs.existsSync(row.output_path)) return res.sendFile(row.output_path);

    return res.status(404).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
