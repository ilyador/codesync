import type { AutoContinueTask } from './auto-continue-types.js';
import { createQueuedExecutionJob } from './routes/run-queue.js';

export async function queueAiTask(params: {
  task: AutoContinueTask;
  projectId: string;
  localPath: string;
}): Promise<string | null> {
  const queued = await createQueuedExecutionJob(params);
  if ('error' in queued) {
    console.error(`[auto-continue] Failed to queue next task ${params.task.id}:`, queued.error);
    return null;
  }
  return queued.jobId;
}
