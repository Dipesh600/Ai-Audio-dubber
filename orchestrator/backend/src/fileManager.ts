import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT } from './agentRunner';

export function fileMB(p: string): number {
  try { return Math.round(fs.statSync(p).size / 1024 / 1024 * 100) / 100; } catch { return 0; }
}

export function globDelete(dir: string, stem: string) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(stem)) try { fs.rmSync(path.join(dir, f), { recursive: true }); } catch {}
  }
}

export function deleteIntermediates(baseName: string, jobId?: string) {
  const r = PROJECT_ROOT;
  globDelete(path.join(r, 'output', 'downloader', 'videos'), baseName);
  globDelete(path.join(r, 'output', 'downloader', 'audio'), baseName);
  globDelete(path.join(r, 'output', 'downloader', 'bgm'), baseName);
  globDelete(path.join(r, 'output', 'downloader', 'manifests'), jobId || baseName);
  globDelete(path.join(r, 'output', 'transcriber', 'original_voiceover_transcription'), baseName);
  globDelete(path.join(r, 'output', 'transcriber', 'generated_voiceover_script'), baseName);
  globDelete(path.join(r, 'output', 'transcriber', 'generated_voiceover_transcription'), baseName);
  globDelete(path.join(r, 'output', 'aligner', 'aligned_audio'), baseName);
  globDelete(path.join(r, 'output', 'aligner', 'dubbed_video'), baseName);
  globDelete(path.join(r, 'input', 'audio'), baseName);
}

export function resolveMediaPath(type: string, row: any, lang?: string): string {
  const base = row.base_name;
  const r = PROJECT_ROOT;

  if (type === 'video') return path.join(r, 'output', 'downloader', 'videos', `${base}.mp4`);
  if (type === 'audio') return path.join(r, 'output', 'downloader', 'audio', `${base}.mp3`);
  if (type === 'final') return row.output_path || '';

  if (type === 'dubbed') {
    let outputPaths: Record<string, string> = {};
    let finalPaths: Record<string, string> = {};
    try { outputPaths = JSON.parse(row.output_paths || '{}'); } catch {}
    try { finalPaths  = JSON.parse(row.final_paths  || '{}'); } catch {}

    if (lang && outputPaths[lang] && fs.existsSync(outputPaths[lang])) return outputPaths[lang];
    if (lang && finalPaths[lang]  && fs.existsSync(finalPaths[lang]))  return finalPaths[lang];

    const stagingVals = Object.values(outputPaths).filter(p => fs.existsSync(p));
    if (stagingVals.length) return stagingVals[0];

    const finalVals = Object.values(finalPaths).filter(p => fs.existsSync(p));
    if (finalVals.length) return finalVals[0];

    const dubbedDir = path.join(r, 'output', 'aligner', 'dubbed_video');
    if (fs.existsSync(dubbedDir)) {
      const files = fs.readdirSync(dubbedDir)
        .filter(f => f.startsWith(base + '_') && f.endsWith('.mp4'))
        .sort((a, b) => a.localeCompare(b));
      if (files.length) return path.join(dubbedDir, files[0]);
    }
    return row.output_path || '';
  }
  return '';
}
