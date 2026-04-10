"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.dbGet = dbGet;
exports.dbAll = dbAll;
exports.setJobFields = setJobFields;
exports.parseJobRow = parseJobRow;
const sqlite3_1 = __importDefault(require("sqlite3"));
const path_1 = __importDefault(require("path"));
const agentRunner_1 = require("./agentRunner");
const DB_PATH = path_1.default.join(agentRunner_1.PROJECT_ROOT, 'jobs.sqlite');
exports.db = new sqlite3_1.default.Database(DB_PATH);
console.log(`[DB] SQLite path: ${DB_PATH}`);
// ── Schema ──
exports.db.serialize(() => {
    exports.db.run(`CREATE TABLE IF NOT EXISTS jobs (
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
    azure_urls     TEXT DEFAULT '{}',
    bgm_path       TEXT DEFAULT '',
    error          TEXT DEFAULT '',
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
    const migrate = [
        'title', 'video_size_mb', 'audio_size_mb', 'nepali_preview', 'eng_preview',
        'output_path', 'output_paths', 'final_paths', 'lang_previews', 'languages', 'bgm_path',
        'azure_urls'
    ];
    migrate.forEach(col => exports.db.run(`ALTER TABLE jobs ADD COLUMN ${col} TEXT DEFAULT ''`, () => { }));
});
// ── Helpers ──
function dbGet(sql, params) {
    return new Promise((resolve, reject) => exports.db.get(sql, params, (e, r) => e ? reject(e) : resolve(r)));
}
function dbAll(sql, params) {
    return new Promise((resolve, reject) => exports.db.all(sql, params, (e, r) => e ? reject(e) : resolve(r)));
}
function setJobFields(id, fields) {
    const keys = Object.keys(fields);
    exports.db.run(`UPDATE jobs SET ${keys.map(k => `${k}=?`).join(', ')} WHERE id=?`, [...keys.map(k => fields[k]), id]);
}
function parseJobRow(row) {
    if (!row)
        return row;
    ['eng_preview', 'nepali_preview'].forEach(k => {
        try {
            row[k] = JSON.parse(row[k] || '[]');
        }
        catch (_a) {
            row[k] = [];
        }
    });
    ['lang_previews', 'output_paths', 'final_paths', 'azure_urls'].forEach(k => {
        try {
            row[k] = JSON.parse(row[k] || '{}');
        }
        catch (_a) {
            row[k] = {};
        }
    });
    return row;
}
