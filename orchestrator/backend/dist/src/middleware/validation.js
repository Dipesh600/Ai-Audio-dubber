"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUrl = validateUrl;
exports.validateFileUpload = validateFileUpload;
// Multi-platform URL validation (YouTube, Instagram, Facebook, Twitter/X, LinkedIn, TikTok)
const SUPPORTED_PLATFORMS = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com|instagram\.com|instagr\.am|facebook\.com|fb\.watch|fb\.com|twitter\.com|x\.com|linkedin\.com|tiktok\.com|vm\.tiktok\.com)/i;
function validateUrl(req, res, next) {
    const { url } = req.body;
    if (!url || typeof url !== 'string' || !SUPPORTED_PLATFORMS.test(url.trim())) {
        return res.status(400).json({
            error: 'Invalid URL. Supported platforms: YouTube, Instagram, Facebook, Twitter/X, LinkedIn, TikTok.'
        });
    }
    next();
}
// Validate uploaded file exists
function validateFileUpload(fieldName) {
    return (req, res, next) => {
        if (!req.file) {
            return res.status(400).json({ error: `No ${fieldName} file uploaded.` });
        }
        // Size limit check (50MB)
        if (req.file.size > 50 * 1024 * 1024) {
            return res.status(400).json({ error: `${fieldName} file too large (max 50MB).` });
        }
        next();
    };
}
