import { useEffect } from 'react';
import type { FlowStep, ProviderConfig } from '../lib/api';
import { MdField } from './MdField';
import {
  ALL_CONTEXT_SOURCES,
  ALL_TOOLS,
  ON_MAX_RETRIES_OPTIONS,
} from '../lib/constants';
import { defaultModelForProvider, formatModelId, isApiProvider, parseModelId } from '../lib/model-id';
import { isTaskSelectedFlow, type FlowProviderBinding } from '../../shared/flow-provider-binding';
import { inferTaskModelProfile, TASK_MODEL_PROFILE_OPTIONS } from '../../shared/flow-step-model';
import s from './FlowEditor.module.css';

interface FlowStepFormFieldsProps {
  step: FlowStep;
  providerBinding: FlowProviderBinding;
  providers: ProviderConfig[];
  index: number;
  allSteps: FlowStep[];
  isNew: boolean;
  onUpdate: (patch: Partial<FlowStep>) => void;
  onToggleTool: (tool: string) => void;
  onToggleContext: (source: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function FlowStepFormFields({
  step,
  providerBinding,
  providers,
  index,
  allSteps,
  isNew,
  onUpdate,
  onToggleTool,
  onToggleContext,
  onSave,
  onDelete,
  onClose,
}: FlowStepFormFieldsProps) {
  const taskSelectedFlow = isTaskSelectedFlow(providerBinding);
  const parsedModel = parseModelId(step.model);
  const availableProviders = providers.filter(provider =>
    provider.is_enabled
    || provider.id === step.provider_config_id
    || (!step.provider_config_id && provider.provider === parsedModel.provider)
  );
  const matchingProviders = availableProviders.filter(provider => provider.provider === parsedModel.provider);
  const inferredProvider = matchingProviders.length === 1 ? matchingProviders[0] : null;
  const selectedProvider = step.provider_config_id
    ? availableProviders.find(provider => provider.id === step.provider_config_id) || providers.find(provider => provider.id === step.provider_config_id)
    : inferredProvider;
  const selectedProviderId = taskSelectedFlow ? '' : (step.provider_config_id || inferredProvider?.id || '');
  const modelOptions = selectedProvider
    ? (selectedProvider.models.length > 0 ? selectedProvider.models : selectedProvider.model_suggestions)
    : [];
  const modelListId = `flow-step-model-${step.id}`;
  const taskProfile = inferTaskModelProfile(step.model) || 'balanced';
  const needsExplicitProviderSelection = !taskSelectedFlow && !step.provider_config_id && matchingProviders.length > 1;

  useEffect(() => {
    if (taskSelectedFlow) {
      if (step.provider_config_id) {
        onUpdate({ provider_config_id: null });
      }
      return;
    }
    if (!step.provider_config_id && inferredProvider) {
      onUpdate({ provider_config_id: inferredProvider.id });
    }
  }, [inferredProvider, onUpdate, step.provider_config_id, taskSelectedFlow]);

  function providerOptionLabel(provider: ProviderConfig): string {
    return provider.label === provider.provider
      ? `${provider.label} (${provider.provider})`
      : `${provider.label} · ${provider.provider}`;
  }

  return (
    <form onSubmit={event => event.preventDefault()} className={s.modalForm}>
      <input
        className={s.textInput}
        value={step.name}
        onChange={event => onUpdate({ name: event.target.value })}
        placeholder={`Step ${index + 1}`}
        autoFocus
      />

      <div className={s.field}>
        <label className={s.label}>Instructions</label>
        <MdField
          value={step.instructions}
          onChange={value => onUpdate({ instructions: value })}
          placeholder="What should the AI do in this step..."
        />
      </div>

      {taskSelectedFlow ? (
        <div className={s.field}>
          <label className={s.label}>Model Profile</label>
          <select
            className={s.select}
            value={taskProfile}
            onChange={event => onUpdate({ model: `task:${event.target.value}` })}
          >
            {TASK_MODEL_PROFILE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className={s.stepCount}>
            `Task model` exposes a task-level model picker. Profile options keep the flow provider-agnostic but assign per-step strength.
          </div>
        </div>
      ) : (
        <div className={s.field}>
          <label className={s.label}>Model</label>
          <div className={s.gateRow}>
            <div className={s.field}>
              <label className={s.label}>Provider Config</label>
              <select
                className={s.select}
                value={selectedProviderId}
                onChange={event => {
                  const provider = providers.find(candidate => candidate.id === event.target.value) || null;
                  if (!provider) {
                    onUpdate({ provider_config_id: null });
                    return;
                  }
                  const fallbackModel = (
                    provider.task_config.default_model
                    || provider.models[0]
                    || provider.model_suggestions[0]
                    || (provider.provider === parsedModel.provider ? parsedModel.model : '')
                    || defaultModelForProvider(provider.provider)
                  ).trim();
                  onUpdate({
                    provider_config_id: provider.id,
                    model: formatModelId(provider.provider, fallbackModel),
                  });
                }}
              >
                {!selectedProviderId && (
                  <option value="">Select provider config</option>
                )}
                <optgroup label="CLI">
                  {availableProviders.filter(provider => provider.provider === 'claude' || provider.provider === 'codex').map(provider => (
                    <option key={provider.id} value={provider.id}>{providerOptionLabel(provider)}</option>
                  ))}
                </optgroup>
                <optgroup label="OpenAI-Compatible">
                  {availableProviders.filter(provider => provider.provider !== 'claude' && provider.provider !== 'codex').map(provider => (
                    <option key={provider.id} value={provider.id}>{providerOptionLabel(provider)}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label}>Model Name</label>
              <input
                className={s.textInput}
                list={modelListId}
                value={parsedModel.model}
                onChange={event => onUpdate({
                  model: formatModelId(selectedProvider?.provider || parsedModel.provider, event.target.value),
                })}
                placeholder="sonnet / llama3 / gpt-5..."
              />
              <datalist id={modelListId}>
                {modelOptions.map(model => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </div>
          </div>
          {needsExplicitProviderSelection && (
            <div className={s.stepCount}>
              This project has multiple {parsedModel.provider} provider configs. Pick the exact config this step should use.
            </div>
          )}
          {!selectedProvider && (
            <div className={s.stepCount}>
              No configured provider matches this step yet. Select a provider config or add one in Provider Settings.
            </div>
          )}
          {selectedProvider && isApiProvider(selectedProvider.provider) && step.tools.length > 0 && (
            <div className={s.stepCount}>
              Tool-use runs in non-streaming mode for API-backed providers.
            </div>
          )}
        </div>
      )}

      <div className={s.field}>
        <label className={s.label}>Tools</label>
        <div className={s.checkboxGrid}>
          {ALL_TOOLS.map(tool => (
            <label key={tool} className={s.checkboxLabel}>
              <input type="checkbox" checked={step.tools.includes(tool)} onChange={() => onToggleTool(tool)} />
              {tool}
            </label>
          ))}
        </div>
      </div>

      <div className={s.field}>
        <label className={s.label}>Context Sources</label>
        <div className={s.chipGrid}>
          {ALL_CONTEXT_SOURCES.map(source => (
            <button
              key={source}
              type="button"
              className={`${s.chip} ${step.context_sources.includes(source) ? s.chipActive : ''}`}
              onClick={() => onToggleContext(source)}
            >
              {source}
            </button>
          ))}
        </div>
      </div>

      <label className={s.checkboxRow}>
        <input type="checkbox" checked={step.is_gate} onChange={event => onUpdate({ is_gate: event.target.checked })} />
        <span>Gate step (pass/fail verdict)</span>
      </label>

      {step.is_gate && (
        <div className={s.gateSection}>
          <div className={s.gateRow}>
            <div className={s.field}>
              <label className={s.label}>On fail jump to</label>
              <select
                className={s.select}
                value={step.on_fail_jump_to ?? ''}
                onChange={event => {
                  const value = event.target.value;
                  onUpdate({ on_fail_jump_to: value === '' ? null : Number(value) });
                }}
              >
                <option value="">None</option>
                {allSteps.map((candidate, candidateIndex) => candidateIndex !== index && (
                  <option key={candidate.id} value={candidateIndex + 1}>
                    Step {candidateIndex + 1}
                    {candidate.name ? ` - ${candidate.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label}>Max retries</label>
              <input
                className={s.textInput}
                type="number"
                min={0}
                max={10}
                value={step.max_retries}
                onChange={event => onUpdate({ max_retries: Number(event.target.value) || 0 })}
              />
            </div>
            <div className={s.field}>
              <label className={s.label}>On max retries</label>
              <select
                className={s.select}
                value={step.on_max_retries}
                onChange={event => onUpdate({ on_max_retries: event.target.value })}
              >
                {ON_MAX_RETRIES_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className={s.modalActions}>
        <button className="btn btnPrimary" type="button" onClick={onSave}>
          {isNew ? 'Create' : 'Save'}
        </button>
        <button className="btn btnSecondary" type="button" onClick={onClose}>
          Cancel
        </button>
        {!isNew && (
          <button
            className={`btn btnDanger btnSm ${s.modalDangerAction}`}
            type="button"
            onClick={onDelete}
          >
            Delete step
          </button>
        )}
      </div>
    </form>
  );
}
