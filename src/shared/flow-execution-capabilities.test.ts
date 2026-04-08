import { describe, expect, it } from 'vitest';
import { deriveFlowExecutionCapabilities } from './flow-execution-capabilities';
import { resolveTaskSelectedStepModel } from './flow-step-model';
import { toProviderReasoningLevel } from './provider-model';

describe('flow execution capabilities', () => {
  it('disables flow-wide model selection when task-selected steps mix profiles', () => {
    const capabilities = deriveFlowExecutionCapabilities({
      provider_binding: 'task_selected',
      steps: [
        { model: 'task:strong' },
        { model: 'task:balanced' },
      ],
    }, 'claude', null);

    expect(capabilities.providerSelectable).toBe(true);
    expect(capabilities.modelSelectable).toBe(false);
    expect(capabilities.modelSelectionReason).toBe('This flow uses per-step model profiles, so task-level model selection is unavailable.');
    expect(capabilities.reasoningSelectable).toBe(true);
    expect(capabilities.subagentsSelectable).toBe(true);
  });

  it('enables flow-wide model selection when every step uses task:selected', () => {
    const capabilities = deriveFlowExecutionCapabilities({
      provider_binding: 'task_selected',
      steps: [
        { model: 'task:selected' },
        { model: 'task:selected' },
      ],
    }, 'codex', 'gpt-5.4');

    expect(capabilities.providerSelectable).toBe(true);
    expect(capabilities.modelSelectable).toBe(true);
    expect(capabilities.reasoningSelectable).toBe(true);
    expect(capabilities.reasoningSelectionReason).toBeNull();
  });

  it('disables reasoning and subagents when the selected task model is not known to support them', () => {
    const capabilities = deriveFlowExecutionCapabilities({
      provider_binding: 'task_selected',
      steps: [
        { model: 'task:selected' },
      ],
    }, 'codex', 'custom-experimental-model');

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
    }, 'claude', null);

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
  it('maps strong and balanced profiles per provider', () => {
    expect(resolveTaskSelectedStepModel('claude', 'task:strong')).toBe('opus');
    expect(resolveTaskSelectedStepModel('claude', 'task:balanced')).toBe('sonnet');
    expect(resolveTaskSelectedStepModel('codex', 'task:strong')).toBe('gpt-5.4');
    expect(resolveTaskSelectedStepModel('codex', 'task:balanced')).toBe('gpt-5.4-mini');
  });

  it('uses the explicit task model for task:selected steps', () => {
    expect(resolveTaskSelectedStepModel('claude', 'task:selected', 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });

  it('maps the shared max effort level to codex xhigh internally', () => {
    expect(toProviderReasoningLevel('claude', 'max')).toBe('max');
    expect(toProviderReasoningLevel('codex', 'max')).toBe('xhigh');
  });
});
