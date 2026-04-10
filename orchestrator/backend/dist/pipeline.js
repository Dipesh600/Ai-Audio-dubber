"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.runPipeline = runPipeline;
exports.runPipelineFromTranscription = runPipelineFromTranscription;
exports.runAlignment = runAlignment;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const agentRunner_1 = require("./agentRunner");
const db_1 = require("./db");
const fileManager_1 = require("./fileManager");
const websocket_1 = require("./websocket");
function runPipeline(id, url, langs) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            (0, db_1.setJobFields)(id, { status: 'DOWNLOADING' });
            (0, websocket_1.emitJobUpdate)(id, { status: 'DOWNLOADING' });
            yield (0, agentRunner_1.runAgent)('downloader', [url, '--job-id', id]);
            const videoDir = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'downloader', 'videos');
            const audioDir = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'downloader', 'audio');
            const manifestDir = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'downloader', 'manifests');
            const manifestPath = path_1.default.join(manifestDir, `${id}_manifest.json`);
            let baseName = '';
            if (fs_1.default.existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
                    baseName = manifest.base_name || '';
                }
                catch (e) {
                    console.warn('[MANIFEST READ ERROR]', e);
                }
            }
            if (!baseName) {
                if (fs_1.default.existsSync(videoDir)) {
                    const vids = fs_1.default.readdirSync(videoDir)
                        .filter(f => f.endsWith('.mp4'))
                        .sort((a, b) => fs_1.default.statSync(path_1.default.join(videoDir, b)).mtime.getTime() -
                        fs_1.default.statSync(path_1.default.join(videoDir, a)).mtime.getTime());
                    if (vids.length)
                        baseName = path_1.default.basename(vids[0], '.mp4');
                }
            }
            if (!baseName)
                throw new Error('Downloader produced no video file.');
            const videoPath = path_1.default.join(videoDir, `${baseName}.mp4`);
            const audioPath = path_1.default.join(audioDir, `${baseName}.mp3`);
            (0, db_1.setJobFields)(id, {
                base_name: baseName,
                title: baseName,
                video_size_mb: (0, fileManager_1.fileMB)(videoPath),
                audio_size_mb: (0, fileManager_1.fileMB)(audioPath),
            });
            (0, db_1.setJobFields)(id, { status: 'TRANSCRIBING' });
            (0, websocket_1.emitJobUpdate)(id, { status: 'TRANSCRIBING', base_name: baseName, title: baseName, video_size_mb: (0, fileManager_1.fileMB)(videoPath), audio_size_mb: (0, fileManager_1.fileMB)(audioPath) });
            yield (0, agentRunner_1.runAgent)('transcriber', [audioPath, '--langs', langs.join(',')]);
            const scriptDir = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'transcriber', 'generated_voiceover_script');
            const langPreviews = {};
            for (const lang of langs) {
                const sp = path_1.default.join(scriptDir, `${baseName}_${lang}_script.json`);
                if (fs_1.default.existsSync(sp)) {
                    try {
                        const data = JSON.parse(fs_1.default.readFileSync(sp, 'utf-8'));
                        langPreviews[lang] = (data.segments || []).slice(0, 20).map((s) => ({
                            start: s.start, end: s.end, text: s.translated_text || s.text,
                            emotion: s.emotion || 'Neutral',
                        }));
                    }
                    catch (_a) { }
                }
            }
            const rawTPath = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'transcriber', 'original_voiceover_transcription', `${baseName}.json`);
            let engPrev = [];
            if (fs_1.default.existsSync(rawTPath)) {
                try {
                    const raw = JSON.parse(fs_1.default.readFileSync(rawTPath, 'utf-8'));
                    engPrev = (raw.segments || []).slice(0, 15).map((s) => ({ start: s.start, end: s.end, text: s.text }));
                }
                catch (_b) { }
            }
            (0, db_1.setJobFields)(id, {
                status: 'AWAITING_TTS',
                eng_preview: JSON.stringify(engPrev),
                nepali_preview: JSON.stringify(langPreviews['nepali'] || []),
                lang_previews: JSON.stringify(langPreviews),
            });
            (0, websocket_1.emitJobUpdate)(id, { status: 'AWAITING_TTS', eng_preview: engPrev, lang_previews: langPreviews });
        }
        catch (e) {
            console.error('[PIPELINE ERROR]', e.message);
            (0, db_1.setJobFields)(id, { status: 'ERROR', error: e.message });
            (0, websocket_1.emitJobUpdate)(id, { status: 'ERROR', error: e.message });
        }
    });
}
/** Pipeline entry for direct video uploads — skips downloader, starts from transcription */
function runPipelineFromTranscription(id, baseName, audioPath, langs) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            (0, db_1.setJobFields)(id, { status: 'TRANSCRIBING' });
            (0, websocket_1.emitJobUpdate)(id, { status: 'TRANSCRIBING', base_name: baseName });
            yield (0, agentRunner_1.runAgent)('transcriber', [audioPath, '--langs', langs.join(',')]);
            const scriptDir = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'transcriber', 'generated_voiceover_script');
            const langPreviews = {};
            for (const lang of langs) {
                const sp = path_1.default.join(scriptDir, `${baseName}_${lang}_script.json`);
                if (fs_1.default.existsSync(sp)) {
                    try {
                        const data = JSON.parse(fs_1.default.readFileSync(sp, 'utf-8'));
                        langPreviews[lang] = (data.segments || []).slice(0, 20).map((s) => ({
                            start: s.start, end: s.end, text: s.translated_text || s.text,
                            emotion: s.emotion || 'Neutral',
                        }));
                    }
                    catch (_a) { }
                }
            }
            const rawTPath = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'transcriber', 'original_voiceover_transcription', `${baseName}.json`);
            let engPrev = [];
            if (fs_1.default.existsSync(rawTPath)) {
                try {
                    const raw = JSON.parse(fs_1.default.readFileSync(rawTPath, 'utf-8'));
                    engPrev = (raw.segments || []).slice(0, 15).map((s) => ({ start: s.start, end: s.end, text: s.text }));
                }
                catch (_b) { }
            }
            (0, db_1.setJobFields)(id, {
                status: 'AWAITING_TTS',
                eng_preview: JSON.stringify(engPrev),
                nepali_preview: JSON.stringify(langPreviews['nepali'] || []),
                lang_previews: JSON.stringify(langPreviews),
            });
            (0, websocket_1.emitJobUpdate)(id, { status: 'AWAITING_TTS', eng_preview: engPrev, lang_previews: langPreviews });
        }
        catch (e) {
            console.error('[PIPELINE:UPLOAD ERROR]', e.message);
            (0, db_1.setJobFields)(id, { status: 'ERROR', error: e.message });
            (0, websocket_1.emitJobUpdate)(id, { status: 'ERROR', error: e.message });
        }
    });
}
function runAlignment(jobId, baseName, targetPath, lang) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            (0, db_1.setJobFields)(jobId, { status: 'ALIGNING' });
            (0, websocket_1.emitJobUpdate)(jobId, { status: 'ALIGNING' });
            yield (0, agentRunner_1.runAgent)('transcriber', [targetPath]);
            const row = yield (0, db_1.dbGet)(`SELECT bgm_path FROM jobs WHERE id=?`, [jobId]);
            const alignerArgs = [targetPath, '--base-name', baseName];
            if ((row === null || row === void 0 ? void 0 : row.bgm_path) && fs_1.default.existsSync(row.bgm_path)) {
                alignerArgs.push('--bgm-path', row.bgm_path);
            }
            yield (0, agentRunner_1.runAgent)('aligner', alignerArgs);
            const langStem = path_1.default.basename(targetPath, path_1.default.extname(targetPath));
            const dubbedDir = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'aligner', 'dubbed_video');
            const dubbedPath = path_1.default.join(dubbedDir, `${langStem}_Dubbed.mp4`);
            const outputPath = fs_1.default.existsSync(dubbedPath) ? dubbedPath : '';
            const outRow = yield (0, db_1.dbGet)(`SELECT output_paths, azure_urls FROM jobs WHERE id=?`, [jobId]);
            let outputPaths = {};
            let azureUrls = {};
            try {
                outputPaths = JSON.parse((outRow === null || outRow === void 0 ? void 0 : outRow.output_paths) || '{}');
            }
            catch (_a) { }
            try {
                azureUrls = JSON.parse((outRow === null || outRow === void 0 ? void 0 : outRow.azure_urls) || '{}');
            }
            catch (_b) { }
            if (outputPath)
                outputPaths[lang] = outputPath;
            // Upload dubbed video to Azure Blob Storage (non-blocking — pipeline continues even if Azure fails)
            if (outputPath) {
                try {
                    const { uploadToAzure } = yield Promise.resolve().then(() => __importStar(require('./services/azureStorage')));
                    const azureUrl = yield uploadToAzure(outputPath, `jobs/${jobId}/dubbed_${lang}.mp4`);
                    if (azureUrl) {
                        azureUrls[lang] = azureUrl;
                        console.log(`[PIPELINE] Azure upload complete for ${lang}: ${azureUrl}`);
                    }
                }
                catch (e) {
                    console.warn(`[PIPELINE] Azure upload skipped: ${e.message}`);
                }
            }
            (0, db_1.setJobFields)(jobId, {
                status: 'REVIEW',
                output_path: outputPath,
                output_paths: JSON.stringify(outputPaths),
                azure_urls: JSON.stringify(azureUrls),
            });
            (0, websocket_1.emitJobUpdate)(jobId, { status: 'REVIEW', output_path: outputPath, output_paths: outputPaths, azure_urls: azureUrls });
        }
        catch (e) {
            (0, db_1.setJobFields)(jobId, { status: 'ERROR', error: e.message });
            (0, websocket_1.emitJobUpdate)(jobId, { status: 'ERROR', error: e.message });
        }
    });
}
