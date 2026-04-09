import sqlite3 from 'sqlite3';
import path from 'path';
import { PROJECT_ROOT } from './agentRunner';

const DB_PATH = path.join(PROJECT_ROOT, 'jobs.sqlite');
export const db = new sqlite3.Database(DB_PATH);
console.log(`[DB] SQLite path: ${DB_PATH}`);

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
    'title', 'video_size_mb', 'audio_size_mb', 'nepali_preview', 'eng_preview',
    'output_path', 'output_paths', 'final_paths', 'lang_previews', 'languages', 'bgm_path'
  ];
  migrate.forEach(col => db.run(`ALTER TABLE jobs ADD COLUMN ${col} TEXT DEFAULT ''`, () => {}));
});

// ── Helpers ──
export function dbGet(sql: string, params: any[]): Promise<any> {
  return new Promise((resolve, reject) => db.get(sql, params, (e, r) => e ? reject(e) : resolve(r)));
}

export function dbAll(sql: string, params: any[]): Promise<any[]> {
  return new Promise((resolve, reject) => db.all(sql, params, (e, r) => e ? reject(e) : resolve(r as any[])));
}

export function setJobFields(id: string, fields: Record<string, any>) {
  const keys = Object.keys(fields);
  db.run(`UPDATE jobs SET ${keys.map(k => `${k}=?`).join(', ')} WHERE id=?`, [...keys.map(k => fields[k]), id]);
}

export function parseJobRow(row: any) {
  if (!row) return row;
  (['eng_preview', 'nepali_preview'] as const).forEach(k => {
    try { row[k] = JSON.parse(row[k] || '[]'); } catch { row[k] = []; }
  });
  (['lang_previews', 'output_paths', 'final_paths'] as const).forEach(k => {
    try { row[k] = JSON.parse(row[k] || '{}'); } catch { row[k] = {}; }
  });
  return row;
}
