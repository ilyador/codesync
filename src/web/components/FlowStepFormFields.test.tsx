// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FlowStepFormFields } from './FlowStepFormFields';
import type { FlowStep, ProviderConfig } from '../lib/api';

function makeStep(overrides: Partial<FlowStep> = {}): FlowStep {
  return {
    id: 'step-1',
    name: 'Implement',
    position: 1,
    instructions: '',
    model: 'custom:gpt-4.1',
    provider_config_id: null,
    tools: [],
    context_sources: ['task_description'],
    is_gate: false,
    on_fail_jump_to: null,
    max_retries: 0,
    on_max_retries: 'pause',
    include_agents_md: true,
    ...overrides,
  };
}

function makeProvider(id: string, provider: ProviderConfig['provider'], overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id,
    project_id: 'project-1',
    provider,
    label: id,
    base_url: null,
    is_enabled: true,
    supports_embeddings: false,
    embedding_model: null,
    model_suggestions: [],
    models: [],
    status: 'online',
    status_message: 'ok',
    has_api_key: false,
    embedding_dimensions: null,
    ...overrides,
  };
}

describe('FlowStepFormFields', () => {
  it('stores the selected provider config id for flow-locked steps', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();

    render(
      <FlowStepFormFields
        step={makeStep()}
        providerBinding="flow_locked"
        providers={[
          makeProvider('provider-a', 'custom', { label: 'Local A', models: ['model-a'] }),
          makeProvider('provider-b', 'custom', { label: 'Local B', models: ['model-b'] }),
        ]}
        index={0}
        allSteps={[makeStep()]}
        isNew={false}
        onUpdate={onUpdate}
        onToggleTool={vi.fn()}
        onToggleContext={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getAllByRole('combobox')[0], 'provider-b');

    expect(onUpdate).toHaveBeenCalledWith({
      provider_config_id: 'provider-b',
      model: 'custom:model-b',
    });
  });

  it('infers the provider config id when only one flow-locked config matches the step model', async () => {
    const onUpdate = vi.fn();

    render(
      <FlowStepFormFields
        step={makeStep({ model: 'claude:sonnet' })}
        providerBinding="flow_locked"
        providers={[
          makeProvider('provider-1', 'claude', { label: 'Claude CLI', models: ['sonnet'] }),
        ]}
        index={0}
        allSteps={[makeStep({ model: 'claude:sonnet' })]}
        isNew={false}
        onUpdate={onUpdate}
        onToggleTool={vi.fn()}
        onToggleContext={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({ provider_config_id: 'provider-1' });
    });
  });
});
