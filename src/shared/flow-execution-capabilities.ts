import {
  resolveModelCapabilities,
  type ModelCapabilities,
  type ProviderKind,
} from './provider-model';
import {
  isTaskSelectableStepModel,
  resolveTaskSelectedStepModel,
  supportsFlowWideModelSelection,
} from './flow-step-model';
import {
  isTaskSelectedFlow,
  normalizeFlowProviderBinding,
  type FlowProviderBinding,
} from './flow-provider-binding';

export interface FlowCapabilityStep {
  model: string;
  tools?: string[];
  context_sources?: string[];
}

export interface FlowExecutionShape {
  provider_binding?: FlowProviderBinding | string | null;
  flow_steps?: FlowCapabilityStep[];
  steps?: FlowCapabilityStep[];
}

export interface FlowExecutionCapabilities {
  flowBinding: FlowProviderBinding;
  taskSelectionEnabled: boolean;
  providerSelectable: boolean;
  providerSelectionReason: string | null;
  modelSelectable: boolean;
  modelSelectionReason: string | null;
  reasoningSelectable: boolean;
  reasoningSelectionReason: string | null;
  subagentsSelectable: boolean;
  subagentsSelectionReason: string | null;
  invalidReason: string | null;
  usesTaskImages: boolean;
  usesTools: boolean;
  usesRagContext: boolean;
}

function flowSteps(flow: FlowExecutionShape): FlowCapabilityStep[] {
  if (Array.isArray(flow.flow_steps)) return flow.flow_steps;
  if (Array.isArray(flow.steps)) return flow.steps;
  return [];
}

function stepCapabilitiesForProvider(
  steps: FlowCapabilityStep[],
  provider: ProviderKind | null,
  taskModel: string | null,
): ModelCapabilities[] {
  if (!provider) return [];
  const effectiveSteps = steps.length > 0 ? steps : [{ model: 'task:selected' }];
  return effectiveSteps.map(step => {
    const concreteModel = resolveTaskSelectedStepModel(provider, step.model, taskModel);
    return resolveModelCapabilities(provider, concreteModel);
  });
}

export function validateTaskSelectedStepModels(steps: readonly FlowCapabilityStep[]): string | null {
  for (const step of steps) {
    if (!isTaskSelectableStepModel(step.model)) {
      return `Task-selected flows require task selectors such as task:selected, task:balanced, or task:strong. Received '${step.model}'.`;
    }
  }
  return null;
}

export function deriveFlowExecutionCapabilities(
  flow: FlowExecutionShape,
  provider: ProviderKind | null,
  taskModel: string | null,
): FlowExecutionCapabilities {
  const steps = flowSteps(flow);
  const flowBinding = normalizeFlowProviderBinding(flow.provider_binding);
  const usesTaskImages = steps.some(step => Array.isArray(step.context_sources) && step.context_sources.includes('task_images'));
  const usesTools = steps.some(step => Array.isArray(step.tools) && step.tools.length > 0);
  const usesRagContext = steps.some(step => Array.isArray(step.context_sources) && step.context_sources.includes('rag'));

  if (!isTaskSelectedFlow(flowBinding)) {
    return {
      flowBinding,
      taskSelectionEnabled: false,
      providerSelectable: false,
      providerSelectionReason: 'Provider and model are locked by this flow.',
      modelSelectable: false,
      modelSelectionReason: 'This flow does not allow task-level model selection.',
      reasoningSelectable: false,
      reasoningSelectionReason: 'Reasoning is inferred from the assigned flow.',
      subagentsSelectable: false,
      subagentsSelectionReason: 'Subagent use is inferred from the assigned flow.',
      invalidReason: null,
      usesTaskImages,
      usesTools,
      usesRagContext,
    };
  }

  const invalidReason = validateTaskSelectedStepModels(steps);
  if (invalidReason) {
    return {
      flowBinding,
      taskSelectionEnabled: false,
      providerSelectable: false,
      providerSelectionReason: invalidReason,
      modelSelectable: false,
      modelSelectionReason: invalidReason,
      reasoningSelectable: false,
      reasoningSelectionReason: invalidReason,
      subagentsSelectable: false,
      subagentsSelectionReason: invalidReason,
      invalidReason,
      usesTaskImages,
      usesTools,
      usesRagContext,
    };
  }
  const modelSelectable = supportsFlowWideModelSelection(steps.map(step => step.model));
  const modelCapabilities = stepCapabilitiesForProvider(steps, provider, modelSelectable ? taskModel : null);
  const reasoningSelectable = modelCapabilities.length > 0 && modelCapabilities.every(capabilities => capabilities.supportsReasoning);
  const subagentsSelectable = modelCapabilities.length > 0 && modelCapabilities.every(capabilities => capabilities.supportsSubagents);

  return {
    flowBinding,
    taskSelectionEnabled: true,
    providerSelectable: true,
    providerSelectionReason: null,
    modelSelectable,
    modelSelectionReason: modelSelectable
      ? null
      : 'This flow uses per-step model profiles, so task-level model selection is unavailable.',
    reasoningSelectable,
    reasoningSelectionReason: reasoningSelectable
      ? null
      : provider
        ? 'The resolved provider/model for this flow does not expose task-level reasoning.'
        : 'Select a provider to see whether this flow allows task-level reasoning.',
    subagentsSelectable,
    subagentsSelectionReason: subagentsSelectable
      ? null
      : provider
        ? 'The resolved provider/model for this flow does not allow task-level subagent control.'
        : 'Select a provider to see whether this flow allows task-level subagent control.',
    invalidReason,
    usesTaskImages,
    usesTools,
    usesRagContext,
  };
}
