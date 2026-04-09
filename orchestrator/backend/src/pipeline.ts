import fs from 'fs';
import path from 'path';
import { runAgent, PROJECT_ROOT } from './agentRunner';
import { dbGet, setJobFields } from './db';
import { fileMB } from './fileManager';
import { emitJobUpdate } from './websocket';

export async function runPipeline(id: string, url: string, langs: string[]) {
  try {
    setJobFields(id, { status: 'DOWNLOADING' });
    emitJobUpdate(id, { status: 'DOWNLOADING' });
    await runAgent('downloader', [url, '--job-id', id]);

    const videoDir = path.join(PROJECT_ROOT, 'output', 'downloader', 'videos');
    const audioDir = path.join(PROJECT_ROOT, 'output', 'downloader', 'audio');
    const manifestDir = path.join(PROJECT_ROOT, 'output', 'downloader', 'manifests');
    const manifestPath = path.join(manifestDir, `${id}_manifest.json`);
    let baseName = '';
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        baseName = manifest.base_name || '';
      } catch (e) {
        console.warn('[MANIFEST READ ERROR]', e);
      }
    }
    if (!baseName) {
      if (fs.existsSync(videoDir)) {
        const vids = fs.readdirSync(videoDir)
          .filter(f => f.endsWith('.mp4'))
          .sort((a, b) =>
            fs.statSync(path.join(videoDir, b)).mtime.getTime() -
            fs.statSync(path.join(videoDir, a)).mtime.getTime()
          );
        if (vids.length) baseName = path.basename(vids[0], '.mp4');
      }
    }
    if (!baseName) throw new Error('Downloader produced no video file.');

    const videoPath = path.join(videoDir, `${baseName}.mp4`);
    const audioPath = path.join(audioDir, `${baseName}.mp3`);
    setJobFields(id, {
      base_name: baseName,
      title: baseName,
      video_size_mb: fileMB(videoPath),
      audio_size_mb: fileMB(audioPath),
    });

    setJobFields(id, { status: 'TRANSCRIBING' });
    emitJobUpdate(id, { status: 'TRANSCRIBING', base_name: baseName, title: baseName, video_size_mb: fileMB(videoPath), audio_size_mb: fileMB(audioPath) });
    await runAgent('transcriber', [audioPath, '--langs', langs.join(',')]);

    const scriptDir = path.join(PROJECT_ROOT, 'output', 'transcriber', 'generated_voiceover_script');
    const langPreviews: Record<string, any[]> = {};
    for (const lang of langs) {
      const sp = path.join(scriptDir, `${baseName}_${lang}_script.json`);
      if (fs.existsSync(sp)) {
        try {
          const data = JSON.parse(fs.readFileSync(sp, 'utf-8'));
          langPreviews[lang] = (data.segments || []).slice(0, 20).map((s: any) => ({
            start: s.start, end: s.end, text: s.translated_text || s.text,
            emotion: s.emotion || 'Neutral',
          }));
        } catch {}
      }
    }

    const rawTPath = path.join(PROJECT_ROOT, 'output', 'transcriber', 'original_voiceover_transcription', `${baseName}.json`);
    let engPrev: any[] = [];
    if (fs.existsSync(rawTPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(rawTPath, 'utf-8'));
        engPrev = (raw.segments || []).slice(0, 15).map((s: any) => ({ start: s.start, end: s.end, text: s.text }));
      } catch {}
    }

    setJobFields(id, {
      status: 'AWAITING_TTS',
      eng_preview: JSON.stringify(engPrev),
      nepali_preview: JSON.stringify(langPreviews['nepali'] || []),
      lang_previews: JSON.stringify(langPreviews),
    });
    emitJobUpdate(id, { status: 'AWAITING_TTS', eng_preview: engPrev, lang_previews: langPreviews });
  } catch (e: any) {
    console.error('[PIPELINE ERROR]', e.message);
    setJobFields(id, { status: 'ERROR', error: e.message });
    emitJobUpdate(id, { status: 'ERROR', error: e.message });
  }
}

/** Pipeline entry for direct video uploads — skips downloader, starts from transcription */
export async function runPipelineFromTranscription(id: string, baseName: string, audioPath: string, langs: string[]) {
  try {
    setJobFields(id, { status: 'TRANSCRIBING' });
    emitJobUpdate(id, { status: 'TRANSCRIBING', base_name: baseName });
    await runAgent('transcriber', [audioPath, '--langs', langs.join(',')]);

    const scriptDir = path.join(PROJECT_ROOT, 'output', 'transcriber', 'generated_voiceover_script');
    const langPreviews: Record<string, any[]> = {};
    for (const lang of langs) {
      const sp = path.join(scriptDir, `${baseName}_${lang}_script.json`);
      if (fs.existsSync(sp)) {
        try {
          const data = JSON.parse(fs.readFileSync(sp, 'utf-8'));
          langPreviews[lang] = (data.segments || []).slice(0, 20).map((s: any) => ({
            start: s.start, end: s.end, text: s.translated_text || s.text,
            emotion: s.emotion || 'Neutral',
          }));
        } catch {}
      }
    }

    const rawTPath = path.join(PROJECT_ROOT, 'output', 'transcriber', 'original_voiceover_transcription', `${baseName}.json`);
    let engPrev: any[] = [];
    if (fs.existsSync(rawTPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(rawTPath, 'utf-8'));
        engPrev = (raw.segments || []).slice(0, 15).map((s: any) => ({ start: s.start, end: s.end, text: s.text }));
      } catch {}
    }

    setJobFields(id, {
      status: 'AWAITING_TTS',
      eng_preview: JSON.stringify(engPrev),
      nepali_preview: JSON.stringify(langPreviews['nepali'] || []),
      lang_previews: JSON.stringify(langPreviews),
    });
    emitJobUpdate(id, { status: 'AWAITING_TTS', eng_preview: engPrev, lang_previews: langPreviews });
  } catch (e: any) {
    console.error('[PIPELINE:UPLOAD ERROR]', e.message);
    setJobFields(id, { status: 'ERROR', error: e.message });
    emitJobUpdate(id, { status: 'ERROR', error: e.message });
  }
}

export async function runAlignment(jobId: string, baseName: string, targetPath: string, lang: string) {
  try {
    setJobFields(jobId, { status: 'ALIGNING' });
    emitJobUpdate(jobId, { status: 'ALIGNING' });

    await runAgent('transcriber', [targetPath]);

    const row = await dbGet(`SELECT bgm_path FROM jobs WHERE id=?`, [jobId]);
    const alignerArgs = [targetPath, '--base-name', baseName];
    if (row?.bgm_path && fs.existsSync(row.bgm_path)) {
      alignerArgs.push('--bgm-path', row.bgm_path);
    }
    await runAgent('aligner', alignerArgs);

    const langStem   = path.basename(targetPath, path.extname(targetPath));
    const dubbedDir  = path.join(PROJECT_ROOT, 'output', 'aligner', 'dubbed_video');
    const dubbedPath = path.join(dubbedDir, `${langStem}_Dubbed.mp4`);
    const outputPath = fs.existsSync(dubbedPath) ? dubbedPath : '';

    const outRow = await dbGet(`SELECT output_paths, azure_urls FROM jobs WHERE id=?`, [jobId]);
    let outputPaths: Record<string, string> = {};
    let azureUrls: Record<string, string> = {};
    try { outputPaths = JSON.parse(outRow?.output_paths || '{}'); } catch {}
    try { azureUrls = JSON.parse(outRow?.azure_urls || '{}'); } catch {}
    if (outputPath) outputPaths[lang] = outputPath;

    // Upload dubbed video to Azure Blob Storage (non-blocking — pipeline continues even if Azure fails)
    if (outputPath) {
      try {
        const { uploadToAzure } = await import('./services/azureStorage');
        const azureUrl = await uploadToAzure(outputPath, `jobs/${jobId}/dubbed_${lang}.mp4`);
        if (azureUrl) {
          azureUrls[lang] = azureUrl;
          console.log(`[PIPELINE] Azure upload complete for ${lang}: ${azureUrl}`);
        }
      } catch (e: any) {
        console.warn(`[PIPELINE] Azure upload skipped: ${e.message}`);
      }
    }

    setJobFields(jobId, {
      status: 'REVIEW',
      output_path: outputPath,
      output_paths: JSON.stringify(outputPaths),
      azure_urls: JSON.stringify(azureUrls),
    });
    emitJobUpdate(jobId, { status: 'REVIEW', output_path: outputPath, output_paths: outputPaths, azure_urls: azureUrls });
  } catch (e: any) {
    setJobFields(jobId, { status: 'ERROR', error: e.message });
    emitJobUpdate(jobId, { status: 'ERROR', error: e.message });
  }
}
