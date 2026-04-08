import { execFile } from 'child_process';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { promisify } from 'util';
import { tool } from 'ai';
import { z } from 'zod';
import { pathInside } from '../authz-path-utils.js';
import { search as ragSearch } from '../rag/service.js';

const execFileAsync = promisify(execFile);
const MAX_READ_LINES = 300;
const MAX_OUTPUT_CHARS = 12000;

function resolveScopedPath(cwd: string, filePath: string): string {
  const resolved = resolve(cwd, filePath);
  const root = resolve(cwd);
  if (!pathInside(root, resolved)) {
    throw new Error(`Path is outside the project root: ${filePath}`);
  }
  return resolved;
}

function limitOutput(value: string): string {
  return value.length > MAX_OUTPUT_CHARS ? `${value.slice(0, MAX_OUTPUT_CHARS)}\n...[truncated]` : value;
}

function numberedLines(text: string, offset = 0): string {
  return text
    .split('\n')
    .map((line, index) => `${offset + index + 1}: ${line}`)
    .join('\n');
}

async function runCli(command: string, args: string[], cwd: string): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return limitOutput([stdout, stderr].filter(Boolean).join(stderr && stdout ? '\n' : ''));
  } catch (error: unknown) {
    const failure = error && typeof error === 'object'
      ? error as { stdout?: unknown; stderr?: unknown; message?: unknown }
      : {};
    const stdout = typeof failure.stdout === 'string' ? failure.stdout : '';
    const stderr = typeof failure.stderr === 'string' ? failure.stderr : '';
    const message = typeof failure.message === 'string' ? failure.message : 'Command failed';
    const details = [stdout, stderr, message].filter(Boolean).join('\n');
    throw new Error(limitOutput(details));
  }
}

export function createAiSdkTools(opts: { cwd: string; projectId: string; enabledTools: string[] }) {
  const enabled = new Set(opts.enabledTools);
  const tools: Record<string, ReturnType<typeof tool>> = {};

  if (enabled.has('Read')) {
    tools.Read = tool({
      description: 'Read a file from disk. Returns numbered lines.',
      parameters: z.object({
        file_path: z.string(),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      }),
      execute: async ({ file_path, offset = 0, limit = MAX_READ_LINES }) => {
        const target = resolveScopedPath(opts.cwd, file_path);
        const file = await readFile(target, 'utf8');
        const lines = file.split('\n').slice(offset, offset + limit).join('\n');
        return numberedLines(lines, offset);
      },
    });
  }

  if (enabled.has('Write')) {
    tools.Write = tool({
      description: 'Write a file to disk, replacing its content if it already exists.',
      parameters: z.object({
        file_path: z.string(),
        content: z.string(),
      }),
      execute: async ({ file_path, content }) => {
        const target = resolveScopedPath(opts.cwd, file_path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, 'utf8');
        return `Wrote ${file_path} (${content.length} chars)`;
      },
    });
  }

  if (enabled.has('Edit')) {
    tools.Edit = tool({
      description: 'Edit an existing file by replacing an exact string match.',
      parameters: z.object({
        file_path: z.string(),
        old_string: z.string(),
        new_string: z.string(),
        replace_all: z.boolean().optional(),
      }),
      execute: async ({ file_path, old_string, new_string, replace_all = false }) => {
        if (!old_string) throw new Error('old_string must not be empty');
        const target = resolveScopedPath(opts.cwd, file_path);
        const file = await readFile(target, 'utf8');
        const matches = file.split(old_string).length - 1;
        if (matches === 0) throw new Error(`old_string was not found in ${file_path}`);
        if (matches > 1 && !replace_all) {
          throw new Error(`old_string matched ${matches} times in ${file_path}; set replace_all=true to replace every match`);
        }
        const next = replace_all ? file.split(old_string).join(new_string) : file.replace(old_string, new_string);
        await writeFile(target, next, 'utf8');
        return `Edited ${file_path} (${replace_all ? matches : 1} replacement${matches === 1 ? '' : 's'})`;
      },
    });
  }

  if (enabled.has('Bash')) {
    tools.Bash = tool({
      description: 'Run a shell command inside the project root.',
      parameters: z.object({
        command: z.string(),
      }),
      execute: async ({ command }) => runCli('bash', ['-lc', command], opts.cwd),
    });
  }

  if (enabled.has('Grep')) {
    tools.Grep = tool({
      description: 'Search files with ripgrep.',
      parameters: z.object({
        pattern: z.string(),
        path: z.string().optional(),
      }),
      execute: async ({ pattern, path = '.' }) => {
        const scoped = resolveScopedPath(opts.cwd, path);
        return runCli('rg', ['--line-number', '--no-heading', pattern, scoped], opts.cwd);
      },
    });
  }

  if (enabled.has('Glob')) {
    tools.Glob = tool({
      description: 'List project files with a glob pattern.',
      parameters: z.object({
        pattern: z.string(),
        path: z.string().optional(),
      }),
      execute: async ({ pattern, path = '.' }) => {
        const scoped = resolveScopedPath(opts.cwd, path);
        return runCli('rg', ['--files', scoped, '-g', pattern], opts.cwd);
      },
    });
  }

  if (opts.enabledTools.length > 0) {
    tools.RagSearch = tool({
      description: 'Search project documents for relevant information.',
      parameters: z.object({
        query: z.string(),
      }),
      execute: async ({ query }) => {
        const results = await ragSearch(opts.projectId, query);
        if (results.length === 0) return 'No relevant document chunks were found.';
        return results.map((result, index) => (
          `[${index + 1}] ${result.file_name} (${(result.similarity * 100).toFixed(1)}%):\n${result.content}`
        )).join('\n\n');
      },
    });
  }

  return tools;
}
