export type FlowProviderBinding = 'task_selected' | 'flow_locked';

export function normalizeFlowProviderBinding(value: string | null | undefined): FlowProviderBinding {
  return value === 'task_selected' ? 'task_selected' : 'flow_locked';
}

export function isTaskSelectedFlow(value: string | null | undefined): boolean {
  return normalizeFlowProviderBinding(value) === 'task_selected';
}
