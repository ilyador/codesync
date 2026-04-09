import type { ReasoningLevel } from './provider-model';
import {
  providerTaskConfigDefaultModel,
  providerTaskConfigSelectableModels,
  providerTaskModelCapabilities,
  resolveTaskSelectedStepModel,
  supportedReasoningLevelIntersection,
  taskConfigSupportsTools,
  type ProviderModelCapabilities,
  type ProviderTaskConfig,
} from './provider-task-config';
import {
  inferTaskModelProfile,
  isTaskSelectableStepModel,
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
  supportedReasoningLevels: ReasoningLevel[];
  reasoningSelectionReason: string | null;
  subagentsSelectable: boolean;
  subagentsSelectionReason: string | null;
  invalidReason: string | null;
  usesTaskImages: boolean;
  usesTools: boolean;
  usesRagContext: boolean;
  modelOptions: string[];
  resolvedTaskModel: string | null;
}

function flowSteps(flow: FlowExecutionShape): FlowCapabilityStep[] {
  if (Array.isArray(flow.flow_steps)) return flow.flow_steps;
  if (Array.isArray(flow.steps)) return flow.steps;
  return [];
}

function stepUsesTaskImages(step: FlowCapabilityStep): boolean {
  return Array.isArray(step.context_sources) && step.context_sources.includes('task_images');
}

function stepCompatibilityError(
  step: FlowCapabilityStep,
  capability: ProviderModelCapabilities,
): string | null {
  const requiredTools = Array.isArray(step.tools) ? step.tools : [];
  if (!taskConfigSupportsTools(capability, requiredTools)) {
    if (capability.supported_tools.length > 0) {
      const supported = new Set(capability.supported_tools.map(tool => tool.toLowerCase()));
      const missing = requiredTools.filter(tool => !supported.has(tool.toLowerCase()));
      if (missing.length > 0) {
        return `The resolved provider/model for this flow does not support required tools: ${missing.join(', ')}.`;
      }
    }
    return 'The resolved provider/model for this flow does not support the tools required by one or more steps.';
  }
  return null;
}

function reasoningSelectionReason(levels: readonly ReasoningLevel[], hasProvider: boolean): string | null {
  if (levels.length > 0) return null;
  return hasProvider
    ? 'The resolved provider/model for this flow does not expose task-level reasoning.'
    : 'Select a provider to see whether this flow allows task-level reasoning.';
}

function subagentsSelectionReason(enabled: boolean, hasProvider: boolean): string | null {
  if (enabled) return null;
  return hasProvider
    ? 'The resolved provider/model for this flow does not allow task-level subagent control.'
    : 'Select a provider to see whether this flow allows task-level subagent control.';
}

function resolveMixedProfileCapabilities(
  steps: FlowCapabilityStep[],
  taskConfig: ProviderTaskConfig,
): {
  invalidReason: string | null;
  capabilities: ProviderModelCapabilities[];
} {
  const capabilities: ProviderModelCapabilities[] = [];

  for (const step of steps) {
    const resolvedModel = resolveTaskSelectedStepModel(taskConfig, step.model, null);
    if (!resolvedModel) {
      switch (inferTaskModelProfile(step.model)) {
        case 'selected':
          return { invalidReason: 'The selected provider does not define a default task model for this flow.', capabilities: [] };
        case 'balanced':
          return { invalidReason: 'The selected provider does not define a balanced model required by this flow.', capabilities: [] };
        case 'strong':
          return { invalidReason: 'The selected provider does not define a strong model required by this flow.', capabilities: [] };
        default:
          return { invalidReason: `Task-selected flow step '${step.model}' does not map to a provider task profile.`, capabilities: [] };
      }
    }
    const capability = providerTaskModelCapabilities(taskConfig, resolvedModel);
    const incompatibility = stepCompatibilityError(step, capability);
    if (incompatibility) {
      return { invalidReason: incompatibility, capabilities: [] };
    }
    capabilities.push(capability);
  }

  return { invalidReason: null, capabilities };
}

function modelSupportsSelectedFlow(
  steps: readonly FlowCapabilityStep[],
  taskConfig: ProviderTaskConfig,
  model: string,
): boolean {
  const capability = providerTaskModelCapabilities(taskConfig, model);
  return steps.every(step => !stepCompatibilityError(step, capability));
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
  taskConfig: ProviderTaskConfig | null,
  taskModel: string | null,
): FlowExecutionCapabilities {
  const steps = flowSteps(flow);
  const flowBinding = normalizeFlowProviderBinding(flow.provider_binding);
  const usesTaskImages = steps.some(stepUsesTaskImages);
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
      supportedReasoningLevels: [],
      reasoningSelectionReason: 'Reasoning is inferred from the assigned flow.',
      subagentsSelectable: false,
      subagentsSelectionReason: 'Subagent use is inferred from the assigned flow.',
      invalidReason: null,
      usesTaskImages,
      usesTools,
      usesRagContext,
      modelOptions: [],
      resolvedTaskModel: null,
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
      supportedReasoningLevels: [],
      reasoningSelectionReason: invalidReason,
      subagentsSelectable: false,
      subagentsSelectionReason: invalidReason,
      invalidReason,
      usesTaskImages,
      usesTools,
      usesRagContext,
      modelOptions: [],
      resolvedTaskModel: null,
    };
  }

  if (!taskConfig) {
    return {
      flowBinding,
      taskSelectionEnabled: true,
      providerSelectable: true,
      providerSelectionReason: null,
      modelSelectable: false,
      modelSelectionReason: 'Select a provider to see whether this flow allows task-level model selection.',
      reasoningSelectable: false,
      supportedReasoningLevels: [],
      reasoningSelectionReason: 'Select a provider to see whether this flow allows task-level reasoning.',
      subagentsSelectable: false,
      subagentsSelectionReason: 'Select a provider to see whether this flow allows task-level subagent control.',
      invalidReason: null,
      usesTaskImages,
      usesTools,
      usesRagContext,
      modelOptions: [],
      resolvedTaskModel: null,
    };
  }

  const modelSelectable = supportsFlowWideModelSelection(steps.map(step => step.model));
  if (modelSelectable) {
    const selectableModels = providerTaskConfigSelectableModels(taskConfig);
    const compatibleModels = selectableModels.filter(model => modelSupportsSelectedFlow(steps, taskConfig, model));
    const explicitModel = typeof taskModel === 'string' && taskModel.trim().length > 0 ? taskModel.trim() : null;
    const defaultModel = providerTaskConfigDefaultModel(taskConfig);
    const fallbackModel = defaultModel && modelSupportsSelectedFlow(steps, taskConfig, defaultModel)
      ? defaultModel
      : compatibleModels[0] || null;

    if (explicitModel && !compatibleModels.some(model => model.toLowerCase() === explicitModel.toLowerCase())) {
      return {
        flowBinding,
        taskSelectionEnabled: true,
        providerSelectable: true,
        providerSelectionReason: null,
        modelSelectable: compatibleModels.length > 0,
        modelSelectionReason: compatibleModels.length > 0 ? null : 'This provider does not expose any flow-compatible task models to switch between.',
        reasoningSelectable: false,
        supportedReasoningLevels: [],
        reasoningSelectionReason: 'The selected task model does not satisfy this flow.',
        subagentsSelectable: false,
        subagentsSelectionReason: 'The selected task model does not satisfy this flow.',
        invalidReason: 'The selected task model does not satisfy this flow for the chosen provider.',
        usesTaskImages,
        usesTools,
        usesRagContext,
        modelOptions: compatibleModels,
        resolvedTaskModel: fallbackModel,
      };
    }

    const resolvedTaskModel = explicitModel || fallbackModel;
    if (!resolvedTaskModel) {
      return {
        flowBinding,
        taskSelectionEnabled: true,
        providerSelectable: true,
        providerSelectionReason: null,
        modelSelectable: false,
        modelSelectionReason: 'This provider does not expose any flow-compatible task models to switch between.',
        reasoningSelectable: false,
        supportedReasoningLevels: [],
        reasoningSelectionReason: 'The selected provider does not define a default task model that satisfies this flow.',
        subagentsSelectable: false,
        subagentsSelectionReason: 'The selected provider does not define a default task model that satisfies this flow.',
        invalidReason: 'The selected provider does not define a task model that satisfies this flow.',
        usesTaskImages,
        usesTools,
        usesRagContext,
        modelOptions: compatibleModels,
        resolvedTaskModel: null,
      };
    }

    const capability = providerTaskModelCapabilities(taskConfig, resolvedTaskModel);
    const supportedReasoningLevels = supportedReasoningLevelIntersection([capability]);
    return {
      flowBinding,
      taskSelectionEnabled: true,
      providerSelectable: true,
      providerSelectionReason: null,
      modelSelectable: compatibleModels.length > 0,
      modelSelectionReason: compatibleModels.length > 0
        ? null
        : 'This provider does not expose any flow-compatible task models to switch between.',
      reasoningSelectable: supportedReasoningLevels.length > 0,
      supportedReasoningLevels,
      reasoningSelectionReason: reasoningSelectionReason(supportedReasoningLevels, true),
      subagentsSelectable: capability.supports_subagents,
      subagentsSelectionReason: subagentsSelectionReason(capability.supports_subagents, true),
      invalidReason: null,
      usesTaskImages,
      usesTools,
      usesRagContext,
      modelOptions: compatibleModels,
      resolvedTaskModel,
    };
  }

  const mixed = resolveMixedProfileCapabilities(steps, taskConfig);
  const supportedReasoningLevels = supportedReasoningLevelIntersection(mixed.capabilities);
  const subagentsSelectable = mixed.capabilities.length > 0 && mixed.capabilities.every(capability => capability.supports_subagents);
  return {
    flowBinding,
    taskSelectionEnabled: true,
    providerSelectable: true,
    providerSelectionReason: null,
    modelSelectable: false,
    modelSelectionReason: 'This flow uses per-step model profiles, so task-level model selection is unavailable.',
    reasoningSelectable: supportedReasoningLevels.length > 0,
    supportedReasoningLevels,
    reasoningSelectionReason: mixed.invalidReason
      ? mixed.invalidReason
      : reasoningSelectionReason(supportedReasoningLevels, true),
    subagentsSelectable,
    subagentsSelectionReason: mixed.invalidReason
      ? mixed.invalidReason
      : subagentsSelectionReason(subagentsSelectable, true),
    invalidReason: mixed.invalidReason,
    usesTaskImages,
    usesTools,
    usesRagContext,
    modelOptions: [],
    resolvedTaskModel: providerTaskConfigDefaultModel(taskConfig),
  };
}
