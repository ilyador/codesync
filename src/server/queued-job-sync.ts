import { stringField, type DbRecord } from './authz.js';
import { supabase } from './supabase.js';
import {
  isQueueableTask,
  resolveFreshFlowSnapshotForTask,
  taskExecutionGeneration,
} from './task-execution.js';

export async function syncQueuedJobsForTask(params: {
  projectId: string;
  task: DbRecord;
}): Promise<void> {
  const taskId = stringField(params.task, 'id');
  if (!taskId) return;

  const { data: queuedJobs, error } = await supabase
    .from('jobs')
    .select('id')
    .eq('task_id', taskId)
    .eq('status', 'queued');
  if (error) throw new Error(`Failed to load queued jobs: ${error.message}`);
  if (!queuedJobs || queuedJobs.length === 0) return;

  if (!isQueueableTask(params.task)) {
    const { error: deleteError } = await supabase
      .from('jobs')
      .delete()
      .eq('task_id', taskId)
      .eq('status', 'queued');
    if (deleteError) throw new Error(`Failed to discard queued jobs: ${deleteError.message}`);
    return;
  }

  const freshPlan = await resolveFreshFlowSnapshotForTask({
    projectId: params.projectId,
    task: params.task,
  });

  await Promise.all(queuedJobs.map(async (job) => {
    const jobId = stringField(job, 'id');
    if (!jobId) return;
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        flow_id: freshPlan.flowId,
        current_phase: freshPlan.firstPhase,
        max_attempts: freshPlan.maxAttempts,
        flow_snapshot: freshPlan.flowSnapshot,
        requested_generation: taskExecutionGeneration(params.task),
      })
      .eq('id', jobId);
    if (updateError) {
      throw new Error(`Failed to refresh queued job ${jobId}: ${updateError.message}`);
    }
  }));
}
