import { getProviderMeta, type ProviderId } from './providers';

export type CheckRequest = {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  keys: string[];
  concurrency: number;
  validationPrompt?: string;
  endpointSuffix?: string;
  lowThreshold?: number; // for status classification
  enableStream?: boolean;
  signal?: AbortSignal;
};

export type CheckResult = {
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
  balance?: number; // -1 means unavailable
  raw?: unknown;
};

export type ProbeResult = {
  ok: boolean;
  status: number;
  raw: unknown;
  baseUrl: string;
  endpointPath: string;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '');
}

function normalizeEndpointSuffix(suffix?: string) {
  const trimmed = suffix?.trim() ?? '';
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function resolveEndpointPath(kind: 'openai' | 'anthropic' | 'gemini', endpointSuffix?: string) {
  const normalized = normalizeEndpointSuffix(endpointSuffix);
  if (normalized) return normalized;
  return kind === 'anthropic' ? '/messages' : '/chat/completions';
}

function shouldTryV1Fallback(baseUrl: string, endpointPath: string, res: Response) {
  if (normalizeBaseUrl(baseUrl).endsWith('/v1')) return false;
  const path = endpointPath.toLowerCase();
  if (path.includes('/v1')) return false;
  return res.status === 404 || res.status === 405;
}

async function readBody(res: Response) {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorInfo(raw: unknown): { message?: string; code?: string; type?: string } {
  if (!raw) return {};
  if (typeof raw === 'string') return { message: raw };
  if (typeof raw !== 'object') return { message: String(raw) };

  const obj: any = raw;
  const err = obj?.error ?? obj?.err ?? (Array.isArray(obj?.errors) ? obj.errors[0] : undefined);

  const message =
    (typeof err?.message === 'string' && err.message) ||
    (typeof obj?.message === 'string' && obj.message) ||
    (typeof err === 'string' && err) ||
    (typeof obj?.error === 'string' && obj.error) ||
    (typeof obj?.error_message === 'string' && obj.error_message) ||
    (typeof obj?.error_msg === 'string' && obj.error_msg);

  const code =
    (typeof err?.code === 'string' && err.code) ||
    (typeof obj?.code === 'string' && obj.code) ||
    (typeof obj?.error_code === 'string' && obj.error_code);

  const type =
    (typeof err?.type === 'string' && err.type) ||
    (typeof obj?.type === 'string' && obj.type);

  return { message, code, type };
}

function classifyError(res: Response, raw: unknown) {
  if (res.status === 401 || res.status === 403) return 'invalid' as const;
  if (res.status === 429) return 'rate_limited' as const;
  if (res.status >= 400 && res.status < 500) return 'invalid' as const;

  const info = extractErrorInfo(raw);
  const text = [info.message, info.code, info.type].filter(Boolean).join(' ').toLowerCase();
  if (text.includes('rate limit') || text.includes('too many requests') || text.includes('quota')) return 'rate_limited' as const;
  if (text.includes('invalid') || text.includes('unauthorized') || text.includes('authentication') || text.includes('api key') || text.includes('apikey')) {
    return 'invalid' as const;
  }
  return 'unknown_error' as const;
}

function isErrorPayload(raw: unknown) {
  if (!raw || typeof raw !== 'object') return false;
  const obj: any = raw;
  if (obj.error || obj.err) return true;
  if (obj.object === 'error') return true;
  if (obj.type === 'error') return true;
  if (Array.isArray(obj.errors) && obj.errors.length > 0) return true;
  return false;
}

function isOpenAIChatResponse(raw: unknown) {
  if (!raw || typeof raw !== 'object') return false;
  const obj: any = raw;
  return Array.isArray(obj.choices) && obj.choices.length > 0;
}

function isOpenAIResponsesResponse(raw: unknown) {
  if (!raw || typeof raw !== 'object') return false;
  const obj: any = raw;
  if (obj.object === 'response') return true;
  if (typeof obj.output_text === 'string') return true;
  if (Array.isArray(obj.output) && obj.output.length > 0) return true;
  return false;
}

function isAnthropicMessageResponse(raw: unknown) {
  if (!raw || typeof raw !== 'object') return false;
  const obj: any = raw;
  if (obj.type === 'message') return true;
  return Array.isArray(obj.content) && obj.content.length > 0;
}

type OpenAIEndpointKind = 'chat' | 'responses' | 'completions' | 'other';

function getOpenAIEndpointKind(endpointPath: string): OpenAIEndpointKind {
  const p = endpointPath.toLowerCase();
  if (p.endsWith('/responses')) return 'responses';
  if (p.endsWith('/chat/completions')) return 'chat';
  if (p.endsWith('/completions')) return 'completions';
  return 'other';
}

function buildOpenAIRequestBody(kind: OpenAIEndpointKind, req: { model: string; prompt?: string }) {
  const prompt = req.prompt || 'Hi';
  if (kind === 'responses') {
    return {
      model: req.model,
      input: prompt,
      max_output_tokens: 16,
      stream: false,
    };
  }
  if (kind === 'completions') {
    return {
      model: req.model,
      prompt,
      max_tokens: 16,
      stream: false,
    };
  }
  return {
    model: req.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1,
    stream: false,
  };
}

function isOpenAIResponseOk(raw: unknown, kind: OpenAIEndpointKind) {
  if (isErrorPayload(raw)) return false;
  if (kind === 'responses') return isOpenAIResponsesResponse(raw) || isOpenAIChatResponse(raw) || raw != null;
  if (kind === 'chat' || kind === 'completions') return isOpenAIChatResponse(raw) || raw != null;
  return true;
}

async function checkOpenAICompatibleKey(req: {
  baseUrl: string;
  model: string;
  key: string;
  prompt?: string;
  endpointSuffix?: string;
  signal?: AbortSignal;
}) {
  const endpointPath = resolveEndpointPath('openai', req.endpointSuffix);
  const endpointKind = getOpenAIEndpointKind(endpointPath);

  async function requestOnce(baseUrl: string) {
    const url = `${normalizeBaseUrl(baseUrl)}${endpointPath}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.key}`,
      },
      body: JSON.stringify(buildOpenAIRequestBody(endpointKind, req)),
      signal: req.signal,
    });
    const raw = await readBody(res);
    return { res, raw };
  }

  const primary = await requestOnce(req.baseUrl);
  const primaryOk = primary.res.ok && isOpenAIResponseOk(primary.raw, endpointKind);
  if (primaryOk) return { ok: true as const, raw: primary.raw };

  if (shouldTryV1Fallback(req.baseUrl, endpointPath, primary.res)) {
    const fallback = await requestOnce(`${normalizeBaseUrl(req.baseUrl)}/v1`);
    const fallbackOk = fallback.res.ok && isOpenAIResponseOk(fallback.raw, endpointKind);
    if (fallbackOk) return { ok: true as const, raw: fallback.raw };
    return { ok: false as const, status: classifyError(fallback.res, fallback.raw), raw: fallback.raw };
  }

  return { ok: false as const, status: classifyError(primary.res, primary.raw), raw: primary.raw };
}

async function checkAnthropicKey(req: {
  baseUrl: string;
  model: string;
  key: string;
  prompt?: string;
  endpointSuffix?: string;
  signal?: AbortSignal;
}) {
  const endpointPath = resolveEndpointPath('anthropic', req.endpointSuffix);

  async function requestOnce(baseUrl: string) {
    const url = `${normalizeBaseUrl(baseUrl)}${endpointPath}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': req.key,
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: req.prompt || 'Hi' }],
      }),
      signal: req.signal,
    });
    const raw = await readBody(res);
    return { res, raw };
  }

  const primary = await requestOnce(req.baseUrl);
  const primaryOk = primary.res.ok && !isErrorPayload(primary.raw);
  if (primaryOk) return { ok: true as const, raw: primary.raw };

  if (shouldTryV1Fallback(req.baseUrl, endpointPath, primary.res)) {
    const fallback = await requestOnce(`${normalizeBaseUrl(req.baseUrl)}/v1`);
    const fallbackOk = fallback.res.ok && !isErrorPayload(fallback.raw);
    if (fallbackOk) return { ok: true as const, raw: fallback.raw };
    return { ok: false as const, status: classifyError(fallback.res, fallback.raw), raw: fallback.raw };
  }

  return { ok: false as const, status: classifyError(primary.res, primary.raw), raw: primary.raw };
}

async function probeOpenAICompatibleKey(req: {
  baseUrl: string;
  model: string;
  key: string;
  prompt?: string;
  endpointSuffix?: string;
  signal?: AbortSignal;
}): Promise<ProbeResult> {
  const endpointPath = resolveEndpointPath('openai', req.endpointSuffix);
  const endpointKind = getOpenAIEndpointKind(endpointPath);
  const normalizedBaseUrl = normalizeBaseUrl(req.baseUrl);

  async function requestOnce(baseUrl: string) {
    const url = `${normalizeBaseUrl(baseUrl)}${endpointPath}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.key}`,
      },
      body: JSON.stringify(buildOpenAIRequestBody(endpointKind, req)),
      signal: req.signal,
    });
    const raw = await readBody(res);
    return { res, raw };
  }

  const primary = await requestOnce(normalizedBaseUrl);
  if (primary.res.status === 200) {
    return {
      ok: true,
      status: primary.res.status,
      raw: primary.raw,
      baseUrl: normalizedBaseUrl,
      endpointPath,
    };
  }

  if (shouldTryV1Fallback(normalizedBaseUrl, endpointPath, primary.res)) {
    const fallbackBaseUrl = `${normalizedBaseUrl}/v1`;
    const fallback = await requestOnce(fallbackBaseUrl);
    if (fallback.res.status === 200) {
      return {
        ok: true,
        status: fallback.res.status,
        raw: fallback.raw,
        baseUrl: fallbackBaseUrl,
        endpointPath,
      };
    }
    return {
      ok: false,
      status: fallback.res.status,
      raw: fallback.raw,
      baseUrl: fallbackBaseUrl,
      endpointPath,
    };
  }

  return {
    ok: false,
    status: primary.res.status,
    raw: primary.raw,
    baseUrl: normalizedBaseUrl,
    endpointPath,
  };
}

async function probeAnthropicKey(req: {
  baseUrl: string;
  model: string;
  key: string;
  prompt?: string;
  endpointSuffix?: string;
  signal?: AbortSignal;
}): Promise<ProbeResult> {
  const endpointPath = resolveEndpointPath('anthropic', req.endpointSuffix);
  const normalizedBaseUrl = normalizeBaseUrl(req.baseUrl);

  async function requestOnce(baseUrl: string) {
    const url = `${normalizeBaseUrl(baseUrl)}${endpointPath}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': req.key,
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: req.prompt || 'Hi' }],
      }),
      signal: req.signal,
    });
    const raw = await readBody(res);
    return { res, raw };
  }

  const primary = await requestOnce(normalizedBaseUrl);
  if (primary.res.status === 200) {
    return {
      ok: true,
      status: primary.res.status,
      raw: primary.raw,
      baseUrl: normalizedBaseUrl,
      endpointPath,
    };
  }

  if (shouldTryV1Fallback(normalizedBaseUrl, endpointPath, primary.res)) {
    const fallbackBaseUrl = `${normalizedBaseUrl}/v1`;
    const fallback = await requestOnce(fallbackBaseUrl);
    if (fallback.res.status === 200) {
      return {
        ok: true,
        status: fallback.res.status,
        raw: fallback.raw,
        baseUrl: fallbackBaseUrl,
        endpointPath,
      };
    }
    return {
      ok: false,
      status: fallback.res.status,
      raw: fallback.raw,
      baseUrl: fallbackBaseUrl,
      endpointPath,
    };
  }

  return {
    ok: false,
    status: primary.res.status,
    raw: primary.raw,
    baseUrl: normalizedBaseUrl,
    endpointPath,
  };
}

async function checkBalance(provider: ProviderId, baseUrl: string, key: string, signal?: AbortSignal): Promise<number> {
  // Best-effort, only for providers where this is known to work.
  if (provider === 'deepseek') {
    const url = `${normalizeBaseUrl(baseUrl).replace(/\/v1$/, '')}/user/balance`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, signal });
    if (!res.ok) return -1;
    const d: any = await res.json().catch(() => null);
    const info = d?.balance_infos?.find((b: any) => b.currency === 'USD') || d?.balance_infos?.[0];
    const bal = info?.total_balance;
    const n = Number(bal);
    return Number.isFinite(n) ? n : -1;
  }

  if (provider === 'moonshot') {
    const url = `${normalizeBaseUrl(baseUrl)}/users/me/balance`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal });
    if (!res.ok) return -1;
    const d: any = await res.json().catch(() => null);
    const n = Number(d?.data?.available_balance);
    return Number.isFinite(n) ? n : -1;
  }

  if (provider === 'newapi') {
    const url = `${normalizeBaseUrl(baseUrl).replace(/\/v1$/, '')}/api/usage/token`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal });
    if (!res.ok) return -1;
    const d: any = await res.json().catch(() => null);
    if (d?.code === true && d?.data) {
      const tokenToUsdRate = 500000;
      const availableUsd = Number((d.data.total_available / tokenToUsdRate).toFixed(2));
      return Number.isFinite(availableUsd) ? availableUsd : -1;
    }
    return -1;
  }

  return -1;
}

export async function checkOne(input: {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  key: string;
  prompt?: string;
  endpointSuffix?: string;
  lowThreshold?: number;
  signal?: AbortSignal;
}): Promise<CheckResult> {
  const meta = getProviderMeta(input.provider);

  let result:
    | { ok: true; raw: unknown }
    | { ok: false; status: CheckResult['status']; raw: unknown };

  if (meta.kind === 'anthropic') {
    result = await checkAnthropicKey({
      baseUrl: input.baseUrl,
      model: input.model,
      key: input.key,
      prompt: input.prompt,
      endpointSuffix: input.endpointSuffix,
      signal: input.signal,
    });
  } else {
    result = await checkOpenAICompatibleKey({
      baseUrl: input.baseUrl,
      model: input.model,
      key: input.key,
      prompt: input.prompt,
      endpointSuffix: input.endpointSuffix,
      signal: input.signal,
    });
  }

  if (result.ok) {
    const balance = meta.supportsBalance ? await checkBalance(input.provider, input.baseUrl, input.key, input.signal) : undefined;
    return { key: input.key, ok: true, status: 'valid', balance, raw: result.raw };
  }

  const errorInfo = extractErrorInfo(result.raw);
  const fallbackMessage = result.status === 'invalid' ? 'error.invalid' : result.status === 'rate_limited' ? 'error.rateLimited' : 'error.failed';

  return {
    key: input.key,
    ok: false,
    status: result.status,
    message: errorInfo.message || errorInfo.code || fallbackMessage,
    raw: result.raw,
  };
}

export async function probeOne(input: {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  key: string;
  prompt?: string;
  endpointSuffix?: string;
  signal?: AbortSignal;
}): Promise<ProbeResult> {
  const meta = getProviderMeta(input.provider);

  if (meta.kind === 'anthropic') {
    return await probeAnthropicKey({
      baseUrl: input.baseUrl,
      model: input.model,
      key: input.key,
      prompt: input.prompt,
      endpointSuffix: input.endpointSuffix,
      signal: input.signal,
    });
  }

  return await probeOpenAICompatibleKey({
    baseUrl: input.baseUrl,
    model: input.model,
    key: input.key,
    prompt: input.prompt,
    endpointSuffix: input.endpointSuffix,
    signal: input.signal,
  });
}

export function parseKeys(text: string): string[] {
  const parts = text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  // de-dup preserve order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}
