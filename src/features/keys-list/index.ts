import type { ApiKeyRecord, TestResult } from '../../types';
import { fetchKeys, sendFeedback } from '../../lib/api-client';
import { resolveProviderLabel } from '../../lib/provider-ui';
import { escapeHtml, formatDate, maskKey, setStatus } from '../../lib/ui';
import { createStore } from '../../state/store';

type KeysListOptions = {
  onLocalTest: (record: ApiKeyRecord) => void;
};

type KeysState = {
  limit: number;
  offset: number;
  total: number;
  items: ApiKeyRecord[];
  loading: boolean;
};

type FeedbackState = {
  ok: boolean;
  status: TestResult['status'];
  testedAt: number;
  feedbackUsed: boolean;
};

export function initKeysList(options: KeysListOptions) {
  const elements = {
    list: document.getElementById('keys-list') as HTMLDivElement,
    status: document.getElementById('status') as HTMLDivElement,
    empty: document.getElementById('empty-state') as HTMLDivElement,
    loadMore: document.getElementById('load-more-btn') as HTMLButtonElement,
    statTotal: document.getElementById('stat-total') as HTMLSpanElement,
    statShown: document.getElementById('stat-shown') as HTMLSpanElement,
    statUpdated: document.getElementById('stat-updated') as HTMLSpanElement,
  };

  const keyStore = new Map<number, string>();
  const feedbackState = new Map<string, FeedbackState>();

  const store = createStore<KeysState>({
    limit: 50,
    offset: 0,
    total: 0,
    items: [],
    loading: false,
  });

  function setListStatus(message: string, tone: 'info' | 'error' | 'success' = 'info'): void {
    setStatus(elements.status, message, tone);
  }

  function formatModelList(models: string[] | null): string | null {
    if (!models || models.length === 0) return null;
    const max = 6;
    const head = models.slice(0, max);
    const suffix = models.length > max ? ` +${models.length - max}` : '';
    return `${head.join(', ')}${suffix}`;
  }

  function renderStats(state: KeysState): void {
    elements.statTotal.textContent = String(state.total);
    elements.statShown.textContent = String(state.items.length);
    elements.statUpdated.textContent = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date());
  }

  function renderList(state: KeysState): void {
    if (state.items.length === 0) {
      elements.list.innerHTML = '';
      elements.empty.style.display = 'block';
    } else {
      elements.empty.style.display = 'none';
    }

    keyStore.clear();

    const html = state.items
      .map((item) => {
        keyStore.set(item.id, item.api_key);
        const description = item.description ? escapeHtml(item.description) : '无描述';
        const providerLabel = resolveProviderLabel(item.provider);
        const modelLabel = item.model || '未填写';
        const endpointLabel = item.endpoint_suffix || '默认';
        const modelsLabel = formatModelList(item.available_models);
        const feedback = feedbackState.get(item.api_key);
        const canFeedback = Boolean(feedback && !feedback.feedbackUsed);
        const feedbackLabel = feedback
          ? feedback.feedbackUsed
            ? '已反馈'
            : '可反馈'
          : '未测试';
        const feedbackTitle = feedback
          ? feedback.feedbackUsed
            ? '已反馈'
            : '可提交反馈'
          : '请先完成本地测试';
        return `
          <div class="key-card" data-id="${item.id}" data-revealed="false">
            <div class="key-card__header">
              <div class="key-url">${escapeHtml(item.base_url)}</div>
              <button class="btn ghost tiny" data-action="reveal">显示 Key</button>
            </div>
            <div class="key-value">${escapeHtml(maskKey(item.api_key))}</div>
            <div class="key-meta">
              <div class="meta-tags">
                <span class="meta-tag">${escapeHtml(providerLabel)}</span>
                <span class="meta-tag">Model: ${escapeHtml(modelLabel)}</span>
                <span class="meta-tag">Endpoint: ${escapeHtml(endpointLabel)}</span>
              </div>
              ${modelsLabel ? `<div class="meta-desc">可用模型: ${escapeHtml(modelsLabel)}</div>` : ''}
              <div class="meta-desc">${description}</div>
            </div>
            <div class="key-stats">
              <span>成功 ${item.success_count}</span>
              <span>失败 ${item.fail_count}</span>
              <span>更新 ${formatDate(item.last_checked)}</span>
            </div>
            <div class="key-actions">
              <span class="meta-tag feedback-tag" data-state="${feedbackLabel}">${feedbackLabel}</span>
              <button class="btn subtle" data-action="test">本地验证</button>
              <button class="btn success" data-action="feedback" data-success="true" ${canFeedback ? '' : 'disabled'} title="${feedbackTitle}">可用</button>
              <button class="btn danger" data-action="feedback" data-success="false" ${canFeedback ? '' : 'disabled'} title="${feedbackTitle}">不可用</button>
            </div>
          </div>
        `;
      })
      .join('');

    elements.list.innerHTML = html;
    renderStats(state);

    const canLoadMore = state.items.length < state.total;
    elements.loadMore.disabled = !canLoadMore;
  }

  async function loadKeys(reset = false): Promise<void> {
    const state = store.getState();
    if (state.loading) return;

    store.update((prev) => ({
      ...prev,
      loading: true,
      offset: reset ? 0 : prev.offset,
      items: reset ? [] : prev.items,
    }));

    setListStatus('正在加载数据...', 'info');

    try {
      const payload = await fetchKeys({
        limit: state.limit,
        offset: reset ? 0 : state.offset,
      });

      store.update((prev) => ({
        ...prev,
        total: payload.pagination.total,
        offset: payload.pagination.offset + payload.data.length,
        items: reset ? payload.data : prev.items.concat(payload.data),
        loading: false,
      }));

      setListStatus('');
      renderList(store.getState());
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载失败';
      setListStatus(message, 'error');
      store.update((prev) => ({ ...prev, loading: false }));
    }
  }

  async function handleFeedback(item: ApiKeyRecord, success: boolean, button: HTMLButtonElement): Promise<void> {
    const state = store.getState();
    if (state.loading) return;
    const feedback = feedbackState.get(item.api_key);
    if (!feedback || feedback.feedbackUsed) {
      setListStatus('请先完成本地测试后再反馈。', 'error');
      return;
    }
    button.disabled = true;
    button.dataset.loading = 'true';
    setListStatus('反馈提交中...', 'info');

    try {
      await sendFeedback(item.id, success);
      const updated = state.items.map((entry) => {
        if (entry.id !== item.id) return entry;
        return {
          ...entry,
          success_count: entry.success_count + (success ? 1 : 0),
          fail_count: entry.fail_count + (success ? 0 : 1),
          last_checked: new Date().toISOString(),
        };
      });
      feedbackState.set(item.api_key, {
        ...feedback,
        feedbackUsed: true,
      });
      store.update((prev) => ({ ...prev, items: updated }));
      renderList(store.getState());
      setListStatus('反馈已记录。', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '反馈失败';
      setListStatus(message, 'error');
    } finally {
      button.disabled = false;
      delete button.dataset.loading;
    }
  }

  elements.loadMore.addEventListener('click', () => {
    void loadKeys(false);
  });

  elements.list.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const card = target.closest<HTMLElement>('.key-card');
    if (!card) return;
    const id = Number(card.dataset.id);
    if (!Number.isFinite(id)) return;

    if (target.matches('[data-action="reveal"]')) {
      const revealed = card.dataset.revealed === 'true';
      const key = keyStore.get(id) || '';
      const value = card.querySelector('.key-value');
      if (value) {
        value.textContent = revealed ? maskKey(key) : key;
      }
      card.dataset.revealed = revealed ? 'false' : 'true';
      (target as HTMLButtonElement).textContent = revealed ? '显示 Key' : '隐藏 Key';
      return;
    }

    if (target.matches('[data-action="test"]')) {
      const item = store.getState().items.find((entry) => entry.id === id);
      if (item) {
        options.onLocalTest(item);
      }
      return;
    }

    if (target.matches('[data-action="feedback"]')) {
      const success = target.getAttribute('data-success') === 'true';
      const item = store.getState().items.find((entry) => entry.id === id);
      if (item) {
        void handleFeedback(item, success, target as HTMLButtonElement);
      }
    }
  });

  loadKeys(true).catch(() => {
    // handled in loadKeys
  });

  return {
    reload: () => loadKeys(true),
    loadMore: () => loadKeys(false),
    updateTestResults: (results: TestResult[]) => {
      const now = Date.now();
      for (const result of results) {
        const key = result.key.trim();
        if (!key) continue;
        feedbackState.set(key, {
          ok: result.ok,
          status: result.status,
          testedAt: now,
          feedbackUsed: false,
        });
      }
      renderList(store.getState());
    },
    clearTestResults: () => {
      feedbackState.clear();
      renderList(store.getState());
    },
  };
}
