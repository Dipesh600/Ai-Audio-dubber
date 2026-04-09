import { Router } from 'express';
import crypto from 'crypto';
import { db, dbGet, setJobFields, parseJobRow } from '../db';
import { runPipeline } from '../pipeline';
import { deleteIntermediates, fileMB } from '../fileManager';
import { PROJECT_ROOT } from '../agentRunner';
import { validateUrl } from '../middleware/validation';
import fs from 'fs';
import path from 'path';

const router = Router();

// ── Start Job ──
router.post('/start-job', validateUrl, (req, res) => {
  const id   = crypto.randomUUID();
  const url  = req.body.url;
  const langs: string[] = Array.isArray(req.body.languages) ? req.body.languages : ['nepali'];

  db.run(`INSERT INTO jobs (id, url, status, languages) VALUES (?, ?, 'PENDING', ?)`, [id, url, langs.join(',')], err => {
    if (err) return res.status(500).json({ error: 'DB insert failed.' });
    res.json({ id, status: 'PENDING' });
    runPipeline(id, url, langs);
  });
});

// ── Job Status ──
router.get('/job-status/:id', async (req, res) => {
  try {
    const jobId = req.params.id as string;
    const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [jobId]);
    if (!row) return res.status(404).json({ error: 'Job not found.' });
    res.json(parseJobRow(row));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Approve ──
router.post('/approve/:id', async (req, res) => {
  try {
    const jobId = req.params.id as string;
    const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [jobId]);
    if (!row) return res.status(404).json({ error: 'Job not found.' });

    let outputPaths: Record<string, string> = {};
    let finalPaths:  Record<string, string> = {};
    let azureUrls:   Record<string, string> = {};
    try { outputPaths = JSON.parse(row.output_paths || '{}'); } catch {}
    try { finalPaths  = JSON.parse(row.final_paths  || '{}'); } catch {}
    try { azureUrls   = JSON.parse(row.azure_urls   || '{}'); } catch {}

    const finalsDir = path.join(PROJECT_ROOT, 'output', 'finals');
    if (!fs.existsSync(finalsDir)) fs.mkdirSync(finalsDir, { recursive: true });

    for (const [lang, srcPath] of Object.entries(outputPaths)) {
      if (srcPath && fs.existsSync(srcPath)) {
        const destFile = `${row.base_name}_${lang}_Final.mp4`;
        const dest = path.join(finalsDir, destFile);
        fs.copyFileSync(srcPath, dest);
        finalPaths[lang] = dest;

        // Upload final to Azure
        try {
          const { uploadToAzure } = await import('../services/azureStorage');
          const azureUrl = await uploadToAzure(dest, `finals/${jobId}/${destFile}`);
          if (azureUrl) {
            azureUrls[`final_${lang}`] = azureUrl;
            console.log(`[APPROVE] Azure upload: ${destFile} → ${azureUrl}`);
          }
        } catch (e: any) {
          console.warn(`[APPROVE] Azure upload skipped: ${e.message}`);
        }
      }
    }

    const allLangs = row.languages ? row.languages.split(',').map((l: string) => l.trim()) : [];
    const allFinalized = allLangs.every((l: string) => finalPaths[l]);
    const newStatus = allFinalized ? 'APPROVED' : 'REVIEW';

    setJobFields(jobId, {
      status: newStatus,
      final_paths: JSON.stringify(finalPaths),
      output_paths: JSON.stringify({}),
      output_path: finalPaths[allLangs[0]] || row.output_path,
      azure_urls: JSON.stringify(azureUrls),
    });

    if (allFinalized) deleteIntermediates(row.base_name, row.id);

    const updated = parseJobRow(await dbGet(`SELECT * FROM jobs WHERE id=?`, [jobId]));
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Reject ──
router.post('/reject/:id', async (req, res) => {
  try {
    const jobId = req.params.id as string;
    const lang = req.query.lang as string || 'nepali';
    const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [jobId]);
    if (!row) return res.status(404).json({ error: 'Job not found.' });

    let outputPaths: Record<string, string> = {};
    try { outputPaths = JSON.parse(row.output_paths || '{}'); } catch {}

    if (outputPaths[lang]) {
      try { fs.unlinkSync(outputPaths[lang]); } catch {}
      delete outputPaths[lang];
    }

    const alignedDir = path.join(PROJECT_ROOT, 'output', 'aligner', 'aligned_audio');
    if (fs.existsSync(alignedDir)) {
      for (const f of fs.readdirSync(alignedDir)) {
        if (f.includes(row.base_name) && f.toLowerCase().includes(lang)) {
          try { fs.unlinkSync(path.join(alignedDir, f)); } catch {}
        }
      }
    }
    const dubbedDir = path.join(PROJECT_ROOT, 'output', 'aligner', 'dubbed_video');
    if (fs.existsSync(dubbedDir)) {
      for (const f of fs.readdirSync(dubbedDir)) {
        if (f.includes(row.base_name) && f.toLowerCase().includes(lang)) {
          try { fs.unlinkSync(path.join(dubbedDir, f)); } catch {}
        }
      }
    }

    const hasOtherOutputs = Object.keys(outputPaths).length > 0;
    let finalPaths: Record<string, string> = {};
    try { finalPaths = JSON.parse(row.final_paths || '{}'); } catch {}
    const hasSaved = Object.keys(finalPaths).length > 0;
    const newStatus = hasOtherOutputs || hasSaved ? 'REVIEW' : 'AWAITING_TTS';

    setJobFields(jobId, { status: newStatus, output_paths: JSON.stringify(outputPaths) });
    const updated = parseJobRow(await dbGet(`SELECT * FROM jobs WHERE id=?`, [jobId]));
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
