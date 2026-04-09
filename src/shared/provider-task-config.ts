import type { MultiagentMode, ProviderKind, ReasoningLevel } from './provider-model';
import { inferTaskModelProfile } from './flow-step-model';

export interface ProviderModelCapabilities {
  supports_tools: boolean;
  supported_tools: string[];
  supports_images: boolean;
  supports_reasoning: boolean;
  supported_reasoning_levels: ReasoningLevel[];
  supports_subagents: boolean;
  context_window: number | null;
  supports_structured_output: boolean;
}

export interface ProviderTaskConfig {
  default_model: string | null;
  balanced_model: string | null;
  strong_model: string | null;
  selectable_models: string[];
  model_capabilities: Record<string, ProviderModelCapabilities>;
}

const ALL_REASONING_LEVELS: ReasoningLevel[] = ['low', 'medium', 'high', 'max'];

function trimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const normalized = trimmed.toLowerCase();
    if (!trimmed || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(trimmed);
  }
  return result;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return dedupeStrings(value.filter((item): item is string => typeof item === 'string'));
}

function reasoningLevels(value: unknown): ReasoningLevel[] {
  if (!Array.isArray(value)) return [];
  return dedupeStrings(
    value.filter((item): item is string => item === 'low' || item === 'medium' || item === 'high' || item === 'max'),
  ) as ReasoningLevel[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function emptyProviderModelCapabilities(): ProviderModelCapabilities {
  return {
    supports_tools: false,
    supported_tools: [],
    supports_images: false,
    supports_reasoning: false,
    supported_reasoning_levels: [],
    supports_subagents: false,
    context_window: null,
    supports_structured_output: false,
  };
}

export function emptyProviderTaskConfig(): ProviderTaskConfig {
  return {
    default_model: null,
    balanced_model: null,
    strong_model: null,
    selectable_models: [],
    model_capabilities: {},
  };
}

function capabilitiesFromValue(value: unknown): ProviderModelCapabilities {
  const raw = record(value);
  const supportsReasoning = raw.supports_reasoning === true;
  return {
    supports_tools: raw.supports_tools === true,
    supported_tools: stringArray(raw.supported_tools),
    supports_images: raw.supports_images === true,
    supports_reasoning: supportsReasoning,
    supported_reasoning_levels: supportsReasoning ? reasoningLevels(raw.supported_reasoning_levels) : [],
    supports_subagents: raw.supports_subagents === true,
    context_window: typeof raw.context_window === 'number' && Number.isFinite(raw.context_window) ? raw.context_window : null,
    supports_structured_output: raw.supports_structured_output === true,
  };
}

function builtinModelCapabilities(overrides: Partial<ProviderModelCapabilities> = {}): ProviderModelCapabilities {
  return {
    supports_tools: true,
    supported_tools: [],
    supports_images: false,
    supports_reasoning: true,
    supported_reasoning_levels: [...ALL_REASONING_LEVELS],
    supports_subagents: true,
    context_window: null,
    supports_structured_output: true,
    ...overrides,
  };
}

export function defaultProviderTaskConfig(provider: ProviderKind): ProviderTaskConfig {
  switch (provider) {
    case 'claude':
      return {
        default_model: 'sonnet',
        balanced_model: 'sonnet',
        strong_model: 'opus',
        selectable_models: ['sonnet', 'opus'],
        model_capabilities: {
          sonnet: builtinModelCapabilities(),
          opus: builtinModelCapabilities(),
        },
      };
    case 'codex':
      return {
        default_model: 'gpt-5.4',
        balanced_model: 'gpt-5.4-mini',
        strong_model: 'gpt-5.4',
        selectable_models: ['gpt-5.4', 'gpt-5.4-mini', 'o3'],
        model_capabilities: {
          'gpt-5.4': builtinModelCapabilities(),
          'gpt-5.4-mini': builtinModelCapabilities(),
          o3: builtinModelCapabilities(),
        },
      };
    default:
      return emptyProviderTaskConfig();
  }
}

export function normalizeProviderTaskConfig(provider: ProviderKind, value: unknown): ProviderTaskConfig {
  if (value == null) {
    return defaultProviderTaskConfig(provider);
  }

  const raw = record(value);
  const modelCapabilities = record(raw.model_capabilities);
  const normalizedCapabilities = Object.fromEntries(
    Object.entries(modelCapabilities)
      .map(([model, capabilities]) => [trimmedString(model), capabilities] as const)
      .filter((entry): entry is readonly [string, unknown] => !!entry[0])
      .map(([model, capabilities]) => [model, capabilitiesFromValue(capabilities)]),
  );

  return {
    default_model: trimmedString(raw.default_model),
    balanced_model: trimmedString(raw.balanced_model),
    strong_model: trimmedString(raw.strong_model),
    selectable_models: stringArray(raw.selectable_models),
    model_capabilities: normalizedCapabilities,
  };
}

export function providerTaskConfigDefaultModel(taskConfig: ProviderTaskConfig): string | null {
  return trimmedString(taskConfig.default_model) || taskConfig.selectable_models[0] || null;
}

export function providerTaskConfigSelectableModels(taskConfig: ProviderTaskConfig): string[] {
  return [...taskConfig.selectable_models];
}

function matchingCapabilityEntry(
  taskConfig: ProviderTaskConfig,
  model: string,
): ProviderModelCapabilities | null {
  const trimmed = model.trim();
  if (!trimmed) return null;
  if (taskConfig.model_capabilities[trimmed]) return taskConfig.model_capabilities[trimmed];
  const normalized = trimmed.toLowerCase();
  for (const [key, value] of Object.entries(taskConfig.model_capabilities)) {
    if (key.toLowerCase() === normalized) {
      return value;
    }
  }
  return null;
}

export function providerTaskModelCapabilities(
  taskConfig: ProviderTaskConfig,
  model: string,
): ProviderModelCapabilities {
  return matchingCapabilityEntry(taskConfig, model) || emptyProviderModelCapabilities();
}

export function resolveTaskSelectedStepModel(
  taskConfig: ProviderTaskConfig,
  stepModel: string,
  taskModel: string | null = null,
): string {
  const profile = inferTaskModelProfile(stepModel);
  if (!profile) {
    throw new Error(`Task-selected flow step '${stepModel}' does not map to a provider-agnostic model selector`);
  }

  switch (profile) {
    case 'selected':
      return trimmedString(taskModel) || providerTaskConfigDefaultModel(taskConfig) || '';
    case 'balanced':
      return trimmedString(taskConfig.balanced_model) || '';
    case 'strong':
      return trimmedString(taskConfig.strong_model) || '';
    default:
      return '';
  }
}

export function supportedReasoningLevelIntersection(
  capabilities: readonly ProviderModelCapabilities[],
): ReasoningLevel[] {
  if (capabilities.length === 0) return [];
  const shared = new Set<ReasoningLevel>(ALL_REASONING_LEVELS);
  for (const capability of capabilities) {
    if (!capability.supports_reasoning || capability.supported_reasoning_levels.length === 0) {
      return [];
    }
    for (const level of [...shared]) {
      if (!capability.supported_reasoning_levels.includes(level)) {
        shared.delete(level);
      }
    }
  }
  return ALL_REASONING_LEVELS.filter(level => shared.has(level));
}

export function normalizeReasoningLevelForCapabilities(
  supportedLevels: readonly ReasoningLevel[],
  value: string | null | undefined,
): ReasoningLevel {
  const normalized = value === 'medium' || value === 'high' || value === 'max' ? value : 'low';
  return supportedLevels.includes(normalized) ? normalized : (supportedLevels[0] || 'low');
}

export function normalizeMultiagentModeForCapabilities(
  supportsSubagents: boolean,
  value: string | null | undefined,
): MultiagentMode {
  if (!supportsSubagents) return 'auto';
  return value === 'yes' ? 'yes' : 'auto';
}

export function taskConfigSupportsTools(
  capability: ProviderModelCapabilities,
  requiredTools: readonly string[],
): boolean {
  if (requiredTools.length === 0) return true;
  if (!capability.supports_tools) return false;
  if (capability.supported_tools.length === 0) return true;
  const supported = new Set(capability.supported_tools.map(tool => tool.toLowerCase()));
  return requiredTools.every(tool => supported.has(tool.toLowerCase()));
}
