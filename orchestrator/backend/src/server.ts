import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const app = express();
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const corsOptions = { origin: ALLOWED_ORIGIN, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type'] };
app.use(cors(corsOptions));
app.use(express.json());

const upload = multer({ dest: path.join(__dirname, '../../uploads_tmp') });
const DB_PATH = path.join(__dirname, '../jobs.sqlite');
const db = new sqlite3.Database(DB_PATH);
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '../../..');

// ── Schema ──
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS jobs (
        id             TEXT PRIMARY KEY,
        url            TEXT DEFAULT '',
        status         TEXT DEFAULT 'PENDING',
        base_name      TEXT DEFAULT '',
        title          TEXT DEFAULT '',
        video_size_mb  REAL DEFAULT 0,
        audio_size_mb  REAL DEFAULT 0,
        nepali_preview TEXT DEFAULT '[]',
        eng_preview    TEXT DEFAULT '[]',
        lang_previews  TEXT DEFAULT '{}',
        languages      TEXT DEFAULT 'nepali',
        output_path    TEXT DEFAULT '',
        output_paths   TEXT DEFAULT '{}',
        final_paths    TEXT DEFAULT '{}',
        bgm_path       TEXT DEFAULT '',
        error          TEXT DEFAULT '',
        created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    const migrate = [
        'title','video_size_mb','audio_size_mb','nepali_preview','eng_preview',
        'output_path','output_paths','final_paths','lang_previews','languages', 'bgm_path'
    ];
    migrate.forEach(col => db.run(`ALTER TABLE jobs ADD COLUMN ${col} TEXT DEFAULT ''`, () => {}));
});

// ── DB Helpers ──
function dbGet(sql: string, params: any[]): Promise<any> {
    return new Promise((resolve, reject) => db.get(sql, params, (e, r) => e ? reject(e) : resolve(r)));
}
function dbAll(sql: string, params: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => db.all(sql, params, (e, r) => e ? reject(e) : resolve(r as any[])));
}
function setJobFields(id: string, fields: Record<string, any>) {
    const keys = Object.keys(fields);
    db.run(`UPDATE jobs SET ${keys.map(k => `${k}=?`).join(', ')} WHERE id=?`, [...keys.map(k => fields[k]), id]);
}

// ── Agent Runner ──
function runAgent(agentName: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(PROJECT_ROOT, 'agents', agentName, 'main.py');
        console.log(`[AGENT:${agentName}] ${args.join(' ')}`);
        const proc = spawn('python3', [scriptPath, ...args], { cwd: PROJECT_ROOT });
        proc.stdout.on('data', d => process.stdout.write(`[${agentName}] ${d}`));
        proc.stderr.on('data', d => process.stderr.write(`[${agentName}:ERR] ${d}`));
        proc.on('close', code => code === 0 ? resolve() : reject(new Error(`${agentName} exited with code ${code}`)));
    });
}

// ── File Helpers ──
function fileMB(p: string): number {
    try { return Math.round(fs.statSync(p).size / 1024 / 1024 * 100) / 100; } catch { return 0; }
}
function globDelete(dir: string, stem: string) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
        if (f.startsWith(stem)) try { fs.rmSync(path.join(dir, f), { recursive: true }); } catch {}
    }
}
function deleteIntermediates(baseName: string, jobId?: string) {
    const r = PROJECT_ROOT;
    globDelete(path.join(r, 'output', 'downloader', 'videos'), baseName);
    globDelete(path.join(r, 'output', 'downloader', 'audio'), baseName);
    globDelete(path.join(r, 'output', 'downloader', 'bgm'), baseName);
    globDelete(path.join(r, 'output', 'downloader', 'manifests'), jobId || baseName);  // clean manifest by job id or base
    globDelete(path.join(r, 'output', 'transcriber', 'original_voiceover_transcription'), baseName);
    globDelete(path.join(r, 'output', 'transcriber', 'generated_voiceover_script'), baseName);
    globDelete(path.join(r, 'output', 'transcriber', 'generated_voiceover_transcription'), baseName);
    globDelete(path.join(r, 'output', 'aligner', 'aligned_audio'), baseName);
    globDelete(path.join(r, 'output', 'aligner', 'dubbed_video'), baseName);
    globDelete(path.join(r, 'input', 'audio'), baseName);
}

// ── Media resolution: type=dubbed supports ?lang=, always no-cache ──
function resolveMediaPath(type: string, row: any, lang?: string): string {
    const base = row.base_name;
    const r = PROJECT_ROOT;

    if (type === 'video') return path.join(r, 'output', 'downloader', 'videos', `${base}.mp4`);
    if (type === 'audio') return path.join(r, 'output', 'downloader', 'audio',  `${base}.mp3`);
    if (type === 'final') return row.output_path || '';

    if (type === 'dubbed') {
        let outputPaths: Record<string, string> = {};
        let finalPaths: Record<string, string> = {};
        try { outputPaths = JSON.parse(row.output_paths || '{}'); } catch {}
        try { finalPaths  = JSON.parse(row.final_paths  || '{}'); } catch {}

        // 1. Staging (output_paths) for requested lang
        if (lang && outputPaths[lang] && fs.existsSync(outputPaths[lang])) return outputPaths[lang];
        // 2. Finals (final_paths) for requested lang — serves saved-but-not-yet-approved preview
        if (lang && finalPaths[lang]  && fs.existsSync(finalPaths[lang]))  return finalPaths[lang];

        // 3. Any available staging path
        const stagingVals = Object.values(outputPaths).filter(p => fs.existsSync(p));
        if (stagingVals.length) return stagingVals[0];

        // 4. Any available finals path
        const finalVals = Object.values(finalPaths).filter(p => fs.existsSync(p));
        if (finalVals.length) return finalVals[0];

        // 5. Legacy: scan dubbed_video dir — strict prefix match (no mtime guessing)
        const dubbedDir = path.join(r, 'output', 'aligner', 'dubbed_video');
        if (fs.existsSync(dubbedDir)) {
            const files = fs.readdirSync(dubbedDir)
                .filter(f => f.startsWith(base + '_') && f.endsWith('.mp4'))
                .sort((a, b) => a.localeCompare(b));  // deterministic sort, not mtime
            if (files.length) return path.join(dubbedDir, files[0]);
        }
        return row.output_path || '';
    }
    return '';
}

// ── Parse job row JSON fields ──
function parseJobRow(row: any) {
    if (!row) return row;
    (['eng_preview', 'nepali_preview'] as const).forEach(k => {
        try { row[k] = JSON.parse(row[k] || '[]'); } catch { row[k] = []; }
    });
    (['lang_previews', 'output_paths', 'final_paths'] as const).forEach(k => {
        try { row[k] = JSON.parse(row[k] || '{}'); } catch { row[k] = {}; }
    });
    return row;
}

// ── Download + Transcribe pipeline ──
async function runPipeline(id: string, url: string, langs: string[]) {
    try {
        setJobFields(id, { status: 'DOWNLOADING' });
        await runAgent('downloader', [url, '--job-id', id]);

        // Read manifest written by downloader (contains exact paths, no directory guessing)
        const videoDir = path.join(PROJECT_ROOT, 'output', 'downloader', 'videos');
        const audioDir = path.join(PROJECT_ROOT, 'output', 'downloader', 'audio');
        const manifestDir = path.join(PROJECT_ROOT, 'output', 'downloader', 'manifests');
        const manifestPath = path.join(manifestDir, `${id}_manifest.json`);
        let baseName = '';
        if (fs.existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                baseName = manifest.base_name || '';
            } catch (e) {
                console.warn('[MANIFEST READ ERROR]', e);
            }
        }
        // Fallback: if manifest missing, scan directory by mtime (legacy)
        if (!baseName) {
            if (fs.existsSync(videoDir)) {
                const vids = fs.readdirSync(videoDir)
                    .filter(f => f.endsWith('.mp4'))
                    .sort((a, b) =>
                        fs.statSync(path.join(videoDir, b)).mtime.getTime() -
                        fs.statSync(path.join(videoDir, a)).mtime.getTime()
                    );
                if (vids.length) baseName = path.basename(vids[0], '.mp4');
            }
        }
        if (!baseName) throw new Error('Downloader produced no video file.');

        const videoPath = path.join(videoDir, `${baseName}.mp4`);
        const audioPath = path.join(audioDir, `${baseName}.mp3`);
        setJobFields(id, {
            base_name: baseName,
            title: baseName,
            video_size_mb: fileMB(videoPath),
            audio_size_mb: fileMB(audioPath),
        });

        setJobFields(id, { status: 'TRANSCRIBING' });
        await runAgent('transcriber', [audioPath, '--langs', langs.join(',')]);

        // Read lang previews
        const scriptDir = path.join(PROJECT_ROOT, 'output', 'transcriber', 'generated_voiceover_script');
        const langPreviews: Record<string, any[]> = {};
        for (const lang of langs) {
            const sp = path.join(scriptDir, `${baseName}_${lang}_script.json`);
            if (fs.existsSync(sp)) {
                try {
                    const data = JSON.parse(fs.readFileSync(sp, 'utf-8'));
                    langPreviews[lang] = (data.segments || []).slice(0, 20).map((s: any) => ({
                        start: s.start, end: s.end, text: s.translated_text || s.text,
                        emotion: s.emotion || 'Neutral',
                    }));
                } catch {}
            }
        }

        const rawTPath = path.join(PROJECT_ROOT, 'output', 'transcriber', 'original_voiceover_transcription', `${baseName}.json`);
        let engPrev: any[] = [];
        if (fs.existsSync(rawTPath)) {
            try {
                const raw = JSON.parse(fs.readFileSync(rawTPath, 'utf-8'));
                engPrev = (raw.segments || []).slice(0, 15).map((s: any) => ({ start: s.start, end: s.end, text: s.text }));
            } catch {}
        }

        setJobFields(id, {
            status: 'AWAITING_TTS',
            eng_preview: JSON.stringify(engPrev),
            nepali_preview: JSON.stringify(langPreviews['nepali'] || []),
            lang_previews: JSON.stringify(langPreviews),
        });
    } catch (e: any) {
        console.error('[PIPELINE ERROR]', e.message);
        setJobFields(id, { status: 'ERROR', error: e.message });
    }
}

// ── Alignment: transcribe TTS → align → produce lang-named dubbed video ──
async function runAlignment(jobId: string, baseName: string, targetPath: string, lang: string) {
    try {
        setJobFields(jobId, { status: 'ALIGNING' });

        // Step 1 – transcribe the uploaded TTS audio (gives word-level timestamps)
        await runAgent('transcriber', [targetPath]);

        // Step 2 – align, passing --base-name so aligner reads the right original transcript
        const row = await dbGet(`SELECT bgm_path FROM jobs WHERE id=?`, [jobId]);
        const alignerArgs = [targetPath, '--base-name', baseName];
        if (row?.bgm_path && fs.existsSync(row.bgm_path)) {
            alignerArgs.push('--bgm-path', row.bgm_path);
        }
        await runAgent('aligner', alignerArgs);

        // Determine output path: {baseName}_{lang}_Dubbed.mp4
        const langStem   = path.basename(targetPath, path.extname(targetPath));   // e.g. "VideoTitle_nepali"
        const dubbedDir  = path.join(PROJECT_ROOT, 'output', 'aligner', 'dubbed_video');
        const dubbedPath = path.join(dubbedDir, `${langStem}_Dubbed.mp4`);
        const outputPath = fs.existsSync(dubbedPath) ? dubbedPath : '';

        // Read existing output_paths and add/update this lang
        const outRow = await dbGet(`SELECT output_paths FROM jobs WHERE id=?`, [jobId]);
        let outputPaths: Record<string, string> = {};
        try { outputPaths = JSON.parse(outRow?.output_paths || '{}'); } catch {}
        if (outputPath) outputPaths[lang] = outputPath;

        setJobFields(jobId, {
            status: 'REVIEW',
            output_path: outputPath,                      // legacy compat
            output_paths: JSON.stringify(outputPaths),
        });
    } catch (e: any) {
        setJobFields(jobId, { status: 'ERROR', error: e.message });
    }
}

// ──────────────────
//  ROUTES
// ──────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Start job
app.post('/api/start-job', (req: Request, res: Response) => {
    const { url, languages } = req.body as { url?: string; languages?: string[] };
    if (!url) { res.status(400).json({ error: 'URL required' }); return; }
    const id   = Date.now().toString();
    const langs = (languages && languages.length > 0) ? languages : ['nepali'];
    db.run(
        `INSERT INTO jobs (id, url, status, languages, output_paths) VALUES (?,?,?,?,?)`,
        [id, url, 'PENDING', langs.join(','), '{}'],
        err => {
            if (err) { res.status(500).json({ error: err.message }); return; }
            runPipeline(id, url, langs);
            res.json({ id, status: 'PENDING' });
        }
    );
});

// Poll status
app.get('/api/job-status/:id', async (req: Request, res: Response) => {
    try {
        const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [req.params.id]);
        if (!row) { res.status(404).json({ error: 'Not found' }); return; }
        res.json(parseJobRow(row));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Upload Background Music (BGM)
app.post('/api/upload-bgm/:id', upload.single('bgm'), async (req: Request, res: Response) => {
    const jobId = String(req.params.id);
    if (!req.file) { res.status(400).json({ error: 'No audio file' }); return; }
    try {
        const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [jobId]);
        if (!row) { res.status(404).json({ error: 'Not found' }); return; }

        const bgmDir = path.join(PROJECT_ROOT, 'output', 'downloader', 'bgm');
        if (!fs.existsSync(bgmDir)) fs.mkdirSync(bgmDir, { recursive: true });

        const ext = path.extname(req.file.originalname).toLowerCase() || '.mp3';
        const targetName = `${row.base_name || jobId}${ext}`;
        const targetPath = path.join(bgmDir, targetName);

        // Delete any existing bgm file for this job
        globDelete(bgmDir, row.base_name || jobId);

        fs.renameSync(req.file.path, targetPath);
        setJobFields(jobId, { bgm_path: targetPath });

        res.json({ message: 'BGM uploaded successfully', bgm_path: targetPath });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Upload TTS for a specific language
// Accepts multipart with field 'audio' (file) and 'lang' (text, default 'nepali')
app.post('/api/upload-tts/:id', upload.single('audio'), async (req: Request, res: Response) => {
    const jobId = String(req.params.id);
    const lang  = ((req.body?.lang as string) || 'nepali').toLowerCase().trim();
    if (!req.file) { res.status(400).json({ error: 'No audio file' }); return; }
    try {
        const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [jobId]);
        if (!row) { res.status(404).json({ error: 'Not found' }); return; }

        // Block upload if this lang is already saved to finals
        let savedFinals: Record<string, string> = {};
        try { savedFinals = JSON.parse(row.final_paths || '{}'); } catch {}
        if (savedFinals[lang]) {
            res.status(400).json({ error: `${lang} is already saved to finals. Use REDO from TTS Upload to create a new version (not available after saving).` });
            return;
        }

        const baseName: string = row.base_name;
        const inputAudioDir = path.join(PROJECT_ROOT, 'input', 'audio');
        fs.mkdirSync(inputAudioDir, { recursive: true });

        // Named with language so multiple languages don't clobber each other
        const targetPath = path.join(inputAudioDir, `${baseName}_${lang}.mp3`);
        fs.renameSync(req.file.path, targetPath);

        res.json({ status: 'ALIGNING', lang });
        runAlignment(jobId, baseName, targetPath, lang); // fire-and-forget
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Approve (smart partial-save):
//   - Moves all currently-staged output_paths langs to finals
//   - If ALL jobLangs are now in finals → deleteIntermediates + APPROVED
//   - If some langs still pending → keep intermediates, status stays REVIEW, user can continue uploading
app.post('/api/approve/:id', async (req: Request, res: Response) => {
    try {
        const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [req.params.id]);
        if (!row) { res.status(404).json({ error: 'Not found' }); return; }

        const jobLangsList = (row.languages || 'nepali').split(',').map((l: string) => l.trim()).filter(Boolean);

        const finalsDir = path.join(PROJECT_ROOT, 'output', 'finals');
        fs.mkdirSync(finalsDir, { recursive: true });

        // Staging paths (not yet moved to finals)
        let outputPaths: Record<string, string> = {};
        try { outputPaths = JSON.parse(row.output_paths || '{}'); } catch {}
        if (!Object.keys(outputPaths).length && row.output_path) {
            outputPaths = { main: row.output_path };
        }

        // Already-saved finals from a previous partial approve
        let existingFinalPaths: Record<string, string> = {};
        try { existingFinalPaths = JSON.parse(row.final_paths || '{}'); } catch {}

        // Move staged langs to finals
        const newlyFinalized: Record<string, string> = {};
        for (const [lang, p] of Object.entries(outputPaths)) {
            const ps = p as string;
            if (ps && fs.existsSync(ps)) {
                const dest = path.join(finalsDir, path.basename(ps));
                fs.renameSync(ps, dest);
                newlyFinalized[lang] = dest;
                // Clean up per-lang staging intermediates (aligned audio, TTS input)
                const langStem = `${row.base_name}_${lang}`;
                const r = PROJECT_ROOT;
                const al = path.join(r, 'output', 'aligner', 'aligned_audio', `${langStem}.wav`);
                if (fs.existsSync(al)) try { fs.rmSync(al); } catch {}
                const ta = path.join(r, 'input', 'audio', `${langStem}.mp3`);
                if (fs.existsSync(ta)) try { fs.rmSync(ta); } catch {}
                globDelete(path.join(r, 'output', 'transcriber', 'generated_voiceover_transcription'), langStem);
            }
        }

        // Merged final_paths = previous finals + newly finalized
        const allFinalPaths = { ...existingFinalPaths, ...newlyFinalized };
        const firstFinal = Object.values(allFinalPaths)[0] as string || '';

        // Determine which jobLangs are still pending (not in finals)
        const pendingLangs = jobLangsList.filter((l: string) => !allFinalPaths[l]);

        if (pendingLangs.length === 0) {
            // ALL langs done → full cleanup + APPROVED
            deleteIntermediates(row.base_name, row.id);
            setJobFields(row.id, {
                status: 'APPROVED',
                output_path: firstFinal,
                output_paths: '{}',          // cleared — all moved to final_paths
                final_paths: JSON.stringify(allFinalPaths),
            });
            res.json({ ok: true, status: 'APPROVED', final_paths: allFinalPaths, pending: [] });
        } else {
            // Partial save — keep intermediates for remaining langs, stay in REVIEW
            setJobFields(row.id, {
                status: 'REVIEW',
                output_path: firstFinal,
                output_paths: '{}',          // staged langs were moved out
                final_paths: JSON.stringify(allFinalPaths),
            });
            res.json({ ok: true, status: 'REVIEW', final_paths: allFinalPaths, pending: pendingLangs });
        }
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Reject a specific language → clean staging files for that lang, reset it to pending
// Blocked if lang is already in final_paths (already saved to finals — use REDO from library)
app.post('/api/reject/:id', async (req: Request, res: Response) => {
    const lang = ((req.query.lang as string) || 'nepali').toLowerCase().trim();
    try {
        const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [req.params.id]);
        if (!row) { res.status(404).json({ error: 'Not found' }); return; }

        // Prevent redo of a lang that was already saved to finals
        let finalPaths: Record<string, string> = {};
        try { finalPaths = JSON.parse(row.final_paths || '{}'); } catch {}
        if (finalPaths[lang]) {
            res.status(400).json({ error: `${lang} is already saved to finals. Cannot redo.` });
            return;
        }

        const baseName: string = row.base_name;
        const langStem = `${baseName}_${lang}`;
        const r = PROJECT_ROOT;

        let outputPaths: Record<string, string> = {};
        try { outputPaths = JSON.parse(row.output_paths || '{}'); } catch {}

        // Delete this lang's staged dubbed video
        const dubbedPath = outputPaths[lang] || path.join(r, 'output', 'aligner', 'dubbed_video', `${langStem}_Dubbed.mp4`);
        if (dubbedPath && fs.existsSync(dubbedPath)) try { fs.rmSync(dubbedPath); } catch {}

        // Delete aligned audio for this lang
        const alignedPath = path.join(r, 'output', 'aligner', 'aligned_audio', `${langStem}.wav`);
        if (fs.existsSync(alignedPath)) try { fs.rmSync(alignedPath); } catch {}

        // Delete TTS input audio
        const ttsAudioPath = path.join(r, 'input', 'audio', `${langStem}.mp3`);
        if (fs.existsSync(ttsAudioPath)) try { fs.rmSync(ttsAudioPath); } catch {}

        // Delete TTS transcription for this lang
        globDelete(path.join(r, 'output', 'transcriber', 'generated_voiceover_transcription'), langStem);

        // Remove from staging output_paths
        delete outputPaths[lang];

        // Determine new status: stay REVIEW if other staged or finalized langs exist, else AWAITING_TTS
        const stagingRemaining = Object.values(outputPaths).filter(p => fs.existsSync(p as string));
        const finalRemaining   = Object.values(finalPaths).filter(p => fs.existsSync(p as string));
        const newStatus = (stagingRemaining.length > 0 || finalRemaining.length > 0) ? 'REVIEW' : 'AWAITING_TTS';
        const newOutputPath = stagingRemaining[0] as string || finalRemaining[0] as string || '';

        setJobFields(row.id, {
            status: newStatus,
            output_path: newOutputPath,
            output_paths: JSON.stringify(outputPaths),
            // final_paths unchanged — don't touch already-saved langs
            error: '',
        });

        const updated = await dbGet(`SELECT * FROM jobs WHERE id=?`, [row.id]);
        res.json(parseJobRow(updated));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Media — serves video/audio/dubbed/final. dubbed supports ?lang= and never caches.
app.get('/api/media', async (req: Request, res: Response) => {
    const { type, id, lang } = req.query as { type: string; id: string; lang?: string };
    if (!type || !id) { res.status(400).json({ error: 'type and id required' }); return; }
    try {
        const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [id]);
        if (!row) { res.status(404).end(); return; }
        const filePath = resolveMediaPath(type, row, lang);
        if (!filePath || !fs.existsSync(filePath)) { res.status(404).end(); return; }

        // No-cache for dubbed and original video so REDO always gets fresh file
        if (type === 'dubbed' || type === 'final' || type === 'video') {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
        res.sendFile(path.resolve(filePath));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Library — all approved jobs with per-lang video URLs
app.get('/api/library', async (_req: Request, res: Response) => {
    try {
        const rows = await dbAll(
            `SELECT id, title, base_name, output_path, output_paths, created_at FROM jobs WHERE status='APPROVED' ORDER BY created_at DESC`,
            []
        );
        res.json(rows.map(r => {
            let outputPaths: Record<string, string> = {};
            try { outputPaths = JSON.parse(r.output_paths || '{}'); } catch {}

            // Build per-lang video API URLs
            const videoUrls: Record<string, string> = {};
            for (const lang of Object.keys(outputPaths)) {
                videoUrls[lang] = `/api/media?type=final&id=${r.id}&lang=${lang}&v=${Date.now()}`;
            }
            // Legacy fallback
            if (!Object.keys(videoUrls).length && r.output_path) {
                videoUrls['main'] = `/api/media?type=final&id=${r.id}`;
            }

            const primaryPath = Object.values(outputPaths)[0] as string || r.output_path;
            return {
                id: r.id,
                title: r.title || r.base_name,
                base_name: r.base_name,
                created_at: r.created_at,
                video_url: `/api/media?type=final&id=${r.id}`,
                video_urls: videoUrls,
                output_paths: outputPaths,
                size_mb: primaryPath && fs.existsSync(primaryPath) ? fileMB(primaryPath) : 0,
            };
        }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Final video for library entries (reads from output_paths by lang)
app.get('/api/final', async (req: Request, res: Response) => {
    const { id, lang } = req.query as { id: string; lang?: string };
    if (!id) { res.status(400).end(); return; }
    try {
        const row = await dbGet(`SELECT * FROM jobs WHERE id=?`, [id]);
        if (!row) { res.status(404).end(); return; }

        let outputPaths: Record<string, string> = {};
        try { outputPaths = JSON.parse(row.output_paths || '{}'); } catch {}

        let filePath = '';
        if (lang && outputPaths[lang]) {
            filePath = outputPaths[lang];
        } else {
            filePath = Object.values(outputPaths)[0] as string || row.output_path || '';
        }

        if (!filePath || !fs.existsSync(filePath)) { res.status(404).end(); return; }
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(path.resolve(filePath));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

const PORT = parseInt(process.env.PORT || '5001', 10);
app.listen(PORT, () => console.log(`[NEURAL_OVERLORD] Backend online → http://localhost:${PORT}`));
