import { readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';
import { claudeEnv } from '../claude-env.js';
import { registerChildProcess, unregisterJobHandle, wasJobCanceled } from './process-control.js';
import type { ProviderDriver } from './types.js';

function stringifyCodexEvent(event: unknown): string | null {
  if (!event || typeof event !== 'object') return null;
  const record = event as Record<string, unknown>;
  const msg = typeof record.msg === 'string' ? record.msg
    : typeof record.message === 'string' ? record.message
    : typeof record.text === 'string' ? record.text
    : null;
  if (msg) return msg;

  const kind = typeof record.type === 'string' ? record.type : '';
  if (kind && typeof record.command === 'string') return `[${kind}] ${record.command}`;
  return null;
}

export const codexCliDriver: ProviderDriver = {
  run({ jobId, prompt, model, cwd, effort, onLog }) {
    return new Promise((resolve, reject) => {
      const outputPath = join(tmpdir(), `workstream-codex-${jobId}-${Date.now()}.txt`);
      const args = [
        'exec',
        '--json',
        '--cd', cwd,
        '--sandbox', 'danger-full-access',
        '--ask-for-approval', 'never',
        '--output-last-message', outputPath,
      ];
      if (model) args.push('--model', model);
      if (effort) args.push('-c', `model_reasoning_effort="${effort}"`);
      args.push('-');

      const proc = spawn('codex', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: claudeEnv,
      });

      const handle = registerChildProcess(jobId, proc);
      let stdoutBuffer = '';

      proc.stdin.on('error', () => {});
      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.stdout.on('data', (data: Buffer) => {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            const formatted = stringifyCodexEvent(event);
            if (formatted) onLog(`${formatted}\n`);
          } catch {
            onLog(`${line}\n`);
          }
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        if (text.trim()) onLog(text);
      });

      proc.on('close', (code) => {
        unregisterJobHandle(jobId, handle);
        if (wasJobCanceled(jobId)) {
          reject(new Error('Job canceled'));
          return;
        }

        let output = '';
        try {
          output = readFileSync(outputPath, 'utf8').trim();
        } catch {
          output = '';
        }
        try { unlinkSync(outputPath); } catch { /* ignore */ }

        if (code === 0 || code === null) {
          resolve(output);
          return;
        }
        reject(new Error(`codex exited with code ${code}`));
      });

      proc.on('error', (error) => {
        unregisterJobHandle(jobId, handle);
        reject(error);
      });
    });
  },
};
