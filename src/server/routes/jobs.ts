import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { asRecord, isMissingRowError, requireJobAccess, requireProjectMember, routeParam, stringField } from '../authz.js';
import { supabase } from '../supabase.js';
import { loadTaskExecutionUnlockUpdate } from '../task-execution.js';
import { errorMessage } from './execution-helpers.js';

export const jobsRouter = Router();

jobsRouter.get('/api/jobs', requireAuth, async (req, res) => {
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id required' });
  const member = await requireProjectMember(req, res, projectId);
  if (!member) return;

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('project_id', projectId)
    .order('started_at', { ascending: false })
    .limit(20);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

jobsRouter.delete('/api/jobs/:id', requireAuth, async (req, res) => {
  const jobId = routeParam(req.params.id);
  const access = await requireJobAccess(req, res, jobId, 'id, project_id, task_id, status');
  if (!access) return;
  const job = access.record;

  const taskId = stringField(job, 'task_id');
  if (job.status === 'failed' && taskId) {
    const { data: taskData, error: taskError } = await supabase
      .from('tasks')
      .select('status, completed_at, active_job_id, execution_generation, execution_settings_locked_at, execution_settings_locked_job_id')
      .eq('id', taskId)
      .single();
    if (taskError) return res.status(isMissingRowError(taskError) ? 404 : 400).json({ error: isMissingRowError(taskError) ? 'Task not found' : taskError.message });
    const task = asRecord(taskData);
    const taskRollback = {
      status: task ? stringField(task, 'status') || 'failed' : 'failed',
      completed_at: task?.completed_at ?? null,
      active_job_id: task?.active_job_id ?? null,
      execution_generation: task?.execution_generation ?? 1,
      execution_settings_locked_at: task?.execution_settings_locked_at ?? null,
      execution_settings_locked_job_id: task?.execution_settings_locked_job_id ?? null,
    };
    let executionReset;
    try {
      executionReset = await loadTaskExecutionUnlockUpdate(taskId);
    } catch (error) {
      return res.status(400).json({ error: errorMessage(error, 'Failed to load task execution reset state') });
    }
    const { error: taskUpdateError } = await supabase
      .from('tasks')
      .update({ status: 'backlog', completed_at: null, ...executionReset })
      .eq('id', taskId);
    if (taskUpdateError) return res.status(400).json({ error: taskUpdateError.message });

    const { error } = await supabase.from('jobs').delete().eq('id', jobId);
    if (error) {
      const { error: rollbackError } = await supabase.from('tasks').update(taskRollback).eq('id', taskId);
      if (rollbackError) console.error(`[jobs] Failed to roll back task ${taskId}:`, rollbackError.message);
      return res.status(400).json({ error: error.message });
    }

    return res.json({ ok: true });
  }

  const { error } = await supabase.from('jobs').delete().eq('id', jobId);
  if (error) return res.status(400).json({ error: error.message });

  res.json({ ok: true });
});
