import { useEffect, useMemo, useState } from 'react';
import { BUILT_IN_TYPES } from '../lib/constants';
import type { Flow, ProviderConfig } from '../lib/api';
import { getFlowIdForType, getPreferredFlowId, type CustomTypeOption } from '../components/task-form-shared';
import type { EditTaskData, TaskFormData } from '../components/task-form-types';
import { useTaskImages } from './useTaskImages';
import { deriveFlowExecutionCapabilities } from '../../shared/flow-execution-capabilities';

interface UseTaskFormStateArgs {
  flows: Flow[];
  providers: ProviderConfig[];
  customTypes: CustomTypeOption[];
  defaultWorkstreamId?: string | null;
  editTask?: EditTaskData;
  onSaveCustomType?: (name: string, pipeline: string) => Promise<void>;
  onSubmit: (data: TaskFormData) => Promise<void>;
  onClose: () => void;
}

export function useTaskFormState({
  flows,
  providers = [],
  customTypes = [],
  defaultWorkstreamId,
  editTask,
  onSaveCustomType,
  onSubmit,
  onClose,
}: UseTaskFormStateArgs) {
  const isEdit = !!editTask;
  const editTypeIsCustom = isEdit && !BUILT_IN_TYPES.includes(editTask.type);
  const editTypeIsSavedCustom = editTypeIsCustom && customTypes.some(ct => ct.name === editTask.type);

  const [title, setTitle] = useState(editTask?.title || '');
  const [description, setDescription] = useState(editTask?.description || '');
  const [type, setType] = useState(
    editTypeIsSavedCustom ? editTask.type : (editTypeIsCustom ? 'feature' : (editTask?.type || 'feature')),
  );
  const [customType, setCustomType] = useState(editTypeIsCustom && !editTypeIsSavedCustom ? editTask.type : '');
  const [customPipeline, setCustomPipeline] = useState(() => {
    if (editTypeIsSavedCustom) {
      return customTypes.find(ct => ct.name === editTask.type)?.pipeline || 'feature';
    }
    return 'feature';
  });
  const [isCustomType, setIsCustomType] = useState(editTypeIsCustom && !editTypeIsSavedCustom);
  const [mode, setMode] = useState(editTask?.mode || 'ai');
  const [effort, setEffort] = useState(editTask?.effort || 'max');
  const [workstreamId, setWorkstreamId] = useState(editTask?.workstream_id || defaultWorkstreamId || '');
  const [assignee, setAssignee] = useState(editTask?.assignee || '');
  const [flowId, setFlowId] = useState(isEdit ? (editTask?.flow_id ?? '') : getPreferredFlowId(flows, 'feature'));
  const [providerConfigId, setProviderConfigId] = useState(editTask?.provider_config_id || '');
  const [providerModel, setProviderModel] = useState(editTask?.provider_model || '');
  const [multiagent, setMultiagent] = useState(editTask?.multiagent || 'auto');
  const [autoContinue, setAutoContinue] = useState(editTask?.auto_continue ?? true);
  const [priority, setPriority] = useState(editTask?.priority || 'backlog');
  const [chaining, setChaining] = useState(editTask?.chaining || 'none');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const matchingFlowId = getFlowIdForType(flows, type);
  const selectedFlow = flows.find(flow => flow.id === flowId) || null;
  const selectedFlowSupportsTaskSelection = mode === 'ai' && !assignee && !!selectedFlow;
  const providerEvaluations = useMemo(() => {
    if (!selectedFlowSupportsTaskSelection || !selectedFlow) return [];
    return providers
      .filter(provider => provider.is_enabled)
      .map(provider => ({
        provider,
        capabilities: deriveFlowExecutionCapabilities(selectedFlow, provider.task_config, null),
      }))
      .filter(result => !result.capabilities.invalidReason);
  }, [providers, selectedFlow, selectedFlowSupportsTaskSelection]);
  const taskSelectableProviders = providerEvaluations.map(result => result.provider);
  const selectedProvider = taskSelectableProviders.find(provider => provider.id === providerConfigId) || null;
  const selectedProviderBaseCapabilities = selectedProvider
    ? providerEvaluations.find(result => result.provider.id === selectedProvider.id)?.capabilities || null
    : null;
  const flowCapabilities = selectedFlowSupportsTaskSelection && selectedFlow
    ? deriveFlowExecutionCapabilities(selectedFlow, selectedProvider?.task_config ?? null, providerModel.trim() || null)
    : null;
  const providerSelectionEnabled = !!flowCapabilities?.providerSelectable;
  const modelSelectionEnabled = !!flowCapabilities?.modelSelectable;
  const reasoningSelectionEnabled = !!flowCapabilities?.reasoningSelectable;
  const subagentSelectionEnabled = !!flowCapabilities?.subagentsSelectable;
  const effectiveProviderModel = modelSelectionEnabled
    ? (providerModel.trim() || flowCapabilities?.resolvedTaskModel || '')
    : '';
  const executionSettingsLocked = !!editTask?.execution_settings_locked_at;

  useEffect(() => {
    if (isEdit || assignee || flowId || !matchingFlowId) return;
    setFlowId(matchingFlowId);
  }, [assignee, flowId, isEdit, matchingFlowId]);

  useEffect(() => {
    if (executionSettingsLocked) return;
    if (!providerSelectionEnabled) {
      if (providerConfigId) setProviderConfigId('');
      if (providerModel) setProviderModel('');
      if (effort !== 'low') setEffort('low');
      if (multiagent !== 'auto') setMultiagent('auto');
      return;
    }

    const fallbackProvider = taskSelectableProviders.length === 1 ? taskSelectableProviders[0] : null;
    if ((!providerConfigId || !selectedProvider) && fallbackProvider) {
      setProviderConfigId(fallbackProvider.id);
      const fallbackCapabilities = providerEvaluations.find(result => result.provider.id === fallbackProvider.id)?.capabilities || null;
      if (fallbackCapabilities?.modelSelectable) {
        const nextModel = fallbackCapabilities.resolvedTaskModel || fallbackCapabilities.modelOptions[0] || '';
        if (providerModel !== nextModel) setProviderModel(nextModel);
      }
      return;
    }

    if (providerConfigId && !selectedProvider) {
      setProviderConfigId('');
      if (providerModel) setProviderModel('');
      return;
    }

    if (selectedProvider && flowCapabilities?.invalidReason) {
      if (!selectedProviderBaseCapabilities && fallbackProvider && fallbackProvider.id !== selectedProvider.id) {
        setProviderConfigId(fallbackProvider.id);
        const fallbackCapabilities = providerEvaluations.find(result => result.provider.id === fallbackProvider.id)?.capabilities || null;
        setProviderModel(fallbackCapabilities?.modelSelectable ? (fallbackCapabilities.resolvedTaskModel || fallbackCapabilities.modelOptions[0] || '') : '');
        return;
      }

      if (selectedProviderBaseCapabilities?.modelSelectable) {
        const nextModel = selectedProviderBaseCapabilities.resolvedTaskModel || selectedProviderBaseCapabilities.modelOptions[0] || '';
        if (providerModel !== nextModel) {
          setProviderModel(nextModel);
          return;
        }
      }
    }

    if (!modelSelectionEnabled && providerModel) {
      setProviderModel('');
      return;
    }

    if (selectedProvider && modelSelectionEnabled) {
      const nextModel = flowCapabilities?.resolvedTaskModel || flowCapabilities?.modelOptions[0] || '';
      if (!providerModel.trim() && nextModel) {
        setProviderModel(nextModel);
        return;
      }
      if (providerModel.trim() && flowCapabilities?.invalidReason && nextModel) {
        setProviderModel(nextModel);
        return;
      }
    }

    if (reasoningSelectionEnabled && flowCapabilities && !flowCapabilities.supportedReasoningLevels.includes(effort as typeof flowCapabilities.supportedReasoningLevels[number])) {
      setEffort(flowCapabilities.supportedReasoningLevels[0] || 'low');
      return;
    }

    if (!reasoningSelectionEnabled && effort !== 'low') {
      setEffort('low');
    }
    if (!subagentSelectionEnabled && multiagent !== 'auto') {
      setMultiagent('auto');
    }
  }, [
    effort,
    modelSelectionEnabled,
    multiagent,
    providerConfigId,
    providerModel,
    providerSelectionEnabled,
    reasoningSelectionEnabled,
    selectedProvider,
    selectedProviderBaseCapabilities,
    subagentSelectionEnabled,
    taskSelectableProviders,
    providerEvaluations,
    executionSettingsLocked,
    flowCapabilities,
  ]);

  const imagesState = useTaskImages({
    initialImages: editTask?.images,
    onError: setError,
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;

    setError('');
    setLoading(true);

    if (!executionSettingsLocked && providerSelectionEnabled && taskSelectableProviders.length > 1 && !providerConfigId) {
      setError('Select a provider for this flow.');
      setLoading(false);
      return;
    }

    try {
      const resolvedType = isCustomType ? customType.trim().toLowerCase().replace(/\s+/g, '-') : type;
      if (isCustomType && customType.trim() && onSaveCustomType) {
        await onSaveCustomType(resolvedType, customPipeline);
      }
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        type: resolvedType,
        mode,
        effort: executionSettingsLocked
          ? (editTask?.effort || 'low')
          : (reasoningSelectionEnabled ? effort : 'low'),
        multiagent: executionSettingsLocked
          ? (editTask?.multiagent || 'auto')
          : (subagentSelectionEnabled ? multiagent : 'auto'),
        assignee: assignee || null,
        flow_id: flowId || null,
        provider_config_id: executionSettingsLocked
          ? (editTask?.provider_config_id || null)
          : (providerSelectionEnabled ? (providerConfigId || null) : null),
        provider_model: executionSettingsLocked
          ? (editTask?.provider_model || null)
          : (modelSelectionEnabled ? (effectiveProviderModel || null) : null),
        auto_continue: autoContinue,
        images: imagesState.images,
        workstream_id: workstreamId || null,
        priority,
        chaining,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEdit ? 'Failed to save task' : 'Failed to create task'));
    } finally {
      setLoading(false);
    }
  }

  return {
    isEdit,
    title,
    setTitle,
    description,
    setDescription,
    type,
    setType,
    customType,
    setCustomType,
    customPipeline,
    setCustomPipeline,
    isCustomType,
    setIsCustomType,
    assignee,
    setAssignee,
    flowId,
    setFlowId,
    providerConfigId,
    setProviderConfigId,
    providerModel,
    setProviderModel,
    selectedFlow,
    selectedProvider,
    taskSelectableProviders,
    flowCapabilities,
    providerSelectionEnabled,
    modelSelectionEnabled,
    reasoningSelectionEnabled,
    subagentSelectionEnabled,
    executionSettingsLocked,
    effort,
    setEffort,
    workstreamId,
    setWorkstreamId,
    priority,
    setPriority,
    multiagent,
    setMultiagent,
    autoContinue,
    setAutoContinue,
    chaining,
    setChaining,
    mode,
    setMode,
    loading,
    error,
    handleSubmit,
    imagesState,
    submitDisabled: loading
      || !title.trim()
      || (isCustomType && !customType.trim())
      || (!executionSettingsLocked && !!flowCapabilities?.invalidReason)
      || (!executionSettingsLocked && providerSelectionEnabled && taskSelectableProviders.length === 0),
    submitLabel: loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save' : 'Create'),
  };
}
