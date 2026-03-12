export type ApiKeyRecord = {
  id: number;
  provider: string | null;
  base_url: string;
  api_key: string;
  model: string | null;
  endpoint_suffix: string | null;
  validation_prompt: string | null;
  available_models: string[] | null;
  description: string | null;
  success_count: number;
  fail_count: number;
  created_at: string;
  last_checked: string;
};

export type ApiListResponse = {
  success: boolean;
  data: ApiKeyRecord[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
  error?: string;
};

export type TestConfig = {
  provider: string;
  baseUrl: string;
  model: string;
  endpointSuffix?: string;
  validationPrompt?: string;
  keys: string[];
  concurrency: number;
};

export type TestResult = {
  key: string;
  ok: boolean;
  status:
    | 'valid'
    | 'invalid'
    | 'rate_limited'
    | 'unknown_error'
    | 'low'
    | 'zero'
    | 'no_balance';
  message?: string;
  balance?: number;
  raw?: unknown;
};

export type ProbeResult = {
  ok: boolean;
  status: number;
  baseUrl: string;
  endpointPath: string;
  raw: unknown;
};

export type SubmitPayload = {
  provider: string;
  base_url: string;
  api_key: string;
  model: string;
  endpoint_suffix?: string;
  validation_prompt?: string;
  available_models?: string[];
  description?: string;
};
