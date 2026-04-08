import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfigRecord } from '../providers/types.js';

const state = vi.hoisted(() => ({
  projectRow: {
    embedding_provider_config_id: 'provider-1' as string | null,
    embedding_dimensions: 768 as number | null,
  },
  providerConfigs: [] as ProviderConfigRecord[],
  projectUpdates: [] as Array<Record<string, unknown>>,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  nextEmbedding: [0.1, 0.2, 0.3],
}));

vi.mock('../providers/registry.js', () => ({
  getProjectProviderConfigs: vi.fn(async () => state.providerConfigs),
}));

vi.mock('../supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table !== 'projects') {
        throw new Error(`Unexpected table: ${table}`);
      }

      const selectChain = {
        select: vi.fn(() => selectChain),
        eq: vi.fn(() => selectChain),
        single: vi.fn(async () => ({ data: state.projectRow, error: null })),
      };

      return {
        ...selectChain,
        update: vi.fn((payload: Record<string, unknown>) => ({
          eq: vi.fn(async () => {
            state.projectRow = { ...state.projectRow, ...payload };
            state.projectUpdates.push(payload);
            return { error: null };
          }),
        })),
      };
    }),
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      return { data: null, error: null };
    }),
  },
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    embedding: (model: string) => model,
  })),
}));

vi.mock('ai', () => ({
  embed: vi.fn(async () => ({ embedding: state.nextEmbedding })),
  embedMany: vi.fn(async ({ values }: { values: string[] }) => ({
    embeddings: values.map(() => state.nextEmbedding),
  })),
}));

import { embed, resolveProjectEmbeddingConfig } from './embeddings.js';

function makeProvider(overrides: Partial<ProviderConfigRecord> = {}): ProviderConfigRecord {
  return {
    id: 'provider-1',
    project_id: 'project-1',
    provider: 'custom',
    label: 'Custom Embeddings',
    base_url: 'http://localhost:1234',
    api_key: null,
    is_enabled: true,
    supports_embeddings: true,
    embedding_model: 'text-embedding-test',
    ...overrides,
  };
}

describe('resolveProjectEmbeddingConfig', () => {
  beforeEach(() => {
    state.projectRow = {
      embedding_provider_config_id: 'provider-1',
      embedding_dimensions: 768,
    };
    state.providerConfigs = [];
    state.projectUpdates = [];
    state.rpcCalls = [];
    state.nextEmbedding = [0.1, 0.2, 0.3];
    vi.clearAllMocks();
  });

  it('rejects a selected provider that has been disabled', async () => {
    state.providerConfigs = [
      makeProvider({ is_enabled: false }),
    ];

    await expect(resolveProjectEmbeddingConfig('project-1')).rejects.toThrow("Selected embedding provider 'Custom Embeddings' is disabled");
  });

  it('rejects projects with no configured embedding provider', async () => {
    state.projectRow = {
      embedding_provider_config_id: null,
      embedding_dimensions: null,
    };

    await expect(resolveProjectEmbeddingConfig('project-1')).rejects.toThrow(
      'No enabled embedding provider is configured for this project',
    );
  });

  it('persists dimensions and syncs the project index when embeddings are first created', async () => {
    state.projectRow = {
      embedding_provider_config_id: null,
      embedding_dimensions: null,
    };

    await embed('project-1', 'hello world', { providerOverride: makeProvider() });

    expect(state.projectUpdates).toContainEqual({ embedding_dimensions: 3 });
    expect(state.rpcCalls).toContainEqual({
      fn: 'sync_rag_chunks_project_embedding_index',
      args: {
        p_project_id: 'project-1',
        p_dimensions: 3,
      },
    });
  });
});
