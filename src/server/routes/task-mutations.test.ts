import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';

vi.mock('../auth-middleware.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../authz.js', () => ({
  requireTaskAccess: vi.fn(async () => ({
    record: {
      id: 'task-1',
      project_id: 'project-1',
      execution_settings_locked_at: null,
    },
    projectId: 'project-1',
  })),
  routeParam: (value: string) => value,
}));

vi.mock('../supabase.js', () => ({
  hasActiveTaskJob: vi.fn(async () => ({ id: 'job-1', status: 'running' })),
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

vi.mock('../queued-job-sync.js', () => ({
  syncQueuedJobsForTask: vi.fn(async () => undefined),
}));

vi.mock('../task-execution.js', async () => {
  const actual = await vi.importActual<typeof import('../task-execution.js')>('../task-execution.js');
  return {
    ...actual,
    normalizeTaskExecutionSettings: vi.fn(async ({ updates }: { updates: Record<string, unknown> }) => ({
      updates,
      selection: null,
    })),
  };
});

vi.mock('./task-validation.js', () => ({
  validateTaskShape: vi.fn(() => null),
  validateTaskScalars: vi.fn(() => null),
  validateTaskReferences: vi.fn(async () => null),
}));

vi.mock('./task-auto-continue.js', () => ({
  maybeQueueTaskAutoContinue: vi.fn(async () => undefined),
}));

import { taskMutationsRouter } from './task-mutations.js';

describe('taskMutationsRouter execution setting guard', () => {
  let server: ReturnType<express.Application['listen']> | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close(error => error ? reject(error) : resolve());
      });
      server = null;
    }
  });

  it('rejects execution-setting edits once the task has actually started', async () => {
    const app = express();
    app.use(express.json());
    app.use(taskMutationsRouter);
    server = app.listen(0);
    const { port } = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/api/tasks/task-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_model: 'gpt-5.4' }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Cannot change task execution settings while job job-1 is running',
    });
  });
});
