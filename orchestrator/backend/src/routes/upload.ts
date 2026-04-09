import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { db, dbGet, setJobFields } from '../db';
import { runAlignment, runPipelineFromTranscription } from '../pipeline';
import { PROJECT_ROOT } from '../agentRunner';
import { validateFileUpload } from '../middleware/validation';
import { fileMB } from '../fileManager';
import { emitJobUpdate } from '../websocket';

const router = Router();
const audioUpload = multer({ dest: path.join(PROJECT_ROOT, 'input', 'audio') });
const videoUpload = multer({ dest: path.join(PROJECT_ROOT, 'input', 'video') });

// ── Upload Video File (skip YouTube download) ──
router.post('/upload-video', videoUpload.single('video'), validateFileUpload('video'), async (req, res) => {
  try {
    const id = crypto.randomUUID();
    const langs: string[] = req.body.languages ? JSON.parse(req.body.languages) : ['nepali'];
    const origName = req.file!.originalname;
    const ext = path.extname(origName) || '.mp4';
    const baseName = path.basename(origName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');

    // Ensure output dirs exist
    const videoDir = path.join(PROJECT_ROOT, 'output', 'downloader', 'videos');
    const audioDir = path.join(PROJECT_ROOT, 'output', 'downloader', 'audio');
    [videoDir, audioDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

    // Move uploaded video to standard location
    const videoPath = path.join(videoDir, `${baseName}.mp4`);
    fs.renameSync(req.file!.path, videoPath);

    // Create job in DB
    db.run(
      `INSERT INTO jobs (id, url, status, languages, base_name, title) VALUES (?, ?, 'DOWNLOADING', ?, ?, ?)`,
      [id, `file://${origName}`, langs.join(','), baseName, origName.replace(ext, '')],
      (err) => {
        if (err) return res.status(500).json({ error: 'DB insert failed.' });

        res.json({ id, status: 'DOWNLOADING' });

        // Extract audio with ffmpeg, then start transcription pipeline
        const audioPath = path.join(audioDir, `${baseName}.mp3`);
        console.log(`[SPLIT] Extracting audio: ${videoPath} → ${audioPath}`);

        setJobFields(id, { status: 'DOWNLOADING' });
        emitJobUpdate(id, { status: 'DOWNLOADING' });

        const ffmpeg = spawn('ffmpeg', ['-i', videoPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', audioPath]);
        ffmpeg.stderr.on('data', d => process.stderr.write(`[ffmpeg:split] ${d}`));
        ffmpeg.on('close', (code) => {
          if (code !== 0 || !fs.existsSync(audioPath)) {
            setJobFields(id, { status: 'ERROR', error: 'Failed to extract audio from video.' });
            emitJobUpdate(id, { status: 'ERROR', error: 'Failed to extract audio from video.' });
            return;
          }

          console.log(`[SPLIT] Audio extracted successfully (${fileMB(audioPath)} MB)`);
          setJobFields(id, {
            base_name: baseName,
            title: origName.replace(ext, ''),
            video_size_mb: fileMB(videoPath),
            audio_size_mb: fileMB(audioPath),
          });
          emitJobUpdate(id, {
            status: 'DOWNLOADING',
            base_name: baseName,
            title: origName.replace(ext, ''),
            video_size_mb: fileMB(videoPath),
            audio_size_mb: fileMB(audioPath),
          });

          // Skip downloader, go straight to transcription
          runPipelineFromTranscription(id, baseName, audioPath, langs);
        });
      }
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Upload TTS Audio ──
router.post('/upload-tts/:id', audioUpload.single('audio'), validateFileUpload('audio'), async (req, res) => {
  try {
    const jobId = req.params.id as string;
    const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [jobId]);
    if (!row) return res.status(404).json({ error: 'Job not found.' });
    const lang     = req.body.lang || 'nepali';
    const origName = req.file!.originalname;
    const ext      = path.extname(origName) || '.mp3';
    const newName  = `${row.base_name}_${lang}_voiceover${ext}`;
    const targetPath = path.join(path.dirname(req.file!.path), newName);
    fs.renameSync(req.file!.path, targetPath);
    res.json({ ok: true, lang });
    runAlignment(jobId, row.base_name, targetPath, lang);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Upload BGM Audio ──
router.post('/upload-bgm/:id', audioUpload.single('bgm'), validateFileUpload('bgm'), async (req, res) => {
  try {
    const jobId = req.params.id as string;
    const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [jobId]);
    if (!row) return res.status(404).json({ error: 'Job not found.' });
    const ext     = path.extname(req.file!.originalname) || '.mp3';
    const bgmDir  = path.join(PROJECT_ROOT, 'output', 'downloader', 'bgm');
    if (!fs.existsSync(bgmDir)) fs.mkdirSync(bgmDir, { recursive: true });
    const bgmPath = path.join(bgmDir, `${row.base_name}_bgm${ext}`);
    fs.renameSync(req.file!.path, bgmPath);
    setJobFields(jobId, { bgm_path: bgmPath });
    res.json({ ok: true, bgm_path: bgmPath });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
