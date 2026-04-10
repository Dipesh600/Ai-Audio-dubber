"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const agentRunner_1 = require("../agentRunner");
const fileManager_1 = require("../fileManager");
const router = (0, express_1.Router)();
router.get('/library', (_req, res) => {
    try {
        const finalsDir = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'finals');
        if (!fs_1.default.existsSync(finalsDir))
            return res.json([]);
        const files = fs_1.default.readdirSync(finalsDir)
            .filter(f => f.endsWith('.mp4'))
            .sort((a, b) => fs_1.default.statSync(path_1.default.join(finalsDir, b)).mtime.getTime() -
            fs_1.default.statSync(path_1.default.join(finalsDir, a)).mtime.getTime());
        const items = files.map(f => ({
            id: f.replace('.mp4', ''),
            title: f.replace('.mp4', '').replace(/_/g, ' '),
            base_name: f.replace('.mp4', ''),
            created_at: fs_1.default.statSync(path_1.default.join(finalsDir, f)).mtime.toISOString(),
            video_url: `/api/library/${encodeURIComponent(f)}`,
            video_urls: { [f.replace('.mp4', '')]: `/api/library/${encodeURIComponent(f)}` },
            size_mb: (0, fileManager_1.fileMB)(path_1.default.join(finalsDir, f)),
        }));
        res.json(items);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.get('/library/:filename', (req, res) => {
    const fp = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'output', 'finals', decodeURIComponent(req.params.filename));
    if (!fs_1.default.existsSync(fp))
        return res.status(404).end();
    res.sendFile(fp);
});
exports.default = router;
