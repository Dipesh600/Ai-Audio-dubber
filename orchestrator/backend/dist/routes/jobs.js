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
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db");
const pipeline_1 = require("../pipeline");
const fileManager_1 = require("../fileManager");
const agentRunner_1 = require("../agentRunner");
const validation_1 = require("../middleware/validation");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const router = (0, express_1.Router)();
// ── Start Job ──
router.post('/start-job', validation_1.validateUrl, (req, res) => {
    const id = crypto_1.default.randomUUID();
    const url = req.body.url;
    const langs = Array.isArray(req.body.languages) ? req.body.languages : ['nepali'];
    db_1.db.run(`INSERT INTO jobs (id, url, status, languages) VALUES (?, ?, 'PENDING', ?)`, [id, url, langs.join(',')], err => {
        if (err)
            return res.status(500).json({ error: 'DB insert failed.' });
        res.json({ id, status: 'PENDING' });
        (0, pipeline_1.runPipeline)(id, url, langs);
    });
});
// ── Job Status ──
router.get('/job-status/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const jobId = req.params.id;
        const row = yield (0, db_1.dbGet)(`SELECT * FROM jobs WHERE id=?`, [jobId]);
        if (!row)
            return res.status(404).json({ error: 'Job not found.' });
        res.json((0, db_1.parseJobRow)(row));
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
}));
// ── Approve ──
router.post('/approve/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const jobId = req.params.id;
        const row = yield (0, db_1.dbGet)(`SELECT * FROM jobs WHERE id=?`, [jobId]);
        if (!row)
            return res.status(404).json({ error: 'Job not found.' });
        let outputPaths = {};
        let finalPaths = {};
        let azureUrls = {};
        try {
            outputPaths = JSON.parse(row.output_paths || '{}');
        }
        catch (_a) { }
        try {
            finalPaths = JSON.parse(row.final_paths || '{}');
        }
        catch (_b) { }
        try {
            azureUrls = JSON.parse(row.azure_urls || '{}');
        }
        catch (_c) { }
        const finalsDir = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'finals');
        if (!fs_1.default.existsSync(finalsDir))
            fs_1.default.mkdirSync(finalsDir, { recursive: true });
        for (const [lang, srcPath] of Object.entries(outputPaths)) {
            if (srcPath && fs_1.default.existsSync(srcPath)) {
                const destFile = `${row.base_name}_${lang}_Final.mp4`;
                const dest = path_1.default.join(finalsDir, destFile);
                fs_1.default.copyFileSync(srcPath, dest);
                finalPaths[lang] = dest;
                // Upload final to Azure
                try {
                    const { uploadToAzure } = yield Promise.resolve().then(() => __importStar(require('../services/azureStorage')));
                    const azureUrl = yield uploadToAzure(dest, `finals/${jobId}/${destFile}`);
                    if (azureUrl) {
                        azureUrls[`final_${lang}`] = azureUrl;
                        console.log(`[APPROVE] Azure upload: ${destFile} → ${azureUrl}`);
                    }
                }
                catch (e) {
                    console.warn(`[APPROVE] Azure upload skipped: ${e.message}`);
                }
            }
        }
        const allLangs = row.languages ? row.languages.split(',').map((l) => l.trim()) : [];
        const allFinalized = allLangs.every((l) => finalPaths[l]);
        const newStatus = allFinalized ? 'APPROVED' : 'REVIEW';
        (0, db_1.setJobFields)(jobId, {
            status: newStatus,
            final_paths: JSON.stringify(finalPaths),
            output_paths: JSON.stringify({}),
            output_path: finalPaths[allLangs[0]] || row.output_path,
            azure_urls: JSON.stringify(azureUrls),
        });
        if (allFinalized)
            (0, fileManager_1.deleteIntermediates)(row.base_name, row.id);
        const updated = (0, db_1.parseJobRow)(yield (0, db_1.dbGet)(`SELECT * FROM jobs WHERE id=?`, [jobId]));
        res.json(updated);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
}));
// ── Reject ──
router.post('/reject/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const jobId = req.params.id;
        const lang = req.query.lang || 'nepali';
        const row = yield (0, db_1.dbGet)(`SELECT * FROM jobs WHERE id=?`, [jobId]);
        if (!row)
            return res.status(404).json({ error: 'Job not found.' });
        let outputPaths = {};
        try {
            outputPaths = JSON.parse(row.output_paths || '{}');
        }
        catch (_a) { }
        if (outputPaths[lang]) {
            try {
                fs_1.default.unlinkSync(outputPaths[lang]);
            }
            catch (_b) { }
            delete outputPaths[lang];
        }
        const alignedDir = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'aligner', 'aligned_audio');
        if (fs_1.default.existsSync(alignedDir)) {
            for (const f of fs_1.default.readdirSync(alignedDir)) {
                if (f.includes(row.base_name) && f.toLowerCase().includes(lang)) {
                    try {
                        fs_1.default.unlinkSync(path_1.default.join(alignedDir, f));
                    }
                    catch (_c) { }
                }
            }
        }
        const dubbedDir = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'aligner', 'dubbed_video');
        if (fs_1.default.existsSync(dubbedDir)) {
            for (const f of fs_1.default.readdirSync(dubbedDir)) {
                if (f.includes(row.base_name) && f.toLowerCase().includes(lang)) {
                    try {
                        fs_1.default.unlinkSync(path_1.default.join(dubbedDir, f));
                    }
                    catch (_d) { }
                }
            }
        }
        const hasOtherOutputs = Object.keys(outputPaths).length > 0;
        let finalPaths = {};
        try {
            finalPaths = JSON.parse(row.final_paths || '{}');
        }
        catch (_e) { }
        const hasSaved = Object.keys(finalPaths).length > 0;
        const newStatus = hasOtherOutputs || hasSaved ? 'REVIEW' : 'AWAITING_TTS';
        (0, db_1.setJobFields)(jobId, { status: newStatus, output_paths: JSON.stringify(outputPaths) });
        const updated = (0, db_1.parseJobRow)(yield (0, db_1.dbGet)(`SELECT * FROM jobs WHERE id=?`, [jobId]));
        res.json(updated);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
}));
exports.default = router;
