import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { isMissingRowError, requireJobAccess, routeParam, stringField } from '../authz.js';
import { transitionJobAndTask } from '../job-task-transition.js';
import { supabase } from '../supabase.js';
import { ensureTaskExecutionJobOwnership } from '../task-execution.js';

export const jobContinueRouter = Router();

jobContinueRouter.post('/api/jobs/:id/continue', requireAuth, async (req, res) => {
  const jobId = routeParam(req.params.id);
  const access = await requireJobAccess(req, res, jobId);
  if (!access) return;
  const job = access.record;
  if (job.status !== 'failed') return res.status(400).json({ error: 'Job is not failed' });

  const phasesCompleted = Array.isArray(job.phases_completed) ? job.phases_completed : [];
  if (phasesCompleted.length === 0) return res.status(400).json({ error: 'No completed phases to continue from' });
  if (!job.flow_snapshot) return res.status(409).json({ error: 'This job has no execution snapshot. Start a new run instead of continuing it.' });

  const { data: maxLog, error: maxLogError } = await supabase.from('job_logs').select('id').eq('job_id', jobId).order('id', { ascending: false }).limit(1).single();
  if (maxLogError && !isMissingRowError(maxLogError)) return res.status(400).json({ error: maxLogError.message });
  const logOffset = maxLog?.id || 0;

  const taskId = stringField(job, 'task_id');
  if (!taskId) return res.status(404).json({ error: 'Task not found' });
  try {
    await ensureTaskExecutionJobOwnership(taskId, jobId);
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : 'Task execution lock no longer matches this job' });
  }

  const { data, error } = await transitionJobAndTask({
    jobId,
    expectedStatus: 'failed',
    jobUpdates: { status: 'queued', question: null, log_offset: logOffset, flow_snapshot: job.flow_snapshot },
    taskId,
    taskUpdates: { status: 'in_progress' },
  });
  if (error) return res.status(400).json({ error });
  if (!data) return res.status(409).json({ error: 'Job is no longer failed' });

  const { error: logErr } = await supabase.from('job_logs').insert({
    job_id: jobId,
    event: 'log',
    data: { text: `[continue] Resuming from phase ${phasesCompleted.length + 1} (${phasesCompleted.length} phases already completed)` },
  });
  if (logErr) console.error(`[jobs] Failed to record continue log for job ${jobId}:`, logErr.message);

  res.json({ ok: true });
});
