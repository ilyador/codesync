import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  taskRow: {
    id: 'task-1',
    active_job_id: null as string | null,
    execution_generation: 1,
    mode: 'ai',
    status: 'todo',
    assignee: null as string | null,
    execution_settings_locked_at: null as string | null,
    execution_settings_locked_job_id: null as string | null,
  },
}));

vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table !== 'tasks') throw new Error(`Unexpected table: ${table}`);

      const selectChain = {
        select: vi.fn(() => selectChain),
        eq: vi.fn(() => selectChain),
        single: vi.fn(async () => ({ data: state.taskRow, error: null })),
      };

      return {
        ...selectChain,
        update: vi.fn((payload: Record<string, unknown>) => {
          const filters: Record<string, unknown> = {};
          const updateChain = {
            eq: vi.fn((column: string, value: unknown) => {
              filters[column] = value;
              return updateChain;
            }),
            is: vi.fn((column: string, value: unknown) => {
              filters[column] = value;
              return updateChain;
            }),
            in: vi.fn((column: string, values: unknown[]) => {
              filters[column] = values;
              return updateChain;
            }),
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                state.taskRow = { ...state.taskRow, ...payload };
                return { data: state.taskRow, error: null };
              }),
              maybeSingle: vi.fn(async () => {
                if (filters.id !== state.taskRow.id) return { data: null, error: null };
                if (filters.mode != null && filters.mode !== state.taskRow.mode) {
                  return { data: null, error: null };
                }
                if (filters.execution_generation != null && filters.execution_generation !== state.taskRow.execution_generation) {
                  return { data: null, error: null };
                }
                if (Array.isArray(filters.status) && !filters.status.includes(state.taskRow.status)) {
                  return { data: null, error: null };
                }
                if ('assignee' in filters && state.taskRow.assignee !== filters.assignee) {
                  return { data: null, error: null };
                }
                if ('active_job_id' in filters && state.taskRow.active_job_id !== filters.active_job_id) {
                  return { data: null, error: null };
                }
                state.taskRow = { ...state.taskRow, ...payload };
                return { data: state.taskRow, error: null };
              }),
            })),
          };
          return updateChain;
        }),
      };
    }),
  },
}));

import {
  ensureTaskExecutionJobOwnership,
  lockTaskExecutionSettings,
} from './task-execution.js';

describe('task execution lock ownership', () => {
  beforeEach(() => {
    state.taskRow = {
      id: 'task-1',
      active_job_id: null,
      execution_generation: 1,
      mode: 'ai',
      status: 'todo',
      assignee: null,
      execution_settings_locked_at: null,
      execution_settings_locked_job_id: null,
    };
  });

  it('locks a task to the starting job and preserves the original lock timestamp on resume', async () => {
    const locked = await lockTaskExecutionSettings('task-1', 'job-1', 1);
    const lockedAt = locked.execution_settings_locked_at;

    expect(locked.execution_settings_locked_job_id).toBe('job-1');
    expect(locked.status).toBe('in_progress');
    expect(typeof lockedAt).toBe('string');

    const resumed = await lockTaskExecutionSettings('task-1', 'job-1', 1);
    expect(resumed.execution_settings_locked_job_id).toBe('job-1');
    expect(resumed.execution_settings_locked_at).toBe(lockedAt);
  });

  it('adopts legacy lock rows for the same job when ownership was not recorded yet', async () => {
    state.taskRow = {
      id: 'task-1',
      active_job_id: null,
      execution_generation: 1,
      mode: 'ai',
      status: 'paused',
      assignee: null,
      execution_settings_locked_at: '2026-04-08T10:00:00.000Z',
      execution_settings_locked_job_id: null,
    };

    const adopted = await ensureTaskExecutionJobOwnership('task-1', 'job-1');
    expect(adopted.execution_settings_locked_job_id).toBe('job-1');
  });

  it('rejects continuing a job after the task was reset', async () => {
    await expect(ensureTaskExecutionJobOwnership('task-1', 'job-1')).rejects.toThrow(
      'This task was reset after the job started. Start a new run instead of continuing the old job.',
    );
  });

  it('does not lock tasks that are no longer queueable', async () => {
    state.taskRow = {
      ...state.taskRow,
      status: 'review',
    };

    const locked = await lockTaskExecutionSettings('task-1', 'job-1', 1);

    expect(locked).toBeNull();
    expect(state.taskRow.active_job_id).toBeNull();
    expect(state.taskRow.status).toBe('review');
  });
});
