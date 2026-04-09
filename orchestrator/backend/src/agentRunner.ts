import { spawn } from 'child_process';
import path from 'path';

export const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '../../..');

export function runAgent(agentName: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(PROJECT_ROOT, 'agents', agentName, 'main.py');
    console.log(`[AGENT:${agentName}] ${args.join(' ')}`);
    const proc = spawn('python3', [scriptPath, ...args], { cwd: PROJECT_ROOT });
    proc.stdout.on('data', d => process.stdout.write(`[${agentName}] ${d}`));
    proc.stderr.on('data', d => process.stderr.write(`[${agentName}:ERR] ${d}`));
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`${agentName} exited with code ${code}`)));
  });
}
