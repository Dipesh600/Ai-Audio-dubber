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
const fs_1 = __importDefault(require("fs"));
const db_1 = require("../db");
const fileManager_1 = require("../fileManager");
const router = (0, express_1.Router)();
// ── Serve media files ──
// Priority: local file → Azure Blob URL redirect
router.get('/media', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { type, id, lang } = req.query;
        if (!type || !id)
            return res.status(400).json({ error: 'type and id required.' });
        const row = yield (0, db_1.dbGet)(`SELECT * FROM jobs WHERE id=?`, [id]);
        if (!row)
            return res.status(404).json({ error: 'Job not found.' });
        // Try local file first
        const filePath = (0, fileManager_1.resolveMediaPath)(type, row, lang);
        if (filePath && fs_1.default.existsSync(filePath))
            return res.sendFile(filePath);
        // Fall back to Azure URLs
        let azureUrls = {};
        try {
            azureUrls = typeof row.azure_urls === 'string' ? JSON.parse(row.azure_urls || '{}') : (row.azure_urls || {});
        }
        catch (_a) { }
        let azureKey = '';
        if (type === 'dubbed' && lang)
            azureKey = lang;
        else if (type === 'dubbed')
            azureKey = Object.keys(azureUrls).find(k => !k.startsWith('final_')) || '';
        else if (type === 'final' && lang)
            azureKey = `final_${lang}`;
        else if (type === 'final')
            azureKey = Object.keys(azureUrls).find(k => k.startsWith('final_')) || '';
        if (azureKey && azureUrls[azureKey]) {
            return res.redirect(azureUrls[azureKey]);
        }
        return res.status(404).json({ error: 'File not found (local or Azure).' });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
}));
// ── Serve final output ──
router.get('/final', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id, lang } = req.query;
        if (!id)
            return res.status(400).json({ error: 'id required.' });
        const row = yield (0, db_1.dbGet)(`SELECT * FROM jobs WHERE id=?`, [id]);
        if (!row)
            return res.status(404).end();
        // Try local file
        if (row.output_path && fs_1.default.existsSync(row.output_path))
            return res.sendFile(row.output_path);
        // Try final_paths
        let finalPaths = {};
        try {
            finalPaths = typeof row.final_paths === 'string' ? JSON.parse(row.final_paths || '{}') : (row.final_paths || {});
        }
        catch (_a) { }
        if (lang && finalPaths[lang] && fs_1.default.existsSync(finalPaths[lang]))
            return res.sendFile(finalPaths[lang]);
        const anyFinal = Object.values(finalPaths).find(p => fs_1.default.existsSync(p));
        if (anyFinal)
            return res.sendFile(anyFinal);
        // Fall back to Azure
        let azureUrls = {};
        try {
            azureUrls = typeof row.azure_urls === 'string' ? JSON.parse(row.azure_urls || '{}') : (row.azure_urls || {});
        }
        catch (_b) { }
        const azureKey = lang ? `final_${lang}` : Object.keys(azureUrls).find(k => k.startsWith('final_'));
        if (azureKey && azureUrls[azureKey])
            return res.redirect(azureUrls[azureKey]);
        return res.status(404).end();
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
}));
exports.default = router;
