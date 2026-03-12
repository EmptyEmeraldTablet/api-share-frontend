import type { TestResult } from '../../types';
import { escapeHtml, maskKey } from '../../lib/ui';

const STATUS_LABELS: Record<TestResult['status'], string> = {
  valid: '有效',
  invalid: '无效',
  rate_limited: '限流',
  unknown_error: '未知',
  low: '余额低',
  zero: '余额为 0',
  no_balance: '无余额信息',
};

const STATUS_TONES: Record<TestResult['status'], 'success' | 'warning' | 'danger' | 'info'> = {
  valid: 'success',
  low: 'warning',
  zero: 'warning',
  no_balance: 'info',
  invalid: 'danger',
  rate_limited: 'warning',
  unknown_error: 'info',
};

function formatBalance(balance: number | undefined): string {
  if (balance === undefined) return '--';
  if (balance === -1) return '不可用';
  return `${balance}`;
}

function formatRawContent(raw: unknown): { text: string; truncated: boolean } {
  let text = '';
  if (raw === undefined || raw === null) {
    text = '无返回内容';
  } else if (typeof raw === 'string') {
    text = raw;
  } else {
    try {
      text = JSON.stringify(raw, null, 2);
    } catch (error) {
      text = String(raw);
    }
  }

  if (!text.trim()) text = '无返回内容';

  const maxLength = 4000;
  if (text.length > maxLength) {
    return { text: `${text.slice(0, maxLength)}\n... (已截断)`, truncated: true };
  }
  return { text, truncated: false };
}

export function renderTestSummary(el: HTMLElement, results: TestResult[]): void {
  if (results.length === 0) {
    el.innerHTML = '';
    return;
  }

  const counts = results.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  const summaryHtml = Object.entries(STATUS_LABELS)
    .map(([status, label]) => {
      const count = counts[status] || 0;
      return `
        <div class="summary-item" data-tone="${STATUS_TONES[status as TestResult['status']]}">
          <span class="summary-label">${label}</span>
          <span class="summary-value">${count}</span>
        </div>
      `;
    })
    .join('');

  el.innerHTML = summaryHtml;
}

export function renderTestResults(el: HTMLElement, results: TestResult[]): void {
  if (results.length === 0) {
    el.innerHTML = '';
    return;
  }

  const html = results
    .map((result) => {
      const label = STATUS_LABELS[result.status];
      const tone = STATUS_TONES[result.status];
      const message = result.message ? escapeHtml(result.message) : 'OK';
      const raw = formatRawContent(result.raw);
      const rawTitle = raw.truncated ? '返回内容（已截断）' : '返回内容';
      return `
        <div class="test-result" data-tone="${tone}">
          <div class="test-result__header">
            <span class="badge" data-tone="${tone}">${label}</span>
            <span class="test-key">${escapeHtml(maskKey(result.key))}</span>
          </div>
          <div class="test-result__meta">
            <span>${message}</span>
            <span>余额: ${formatBalance(result.balance)}</span>
          </div>
          <details class="test-raw">
            <summary>${rawTitle}</summary>
            <pre>${escapeHtml(raw.text)}</pre>
          </details>
        </div>
      `;
    })
    .join('');

  el.innerHTML = html;
}

export function renderTestBlocks(
  summaryEl: HTMLElement,
  resultsEl: HTMLElement,
  results: TestResult[],
): void {
  renderTestSummary(summaryEl, results);
  renderTestResults(resultsEl, results);
}
