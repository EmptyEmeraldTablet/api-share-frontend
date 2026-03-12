import { PROVIDERS, type ProviderId } from './providers';
import { escapeHtml } from './ui';

export function renderProviderOptions(
  select: HTMLSelectElement,
  defaultId: ProviderId = 'openai',
): void {
  const options = PROVIDERS.map((provider) => {
    return `<option value="${provider.id}">${escapeHtml(provider.name)}</option>`;
  }).join('');
  select.innerHTML = options;
  select.value = defaultId;
}

export function resolveProviderLabel(providerId: string | null): string {
  if (!providerId) return '未知';
  const match = PROVIDERS.find((provider) => provider.id === providerId);
  return match ? match.name : providerId;
}
