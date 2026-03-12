export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'openai_compatible'
  | 'newapi'
  | 'deepseek'
  | 'moonshot'
  | 'zhipu'
  | 'qwen'
  | 'gemini'
  | 'groq';

export type ProviderMeta = {
  id: ProviderId;
  name: string;
  kind: 'openai' | 'anthropic' | 'gemini';
  defaultBaseUrl: string;
  defaultModel: string;
  supportsBalance: boolean;
};

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    supportsBalance: false,
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    kind: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-latest',
    supportsBalance: false,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'openai',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    supportsBalance: true,
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    kind: 'openai',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    supportsBalance: true,
  },
  {
    id: 'zhipu',
    name: 'Zhipu AI (GLM)',
    kind: 'openai',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4.5',
    supportsBalance: false,
  },
  {
    id: 'qwen',
    name: 'Tongyi Qwen (DashScope OpenAI-compatible)',
    kind: 'openai',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-turbo',
    supportsBalance: false,
  },
  {
    id: 'groq',
    name: 'Groq',
    kind: 'openai',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    supportsBalance: false,
  },
  {
    id: 'gemini',
    name: 'Google Gemini (OpenAI-compatible)',
    kind: 'openai',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    supportsBalance: false,
  },
  {
    id: 'newapi',
    name: 'NewAPI (OpenAI-compatible)',
    kind: 'openai',
    defaultBaseUrl: 'https://example.com/v1',
    defaultModel: 'gpt-4o-mini',
    supportsBalance: true,
  },
  {
    id: 'openai_compatible',
    name: 'OpenAI-compatible (custom)',
    kind: 'openai',
    defaultBaseUrl: 'https://example.com/v1',
    defaultModel: 'gpt-4o-mini',
    supportsBalance: false,
  },
];

export function getProviderMeta(id: ProviderId): ProviderMeta {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}
