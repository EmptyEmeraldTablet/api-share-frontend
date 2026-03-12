import { escapeHtml } from './ui';

export function renderModelList(
  listEl: HTMLElement,
  models: string[],
  current?: string,
): void {
  if (!models.length) {
    listEl.innerHTML = '';
    return;
  }
  listEl.innerHTML = models
    .map((model) => {
      const active = model === current ? 'true' : 'false';
      return `<button type="button" class="model-chip" data-model="${escapeHtml(model)}" data-active="${active}">${escapeHtml(model)}</button>`;
    })
    .join('');
}

export function renderModelSelect(
  selectEl: HTMLSelectElement,
  models: string[],
  options?: {
    preferred?: string;
    placeholder?: string;
    autoSelect?: boolean;
  },
): string | null {
  if (!models.length) {
    selectEl.innerHTML = '<option value="">未探测</option>';
    selectEl.disabled = true;
    return null;
  }

  const placeholder = options?.placeholder ?? '';
  const autoSelect = options?.autoSelect ?? true;
  const preferred = options?.preferred;

  const placeholderOption = placeholder
    ? `<option value="">${escapeHtml(placeholder)}</option>`
    : '';
  const optionsHtml = models
    .map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`)
    .join('');

  selectEl.innerHTML = `${placeholderOption}${optionsHtml}`;
  selectEl.disabled = false;

  if (!autoSelect) {
    selectEl.value = '';
    return null;
  }

  const selected = preferred && models.includes(preferred) ? preferred : models[0];
  selectEl.value = selected;
  return selected;
}

export function syncModelSelection(params: {
  models: string[];
  selectEl: HTMLSelectElement;
  inputEl?: HTMLInputElement;
  listEl?: HTMLElement;
}): void {
  if (!params.models.length) return;
  const current = params.inputEl ? params.inputEl.value.trim() : params.selectEl.value;
  if (params.models.includes(current)) {
    params.selectEl.value = current;
  } else if (params.inputEl) {
    params.selectEl.value = '';
  }

  if (params.listEl) {
    renderModelList(params.listEl, params.models, current);
  }
}
