import type { ProviderKind } from './model-id.js';

export interface ProviderConfigRecord {
  id: string;
  project_id: string;
  provider: ProviderKind;
  label: string;
  base_url: string | null;
  api_key: string | null;
  is_enabled: boolean;
  supports_embeddings: boolean;
  embedding_model: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProviderDriver {
  run(opts: {
    jobId: string;
    projectId: string;
    prompt: string;
    model: string;
    cwd: string;
    tools: string[];
    effort?: string;
    providerConfig: ProviderConfigRecord;
    onLog: (text: string) => void;
  }): Promise<string>;
}

export interface ProviderStatus {
  ok: boolean;
  status: 'online' | 'offline';
  message: string;
  models: string[];
  embedding_dimensions?: number | null;
}
