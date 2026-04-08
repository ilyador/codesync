import type { DbRecord } from '../authz.js';
import { hasActiveWorkstreamJob, supabase } from '../supabase.js';
import {
  isQueueableTask,
  resolveFreshFlowSnapshotForTask,
  taskExecutionGeneration,
} from '../task-execution.js';

export async function activeWorkstreamJobId(workstreamId: string): Promise<{ jobId: string | null } | { error: string }> {
  try {
    return { jobId: await hasActiveWorkstreamJob(workstreamId) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to check active workstream jobs' };
  }
}

export async function createQueuedExecutionJob(params: {
  task: DbRecord;
  taskId: string;
  projectId: string;
  localPath: string;
}): Promise<{ jobId: string } | { error: string }> {
  if (!isQueueableTask(params.task)) {
    return { error: 'Task is not queueable for AI execution' };
  }

  let flowPlan: Awaited<ReturnType<typeof resolveFreshFlowSnapshotForTask>>;
  try {
    flowPlan = await resolveFreshFlowSnapshotForTask({
      projectId: params.projectId,
      task: params.task,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to resolve execution flow' };
  }

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      task_id: params.taskId,
      project_id: params.projectId,
      local_path: params.localPath,
      status: 'queued',
      current_phase: flowPlan.firstPhase,
      max_attempts: flowPlan.maxAttempts,
      flow_id: flowPlan.flowId,
      flow_snapshot: flowPlan.flowSnapshot,
      requested_generation: taskExecutionGeneration(params.task),
    })
    .select()
    .single();
  if (jobErr || !job) return { error: jobErr?.message || 'Failed to create job' };

  return { jobId: job.id };
}

export async function createQueuedRunJob(params: {
  task: DbRecord;
  taskId: string;
  projectId: string;
  localPath: string;
}): Promise<{ jobId: string } | { error: string }> {
  return createQueuedExecutionJob(params);
}
