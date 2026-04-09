import { describe, expect, it } from 'vitest';
import { deriveFlowExecutionCapabilities } from './flow-execution-capabilities';
import {
  defaultProviderTaskConfig,
  resolveTaskSelectedStepModel,
} from './provider-task-config';
import { toProviderReasoningLevel } from './provider-model';

describe('flow execution capabilities', () => {
  it('disables flow-wide model selection when task-selected steps mix profiles', () => {
    const capabilities = deriveFlowExecutionCapabilities({
      provider_binding: 'task_selected',
      steps: [
        { model: 'task:strong' },
        { model: 'task:balanced' },
      ],
    }, defaultProviderTaskConfig('claude'), null);

    expect(capabilities.providerSelectable).toBe(true);
    expect(capabilities.modelSelectable).toBe(false);
    expect(capabilities.modelSelectionReason).toBe('This flow uses per-step model profiles, so task-level model selection is unavailable.');
    expect(capabilities.reasoningSelectable).toBe(true);
    expect(capabilities.subagentsSelectable).toBe(true);
  });

  it('enables flow-wide model selection for non-CLI providers when their task config satisfies the flow', () => {
    const capabilities = deriveFlowExecutionCapabilities({
      provider_binding: 'task_selected',
      steps: [
        { model: 'task:selected', tools: ['Read'] },
        { model: 'task:selected', context_sources: ['task_description'] },
      ],
    }, {
      default_model: 'qwen2.5-coder',
      balanced_model: 'qwen2.5-coder',
      strong_model: 'qwen2.5-coder-32b',
      selectable_models: ['qwen2.5-coder', 'qwen2.5-coder-32b'],
      model_capabilities: {
        'qwen2.5-coder': {
          supports_tools: true,
          supported_tools: [],
          supports_images: false,
          supports_reasoning: true,
          supported_reasoning_levels: ['low', 'medium', 'high', 'max'],
          supports_subagents: false,
          context_window: null,
          supports_structured_output: true,
        },
        'qwen2.5-coder-32b': {
          supports_tools: true,
          supported_tools: [],
          supports_images: false,
          supports_reasoning: true,
          supported_reasoning_levels: ['low', 'medium', 'high', 'max'],
          supports_subagents: false,
          context_window: null,
          supports_structured_output: true,
        },
      },
    }, null);

    expect(capabilities.providerSelectable).toBe(true);
    expect(capabilities.modelSelectable).toBe(true);
    expect(capabilities.modelOptions).toEqual(['qwen2.5-coder', 'qwen2.5-coder-32b']);
    expect(capabilities.resolvedTaskModel).toBe('qwen2.5-coder');
    expect(capabilities.reasoningSelectable).toBe(true);
  });

  it('rejects providers whose manifest cannot satisfy required tools', () => {
    const capabilities = deriveFlowExecutionCapabilities({
      provider_binding: 'task_selected',
      steps: [
        { model: 'task:selected', tools: ['Read', 'Write'] },
      ],
    }, {
      default_model: 'llama3',
      balanced_model: 'llama3',
      strong_model: 'llama3',
      selectable_models: ['llama3'],
      model_capabilities: {
        llama3: {
          supports_tools: false,
          supported_tools: [],
          supports_images: false,
          supports_reasoning: false,
          supported_reasoning_levels: [],
          supports_subagents: false,
          context_window: null,
          supports_structured_output: false,
        },
      },
    }, null);

    expect(capabilities.invalidReason).toBe('The selected provider does not define a task model that satisfies this flow.');
  });

  it('treats task_images as prompt context instead of a multimodal hard gate', () => {
    const capabilities = deriveFlowExecutionCapabilities({
      provider_binding: 'task_selected',
      steps: [
        { model: 'task:strong', context_sources: ['task_description', 'task_images'] },
      ],
    }, defaultProviderTaskConfig('claude'), null);

    expect(capabilities.invalidReason).toBeNull();
    expect(capabilities.usesTaskImages).toBe(true);
    expect(capabilities.reasoningSelectable).toBe(true);
  });

  it('disables reasoning and subagents when the selected task model does not support them', () => {
    const capabilities = deriveFlowExecutionCapabilities({
      provider_binding: 'task_selected',
      steps: [
        { model: 'task:selected' },
      ],
    }, {
      default_model: 'stable',
      balanced_model: 'stable',
      strong_model: 'stable',
      selectable_models: ['stable', 'custom-experimental-model'],
      model_capabilities: {
        stable: {
          supports_tools: true,
          supported_tools: [],
          supports_images: false,
          supports_reasoning: true,
          supported_reasoning_levels: ['low', 'medium', 'high', 'max'],
          supports_subagents: true,
          context_window: null,
          supports_structured_output: true,
        },
        'custom-experimental-model': {
          supports_tools: true,
          supported_tools: [],
          supports_images: false,
          supports_reasoning: false,
          supported_reasoning_levels: [],
          supports_subagents: false,
          context_window: null,
          supports_structured_output: true,
        },
      },
    }, 'custom-experimental-model');

    expect(capabilities.providerSelectable).toBe(true);
    expect(capabilities.modelSelectable).toBe(true);
    expect(capabilities.reasoningSelectable).toBe(false);
    expect(capabilities.subagentsSelectable).toBe(false);
    expect(capabilities.reasoningSelectionReason).toBe('The resolved provider/model for this flow does not expose task-level reasoning.');
    expect(capabilities.subagentsSelectionReason).toBe('The resolved provider/model for this flow does not allow task-level subagent control.');
  });

  it('marks task-selected flows invalid when a step uses a locked provider model', () => {
    const capabilities = deriveFlowExecutionCapabilities({
      provider_binding: 'task_selected',
      steps: [{ model: 'ollama:llama3' }],
    }, defaultProviderTaskConfig('claude'), null);

    expect(capabilities.providerSelectable).toBe(false);
    expect(capabilities.invalidReason).toContain('Task-selected flows require task selectors');
  });

  it('treats flow-locked flows as fully inferred at the task level', () => {
    const capabilities = deriveFlowExecutionCapabilities({
      provider_binding: 'flow_locked',
      steps: [{ model: 'claude:sonnet' }],
    }, null, null);

    expect(capabilities.providerSelectable).toBe(false);
    expect(capabilities.modelSelectable).toBe(false);
    expect(capabilities.reasoningSelectable).toBe(false);
    expect(capabilities.subagentsSelectable).toBe(false);
    expect(capabilities.providerSelectionReason).toBe('Provider and model are locked by this flow.');
    expect(capabilities.reasoningSelectionReason).toBe('Reasoning is inferred from the assigned flow.');
    expect(capabilities.subagentsSelectionReason).toBe('Subagent use is inferred from the assigned flow.');
  });
});

describe('task-selected model resolution', () => {
  it('maps strong and balanced profiles from the provider task config', () => {
    expect(resolveTaskSelectedStepModel(defaultProviderTaskConfig('claude'), 'task:strong')).toBe('opus');
    expect(resolveTaskSelectedStepModel(defaultProviderTaskConfig('claude'), 'task:balanced')).toBe('sonnet');
    expect(resolveTaskSelectedStepModel(defaultProviderTaskConfig('codex'), 'task:strong')).toBe('gpt-5.4');
    expect(resolveTaskSelectedStepModel(defaultProviderTaskConfig('codex'), 'task:balanced')).toBe('gpt-5.4-mini');
  });

  it('uses the explicit task model for task:selected steps', () => {
    expect(resolveTaskSelectedStepModel(defaultProviderTaskConfig('claude'), 'task:selected', 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });

  it('maps the shared max effort level to codex xhigh internally', () => {
    expect(toProviderReasoningLevel('claude', 'max')).toBe('max');
    expect(toProviderReasoningLevel('codex', 'max')).toBe('xhigh');
  });
});
