import { generateText, stepCountIs, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { registerAbortController, unregisterJobHandle, wasJobCanceled } from './process-control.js';
import { createAiSdkTools } from './tool-handlers.js';
import { isLocalApiProvider } from './model-id.js';
import type { ProviderDriver } from './types.js';

function providerBaseUrl(baseUrl: string | null): string {
  if (!baseUrl) throw new Error('Provider is missing a base_url');
  return baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl.replace(/\/+$/, '')}/v1`;
}

function defaultApiKey(provider: string): string {
  if (provider === 'ollama') return 'ollama';
  if (provider === 'lmstudio') return 'lmstudio';
  return 'local-provider';
}

function logStep(step: { text: string; toolCalls: Array<{ toolName?: string; input?: unknown }> }, onLog: (text: string) => void) {
  for (const call of step.toolCalls) {
    const name = call.toolName || 'tool';
    const input = call.input && typeof call.input === 'object' ? call.input as Record<string, unknown> : {};
    const ref = typeof input.file_path === 'string' ? input.file_path
      : typeof input.pattern === 'string' ? input.pattern
      : typeof input.path === 'string' ? input.path
      : typeof input.command === 'string' ? input.command.slice(0, 100)
      : '';
    onLog(`[${name}] ${ref}\n`);
  }
  if (step.text.trim()) onLog(`${step.text.trim()}\n`);
}

export const aiSdkDriver: ProviderDriver = {
  async run({ jobId, projectId, prompt, model, cwd, tools, providerConfig, onLog }) {
    const client = createOpenAI({
      baseURL: providerBaseUrl(providerConfig.base_url),
      apiKey: providerConfig.api_key || defaultApiKey(providerConfig.provider),
      name: providerConfig.provider,
    });
    const abortController = new AbortController();
    const handle = registerAbortController(jobId, abortController);
    const availableTools = createAiSdkTools({ cwd, projectId, enabledTools: tools });

    try {
      const hasTools = Object.keys(availableTools).length > 0;
      if (!hasTools) {
        const result = streamText({
          model: client(model),
          prompt,
          abortSignal: abortController.signal,
        });

        let output = '';
        for await (const chunk of result.textStream) {
          output += chunk;
          onLog(chunk);
        }
        return (await result.text) || output;
      }

      const result = await generateText({
        model: client(model),
        prompt,
        tools: availableTools,
        stopWhen: stepCountIs(isLocalApiProvider(providerConfig.provider) ? 10 : 12),
        abortSignal: abortController.signal,
        onStepFinish: (step) => logStep(step, onLog),
      });

      return result.text.trim();
    } catch (error) {
      if (wasJobCanceled(jobId)) throw new Error('Job canceled');
      throw error;
    } finally {
      unregisterJobHandle(jobId, handle);
    }
  },
};
