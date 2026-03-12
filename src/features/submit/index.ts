import type { SubmitPayload, TestResult } from '../../types';
import { submitKey } from '../../lib/api-client';
import { probeModels } from '../../lib/model-probe';
import { renderProviderOptions } from '../../lib/provider-ui';
import { getProviderMeta, type ProviderId } from '../../lib/providers';
import { renderModelList, renderModelSelect } from '../../lib/model-selector';
import { normalizeEndpointSuffix, setStatus } from '../../lib/ui';
import { probeOne } from '../../lib/checkers';
import { renderTestBlocks } from '../test/render';

type SubmitFeatureOptions = {
  onSubmitSuccess?: () => void;
};

export function initSubmitForm(options: SubmitFeatureOptions = {}): void {
  const elements = {
    form: document.getElementById('submit-form') as HTMLFormElement,
    provider: document.getElementById('submit-provider') as HTMLSelectElement,
    baseUrl: document.getElementById('submit-base-url') as HTMLInputElement,
    apiKey: document.getElementById('submit-api-key') as HTMLInputElement,
    endpoint: document.getElementById('submit-endpoint') as HTMLInputElement,
    prompt: document.getElementById('submit-prompt') as HTMLInputElement,
    modelSelect: document.getElementById('submit-model-select') as HTMLSelectElement,
    modelList: document.getElementById('submit-model-list') as HTMLDivElement,
    description: document.getElementById('submit-description') as HTMLTextAreaElement,
    probeBtn: document.getElementById('submit-probe-btn') as HTMLButtonElement,
    testBtn: document.getElementById('submit-test-btn') as HTMLButtonElement,
    submitBtn: document.getElementById('submit-submit-btn') as HTMLButtonElement,
    status: document.getElementById('submit-status') as HTMLDivElement,
    summary: document.getElementById('submit-summary') as HTMLDivElement,
    results: document.getElementById('submit-results') as HTMLDivElement,
  };

  const state = {
    probing: false,
    testing: false,
    canSubmit: false,
    models: [] as string[],
  };

  function setSubmitStatus(message: string, tone: 'info' | 'error' | 'success' = 'info'): void {
    setStatus(elements.status, message, tone);
  }

  function applyProviderDefaults(providerId: ProviderId, keepBaseUrl = false): void {
    const meta = getProviderMeta(providerId);
    if (!keepBaseUrl) {
      elements.baseUrl.value = meta.defaultBaseUrl;
    }
    state.models = [];
    renderModelList(elements.modelList, []);
    renderModelSelect(elements.modelSelect, [], { autoSelect: false });
    elements.testBtn.disabled = true;
    elements.submitBtn.disabled = true;
    state.canSubmit = false;
  }

  function resetSubmitState(): void {
    state.models = [];
    state.canSubmit = false;
    elements.testBtn.disabled = true;
    elements.submitBtn.disabled = true;
    renderModelList(elements.modelList, []);
    renderModelSelect(elements.modelSelect, [], { autoSelect: false });
    renderTestBlocks(elements.summary, elements.results, []);
    setSubmitStatus('');
  }

  function invalidateModels(message?: string): void {
    state.models = [];
    renderModelList(elements.modelList, []);
    renderModelSelect(elements.modelSelect, [], { autoSelect: false });
    elements.testBtn.disabled = true;
    elements.submitBtn.disabled = true;
    state.canSubmit = false;
    renderTestBlocks(elements.summary, elements.results, []);
    if (message) {
      setSubmitStatus(message, 'info');
    }
  }

  function invalidateTest(message?: string): void {
    elements.submitBtn.disabled = true;
    state.canSubmit = false;
    renderTestBlocks(elements.summary, elements.results, []);
    if (message) {
      setSubmitStatus(message, 'info');
    }
  }

  function validateBaseUrl(baseUrl: string): string | null {
    if (!baseUrl) return 'Base URL 不能为空';
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return 'Base URL 必须是 http 或 https';
      }
    } catch {
      return 'Base URL 格式不正确';
    }
    return null;
  }

  async function handleProbeModels(): Promise<void> {
    if (state.probing || state.testing) return;
    const baseUrl = elements.baseUrl.value.trim();
    const apiKey = elements.apiKey.value.trim();
    const provider = elements.provider.value as ProviderId;

    const baseError = validateBaseUrl(baseUrl);
    if (baseError) {
      setSubmitStatus(baseError, 'error');
      return;
    }
    if (!apiKey) {
      setSubmitStatus('API Key 不能为空', 'error');
      return;
    }

    state.probing = true;
    elements.probeBtn.disabled = true;
    setSubmitStatus('正在探测模型...', 'info');
    renderTestBlocks(elements.summary, elements.results, []);

    try {
      const result = await probeModels({ provider, baseUrl, keys: [apiKey] });
      if (!result) {
        state.models = [];
        renderModelList(elements.modelList, []);
        renderModelSelect(elements.modelSelect, [], { autoSelect: false });
        setSubmitStatus('未探测到模型列表，请检查 Base URL 与 Key。', 'error');
        return;
      }

      state.models = result.models;
      renderModelSelect(elements.modelSelect, result.models, {
        autoSelect: false,
        placeholder: '请选择模型',
      });
      updateModelSelection('');

      if (result.baseUrl !== baseUrl) {
        elements.baseUrl.value = result.baseUrl;
      }

      setSubmitStatus('模型探测完成，请选择模型后测试。', 'success');
      elements.testBtn.disabled = true;
      elements.submitBtn.disabled = true;
      state.canSubmit = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : '模型探测失败';
      setSubmitStatus(message, 'error');
    } finally {
      state.probing = false;
      elements.probeBtn.disabled = false;
    }
  }

  function updateModelSelection(model: string): void {
    renderModelList(elements.modelList, state.models, model);
    elements.testBtn.disabled = !model;
  }

  async function handleSubmitTest(): Promise<void> {
    if (state.testing || state.probing) return;

    const provider = elements.provider.value as ProviderId;
    const baseUrl = elements.baseUrl.value.trim();
    const apiKey = elements.apiKey.value.trim();
    const model = elements.modelSelect.value;
    if (!model) {
      setSubmitStatus('请先选择模型并完成测试。', 'error');
      return;
    }
    const endpointSuffixRaw = elements.endpoint.value;
    const endpointSuffix = normalizeEndpointSuffix(endpointSuffixRaw);
    if (endpointSuffix && endpointSuffix !== endpointSuffixRaw.trim()) {
      elements.endpoint.value = endpointSuffix;
    }
    const prompt = elements.prompt.value.trim() || undefined;

    const baseError = validateBaseUrl(baseUrl);
    if (baseError) {
      setSubmitStatus(baseError, 'error');
      return;
    }
    if (!apiKey) {
      setSubmitStatus('API Key 不能为空', 'error');
      return;
    }
    if (!state.models.length) {
      setSubmitStatus('请先探测模型列表。', 'error');
      return;
    }
    if (!model || !state.models.includes(model)) {
      setSubmitStatus('请从模型列表中选择要验证的模型。', 'error');
      return;
    }

    state.testing = true;
    elements.testBtn.disabled = true;
    elements.probeBtn.disabled = true;
    elements.submitBtn.disabled = true;
    state.canSubmit = false;
    setSubmitStatus('测试中...', 'info');
    renderTestBlocks(elements.summary, elements.results, []);

    try {
      const result = await probeOne({
        provider,
        baseUrl,
        model,
        key: apiKey,
        prompt,
        endpointSuffix,
      });

      if (result.baseUrl !== baseUrl) {
        elements.baseUrl.value = result.baseUrl;
      }

      const testResult: TestResult = {
        key: apiKey,
        ok: result.ok,
        status: result.ok ? 'valid' : 'invalid',
        message: result.ok ? 'HTTP 200' : `HTTP ${result.status}`,
        raw: result.raw,
      };

      renderTestBlocks(elements.summary, elements.results, [testResult]);

      if (result.ok) {
        setSubmitStatus('测试通过，可选择是否提交。', 'success');
        state.canSubmit = true;
        elements.submitBtn.disabled = false;
      } else {
        setSubmitStatus('测试未通过，无法提交。', 'error');
        state.canSubmit = false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '无响应或被拒绝';
      const testResult: TestResult = {
        key: apiKey,
        ok: false,
        status: 'invalid',
        message,
        raw: error instanceof Error ? { name: error.name, message: error.message } : error,
      };
      renderTestBlocks(elements.summary, elements.results, [testResult]);
      setSubmitStatus('测试未通过，无法提交。', 'error');
    } finally {
      state.testing = false;
      elements.testBtn.disabled = false;
      elements.probeBtn.disabled = false;
    }
  }

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (!state.canSubmit) {
      setSubmitStatus('请先完成测试并确认通过。', 'error');
      return;
    }

    const provider = elements.provider.value as ProviderId;
    const baseUrl = elements.baseUrl.value.trim();
    const apiKey = elements.apiKey.value.trim();
    const model = elements.modelSelect.value;
    const endpointSuffix = normalizeEndpointSuffix(elements.endpoint.value);
    const validationPrompt = elements.prompt.value.trim() || undefined;
    const description = elements.description.value.trim() || undefined;

    const payload: SubmitPayload = {
      provider,
      base_url: baseUrl,
      api_key: apiKey,
      model,
      endpoint_suffix: endpointSuffix,
      validation_prompt: validationPrompt,
      available_models: state.models.length ? state.models : undefined,
      description,
    };

    elements.submitBtn.disabled = true;
    setSubmitStatus('提交中...', 'info');

    try {
      await submitKey(payload);
      elements.form.reset();
      renderProviderOptions(elements.provider, 'openai');
      applyProviderDefaults(elements.provider.value as ProviderId);
      resetSubmitState();
      setSubmitStatus('提交成功，感谢你的贡献。', 'success');
      options.onSubmitSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : '提交失败';
      setSubmitStatus(message, 'error');
      elements.submitBtn.disabled = false;
    }
  }

  renderProviderOptions(elements.provider, 'openai');
  applyProviderDefaults('openai');
  resetSubmitState();

  elements.provider.addEventListener('change', () => {
    applyProviderDefaults(elements.provider.value as ProviderId);
    invalidateModels('Provider 已变更，请重新探测模型。');
  });
  elements.baseUrl.addEventListener('change', () => {
    invalidateModels('Base URL 已变更，请重新探测模型。');
  });
  elements.apiKey.addEventListener('change', () => {
    invalidateModels('API Key 已变更，请重新探测模型。');
  });
  elements.endpoint.addEventListener('input', () => {
    invalidateTest('Endpoint 已变更，请重新测试。');
  });
  elements.prompt.addEventListener('input', () => {
    invalidateTest('验证提示词已变更，请重新测试。');
  });
  elements.probeBtn.addEventListener('click', () => {
    void handleProbeModels();
  });
  elements.modelSelect.addEventListener('change', () => {
    updateModelSelection(elements.modelSelect.value);
    invalidateTest('模型已变更，请重新测试。');
  });
  elements.modelList.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const chip = target.closest<HTMLButtonElement>('.model-chip');
    if (!chip) return;
    const model = chip.dataset.model;
    if (!model) return;
    elements.modelSelect.value = model;
    updateModelSelection(model);
    invalidateTest('模型已变更，请重新测试。');
  });
  elements.testBtn.addEventListener('click', () => {
    void handleSubmitTest();
  });
  elements.form.addEventListener('submit', (event) => {
    void handleSubmit(event);
  });
  elements.form.addEventListener('reset', () => {
    resetSubmitState();
    const providerId = elements.provider.value as ProviderId;
    applyProviderDefaults(providerId);
  });
}
