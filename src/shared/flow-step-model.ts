import { parseModelId } from './provider-model';

export type TaskModelProfile = 'selected' | 'balanced' | 'strong';

export interface TaskModelProfileOption {
  value: TaskModelProfile;
  label: string;
  description: string;
}

export const TASK_MODEL_PROFILE_OPTIONS: TaskModelProfileOption[] = [
  {
    value: 'selected',
    label: 'Task model',
    description: 'Use the task-level model, if this flow supports model selection.',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Use a general-purpose model profile for standard steps.',
  },
  {
    value: 'strong',
    label: 'Strong',
    description: 'Use the strongest coding model profile for the selected provider.',
  },
];

const STRONG_MODEL_IDS = new Set([
  'claude:opus',
  'codex:gpt-5.4',
  'codex:gpt-5.3-codex',
  'codex:gpt-5.2-codex',
  'codex:gpt-5.1-codex-max',
  'codex:gpt-5-codex',
  'codex:o3',
]);

const BALANCED_MODEL_IDS = new Set([
  'claude:sonnet',
  'codex:gpt-5.4-mini',
  'codex:gpt-5.1-codex',
  'codex:gpt-5.2',
]);

export function formatTaskModelSelector(profile: TaskModelProfile): string {
  return `task:${profile}`;
}

export function parseTaskModelSelector(value: string | null | undefined): TaskModelProfile | null {
  const trimmed = (value || '').trim().toLowerCase();
  if (!trimmed.startsWith('task:')) return null;
  switch (trimmed.slice('task:'.length)) {
    case 'selected':
      return 'selected';
    case 'fast':
      return 'balanced';
    case 'balanced':
    case 'strong':
      return trimmed.slice('task:'.length) as TaskModelProfile;
    default:
      return null;
  }
}

export function isTaskModelSelector(value: string | null | undefined): boolean {
  return parseTaskModelSelector(value) !== null;
}

export function inferTaskModelProfile(value: string | null | undefined): TaskModelProfile | null {
  if (!(value || '').trim()) return null;
  const selector = parseTaskModelSelector(value);
  if (selector) return selector;

  const parsed = parseModelId(value);
  const normalized = `${parsed.provider}:${parsed.model}`.toLowerCase();
  if (BALANCED_MODEL_IDS.has(normalized)) return 'balanced';
  if (STRONG_MODEL_IDS.has(normalized)) return 'strong';
  return null;
}

export function isTaskSelectableStepModel(value: string | null | undefined): boolean {
  return inferTaskModelProfile(value) !== null;
}

export function supportsFlowWideModelSelection(stepModels: readonly string[]): boolean {
  return stepModels.every(model => inferTaskModelProfile(model) === 'selected');
}

export function describeTaskStepModel(value: string | null | undefined): string {
  const profile = inferTaskModelProfile(value);
  switch (profile) {
    case 'selected':
      return 'task model';
    case 'balanced':
      return 'balanced profile';
    case 'strong':
      return 'strong profile';
    default:
      return (value || '').trim() || 'unknown';
  }
}
