import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { revertToCheckpoint } from '../checkpoint.js';
import {
  asRecord,
  isMissingRowError,
  requireAuthorizedLocalPath,
  requireJobAccess,
  routeParam,
  stringField,
} from '../authz.js';
import { supabase } from '../supabase.js';
import { loadTaskExecutionUnlockUpdate as loadExecutionReset } from '../task-execution.js';
import { errorMessage } from './execution-helpers.js';

export const jobRevertRouter = Router();

jobRevertRouter.post('/api/jobs/:id/revert', requireAuth, async (req, res) => {
  const jobId = routeParam(req.params.id);
  const access = await requireJobAccess(req, res, jobId);
  if (!access) return;
  const job = access.record;
  if (job.status !== 'review' && job.status !== 'failed' && job.status !== 'done') {
    return res.status(400).json({ error: 'Job must be in review, failed, or done status to revert' });
  }

  const localPath = requireAuthorizedLocalPath(res, access.member, stringField(job, 'local_path'), 'job local_path');
  if (!localPath) return;
  const taskId = stringField(job, 'task_id');
  if (!taskId) return res.status(404).json({ error: 'Task not found' });

  const { data: taskData, error: taskError } = await supabase
    .from('tasks')
    .select('status, completed_at, active_job_id, execution_generation, execution_settings_locked_at, execution_settings_locked_job_id')
    .eq('id', taskId)
    .single();
  if (taskError) return res.status(isMissingRowError(taskError) ? 404 : 400).json({ error: isMissingRowError(taskError) ? 'Task not found' : taskError.message });
  const task = asRecord(taskData);
  const taskRollback = {
    status: task ? stringField(task, 'status') || 'review' : 'review',
    completed_at: task?.completed_at ?? null,
    active_job_id: task?.active_job_id ?? null,
    execution_generation: task?.execution_generation ?? 1,
    execution_settings_locked_at: task?.execution_settings_locked_at ?? null,
    execution_settings_locked_job_id: task?.execution_settings_locked_job_id ?? null,
  };

  try {
    revertToCheckpoint(localPath, jobId);
  } catch (error) {
    return res.status(400).json({ error: errorMessage(error, 'Failed to revert checkpoint') });
  }

  let executionReset;
  try {
    executionReset = await loadExecutionReset(taskId);
  } catch (error) {
    return res.status(400).json({ error: errorMessage(error, 'Failed to load task execution reset state') });
  }
  const { error: taskUpdateErr } = await supabase
    .from('tasks')
    .update({ status: 'todo', completed_at: null, ...executionReset })
    .eq('id', taskId);
  if (taskUpdateErr) return res.status(400).json({ error: taskUpdateErr.message });
  const { error: jobUpdateErr } = await supabase.from('jobs').update({ checkpoint_status: 'reverted' }).eq('id', jobId);
  if (jobUpdateErr) {
    const { error: rollbackErr } = await supabase.from('tasks').update(taskRollback).eq('id', taskId);
    if (rollbackErr) console.error(`[revert] Failed to roll back task ${taskId}:`, rollbackErr.message);
    return res.status(400).json({ error: jobUpdateErr.message });
  }

  res.json({ ok: true });
});
