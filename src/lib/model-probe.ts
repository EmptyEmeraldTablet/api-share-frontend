import { getProviderMeta, type ProviderId } from './providers';

export type ModelProbeResult = {
  baseUrl: string;
  models: string[];
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function buildCandidateBaseUrls(baseUrl: string): string[] {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith('/v1')) {
    const trimmed = normalized.replace(/\/v1$/, '');
    return dedupeStrings([normalized, trimmed]);
  }
  return dedupeStrings([normalized, `${normalized}/v1`]);
}

function extractModelIds(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const obj: any = raw;
  const data = Array.isArray(obj?.data) ? obj.data : [];
  const ids = data
    .map((item: any) => (typeof item?.id === 'string' ? item.id : null))
    .filter((id: string | null): id is string => Boolean(id));
  return dedupeStrings(ids);
}

async function tryOpenAIModels(baseUrl: string, key: string, signal?: AbortSignal): Promise<string[]> {
  const url = `${normalizeBaseUrl(baseUrl)}/models`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
    signal,
  });
  if (!res.ok) return [];
  const raw = await res.json().catch(() => null);
  return extractModelIds(raw);
}

async function tryAnthropicModels(baseUrl: string, key: string, signal?: AbortSignal): Promise<string[]> {
  const url = `${normalizeBaseUrl(baseUrl)}/models`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      Accept: 'application/json',
    },
    signal,
  });
  if (!res.ok) return [];
  const raw = await res.json().catch(() => null);
  return extractModelIds(raw);
}

export async function probeModels(input: {
  provider: ProviderId;
  baseUrl: string;
  keys: string[];
  signal?: AbortSignal;
}): Promise<ModelProbeResult | null> {
  const meta = getProviderMeta(input.provider);
  const candidates = buildCandidateBaseUrls(input.baseUrl);
  const keys = input.keys.slice(0, 3);

  for (const key of keys) {
    for (const candidate of candidates) {
      const models =
        meta.kind === 'anthropic'
          ? await tryAnthropicModels(candidate, key, input.signal)
          : await tryOpenAIModels(candidate, key, input.signal);
      if (models.length > 0) {
        return { baseUrl: candidate, models };
      }
    }
  }

  return null;
}
