"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROJECT_ROOT = void 0;
exports.runAgent = runAgent;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
// PROJECT_ROOT must point to the monorepo root (where agents/ and core/ live)
// In Docker: /app (set via ENV), locally: 3 levels up from src/
const resolvedRoot = path_1.default.resolve(__dirname, '../../..');
exports.PROJECT_ROOT = process.env.PROJECT_ROOT || resolvedRoot;
function runAgent(agentName, args) {
    return new Promise((resolve, reject) => {
        const scriptPath = path_1.default.join(exports.PROJECT_ROOT, 'agents', agentName, 'main.py');
        console.log(`[AGENT:${agentName}] script=${scriptPath}`);
        console.log(`[AGENT:${agentName}] args=${args.join(' ')}`);
        console.log(`[AGENT:${agentName}] PROJECT_ROOT=${exports.PROJECT_ROOT}`);
        const proc = (0, child_process_1.spawn)('python3', [scriptPath, ...args], {
            cwd: exports.PROJECT_ROOT,
            env: Object.assign(Object.assign({}, process.env), { 
                // Ensure Python can import `core.logger`, `core.paths`
                PYTHONPATH: exports.PROJECT_ROOT }),
        });
        proc.stdout.on('data', d => process.stdout.write(`[${agentName}] ${d}`));
        proc.stderr.on('data', d => process.stderr.write(`[${agentName}:ERR] ${d}`));
        proc.on('error', err => reject(new Error(`Failed to start ${agentName}: ${err.message}`)));
        proc.on('close', code => code === 0 ? resolve() : reject(new Error(`${agentName} exited with code ${code}`)));
    });
}
