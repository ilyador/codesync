import type { ChildProcess } from 'child_process';

interface JobHandle {
  id: symbol;
  cancel: () => Promise<void> | void;
}

const activeHandles = new Map<string, Set<JobHandle>>();
const canceledJobs = new Set<string>();

function registerHandle(jobId: string, handle: JobHandle): JobHandle {
  const handles = activeHandles.get(jobId) ?? new Set<JobHandle>();
  handles.add(handle);
  activeHandles.set(jobId, handles);
  return handle;
}

export function registerChildProcess(jobId: string, proc: ChildProcess): JobHandle {
  return registerHandle(jobId, {
    id: Symbol('child-process'),
    cancel: () => terminateProcess(proc),
  });
}

export function registerAbortController(jobId: string, controller: AbortController): JobHandle {
  return registerHandle(jobId, {
    id: Symbol('abort-controller'),
    cancel: () => controller.abort(),
  });
}

export function unregisterJobHandle(jobId: string, handle: JobHandle): void {
  const handles = activeHandles.get(jobId);
  if (!handles) return;
  handles.forEach(candidate => {
    if (candidate.id === handle.id) handles.delete(candidate);
  });
  if (handles.size === 0) activeHandles.delete(jobId);
}

function terminateProcess(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    let closed = false;
    let escalate: ReturnType<typeof setTimeout> | null = null;
    let fallback: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (closed) return;
      closed = true;
      if (escalate) clearTimeout(escalate);
      if (fallback) clearTimeout(fallback);
      resolve();
    };

    proc.once('close', finish);
    try {
      proc.kill('SIGTERM');
    } catch {
      finish();
      return;
    }

    escalate = setTimeout(() => {
      if (!closed) {
        try { proc.kill('SIGKILL'); } catch { /* already dead */ }
      }
    }, 5000);
    fallback = setTimeout(finish, 6000);
  });
}

export function hasActiveJobHandles(jobId: string): boolean {
  return (activeHandles.get(jobId)?.size || 0) > 0;
}

export function wasJobCanceled(jobId: string): boolean {
  return canceledJobs.has(jobId);
}

export async function cancelJobHandles(jobId: string): Promise<void> {
  const handles = activeHandles.get(jobId);
  if (!handles || handles.size === 0) return;
  canceledJobs.add(jobId);
  try {
    const results = await Promise.allSettled([...handles].map(handle => Promise.resolve(handle.cancel())));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length > 0) {
      throw new AggregateError(failures.map(failure => failure.reason), `Failed to cancel ${failures.length} job handle(s)`);
    }
  } finally {
    activeHandles.delete(jobId);
    canceledJobs.delete(jobId);
  }
}

export function cancelAllJobHandles(): void {
  for (const [jobId, handles] of activeHandles) {
    activeHandles.delete(jobId);
    for (const handle of handles) {
      Promise.resolve(handle.cancel()).catch(() => {});
    }
  }
}
