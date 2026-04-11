import { broadcast } from './realtime-listeners.js';
import { projectRecord, stringField, type RealtimePayload } from './realtime-payload.js';
import { supabase } from './supabase.js';

async function resolveProjectId(table: 'tasks' | 'workstreams', id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from(table)
    .select('project_id')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  const projectId = (data as { project_id?: unknown }).project_id;
  return typeof projectId === 'string' && projectId.length > 0 ? projectId : null;
}

export async function broadcastNotificationChange(payload: RealtimePayload): Promise<void> {
  const record = projectRecord(payload);
  const taskId = stringField(record, 'task_id');
  const workstreamId = stringField(record, 'workstream_id');

  let projectId: string | null = null;
  if (taskId) {
    projectId = await resolveProjectId('tasks', taskId);
  } else if (workstreamId) {
    projectId = await resolveProjectId('workstreams', workstreamId);
  }
  if (!projectId) return;

  broadcast(projectId, { type: 'notification_changed' });
}
