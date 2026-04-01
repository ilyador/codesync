import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { runJob, cancelJob, loadTaskTypeConfig } from '../runner.js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

// SSE connections per job
const sseClients = new Map<string, Set<(event: string, data: any) => void>>();

function broadcast(jobId: string, event: string, data: any) {
  const clients = sseClients.get(jobId);
  if (clients) {
    for (const send of clients) {
      send(event, data);
    }
  }
}

export const executionRouter = Router();

// Start a job
executionRouter.post('/api/run', async (req, res) => {
  const { taskId, projectId, localPath } = req.body;

  if (!taskId || !projectId || !localPath) {
    return res.status(400).json({ error: 'taskId, projectId, and localPath are required' });
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
    return res.status(500).json({ error: 'Failed to create job' });
  }

  // Update task status
  await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', taskId);

  // Return job ID immediately — execution happens async
  res.json({ jobId: job.id });

  // Run async
  runJob({
    jobId: job.id,
    taskId,
    projectId,
    localPath,
    task,
    taskType,
    onLog: (text) => broadcast(job.id, 'log', { text }),
    onPhaseStart: (phase, attempt) => broadcast(job.id, 'phase_start', { phase, attempt }),
    onPhaseComplete: (phase, output) => broadcast(job.id, 'phase_complete', { phase, output }),
    onPause: (question) => broadcast(job.id, 'paused', { question }),
    onReview: (result) => broadcast(job.id, 'review', result),
    onDone: () => broadcast(job.id, 'done', {}),
    onFail: (error) => broadcast(job.id, 'failed', { error }),
  }).catch(err => {
    broadcast(job.id, 'failed', { error: err.message });
  });
});

// SSE stream for job logs
executionRouter.get('/api/jobs/:id/events', (req, res) => {
  const jobId = req.params.id;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Register client
  if (!sseClients.has(jobId)) sseClients.set(jobId, new Set());
  sseClients.get(jobId)!.add(send);

  // Send heartbeat
  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.get(jobId)?.delete(send);
    if (sseClients.get(jobId)?.size === 0) sseClients.delete(jobId);
  });
});

// Reply to paused job
executionRouter.post('/api/jobs/:id/reply', async (req, res) => {
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

  res.json({ ok: true });

  // Resume execution
  runJob({
    jobId,
    taskId: task.id,
    projectId: job.project_id,
    localPath,
    task: { ...task, answer },
    taskType,
    onLog: (text) => broadcast(jobId, 'log', { text }),
    onPhaseStart: (phase, attempt) => broadcast(jobId, 'phase_start', { phase, attempt }),
    onPhaseComplete: (phase, output) => broadcast(jobId, 'phase_complete', { phase, output }),
    onPause: (question) => broadcast(jobId, 'paused', { question }),
    onReview: (result) => broadcast(jobId, 'review', result),
    onDone: () => broadcast(jobId, 'done', {}),
    onFail: (error) => broadcast(jobId, 'failed', { error }),
  }).catch(err => {
    broadcast(jobId, 'failed', { error: err.message });
  });
});

// Approve job
executionRouter.post('/api/jobs/:id/approve', async (req, res) => {
  const jobId = req.params.id;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job || job.status !== 'review') {
    return res.status(400).json({ error: 'Job is not in review' });
  }

  await supabase.from('jobs').update({
    status: 'done',
    completed_at: new Date().toISOString(),
  }).eq('id', jobId);

  await supabase.from('tasks').update({
    status: 'done',
    completed_at: new Date().toISOString(),
  }).eq('id', job.task_id);

  res.json({ ok: true });
});

// Reject job -> back to backlog
executionRouter.post('/api/jobs/:id/reject', async (req, res) => {
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
