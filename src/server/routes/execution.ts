import { Router } from 'express';
import { runJob, cancelJob, loadTaskTypeConfig } from '../runner.js';
import { supabase } from '../supabase.js';
import { requireAuth } from '../auth-middleware.js';
import { createCheckpoint, revertToCheckpoint, deleteCheckpoint } from '../checkpoint.js';

// SSE connections per job
const sseClients = new Map<string, Set<(id: number, event: string, data: any) => void>>();

// SSE event buffer with incrementing IDs for Last-Event-ID deduplication
const MAX_BUFFER_SIZE = 100;
const sseEventBuffer = new Map<string, Array<{ id: number; event: string; data: any }>>();
const sseEventCounters = new Map<string, number>();

function broadcast(jobId: string, event: string, data: any) {
  // Increment event ID
  const counter = (sseEventCounters.get(jobId) || 0) + 1;
  sseEventCounters.set(jobId, counter);

  // Push to buffer
  if (!sseEventBuffer.has(jobId)) sseEventBuffer.set(jobId, []);
  const buffer = sseEventBuffer.get(jobId)!;
  buffer.push({ id: counter, event, data });
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
  }

  // Clean up buffer after job completes
  if (event === 'done' || event === 'failed') {
    setTimeout(() => {
      sseEventBuffer.delete(jobId);
      sseEventCounters.delete(jobId);
    }, 60000);
  }

  const clients = sseClients.get(jobId);
  if (clients) {
    for (const send of clients) {
      send(counter, event, data);
    }
  }
}

export const executionRouter = Router();

function makeBroadcastCallbacks(jobId: string) {
  return {
    onLog: (text: string) => broadcast(jobId, 'log', { text }),
    onPhaseStart: (phase: string, attempt: number) => broadcast(jobId, 'phase_start', { phase, attempt }),
    onPhaseComplete: (phase: string, output: string) => broadcast(jobId, 'phase_complete', { phase, output }),
    onPause: (question: string) => broadcast(jobId, 'paused', { question }),
    onDone: () => broadcast(jobId, 'done', {}),
    onFail: (error: string) => broadcast(jobId, 'failed', { error }),
  };
}

async function getMemberLocalPath(projectId: string, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('project_members')
    .select('local_path')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();
  return data?.local_path || null;
}

// Reusable internal function to start a job
export async function startJobInternal(params: {
  taskId: string;
  projectId: string;
  localPath: string;
  task: any;
  taskType: any;
  autoApprove?: boolean;
}): Promise<string> {
  const { taskId, projectId, localPath, task, taskType, autoApprove } = params;

  // Create job
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      task_id: taskId,
      project_id: projectId,
      status: 'running',
      current_phase: taskType.phases[0],
      max_attempts: taskType.verify_retries + 1,
    })
    .select()
    .single();

  if (jobErr || !job) {
    throw new Error('Failed to create job');
  }

  // Update task status
  await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', taskId);

  // Create checkpoint before running
  try {
    const checkpoint = createCheckpoint(localPath, job.id);
    await supabase.from('jobs').update({
      checkpoint_ref: checkpoint.commitSha,
      checkpoint_status: 'active'
    }).eq('id', job.id);
    broadcast(job.id, 'log', { text: '[checkpoint] Saved working directory state\n' });
  } catch (err: any) {
    broadcast(job.id, 'log', { text: `[checkpoint] Warning: ${err.message}\n` });
  }

  // Build onReview callback based on autoApprove
  const onReview = autoApprove
    ? async (result: any) => {
        broadcast(job.id, 'review', result);
        // Auto-approve: mark job done, task done, clean checkpoint
        await supabase.from('jobs').update({
          status: 'done',
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        await supabase.from('tasks').update({
          status: 'done',
          completed_at: new Date().toISOString(),
        }).eq('id', taskId);
        try { deleteCheckpoint(localPath, job.id); } catch {}
        await supabase.from('jobs').update({ checkpoint_status: 'cleaned' }).eq('id', job.id);
        broadcast(job.id, 'done', {});
        // Trigger next task in workstream
        maybeAutoContinue({
          completedTaskId: taskId,
          projectId,
          localPath,
        }).catch((err: any) => console.error('[auto-continue] Error:', err.message));
      }
    : (result: any) => broadcast(job.id, 'review', result);

  // Delay 500ms to give the browser time to connect SSE before events fire
  const callbacks = makeBroadcastCallbacks(job.id);
  setTimeout(() => {
    runJob({
      jobId: job.id,
      taskId,
      projectId,
      localPath,
      task,
      taskType,
      phasesAlreadyCompleted: [],
      ...callbacks,
      onReview,
    }).catch(err => {
      broadcast(job.id, 'failed', { error: err.message });
    });
  }, 500);

  return job.id;
}

// Auto-continue: start next task in workstream after completion
export async function maybeAutoContinue(params: {
  completedTaskId: string;
  projectId: string;
  localPath: string;
}): Promise<void> {
  const { completedTaskId, projectId, localPath } = params;

  const { data: task } = await supabase
    .from('tasks')
    .select('id, auto_continue, workstream_id, position, mode')
    .eq('id', completedTaskId)
    .single();

  if (!task) return;
  if (task.auto_continue !== true) return;
  if (task.workstream_id == null) return;

  const { data: nextTask } = await supabase
    .from('tasks')
    .select('id, type, mode, auto_continue')
    .eq('workstream_id', task.workstream_id)
    .in('status', ['backlog', 'todo'])
    .gt('position', task.position)
    .order('position', { ascending: true })
    .limit(1)
    .single();

  if (!nextTask) {
    // No next task — check if workstream is complete (all tasks done)
    const { data: remainingTasks } = await supabase
      .from('tasks')
      .select('id')
      .eq('workstream_id', task.workstream_id)
      .not('status', 'eq', 'done')
      .limit(1);

    if (!remainingTasks || remainingTasks.length === 0) {
      // All tasks done — mark workstream complete
      await supabase
        .from('workstreams')
        .update({ status: 'complete' })
        .eq('id', task.workstream_id);
      broadcast(task.workstream_id, 'workstream_complete', {
        workstreamId: task.workstream_id,
        projectId,
      });
    }
    return;
  }

  // If next task is human mode, pause the chain
  if (nextTask.mode === 'human') {
    broadcast(task.workstream_id, 'workstream_paused', {
      workstreamId: task.workstream_id,
      taskId: nextTask.id,
      reason: 'Next task requires human action',
    });
    return;
  }

  // Fetch full task for the runner
  const { data: fullNextTask } = await supabase.from('tasks').select('*').eq('id', nextTask.id).single();
  if (!fullNextTask) return;

  const taskType = loadTaskTypeConfig(localPath, fullNextTask.type);
  await startJobInternal({
    taskId: fullNextTask.id,
    projectId,
    localPath,
    task: fullNextTask,
    taskType,
    autoApprove: fullNextTask.auto_continue,
  });
}

// Start a job
executionRouter.post('/api/run', requireAuth, async (req, res) => {
  const { taskId, projectId, localPath, autoContinue } = req.body;

  if (!taskId || !projectId || !localPath) {
    return res.status(400).json({ error: 'taskId, projectId, and localPath are required' });
  }

  // Validate localPath against the user's registered path for this project
  const userId = (req as any).userId;
  const { data: membership } = await supabase
    .from('project_members')
    .select('local_path')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();
  if (membership && membership.local_path && membership.local_path !== localPath) {
    return res.status(403).json({ error: 'localPath does not match your registered project path' });
  }

  // Prevent concurrent jobs for the same task
  const { data: existingJobs } = await supabase
    .from('jobs')
    .select('id')
    .eq('task_id', taskId)
    .in('status', ['running', 'paused'])
    .limit(1);

  if (existingJobs && existingJobs.length > 0) {
    return res.status(409).json({ error: 'A job is already running or paused for this task', jobId: existingJobs[0].id });
  }

  // Fetch task
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (taskErr || !task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (task.mode !== 'ai') {
    return res.status(400).json({ error: 'Only AI tasks can be run' });
  }

  // Load task type config
  const taskType = loadTaskTypeConfig(localPath, task.type);

  try {
    const jobId = await startJobInternal({ taskId, projectId, localPath, task, taskType, autoApprove: autoContinue === true ? task.auto_continue : false });
    res.json({ jobId });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create job' });
  }
});

// SSE stream for job logs
executionRouter.get('/api/jobs/:id/events', async (req, res) => {
  const jobId = req.params.id;
  // Validate token from query param
  const token = req.query.token as string;
  if (token) {
    const { error } = await supabase.auth.getUser(token);
    if (error) return res.status(401).end();
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Tell EventSource to retry after 3 seconds on disconnect
  res.write('retry: 3000\n\n');

  const send = (id: number, event: string, data: any) => {
    res.write(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Register client
  if (!sseClients.has(jobId)) sseClients.set(jobId, new Set());
  sseClients.get(jobId)!.add(send);

  // Send initial connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'ok' })}\n\n`);

  // Replay buffered events, skipping those the client already received
  const lastEventId = parseInt(req.headers['last-event-id'] as string) || 0;
  const buffer = sseEventBuffer.get(jobId);
  if (buffer && buffer.length > 0) {
    for (const entry of buffer) {
      if (entry.id > lastEventId) {
        send(entry.id, entry.event, entry.data);
      }
    }
  }

  // Send heartbeat
  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.get(jobId)?.delete(send);
    if (sseClients.get(jobId)?.size === 0) sseClients.delete(jobId);
  });
});

// Reply to paused job
executionRouter.post('/api/jobs/:id/reply', requireAuth, async (req, res) => {
  const jobId = req.params.id;
  const { answer, localPath } = req.body;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job || job.status !== 'paused') {
    return res.status(400).json({ error: 'Job is not paused' });
  }

  // Save answer and resume
  await supabase.from('jobs').update({ status: 'running', answer }).eq('id', jobId);

  const { data: task } = await supabase.from('tasks').select('*').eq('id', job.task_id).single();
  if (!task) return res.status(404).json({ error: 'Task not found' });

  await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', task.id);

  const taskType = loadTaskTypeConfig(localPath, task.type);

  // Load phases already completed so we skip them on resume
  const phasesAlreadyCompleted: any[] = (job.phases_completed as any[]) || [];

  res.json({ ok: true });

  // Resume execution
  runJob({
    jobId,
    taskId: task.id,
    projectId: job.project_id,
    localPath,
    task: { ...task, answer },
    taskType,
    phasesAlreadyCompleted,
    ...makeBroadcastCallbacks(jobId),
    onReview: (result) => broadcast(jobId, 'review', result),
  }).catch(err => {
    broadcast(jobId, 'failed', { error: err.message });
  });
});

// Terminate a running job
executionRouter.post('/api/jobs/:id/terminate', requireAuth, async (req, res) => {
  const jobId = req.params.id;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job) return res.status(404).json({ error: 'Job not found' });

  // Kill the child process
  cancelJob(jobId);

  let failMessage = 'Job failed: terminated by user.';
  const localPath = await getMemberLocalPath(job.project_id, (req as any).userId);

  if (localPath) {
    try {
      revertToCheckpoint(localPath, jobId);
      failMessage += ' Changes have been automatically reverted.';
    } catch { /* ignore revert failure */ }
  }

  // Mark job as failed
  await supabase.from('jobs').update({
    status: 'failed',
    completed_at: new Date().toISOString(),
    question: failMessage,
  }).eq('id', jobId);

  // Move task back to backlog
  await supabase.from('tasks').update({
    status: 'backlog',
  }).eq('id', job.task_id);

  broadcast(jobId, 'failed', { error: 'Job terminated by user' });

  res.json({ ok: true });
});

// Approve job
executionRouter.post('/api/jobs/:id/approve', requireAuth, async (req, res) => {
  const jobId = req.params.id;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job || job.status !== 'review') {
    return res.status(400).json({ error: 'Job is not in review' });
  }

  const now = new Date().toISOString();
  const localPath = req.body.localPath || '';

  await Promise.all([
    supabase.from('jobs').update({ status: 'done', completed_at: now }).eq('id', jobId),
    supabase.from('tasks').update({ status: 'done', completed_at: now }).eq('id', job.task_id),
  ]);

  try { deleteCheckpoint(localPath, jobId); } catch {}
  await supabase.from('jobs').update({ checkpoint_status: 'cleaned' }).eq('id', jobId);

  res.json({ ok: true });

  // Fire-and-forget auto-continue
  maybeAutoContinue({
    completedTaskId: job.task_id,
    projectId: job.project_id,
    localPath,
  }).catch(console.error);
});

// Reject job -> back to backlog
executionRouter.post('/api/jobs/:id/reject', requireAuth, async (req, res) => {
  const jobId = req.params.id;
  const { note } = req.body;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job) return res.status(404).json({ error: 'Job not found' });

  await supabase.from('jobs').update({
    status: 'done',
    completed_at: new Date().toISOString(),
  }).eq('id', jobId);

  await supabase.from('tasks').update({
    status: 'backlog',
    followup_notes: note || null,
  }).eq('id', job.task_id);

  res.json({ ok: true });
});

// Revert job -> restore files to pre-job state
executionRouter.post('/api/jobs/:id/revert', requireAuth, async (req, res) => {
  const jobId = req.params.id;
  const { localPath } = req.body;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (!['review', 'failed', 'done'].includes(job.status)) {
    return res.status(400).json({ error: 'Job must be in review, failed, or done status to revert' });
  }

  if (!localPath) {
    return res.status(400).json({ error: 'localPath is required' });
  }

  try {
    revertToCheckpoint(localPath, jobId);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to revert checkpoint' });
  }

  await supabase.from('jobs').update({ checkpoint_status: 'reverted' }).eq('id', jobId);

  await supabase.from('tasks').update({ status: 'backlog' }).eq('id', job.task_id);

  broadcast(jobId, 'reverted', {});

  res.json({ ok: true });
});
