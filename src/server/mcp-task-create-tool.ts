import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { isMissingRowError } from './authz.js';
import { isMcpProjectAllowed, mcpProjectScopeError, mcpText } from './mcp-authz.js';
import { getSystemUserId } from './mcp-system-user.js';
import { supabase } from './supabase.js';

export function registerMcpTaskCreateTool(server: McpServer): void {
  server.tool('task_create', 'Create a new task', {
    project_id: z.string(),
    title: z.string().max(500),
    type: z.string().max(50).default('feature'),
    description: z.string().max(20000).optional(),
    workstream_id: z.string().optional(),
  }, async ({ project_id, title, type, description, workstream_id }) => {
    if (!isMcpProjectAllowed(project_id)) return mcpText(mcpProjectScopeError(project_id));
    const cleanTitle = title.trim();
    if (!cleanTitle) return mcpText('Error: title is required.');
    if (workstream_id) {
      const { data: workstream, error: workstreamError } = await supabase
        .from('workstreams')
        .select('project_id')
        .eq('id', workstream_id)
        .single();
      if (workstreamError) {
        if (isMissingRowError(workstreamError)) return mcpText('Error: workstream_id not found');
        console.error(`[mcp] Failed to load workstream ${workstream_id}:`, workstreamError.message);
        return mcpText('Error: failed to load workstream');
      }
      if (workstream?.project_id !== project_id) return mcpText('Error: workstream_id does not belong to project_id');
    }

    const { data: maxTask, error: maxTaskError } = await supabase
      .from('tasks')
      .select('position')
      .eq('project_id', project_id)
      .order('position', { ascending: false })
      .limit(1)
      .single();
    if (maxTaskError && !isMissingRowError(maxTaskError)) {
      console.error(`[mcp] Failed to load max task position for project ${project_id}:`, maxTaskError.message);
      return mcpText('Error: failed to load project tasks');
    }

    const createdBy = await getSystemUserId(project_id);

    const { data, error } = await supabase.from('tasks').insert({
      project_id,
      title: cleanTitle,
      type,
      description: description || '',
      workstream_id: workstream_id || null,
      position: (maxTask?.position ?? 0) + 1,
      created_by: createdBy,
    }).select().single();

    if (error) {
      console.error(`[mcp] Failed to insert task for project ${project_id}:`, error.message);
      return mcpText('Error: failed to create task');
    }
    return mcpText(`Created task: ${data.title} (${data.id})`);
  });
}
