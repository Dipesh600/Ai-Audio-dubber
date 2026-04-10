"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileMB = fileMB;
exports.globDelete = globDelete;
exports.deleteIntermediates = deleteIntermediates;
exports.resolveMediaPath = resolveMediaPath;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const agentRunner_1 = require("./agentRunner");
function fileMB(p) {
    try {
        return Math.round(fs_1.default.statSync(p).size / 1024 / 1024 * 100) / 100;
    }
    catch (_a) {
        return 0;
    }
}
function globDelete(dir, stem) {
    if (!fs_1.default.existsSync(dir))
        return;
    for (const f of fs_1.default.readdirSync(dir)) {
        if (f.startsWith(stem))
            try {
                fs_1.default.rmSync(path_1.default.join(dir, f), { recursive: true });
            }
            catch (_a) { }
    }
}
function deleteIntermediates(baseName, jobId) {
    const r = agentRunner_1.PROJECT_ROOT;
    globDelete(path_1.default.join(r, 'output', 'downloader', 'videos'), baseName);
    globDelete(path_1.default.join(r, 'output', 'downloader', 'audio'), baseName);
    globDelete(path_1.default.join(r, 'output', 'downloader', 'bgm'), baseName);
    globDelete(path_1.default.join(r, 'output', 'downloader', 'manifests'), jobId || baseName);
    globDelete(path_1.default.join(r, 'output', 'transcriber', 'original_voiceover_transcription'), baseName);
    globDelete(path_1.default.join(r, 'output', 'transcriber', 'generated_voiceover_script'), baseName);
    globDelete(path_1.default.join(r, 'output', 'transcriber', 'generated_voiceover_transcription'), baseName);
    globDelete(path_1.default.join(r, 'output', 'aligner', 'aligned_audio'), baseName);
    globDelete(path_1.default.join(r, 'output', 'aligner', 'dubbed_video'), baseName);
    globDelete(path_1.default.join(r, 'input', 'audio'), baseName);
}
function resolveMediaPath(type, row, lang) {
    const base = row.base_name;
    const r = agentRunner_1.PROJECT_ROOT;
    if (type === 'video')
        return path_1.default.join(r, 'output', 'downloader', 'videos', `${base}.mp4`);
    if (type === 'audio')
        return path_1.default.join(r, 'output', 'downloader', 'audio', `${base}.mp3`);
    if (type === 'final')
        return row.output_path || '';
    if (type === 'dubbed') {
        let outputPaths = {};
        let finalPaths = {};
        try {
            outputPaths = JSON.parse(row.output_paths || '{}');
        }
        catch (_a) { }
        try {
            finalPaths = JSON.parse(row.final_paths || '{}');
        }
        catch (_b) { }
        if (lang && outputPaths[lang] && fs_1.default.existsSync(outputPaths[lang]))
            return outputPaths[lang];
        if (lang && finalPaths[lang] && fs_1.default.existsSync(finalPaths[lang]))
            return finalPaths[lang];
        const stagingVals = Object.values(outputPaths).filter(p => fs_1.default.existsSync(p));
        if (stagingVals.length)
            return stagingVals[0];
        const finalVals = Object.values(finalPaths).filter(p => fs_1.default.existsSync(p));
        if (finalVals.length)
            return finalVals[0];
        const dubbedDir = path_1.default.join(r, 'output', 'aligner', 'dubbed_video');
        if (fs_1.default.existsSync(dubbedDir)) {
            const files = fs_1.default.readdirSync(dubbedDir)
                .filter(f => f.startsWith(base + '_') && f.endsWith('.mp4'))
                .sort((a, b) => a.localeCompare(b));
            if (files.length)
                return path_1.default.join(dubbedDir, files[0]);
        }
        return row.output_path || '';
    }
    return '';
}
