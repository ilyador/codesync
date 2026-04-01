import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

const server = new McpServer({ name: 'codesync', version: '1.0.0' });

// project_focus — get current top task
server.tool('project_focus', 'Get the current focus task and why it was chosen', {
  project_id: z.string().describe('Project UUID'),
}, async ({ project_id }) => {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', project_id)
    .in('status', ['backlog', 'todo'])
    .order('position', { ascending: true })
    .limit(3);

  if (!tasks || tasks.length === 0) {
    return { content: [{ type: 'text', text: 'No actionable tasks in backlog.' }] };
  }

  const focus = tasks[0];
  const text = `## Focus: ${focus.title}\nType: ${focus.type} | Effort: ${focus.effort} | Mode: ${focus.mode}\n${focus.description || ''}`;
  return { content: [{ type: 'text', text }] };
});

// project_summary — full state as markdown
server.tool('project_summary', 'Get full project state as LLM-readable markdown', {
  project_id: z.string().describe('Project UUID'),
}, async ({ project_id }) => {
  const [{ data: project }, { data: tasks }, { data: jobs }, { data: milestones }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', project_id).single(),
    supabase.from('tasks').select('*').eq('project_id', project_id).order('position'),
    supabase.from('jobs').select('*').eq('project_id', project_id).order('started_at', { ascending: false }).limit(10),
    supabase.from('milestones').select('*').eq('project_id', project_id),
  ]);

  const backlog = tasks?.filter(t => ['backlog', 'todo'].includes(t.status)) || [];
  const done = tasks?.filter(t => t.status === 'done') || [];
  const active = tasks?.filter(t => ['in_progress', 'paused', 'review'].includes(t.status)) || [];

  let md = `# Project: ${project?.name || 'Unknown'}\n\n`;

  if (milestones && milestones.length > 0) {
    const ms = milestones[0];
    const msTasks = tasks?.filter(t => t.milestone_id === ms.id) || [];
    const msDone = msTasks.filter(t => t.status === 'done').length;
    md += `## Milestone: ${ms.name}\n${msDone}/${msTasks.length} done${ms.deadline ? ` | Deadline: ${ms.deadline}` : ''}\n\n`;
  }

  if (active.length > 0) {
    md += `## Active\n`;
    for (const t of active) md += `- [${t.status}] ${t.title} (${t.type})\n`;
    md += '\n';
  }

  if (jobs && jobs.length > 0) {
    md += `## Recent Jobs\n`;
    for (const j of jobs.slice(0, 5)) {
      md += `- [${j.status}] ${j.current_phase || ''} ${j.status === 'paused' ? `— ${j.question}` : ''}\n`;
    }
    md += '\n';
  }

  md += `## Backlog (${backlog.length} tasks)\n`;
  for (const t of backlog.slice(0, 10)) {
    md += `${backlog.indexOf(t) + 1}. ${t.title} (${t.type})\n`;
  }

  md += `\n## Done: ${done.length} tasks completed\n`;

  return { content: [{ type: 'text', text: md }] };
});

// task_create
server.tool('task_create', 'Create a new task', {
  project_id: z.string(),
  title: z.string(),
  type: z.string().default('feature'),
  description: z.string().optional(),
  milestone_id: z.string().optional(),
}, async ({ project_id, title, type, description, milestone_id }) => {
  const { data: maxTask } = await supabase
    .from('tasks')
    .select('position')
    .eq('project_id', project_id)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const { data, error } = await supabase.from('tasks').insert({
    project_id,
    title,
    type,
    description: description || '',
    milestone_id: milestone_id || null,
    position: (maxTask?.position || 0) + 1,
  }).select().single();

  if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
  return { content: [{ type: 'text', text: `Created task: ${data.title} (${data.id})` }] };
});

// task_update
server.tool('task_update', 'Update a task status or fields', {
  task_id: z.string(),
  status: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
}, async ({ task_id, ...updates }) => {
  const clean = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));
  const { error } = await supabase.from('tasks').update(clean).eq('id', task_id);
  if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
  return { content: [{ type: 'text', text: `Task ${task_id} updated.` }] };
});

// task_log — add comment
server.tool('task_log', 'Add a note/comment to a task', {
  task_id: z.string(),
  message: z.string(),
}, async ({ task_id, message }) => {
  const { error } = await supabase.from('comments').insert({
    task_id,
    user_id: '00000000-0000-0000-0000-000000000000', // system user for MCP
    body: message,
  });
  if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
  return { content: [{ type: 'text', text: 'Note added.' }] };
});

// milestone_status
server.tool('milestone_status', 'Get milestone progress and blockers', {
  milestone_id: z.string(),
}, async ({ milestone_id }) => {
  const { data: ms } = await supabase.from('milestones').select('*').eq('id', milestone_id).single();
  if (!ms) return { content: [{ type: 'text', text: 'Milestone not found.' }] };

  const { data: tasks } = await supabase.from('tasks').select('*').eq('milestone_id', milestone_id);
  const done = tasks?.filter(t => t.status === 'done').length || 0;
  const total = tasks?.length || 0;
  const blocked = tasks?.filter(t => t.status === 'paused').length || 0;

  const text = `## ${ms.name}\nProgress: ${done}/${total}${ms.deadline ? ` | Deadline: ${ms.deadline}` : ''}\nBlocked: ${blocked} tasks`;
  return { content: [{ type: 'text', text }] };
});

// job_reply
server.tool('job_reply', 'Answer a paused job question', {
  job_id: z.string(),
  answer: z.string(),
}, async ({ job_id, answer }) => {
  const { error } = await supabase.from('jobs').update({ answer, status: 'running' }).eq('id', job_id);
  if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
  return { content: [{ type: 'text', text: 'Reply sent. Job will resume on next execution.' }] };
});

// job_approve
server.tool('job_approve', 'Approve a job in review', {
  job_id: z.string(),
}, async ({ job_id }) => {
  await supabase.from('jobs').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', job_id);
  return { content: [{ type: 'text', text: 'Job approved. Use git commands to commit the changes.' }] };
});

// job_reject
server.tool('job_reject', 'Reject a job and send task back to backlog', {
  job_id: z.string(),
  note: z.string(),
}, async ({ job_id, note }) => {
  const { data: job } = await supabase.from('jobs').select('task_id').eq('id', job_id).single();
  if (job) {
    await supabase.from('tasks').update({ status: 'backlog', followup_notes: note }).eq('id', job.task_id);
  }
  await supabase.from('jobs').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', job_id);
  return { content: [{ type: 'text', text: 'Job rejected. Task returned to backlog with notes.' }] };
});

// Start MCP server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
