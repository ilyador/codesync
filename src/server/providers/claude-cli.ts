import { spawn } from 'child_process';
import { claudeEnv } from '../claude-env.js';
import { registerChildProcess, unregisterJobHandle, wasJobCanceled } from './process-control.js';
import type { ProviderDriver } from './types.js';

const JOB_TIMEOUT_MS = 30 * 60 * 1000;

interface ClaudeStreamBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface ClaudeStreamEvent {
  type?: string;
  duration_ms?: number;
  message?: {
    content?: ClaudeStreamBlock[];
  };
}

function formatClaudeStreamEvent(event: ClaudeStreamEvent): string | null {
  if (event.type === 'assistant' && event.message?.content) {
    const parts: string[] = [];
    for (const block of event.message.content) {
      if (block.type === 'text' && block.text) parts.push(block.text);
      if (block.type === 'tool_use') {
        const toolName = block.name || 'unknown';
        const input = block.input || {};
        if (toolName === 'Read' || toolName === 'Glob' || toolName === 'Grep') {
          const filePath = typeof input.file_path === 'string' ? input.file_path : '';
          const pattern = typeof input.pattern === 'string' ? input.pattern : '';
          const path = typeof input.path === 'string' ? input.path : '';
          parts.push(`[${toolName}] ${filePath || pattern || path}`);
        } else if (toolName === 'Edit' || toolName === 'Write') {
          const filePath = typeof input.file_path === 'string' ? input.file_path : '';
          parts.push(`[${toolName}] ${filePath}`);
        } else if (toolName === 'Bash') {
          const command = typeof input.command === 'string' ? input.command : '';
          parts.push(`[Bash] ${command.slice(0, 100)}`);
        } else {
          parts.push(`[${toolName}]`);
        }
      }
    }
    return parts.join('\n') || null;
  }

  if (event.type === 'result') {
    const duration = event.duration_ms ? ` (${(event.duration_ms / 1000).toFixed(1)}s)` : '';
    return `[done] Phase complete${duration}`;
  }

  if (event.type === 'tool_result' || event.type === 'tool_output') return null;
  return null;
}

function appendClaudeStreamLine(line: string, onLog: (text: string) => void, fullOutput: string): string {
  if (!line.trim()) return fullOutput;
  try {
    const event = JSON.parse(line) as ClaudeStreamEvent;
    const formatted = formatClaudeStreamEvent(event);
    if (!formatted) return fullOutput;
    onLog(`${formatted}\n`);
    return `${fullOutput}${formatted}\n`;
  } catch {
    onLog(`${line}\n`);
    return `${fullOutput}${line}\n`;
  }
}

export const claudeCliDriver: ProviderDriver = {
  run({ jobId, prompt, model, cwd, tools, effort, onLog }) {
    return new Promise((resolve, reject) => {
      const args = ['-p', '--verbose', '--output-format', 'stream-json'];
      if (tools.length > 0) {
        args.push('--allowedTools', tools.join(','));
        const writeTools = ['Edit', 'Write', 'NotebookEdit'];
        const blocked = writeTools.filter(tool => !tools.includes(tool));
        if (blocked.length > 0) args.push('--disallowedTools', blocked.join(','));
      }
      if (model) args.push('--model', model);
      if (effort) args.push('--effort', effort);

      const proc = spawn('claude', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: claudeEnv,
      });

      const handle = registerChildProcess(jobId, proc);
      let fullOutput = '';
      let lineBuffer = '';
      let timedOut = false;
      let killTimer: ReturnType<typeof setTimeout> | null = null;

      const timeout = setTimeout(() => {
        timedOut = true;
        onLog(`[runner] Claude timed out after ${JOB_TIMEOUT_MS / 60000}m\n`);
        try { proc.kill('SIGTERM'); } catch { /* already dead */ }
        killTimer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* already dead */ } }, 5000);
      }, JOB_TIMEOUT_MS);

      proc.stdin.on('error', () => {});
      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.stdout.on('data', (data: Buffer) => {
        lineBuffer += data.toString();
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          fullOutput = appendClaudeStreamLine(line, onLog, fullOutput);
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        if (!text.trim()) return;
        onLog(text);
      });

      proc.on('close', (code, signal) => {
        clearTimeout(timeout);
        if (killTimer) clearTimeout(killTimer);
        unregisterJobHandle(jobId, handle);
        if (wasJobCanceled(jobId)) {
          reject(new Error('Job canceled'));
          return;
        }
        if (timedOut) {
          reject(new Error('Claude timed out'));
          return;
        }
        if (lineBuffer.trim()) {
          fullOutput = appendClaudeStreamLine(lineBuffer.trim(), onLog, fullOutput);
        }
        if (code === 0 && signal === null) resolve(fullOutput.trim());
        else reject(new Error(`claude exited with code ${code}${signal ? ` (${signal})` : ''}`));
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        if (killTimer) clearTimeout(killTimer);
        unregisterJobHandle(jobId, handle);
        reject(error);
      });
    });
  },
};
