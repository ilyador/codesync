import { asRecord, type DbRecord } from '../authz.js';
import { supabase } from '../supabase.js';
import { createQueuedExecutionJob } from './run-queue.js';

export async function queueReworkJob(params: {
  task: DbRecord;
  taskId: string;
  projectId: string;
  localPath: string;
}): Promise<{ job: DbRecord } | { error: string; status: number }> {
  const queued = await createQueuedExecutionJob(params);
  if ('error' in queued) {
    return { status: 400, error: queued.error };
  }

  const { data: newJob, error: jobErr } = await supabase.from('jobs').select('*').eq('id', queued.jobId).single();

  const job = asRecord(newJob);
  if (jobErr || !job) return { status: 500, error: jobErr?.message || 'Failed to create rework job' };
  return { job };
}
