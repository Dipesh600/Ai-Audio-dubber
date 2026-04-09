import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// PROJECT_ROOT must point to the monorepo root (where agents/ and core/ live)
// In Docker: /app (set via ENV), locally: 3 levels up from src/
const resolvedRoot = path.resolve(__dirname, '../../..');
export const PROJECT_ROOT = process.env.PROJECT_ROOT || resolvedRoot;

export function runAgent(agentName: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(PROJECT_ROOT, 'agents', agentName, 'main.py');
    console.log(`[AGENT:${agentName}] script=${scriptPath}`);
    console.log(`[AGENT:${agentName}] args=${args.join(' ')}`);
    console.log(`[AGENT:${agentName}] PROJECT_ROOT=${PROJECT_ROOT}`);

    const proc = spawn('python3', [scriptPath, ...args], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        // Ensure Python can import `core.logger`, `core.paths`
        PYTHONPATH: PROJECT_ROOT,
      },
    });

    proc.stdout.on('data', d => process.stdout.write(`[${agentName}] ${d}`));
    proc.stderr.on('data', d => process.stderr.write(`[${agentName}:ERR] ${d}`));
    proc.on('error', err => reject(new Error(`Failed to start ${agentName}: ${err.message}`)));
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`${agentName} exited with code ${code}`)));
  });
}
