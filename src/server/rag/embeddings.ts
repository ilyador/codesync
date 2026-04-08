import { embed as sdkEmbed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { getProjectProviderConfigs } from '../providers/registry.js';
import type { ProviderConfigRecord } from '../providers/types.js';
import { supabase } from '../supabase.js';

export function assertEmbeddingProviderUsable(config: ProviderConfigRecord, contextLabel = 'Embedding provider'): void {
  if (!config.is_enabled) {
    throw new Error(`${contextLabel} '${config.label}' is disabled`);
  }
  if (!config.supports_embeddings) {
    throw new Error(`${contextLabel} '${config.label}' is not configured for embeddings`);
  }
  if (!config.base_url) {
    throw new Error(`${contextLabel} '${config.label}' is missing a base URL`);
  }
  if (!config.embedding_model) {
    throw new Error(`${contextLabel} '${config.label}' is missing an embedding model`);
  }
}

function fallbackEmbeddingProvider(providerConfigs: ProviderConfigRecord[]): ProviderConfigRecord {
  const config = providerConfigs.find(config => (
    config.is_enabled
    && config.supports_embeddings
    && !!config.base_url
    && !!config.embedding_model
  ));
  if (!config) {
    throw new Error('No enabled embedding provider is configured for this project');
  }
  return config;
}

export async function resolveFallbackEmbeddingProvider(projectId: string): Promise<ProviderConfigRecord> {
  return fallbackEmbeddingProvider(await getProjectProviderConfigs(projectId));
}

export async function resolveProjectEmbeddingConfig(
  projectId: string,
  opts: { providerOverride?: ProviderConfigRecord | null } = {},
) {
  const { data: project, error } = await supabase
    .from('projects')
    .select('embedding_provider_config_id, embedding_dimensions')
    .eq('id', projectId)
    .single();
  if (error) throw new Error(`Failed to load project embedding settings: ${error.message}`);

  if (opts.providerOverride) {
    assertEmbeddingProviderUsable(opts.providerOverride, 'Selected embedding provider');
    return {
      provider: opts.providerOverride,
      storedDimensions: typeof project.embedding_dimensions === 'number' ? project.embedding_dimensions : null,
    };
  }

  const providerConfigs = await getProjectProviderConfigs(projectId);
  const selectedProviderId = typeof project.embedding_provider_config_id === 'string'
    ? project.embedding_provider_config_id
    : null;

  if (selectedProviderId) {
    const selected = providerConfigs.find(config => config.id === selectedProviderId);
    if (!selected) {
      throw new Error('Selected embedding provider is missing. Choose another provider in project settings.');
    }
    assertEmbeddingProviderUsable(selected, 'Selected embedding provider');
    return {
      provider: selected,
      storedDimensions: typeof project.embedding_dimensions === 'number' ? project.embedding_dimensions : null,
    };
  }

  return {
    provider: fallbackEmbeddingProvider(providerConfigs),
    storedDimensions: typeof project.embedding_dimensions === 'number' ? project.embedding_dimensions : null,
  };
}

async function persistEmbeddingDimensions(projectId: string, dimensions: number): Promise<void> {
  const { error } = await supabase.from('projects').update({ embedding_dimensions: dimensions }).eq('id', projectId);
  if (error) throw new Error(`Failed to persist embedding dimensions: ${error.message}`);
  await syncProjectEmbeddingIndex(projectId, dimensions);
}

export async function resetProjectEmbeddingDimensions(projectId: string): Promise<void> {
  const { error } = await supabase.from('projects').update({ embedding_dimensions: null }).eq('id', projectId);
  if (error) throw new Error(`Failed to reset embedding dimensions: ${error.message}`);
  await syncProjectEmbeddingIndex(projectId, null);
}

async function syncProjectEmbeddingIndex(projectId: string, dimensions: number | null): Promise<void> {
  const { error } = await supabase.rpc('sync_rag_chunks_project_embedding_index', {
    p_project_id: projectId,
    p_dimensions: dimensions,
  });
  if (error) throw new Error(`Failed to sync RAG embedding index: ${error.message}`);
}

export async function embed(
  projectId: string,
  input: string | string[],
  opts: { providerOverride?: ProviderConfigRecord | null } = {},
): Promise<number[][]> {
  const { provider, storedDimensions } = await resolveProjectEmbeddingConfig(projectId, opts);
  const client = createOpenAI({
    baseURL: provider.base_url!.endsWith('/v1') ? provider.base_url! : `${provider.base_url!.replace(/\/+$/, '')}/v1`,
    apiKey: provider.api_key || 'local-provider',
    name: `${provider.provider}-embedding`,
  });

  const embeddings = Array.isArray(input)
    ? (await embedMany({
      model: client.embedding(provider.embedding_model!),
      values: input,
      abortSignal: AbortSignal.timeout(30000),
    })).embeddings
    : [(await sdkEmbed({
      model: client.embedding(provider.embedding_model!),
      value: input,
      abortSignal: AbortSignal.timeout(30000),
    })).embedding];

  const nextDimensions = embeddings[0]?.length || 0;
  if (storedDimensions && nextDimensions && storedDimensions !== nextDimensions) {
    throw new Error(`Embedding dimensions changed from ${storedDimensions} to ${nextDimensions}. Re-index project documents before searching or ingesting.`);
  }
  if (!storedDimensions && nextDimensions) {
    await persistEmbeddingDimensions(projectId, nextDimensions);
  }

  return embeddings;
}
