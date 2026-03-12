import type { ApiKeyRecord, TestResult } from '../../types';
import { checkOne, parseKeys } from '../../lib/checkers';
import { probeModels } from '../../lib/model-probe';
import { renderProviderOptions } from '../../lib/provider-ui';
import { getProviderMeta, PROVIDERS, type ProviderId } from '../../lib/providers';
import { renderModelList, renderModelSelect, syncModelSelection } from '../../lib/model-selector';
import { clampNumber, normalizeEndpointSuffix, setStatus } from '../../lib/ui';
import { renderTestBlocks } from './render';

type TestConsoleApi = {
  prefillFromRecord: (record: ApiKeyRecord) => void;
};

const MAX_KEYS = 10;
const MAX_CONCURRENCY = 5;

type TestConsoleOptions = {
  onResults?: (results: TestResult[]) => void;
  onClear?: () => void;
};

export function initTestConsole(options: TestConsoleOptions = {}): TestConsoleApi {
  const elements = {
    form: document.getElementById('test-form') as HTMLFormElement,
    provider: document.getElementById('test-provider') as HTMLSelectElement,
    baseUrl: document.getElementById('test-base-url') as HTMLInputElement,
    model: document.getElementById('test-model') as HTMLInputElement,
    modelSelect: document.getElementById('test-model-select') as HTMLSelectElement,
    modelList: document.getElementById('test-model-list') as HTMLDivElement,
    endpoint: document.getElementById('test-endpoint') as HTMLInputElement,
    concurrency: document.getElementById('test-concurrency') as HTMLInputElement,
    lowThreshold: document.getElementById('test-low') as HTMLInputElement,
    prompt: document.getElementById('test-prompt') as HTMLTextAreaElement,
    keys: document.getElementById('test-keys') as HTMLTextAreaElement,
    run: document.getElementById('test-run-btn') as HTMLButtonElement,
    stop: document.getElementById('test-stop-btn') as HTMLButtonElement,
    models: document.getElementById('test-models-btn') as HTMLButtonElement,
    clearInfo: document.getElementById('test-clear-info-btn') as HTMLButtonElement,
    clear: document.getElementById('test-clear-btn') as HTMLButtonElement,
    status: document.getElementById('test-status') as HTMLDivElement,
    summary: document.getElementById('test-summary') as HTMLDivElement,
    results: document.getElementById('test-results') as HTMLDivElement,
  };

  const modelState = {
    loading: false,
    models: [] as string[],
  };

  const testState = {
    running: false,
    controller: null as AbortController | null,
    results: [] as TestResult[],
    runToken: 0,
  };

  function setTestStatus(message: string, tone: 'info' | 'error' | 'success' = 'info'): void {
    setStatus(elements.status, message, tone);
  }

  function applyProviderDefaults(providerId: ProviderId, keepBaseUrl = false): void {
    const meta = getProviderMeta(providerId);
    if (!keepBaseUrl) {
      elements.baseUrl.value = meta.defaultBaseUrl;
    }
    elements.model.value = meta.defaultModel;
    modelState.models = [];
    renderModelList(elements.modelList, []);
    renderModelSelect(elements.modelSelect, []);
  }

  async function fetchModels(): Promise<void> {
    if (modelState.loading) return;
    if (testState.running) {
      setTestStatus('测试进行中，无法探测模型。', 'error');
      return;
    }

    const provider = elements.provider.value as ProviderId;
    const baseUrl = elements.baseUrl.value.trim();
    const keys = parseKeys(elements.keys.value);
    if (!baseUrl) {
      setTestStatus('Base URL 不能为空', 'error');
      return;
    }
    if (keys.length === 0) {
      setTestStatus('请输入待测试的 API Key', 'error');
      return;
    }

    modelState.loading = true;
    elements.models.disabled = true;
    setTestStatus('正在探测模型...', 'info');

    try {
      const found = await probeModels({ provider, baseUrl, keys });
      if (!found) {
        modelState.models = [];
        renderModelList(elements.modelList, []);
        renderModelSelect(elements.modelSelect, []);
        setTestStatus('无法获取模型列表。', 'error');
        return;
      }

      modelState.models = found.models;
      const selected = renderModelSelect(elements.modelSelect, found.models, {
        preferred: elements.model.value.trim(),
        autoSelect: true,
      });

      if (found.baseUrl !== baseUrl) {
        elements.baseUrl.value = found.baseUrl;
      }

      if (selected) {
        elements.model.value = selected;
      }

      renderModelList(elements.modelList, found.models, elements.model.value.trim());
      setTestStatus('模型探测完成', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '模型探测失败';
      setTestStatus(message, 'error');
    } finally {
      modelState.loading = false;
      elements.models.disabled = false;
    }
  }

  function normalizeErrorRaw(error: unknown): unknown {
    if (error instanceof Error) {
      return { name: error.name, message: error.message };
    }
    return error;
  }

  async function runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
    signal?: AbortSignal,
  ): Promise<R[]> {
    const results: Array<R | undefined> = new Array(items.length);
    let cursor = 0;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        if (signal?.aborted) return;
        const index = cursor++;
        results[index] = await fn(items[index], index);
      }
    });

    await Promise.all(workers);
    return results.filter((item): item is R => item !== undefined);
  }

  async function runTests(): Promise<void> {
    if (testState.running) return;

    const provider = elements.provider.value as ProviderId;
    const baseUrl = elements.baseUrl.value.trim();
    const model = elements.model.value.trim();
    const endpointSuffixRaw = elements.endpoint.value;
    const endpointSuffix = normalizeEndpointSuffix(endpointSuffixRaw);
    if (endpointSuffix && endpointSuffix !== endpointSuffixRaw.trim()) {
      elements.endpoint.value = endpointSuffix;
    }
    const prompt = elements.prompt.value.trim() || undefined;
    const lowThresholdRaw = Number(elements.lowThreshold.value);
    const lowThreshold =
      Number.isFinite(lowThresholdRaw) && lowThresholdRaw > 0 ? lowThresholdRaw : undefined;

    if (!baseUrl) {
      setTestStatus('Base URL 不能为空', 'error');
      return;
    }
    if (!model) {
      setTestStatus('Model 不能为空', 'error');
      return;
    }

    const keys = parseKeys(elements.keys.value);
    if (keys.length === 0) {
      setTestStatus('请输入待测试的 API Key', 'error');
      return;
    }
    if (keys.length > MAX_KEYS) {
      setTestStatus(`一次最多测试 ${MAX_KEYS} 个 Key`, 'error');
      return;
    }

    const concurrency = clampNumber(Number(elements.concurrency.value) || 1, 1, MAX_CONCURRENCY);

    setTestStatus('测试中...', 'info');
    testState.running = true;
    const runToken = ++testState.runToken;
    const controller = new AbortController();
    testState.controller = controller;
    elements.run.disabled = true;
    elements.stop.disabled = false;
    elements.models.disabled = true;
    testState.results = [];
    renderTestBlocks(elements.summary, elements.results, []);

    try {
      const results = await runWithConcurrency(
        keys,
        concurrency,
        async (key) => {
          if (controller.signal.aborted) {
            return {
              key,
              ok: false,
              status: 'unknown_error',
              message: '已取消',
              raw: '已取消',
            } satisfies TestResult;
          }

          try {
            return await checkOne({
              provider,
              baseUrl,
              model,
              key,
              prompt,
              endpointSuffix,
              lowThreshold,
              signal: controller.signal,
            });
          } catch (error) {
            const isAbort = error instanceof DOMException && error.name === 'AbortError';
            const message = isAbort
              ? '已取消'
              : error instanceof Error
                ? error.message
                : '无响应或被拒绝';
            return {
              key,
              ok: false,
              status: isAbort ? 'unknown_error' : 'invalid',
              message,
              raw: normalizeErrorRaw(error),
            } satisfies TestResult;
          }
        },
        controller.signal,
      );

      if (runToken !== testState.runToken) {
        return;
      }

      testState.results = results;
      renderTestBlocks(elements.summary, elements.results, results);
      options.onResults?.(results);
      if (controller.signal.aborted) {
        setTestStatus('测试已取消', 'error');
      } else {
        setTestStatus('测试完成', 'success');
      }
    } finally {
      testState.running = false;
      elements.run.disabled = false;
      elements.stop.disabled = true;
      elements.models.disabled = modelState.loading;
      testState.controller = null;
    }
  }

  function stopTests(): void {
    if (!testState.running) return;
    testState.controller?.abort();
    setTestStatus('正在取消...', 'error');
  }

  function clearTestResults(): void {
    testState.runToken += 1;
    if (testState.running) {
      testState.controller?.abort();
    }
    testState.results = [];
    renderTestBlocks(elements.summary, elements.results, []);
    setTestStatus('');
    options.onClear?.();
  }

  function clearTestInfo(): void {
    if (testState.running) {
      setTestStatus('测试进行中，无法清空信息。', 'error');
      return;
    }
    const providerId = elements.provider.value as ProviderId;
    elements.form.reset();
    elements.provider.value = providerId;
    applyProviderDefaults(providerId);
    elements.concurrency.value = '3';
    elements.lowThreshold.value = '';
    setTestStatus('');
  }

  function prefillFromRecord(record: ApiKeyRecord): void {
    const providerId = record.provider && PROVIDERS.some((p) => p.id === record.provider)
      ? (record.provider as ProviderId)
      : 'openai_compatible';
    elements.provider.value = providerId;
    applyProviderDefaults(providerId, true);
    elements.baseUrl.value = record.base_url;
    if (record.model) {
      elements.model.value = record.model;
    }
    elements.keys.value = record.api_key;
    elements.endpoint.value = record.endpoint_suffix || '';
    elements.prompt.value = record.validation_prompt || '';
    if (record.available_models && record.available_models.length > 0) {
      modelState.models = record.available_models;
      const selected = renderModelSelect(elements.modelSelect, record.available_models, {
        preferred: elements.model.value.trim(),
        autoSelect: true,
      });
      if (selected) {
        elements.model.value = selected;
      }
      renderModelList(elements.modelList, record.available_models, elements.model.value.trim());
    }
    syncModelSelection({
      models: modelState.models,
      selectEl: elements.modelSelect,
      inputEl: elements.model,
      listEl: elements.modelList,
    });
    setTestStatus('已填入选择的 API Key，可直接开始测试。', 'info');
    document.getElementById('test')?.scrollIntoView({ behavior: 'smooth' });
  }

  renderProviderOptions(elements.provider, 'openai');
  applyProviderDefaults('openai');
  elements.stop.disabled = true;
  clearTestResults();

  elements.provider.addEventListener('change', () => {
    applyProviderDefaults(elements.provider.value as ProviderId);
  });
  elements.modelSelect.addEventListener('change', () => {
    const selected = elements.modelSelect.value;
    if (selected) {
      elements.model.value = selected;
      renderModelList(elements.modelList, modelState.models, selected);
    }
  });
  elements.model.addEventListener('input', () => {
    syncModelSelection({
      models: modelState.models,
      selectEl: elements.modelSelect,
      inputEl: elements.model,
      listEl: elements.modelList,
    });
  });
  elements.models.addEventListener('click', () => {
    void fetchModels();
  });
  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    void runTests();
  });
  elements.stop.addEventListener('click', () => stopTests());
  elements.clearInfo.addEventListener('click', () => clearTestInfo());
  elements.clear.addEventListener('click', () => clearTestResults());
  elements.modelList.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const chip = target.closest<HTMLButtonElement>('.model-chip');
    if (!chip) return;
    const model = chip.dataset.model;
    if (!model) return;
    elements.model.value = model;
    syncModelSelection({
      models: modelState.models,
      selectEl: elements.modelSelect,
      inputEl: elements.model,
      listEl: elements.modelList,
    });
  });

  return { prefillFromRecord };
}
