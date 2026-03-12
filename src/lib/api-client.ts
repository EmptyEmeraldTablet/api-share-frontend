import type { ApiListResponse, SubmitPayload } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new Error('返回数据解析失败');
  }
}

export async function fetchKeys(params: {
  limit: number;
  offset: number;
}): Promise<ApiListResponse> {
  const response = await fetch(
    `${API_BASE}/api/keys?limit=${params.limit}&offset=${params.offset}`,
  );
  const payload = await readJson<ApiListResponse>(response);
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || '请求失败');
  }
  return payload;
}

export async function submitKey(payload: SubmitPayload): Promise<{ id: number | null }> {
  const response = await fetch(`${API_BASE}/api/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson<{ success: boolean; id?: number | null; error?: string }>(response);
  if (!response.ok || !data.success) {
    throw new Error(data.error || '提交失败');
  }
  return { id: data.id ?? null };
}

export async function sendFeedback(apiId: number, success: boolean): Promise<void> {
  const response = await fetch(`${API_BASE}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_id: apiId, success }),
  });
  const data = await readJson<{ success: boolean; error?: string }>(response);
  if (!response.ok || !data.success) {
    throw new Error(data.error || '反馈失败');
  }
}
