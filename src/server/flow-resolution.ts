import { isMissingRowError } from './authz.js';
import { buildFlowSnapshot, type FlowConfig } from './flow-config.js';
import { supabase } from './supabase.js';

/** Resolve a flow's snapshot, first phase, and maxAttempts from a loaded flow row. */
function resolveFlow(flow: unknown): { flowSnapshot: FlowConfig; firstPhase: string; maxAttempts: number } {
  const flowSnapshot = buildFlowSnapshot(flow);
  const firstPhase = flowSnapshot.steps[0]?.name || 'plan';
  const maxAttempts = flowSnapshot.steps.length > 0
    ? Math.max(...flowSnapshot.steps.map(step => step.max_retries + 1))
    : 1;
  return { flowSnapshot, firstPhase, maxAttempts };
}

export async function resolveFlowForTask(
  task: { flow_id?: string | null },
  projectId: string,
): Promise<{ flowSnapshot: FlowConfig; firstPhase: string; maxAttempts: number; flowId: string }> {
  if (!task.flow_id) {
    throw new Error('AI tasks require an assigned flow');
  }

  const { data: flow, error: flowError } = await supabase
    .from('flows')
    .select('*, flow_steps(*)')
    .eq('id', task.flow_id)
    .eq('project_id', projectId)
    .single();
  if (flowError) {
    if (isMissingRowError(flowError)) {
      throw new Error('Assigned flow was not found');
    }
    throw new Error(flowError.message);
  }

  const { flowSnapshot, firstPhase, maxAttempts } = resolveFlow(flow);
  return { flowSnapshot, firstPhase, maxAttempts, flowId: task.flow_id };
}
