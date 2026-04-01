import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const admin = createClient(supabaseUrl, supabaseKey);

export const dataRouter = Router();

// Middleware: extract user from token
function getUserId(req: any): string | null {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  // Decode JWT payload (no verification needed — Supabase RLS handles auth)
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.sub;
  } catch { return null; }
}

// --- Projects ---

dataRouter.get('/api/projects', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { data } = await admin
    .from('project_members')
    .select('project_id, role, projects(id, name, created_at)')
    .eq('user_id', userId);

  const projects = (data || []).map((d: any) => ({
    id: d.projects.id,
    name: d.projects.name,
    role: d.role,
    created_at: d.projects.created_at,
  }));
  res.json(projects);
});

dataRouter.post('/api/projects', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { name } = req.body;
  const { data: project, error } = await admin
    .from('projects')
    .insert({ name, created_by: userId })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  await admin.from('project_members').insert({
    project_id: project.id,
    user_id: userId,
    role: 'admin',
  });

  res.json(project);
});

// --- Milestones ---

dataRouter.get('/api/milestones', async (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).json({ error: 'project_id required' });

  const { data } = await admin
    .from('milestones')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  res.json(data || []);
});

dataRouter.post('/api/milestones', async (req, res) => {
  const { project_id, name, deadline } = req.body;
  const { data, error } = await admin
    .from('milestones')
    .insert({ project_id, name, deadline: deadline || null })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

dataRouter.patch('/api/milestones/:id', async (req, res) => {
  const { data, error } = await admin
    .from('milestones')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// --- Tasks ---

dataRouter.get('/api/tasks', async (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).json({ error: 'project_id required' });

  const { data } = await admin
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true });
  res.json(data || []);
});

dataRouter.post('/api/tasks', async (req, res) => {
  const userId = getUserId(req);
  const { project_id, title, description, type, mode, effort, milestone_id } = req.body;

  // Get max position
  const { data: maxTask } = await admin
    .from('tasks')
    .select('position')
    .eq('project_id', project_id)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const { data, error } = await admin
    .from('tasks')
    .insert({
      project_id,
      title,
      description: description || '',
      type: type || 'feature',
      mode: mode || 'ai',
      effort: effort || 'high',
      milestone_id: milestone_id || null,
      position: (maxTask?.position || 0) + 1,
      created_by: userId,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

dataRouter.patch('/api/tasks/:id', async (req, res) => {
  const updates = { ...req.body };
  if (updates.status === 'done' && !updates.completed_at) {
    updates.completed_at = new Date().toISOString();
  }
  const { data, error } = await admin
    .from('tasks')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

dataRouter.delete('/api/tasks/:id', async (req, res) => {
  const { error } = await admin.from('tasks').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// --- Jobs ---

dataRouter.get('/api/jobs', async (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).json({ error: 'project_id required' });

  const { data } = await admin
    .from('jobs')
    .select('*')
    .eq('project_id', projectId)
    .order('started_at', { ascending: false })
    .limit(20);
  res.json(data || []);
});

// --- Comments ---

dataRouter.get('/api/comments', async (req, res) => {
  const taskId = req.query.task_id as string;
  if (!taskId) return res.status(400).json({ error: 'task_id required' });

  const { data } = await admin
    .from('comments')
    .select('*, profiles(name, initials)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });
  res.json(data || []);
});

dataRouter.post('/api/comments', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { task_id, body } = req.body;
  const { data, error } = await admin
    .from('comments')
    .insert({ task_id, user_id: userId, body })
    .select('*, profiles(name, initials)')
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// --- Notifications ---

dataRouter.get('/api/notifications', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { data } = await admin
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  res.json(data || []);
});

dataRouter.patch('/api/notifications/:id/read', async (req, res) => {
  await admin.from('notifications').update({ read: true }).eq('id', req.params.id);
  res.json({ ok: true });
});

dataRouter.post('/api/notifications/read-all', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  await admin.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  res.json({ ok: true });
});

// --- SSE: Realtime changes ---

const changeListeners = new Map<string, Set<(data: any) => void>>();

// Poll Supabase for changes every 2 seconds (simpler than WebSocket proxy)
setInterval(async () => {
  for (const [projectId, clients] of changeListeners) {
    if (clients.size === 0) { changeListeners.delete(projectId); continue; }
    // Fetch latest task and job updates
    const { data: tasks } = await admin
      .from('tasks')
      .select('id, status, position, updated_at')
      .eq('project_id', projectId)
      .order('position');
    const { data: jobs } = await admin
      .from('jobs')
      .select('id, status, current_phase, attempt')
      .eq('project_id', projectId)
      .order('started_at', { ascending: false })
      .limit(10);
    for (const send of clients) {
      send({ tasks: tasks || [], jobs: jobs || [] });
    }
  }
}, 2000);

dataRouter.get('/api/changes', (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).end();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const send = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (!changeListeners.has(projectId)) changeListeners.set(projectId, new Set());
  changeListeners.get(projectId)!.add(send);

  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    changeListeners.get(projectId)?.delete(send);
  });
});
