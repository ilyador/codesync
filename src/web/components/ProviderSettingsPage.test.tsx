// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProviderSettingsPage } from './ProviderSettingsPage';
import { ModalContext, type ModalContextValue } from '../hooks/modal-context';
import type { EmbeddingProviderUpdateResponse, ProviderConfig, ProviderUpdateEmbeddingResponse } from '../lib/api';
import { defaultProviderTaskConfig } from '../../shared/provider-task-config';

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'provider-1',
    project_id: 'project-1',
    provider: 'custom',
    label: 'Local Embeddings',
    base_url: 'http://localhost:1234',
    is_enabled: true,
    supports_embeddings: true,
    embedding_model: 'text-embedding-test',
    task_config: defaultProviderTaskConfig('custom'),
    model_suggestions: [],
    models: [],
    status: 'online',
    status_message: 'ok',
    has_api_key: false,
    embedding_dimensions: 768,
    ...overrides,
  };
}

function renderPage(overrides: Partial<React.ComponentProps<typeof ProviderSettingsPage>> = {}) {
  const modalValue: ModalContextValue = {
    alert: vi.fn().mockResolvedValue(undefined),
    confirm: vi.fn().mockResolvedValue(false),
  };

  const props: React.ComponentProps<typeof ProviderSettingsPage> = {
    providers: [makeProvider()],
    embeddingProviderConfigId: 'provider-1',
    embeddingDimensions: 768,
    detectedLocalProviders: [],
    onCreateProvider: vi.fn().mockResolvedValue(undefined),
    onUpdateProvider: vi.fn().mockResolvedValue(makeProvider()),
    onDeleteProvider: vi.fn().mockResolvedValue(undefined),
    onTestProvider: vi.fn().mockResolvedValue({ ok: true, status: 'online', message: 'ok', models: [] }),
    onRefreshProviderModels: vi.fn().mockResolvedValue([]),
    onUpdateEmbeddingProvider: vi.fn().mockResolvedValue({
      embedding_provider_config_id: 'provider-1',
      embedding_dimensions: 768,
      detected_embedding_dimensions: 768,
      requires_reindex: false,
      updated: true,
      reindexed: null,
    } satisfies EmbeddingProviderUpdateResponse),
    onReindexDocuments: vi.fn().mockResolvedValue({ reindexed: 0 }),
    ...overrides,
  };

  const view = render(
    <ModalContext.Provider value={modalValue}>
      <ProviderSettingsPage {...props} />
    </ModalContext.Provider>,
  );

  return { ...view, props, modalValue };
}

describe('ProviderSettingsPage', () => {
  it('shows a modal alert when provider creation fails', async () => {
    const user = userEvent.setup();
    const onCreateProvider = vi.fn().mockRejectedValue(new Error('boom'));
    const { modalValue } = renderPage({ onCreateProvider });

    await user.click(screen.getByRole('button', { name: 'Add Provider' }));

    await waitFor(() => {
      expect(modalValue.alert).toHaveBeenCalledWith('Add Provider Failed', 'boom');
    });
  });

  it('prompts for reindex and retries the embedding-provider update with reindex enabled', async () => {
    const user = userEvent.setup();
    const onUpdateEmbeddingProvider = vi.fn()
      .mockResolvedValueOnce({
        embedding_provider_config_id: 'provider-1',
        requested_embedding_provider_config_id: 'provider-1',
        embedding_dimensions: 768,
        detected_embedding_dimensions: 1536,
        requires_reindex: true,
        updated: false,
        reindexed: null,
      } satisfies EmbeddingProviderUpdateResponse)
      .mockResolvedValueOnce({
        embedding_provider_config_id: 'provider-1',
        embedding_dimensions: 1536,
        detected_embedding_dimensions: 1536,
        requires_reindex: false,
        updated: true,
        reindexed: 4,
      } satisfies EmbeddingProviderUpdateResponse);
    const modalValue: ModalContextValue = {
      alert: vi.fn().mockResolvedValue(undefined),
      confirm: vi.fn().mockResolvedValue(true),
    };

    render(
      <ModalContext.Provider value={modalValue}>
        <ProviderSettingsPage
          providers={[makeProvider()]}
          embeddingProviderConfigId="provider-1"
          embeddingDimensions={768}
          detectedLocalProviders={[]}
          onCreateProvider={vi.fn().mockResolvedValue(undefined)}
          onUpdateProvider={vi.fn().mockResolvedValue(makeProvider())}
          onDeleteProvider={vi.fn().mockResolvedValue(undefined)}
          onTestProvider={vi.fn().mockResolvedValue({ ok: true, status: 'online', message: 'ok', models: [] })}
          onRefreshProviderModels={vi.fn().mockResolvedValue([])}
          onUpdateEmbeddingProvider={onUpdateEmbeddingProvider}
          onReindexDocuments={vi.fn().mockResolvedValue({ reindexed: 0 })}
        />
      </ModalContext.Provider>,
    );

    await user.click(screen.getByRole('button', { name: 'Save Embedding Provider' }));

    await waitFor(() => {
      expect(modalValue.confirm).toHaveBeenCalled();
      expect(onUpdateEmbeddingProvider).toHaveBeenNthCalledWith(1, 'provider-1');
      expect(onUpdateEmbeddingProvider).toHaveBeenNthCalledWith(2, 'provider-1', { reindexDocuments: true });
      expect(modalValue.alert).toHaveBeenCalledWith('Embedding Provider Updated', 'Saved the embedding provider and re-indexed 4 documents.');
    });
  });

  it('prompts for reindex and retries when saving the active embedding provider config', async () => {
    const user = userEvent.setup();
    const onUpdateProvider = vi.fn()
      .mockResolvedValueOnce({
        provider: makeProvider({ embedding_model: 'text-embedding-next' }),
        embedding_provider_config_id: 'provider-1',
        requested_embedding_provider_config_id: 'provider-1',
        embedding_dimensions: 768,
        detected_embedding_dimensions: 1536,
        requires_reindex: true,
        updated: false,
        reindexed: null,
      } satisfies ProviderUpdateEmbeddingResponse)
      .mockResolvedValueOnce({
        provider: makeProvider({ embedding_model: 'text-embedding-next' }),
        embedding_provider_config_id: 'provider-1',
        requested_embedding_provider_config_id: 'provider-1',
        embedding_dimensions: 1536,
        detected_embedding_dimensions: 1536,
        requires_reindex: false,
        updated: true,
        reindexed: 4,
      } satisfies ProviderUpdateEmbeddingResponse);
    const modalValue: ModalContextValue = {
      alert: vi.fn().mockResolvedValue(undefined),
      confirm: vi.fn().mockResolvedValue(true),
    };

    render(
      <ModalContext.Provider value={modalValue}>
        <ProviderSettingsPage
          providers={[makeProvider()]}
          embeddingProviderConfigId="provider-1"
          embeddingDimensions={768}
          detectedLocalProviders={[]}
          onCreateProvider={vi.fn().mockResolvedValue(undefined)}
          onUpdateProvider={onUpdateProvider}
          onDeleteProvider={vi.fn().mockResolvedValue(undefined)}
          onTestProvider={vi.fn().mockResolvedValue({ ok: true, status: 'online', message: 'ok', models: [] })}
          onRefreshProviderModels={vi.fn().mockResolvedValue([])}
          onUpdateEmbeddingProvider={vi.fn().mockResolvedValue({
            embedding_provider_config_id: 'provider-1',
            embedding_dimensions: 768,
            detected_embedding_dimensions: 768,
            requires_reindex: false,
            updated: true,
            reindexed: null,
          })}
          onReindexDocuments={vi.fn().mockResolvedValue({ reindexed: 0 })}
        />
      </ModalContext.Provider>,
    );

    await user.clear(screen.getAllByLabelText('Embedding Model')[1]);
    await user.type(screen.getAllByLabelText('Embedding Model')[1], 'text-embedding-next');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(modalValue.confirm).toHaveBeenCalled();
      expect(onUpdateProvider).toHaveBeenNthCalledWith(1, 'provider-1', expect.objectContaining({
        embedding_model: 'text-embedding-next',
      }));
      expect(onUpdateProvider).toHaveBeenNthCalledWith(2, 'provider-1', expect.objectContaining({
        embedding_model: 'text-embedding-next',
      }), { reindexDocuments: true });
      expect(modalValue.alert).toHaveBeenCalledWith('Provider Updated', 'Saved Local Embeddings and re-indexed 4 documents.');
    });
  });

  it('preserves unsaved task config edits when provider data reloads', async () => {
    const { rerender, props, modalValue } = renderPage();
    const draftText = '{"default_model":"qwen","balanced_model":"qwen","strong_model":"qwen","selectable_models":["qwen"],"model_capabilities":{"qwen":{"supports_tools":true,"supported_tools":[],"supports_images":false,"supports_reasoning":false,"supported_reasoning_levels":[],"supports_subagents":false,"context_window":null,"supports_structured_output":true}}}';

    const textarea = screen.getByLabelText('Task Config (JSON)');
    fireEvent.change(textarea, { target: { value: draftText } });

    rerender(
      <ModalContext.Provider value={modalValue}>
        <ProviderSettingsPage
          {...props}
          providers={[makeProvider({ models: ['qwen2.5-coder'], status_message: 'reloaded' })]}
        />
      </ModalContext.Provider>,
    );

    expect((screen.getByLabelText('Task Config (JSON)') as HTMLTextAreaElement).value).toBe(draftText);
  });

  it('sends the create-time task config instead of requiring a second provider edit', async () => {
    const user = userEvent.setup();
    const onCreateProvider = vi.fn().mockResolvedValue(undefined);
    renderPage({ onCreateProvider });

    const createTaskConfig = '{"default_model":"qwen2.5-coder","balanced_model":"qwen2.5-coder","strong_model":"qwen2.5-coder-32b","selectable_models":["qwen2.5-coder","qwen2.5-coder-32b"],"model_capabilities":{"qwen2.5-coder":{"supports_tools":true,"supported_tools":[],"supports_images":false,"supports_reasoning":true,"supported_reasoning_levels":["low","medium"],"supports_subagents":false,"context_window":null,"supports_structured_output":true},"qwen2.5-coder-32b":{"supports_tools":true,"supported_tools":[],"supports_images":false,"supports_reasoning":true,"supported_reasoning_levels":["low","medium","high"],"supports_subagents":false,"context_window":null,"supports_structured_output":true}}}';

    await user.type(screen.getAllByLabelText('Label')[0], 'Local Ollama');
    await user.clear(screen.getAllByLabelText('Base URL')[0]);
    await user.type(screen.getAllByLabelText('Base URL')[0], 'http://localhost:11434');
    fireEvent.change(screen.getByLabelText('Task Config Template (JSON)'), { target: { value: createTaskConfig } });
    await user.click(screen.getByRole('button', { name: 'Add Provider' }));

    await waitFor(() => {
      expect(onCreateProvider).toHaveBeenCalledWith(expect.objectContaining({
        label: 'Local Ollama',
        base_url: 'http://localhost:11434',
        task_config: expect.objectContaining({
          default_model: 'qwen2.5-coder',
          strong_model: 'qwen2.5-coder-32b',
          selectable_models: ['qwen2.5-coder', 'qwen2.5-coder-32b'],
        }),
      }));
    });
  });
});
