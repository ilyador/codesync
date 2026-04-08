import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import type { DbRecord } from '../authz.js';
import { requireTaskAccess, routeParam } from '../authz.js';
import { hasActiveTaskJob, supabase } from '../supabase.js';
import { syncQueuedJobsForTask } from '../queued-job-sync.js';
import {
  hasTaskExecutionSettingChanges,
  normalizeTaskExecutionSettings,
  shouldUnlockTaskExecutionSettings,
  taskExecutionUnlockUpdate,
} from '../task-execution.js';
import { maybeQueueTaskAutoContinue } from './task-auto-continue.js';
import { validateTaskReferences, validateTaskScalars, validateTaskShape } from './task-validation.js';

const TASK_UPDATE_FIELDS = ['title', 'description', 'type', 'mode', 'effort', 'multiagent', 'status', 'assignee', 'workstream_id', 'position', 'images', 'followup_notes', 'auto_continue', 'priority', 'flow_id', 'provider_config_id', 'provider_model', 'chaining'];

export const taskMutationsRouter = Router();

taskMutationsRouter.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  const taskId = routeParam(req.params.id);
  const access = await requireTaskAccess(req, res, taskId, '*');
  if (!access) return;
  const updates: Record<string, unknown> = {};
  for (const key of TASK_UPDATE_FIELDS) {
    if (key in req.body) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No supported fields to update' });
  const shapeError = validateTaskShape(updates) || validateTaskScalars(updates);
  if (shapeError) return res.status(400).json({ error: shapeError });
  if (typeof updates.title === 'string') updates.title = updates.title.trim();
  const hasExecutionSettingChanges = hasTaskExecutionSettingChanges(updates);
  const shouldSyncQueuedJobs = hasExecutionSettingChanges;
  const referenceError = await validateTaskReferences(updates, access.projectId);
  if (referenceError) return res.status(400).json({ error: referenceError });
  if (typeof updates.status === 'string' || hasExecutionSettingChanges) {
    try {
      const active = await hasActiveTaskJob(taskId);
      if (typeof updates.status === 'string' && active) {
        return res.status(409).json({ error: `Cannot change task status while job ${active.id} is ${active.status}` });
      }
      if (hasExecutionSettingChanges && active && active.status !== 'queued') {
        return res.status(409).json({ error: `Cannot change task execution settings while job ${active.id} is ${active.status}` });
      }
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to check active jobs' });
    }
  }
  if (updates.status === 'done' && !updates.completed_at) {
    updates.completed_at = new Date().toISOString();
  } else if (typeof updates.status === 'string' && updates.status !== 'done') {
    updates.completed_at = null;
  }
  try {
    const execution = await normalizeTaskExecutionSettings({
      projectId: access.projectId,
      currentTask: access.record,
      updates,
    });
    Object.assign(updates, execution.updates);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid task execution settings' });
  }
  if (shouldUnlockTaskExecutionSettings(updates.status)) {
    Object.assign(updates, taskExecutionUnlockUpdate(access.record));
  }
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  if (shouldSyncQueuedJobs) {
    try {
      await syncQueuedJobsForTask({
        projectId: access.projectId,
        task: data as DbRecord,
      });
    } catch (syncError) {
      console.error(`[tasks] Failed to sync queued jobs for task ${taskId}:`, syncError);
    }
  }

  if (updates.status === 'done') await maybeQueueTaskAutoContinue(req, data);

  res.json(data);
});

taskMutationsRouter.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  const taskId = routeParam(req.params.id);
  const access = await requireTaskAccess(req, res, taskId, 'id, project_id');
  if (!access) return;
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});
