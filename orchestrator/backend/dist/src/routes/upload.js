"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const child_process_1 = require("child_process");
const db_1 = require("../db");
const pipeline_1 = require("../pipeline");
const agentRunner_1 = require("../agentRunner");
const validation_1 = require("../middleware/validation");
const fileManager_1 = require("../fileManager");
const websocket_1 = require("../websocket");
const router = (0, express_1.Router)();
const audioUpload = (0, multer_1.default)({ dest: path_1.default.join(agentRunner_1.PROJECT_ROOT, 'input', 'audio') });
const videoUpload = (0, multer_1.default)({ dest: path_1.default.join(agentRunner_1.PROJECT_ROOT, 'input', 'video') });
// ── Upload Video File (skip YouTube download) ──
router.post('/upload-video', videoUpload.single('video'), (0, validation_1.validateFileUpload)('video'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = crypto_1.default.randomUUID();
        const langs = req.body.languages ? JSON.parse(req.body.languages) : ['nepali'];
        const origName = req.file.originalname;
        const ext = path_1.default.extname(origName) || '.mp4';
        const baseName = path_1.default.basename(origName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        // Ensure output dirs exist
        const videoDir = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'downloader', 'videos');
        const audioDir = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'downloader', 'audio');
        [videoDir, audioDir].forEach(d => { if (!fs_1.default.existsSync(d))
            fs_1.default.mkdirSync(d, { recursive: true }); });
        // Move uploaded video to standard location
        const videoPath = path_1.default.join(videoDir, `${baseName}.mp4`);
        fs_1.default.renameSync(req.file.path, videoPath);
        // Create job in DB
        db_1.db.run(`INSERT INTO jobs (id, url, status, languages, base_name, title) VALUES (?, ?, 'DOWNLOADING', ?, ?, ?)`, [id, `file://${origName}`, langs.join(','), baseName, origName.replace(ext, '')], (err) => {
            if (err)
                return res.status(500).json({ error: 'DB insert failed.' });
            res.json({ id, status: 'DOWNLOADING' });
            // Extract audio with ffmpeg, then start transcription pipeline
            const audioPath = path_1.default.join(audioDir, `${baseName}.mp3`);
            console.log(`[SPLIT] Extracting audio: ${videoPath} → ${audioPath}`);
            (0, db_1.setJobFields)(id, { status: 'DOWNLOADING' });
            (0, websocket_1.emitJobUpdate)(id, { status: 'DOWNLOADING' });
            const ffmpeg = (0, child_process_1.spawn)('ffmpeg', ['-i', videoPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', audioPath]);
            ffmpeg.stderr.on('data', d => process.stderr.write(`[ffmpeg:split] ${d}`));
            ffmpeg.on('close', (code) => {
                if (code !== 0 || !fs_1.default.existsSync(audioPath)) {
                    (0, db_1.setJobFields)(id, { status: 'ERROR', error: 'Failed to extract audio from video.' });
                    (0, websocket_1.emitJobUpdate)(id, { status: 'ERROR', error: 'Failed to extract audio from video.' });
                    return;
                }
                console.log(`[SPLIT] Audio extracted successfully (${(0, fileManager_1.fileMB)(audioPath)} MB)`);
                (0, db_1.setJobFields)(id, {
                    base_name: baseName,
                    title: origName.replace(ext, ''),
                    video_size_mb: (0, fileManager_1.fileMB)(videoPath),
                    audio_size_mb: (0, fileManager_1.fileMB)(audioPath),
                });
                (0, websocket_1.emitJobUpdate)(id, {
                    status: 'DOWNLOADING',
                    base_name: baseName,
                    title: origName.replace(ext, ''),
                    video_size_mb: (0, fileManager_1.fileMB)(videoPath),
                    audio_size_mb: (0, fileManager_1.fileMB)(audioPath),
                });
                // Skip downloader, go straight to transcription
                (0, pipeline_1.runPipelineFromTranscription)(id, baseName, audioPath, langs);
            });
        });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
}));
// ── Upload TTS Audio ──
router.post('/upload-tts/:id', audioUpload.single('audio'), (0, validation_1.validateFileUpload)('audio'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const jobId = req.params.id;
        const row = yield (0, db_1.dbGet)(`SELECT * FROM jobs WHERE id=?`, [jobId]);
        if (!row)
            return res.status(404).json({ error: 'Job not found.' });
        const lang = req.body.lang || 'nepali';
        const origName = req.file.originalname;
        const ext = path_1.default.extname(origName) || '.mp3';
        const newName = `${row.base_name}_${lang}_voiceover${ext}`;
        const targetPath = path_1.default.join(path_1.default.dirname(req.file.path), newName);
        fs_1.default.renameSync(req.file.path, targetPath);
        res.json({ ok: true, lang });
        (0, pipeline_1.runAlignment)(jobId, row.base_name, targetPath, lang);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
}));
// ── Upload BGM Audio ──
router.post('/upload-bgm/:id', audioUpload.single('bgm'), (0, validation_1.validateFileUpload)('bgm'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const jobId = req.params.id;
        const row = yield (0, db_1.dbGet)(`SELECT * FROM jobs WHERE id=?`, [jobId]);
        if (!row)
            return res.status(404).json({ error: 'Job not found.' });
        const ext = path_1.default.extname(req.file.originalname) || '.mp3';
        const bgmDir = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'downloader', 'bgm');
        if (!fs_1.default.existsSync(bgmDir))
            fs_1.default.mkdirSync(bgmDir, { recursive: true });
        const bgmPath = path_1.default.join(bgmDir, `${row.base_name}_bgm${ext}`);
        fs_1.default.renameSync(req.file.path, bgmPath);
        (0, db_1.setJobFields)(jobId, { bgm_path: bgmPath });
        res.json({ ok: true, bgm_path: bgmPath });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
}));
exports.default = router;
